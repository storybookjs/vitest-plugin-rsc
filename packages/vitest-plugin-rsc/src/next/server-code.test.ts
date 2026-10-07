import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { rolldown } from "rolldown";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { compileServerCode, createServerCode } from "./server-code.ts";

const registry = "globalThis.__server__";
// A project that has Vitest, for the packages of the test runner.
const root = fileURLToPath(new URL("../../../../playground/next-e2e-demo", import.meta.url));

// A tab, as far as server code can tell.
beforeEach(() => {
  vi.stubGlobal("window", { innerWidth: 390 });
  vi.stubGlobal("document", { title: "Tab" });
  vi.stubGlobal("location", { href: "http://tab.test/" });
  vi.stubGlobal("__server__", { fetch: () => "server fetch", Response: class ServerResponse {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// What a module leaves in `result`, compiled as server code.
async function run(source: string, options?: { bundled: boolean }): Promise<unknown> {
  const compiled = await compileServerCode(source, "/app/module.js", registry, options);
  return runInThisContext(`(() => { ${compiled?.code ?? source}\nreturn result; })()`);
}

test("hides the globals of a tab from a source file", async () => {
  expect(await run(`var result = [typeof window, typeof document, typeof location];`)).toEqual([
    "undefined",
    "undefined",
    "undefined",
  ]);
  await expect(run(`var result = window.innerWidth;`)).rejects.toThrow(TypeError);
});

test("leaves a module its own bindings", async () => {
  expect(await run(`const location = "Utrecht"; var result = location;`)).toBe("Utrecht");
  expect(await run(`const { document = "passport" } = {}; var result = document;`)).toBe(
    "passport",
  );
  expect(await run(`function measure(window) { return window; } var result = measure(1);`)).toBe(1);
  // An import is a binding of the module too.
  const compiled = await compileServerCode(
    `import { document } from "./document.js";\nexport const title = document.title + window;`,
    "/app/module.js",
    registry,
  );
  expect(compiled?.code).toMatch(/\nvar window, location, localStorage, sessionStorage;\n$/);
});

test("keeps the text of a function in a source file, for an app that sends it to the browser", async () => {
  const source = `function setTheme() { if (typeof document !== "undefined") document.title = localStorage.getItem("theme"); }`;

  expect(await run(`${source} var result = setTheme.toString();`)).toBe(source);
});

test("keeps what is first in a module first", async () => {
  const compiled = await compileServerCode(
    `"use client";\nexport const width = typeof window;\nexport const load = () => fetch("/");`,
    "/app/module.js",
    registry,
  );

  expect(compiled?.code).toMatch(/^"use client";\n/);
});

test("reads fetch, Request and Response from the server", async () => {
  expect(await run(`var result = [fetch("/"), globalThis.fetch("/")];`)).toEqual([
    "server fetch",
    "server fetch",
  ]);
  expect(await run(`var result = new Response().constructor.name;`)).toBe("ServerResponse");
  expect(await run(`function load(fetch) { return fetch(); } var result = load(() => 1);`)).toBe(1);
  // Next patches the server's fetch by assigning to it.
  expect(await run(`globalThis.fetch = () => "patched"; var result = __server__.fetch();`)).toBe(
    "patched",
  );
});

test("leaves code alone that names none of them", async () => {
  expect(
    await compileServerCode(`export const answer = 42;`, "/app/module.js", registry),
  ).toBeUndefined();
});

test("replaces typeof window in a module that will be bundled, and nothing else of it", async () => {
  const bundled = { bundled: true };

  expect(await run(`var result = [typeof window, typeof document];`, bundled)).toEqual([
    "undefined",
    "undefined",
  ]);
  expect(
    await run(`function f(window) { return typeof window; } var result = f(1);`, bundled),
  ).toBe("number");
  // Not hidden: a bundler would rename a variable that hides it.
  expect(await run(`var result = window.innerWidth;`, bundled)).toBe(390);
  // A CommonJS module can return at its top level.
  const compiled = await compileServerCode(
    `if (typeof window === "undefined") return;\nmodule.exports = 1;`,
    "/dependency/index.js",
    registry,
    bundled,
  );
  expect(compiled?.code).toContain(`"undefined" === "undefined"`);
});

// Pre-bundles modules the way Vite's dependency optimizer does: Rolldown, with
// the plugin of a server layer.
async function prebundle(modules: Record<string, string>): Promise<string> {
  const serverCode = createServerCode(registry);
  const build = await rolldown({
    input: Object.keys(modules)[0]!,
    plugins: [
      {
        name: "modules",
        resolveId: (source, importer) =>
          importer ? path.posix.join(path.posix.dirname(importer), source) : source,
        load: (id) => modules[id],
      },
      serverCode.optimizerPlugin("ssr"),
    ],
  });
  const { output } = await build.generate({ format: "esm" });
  return output[0].code;
}

test("keeps the text of a function in a pre-bundled package of several modules", async () => {
  const script = `function script() { document.title = window.name; }`;
  const code = await prebundle({
    "/dependency/index.js": `
      import { other } from "./other.js";
      ${script}
      globalThis.result = [typeof window, other(), script.toString()];`,
    "/dependency/other.js": `
      export const other = () => (typeof window === "undefined" ? "server" : window.name);`,
  });

  runInThisContext(code);

  const [first, second, text] = (globalThis as unknown as { result: string[] }).result;
  expect([first, second]).toEqual(["undefined", "server"]);
  // The bundler prints it again, with its own whitespace and the same names.
  expect(text!.replace(/\s+/g, " ")).toBe(script);
});

test("pre-bundles a file that is not plain JavaScript as it is, with a warning", async () => {
  const warn = vi.fn();
  const { transform } = createServerCode(registry).optimizerPlugin("ssr");

  const result = await transform.call(
    { warn },
    `export const Width = () => <p>{typeof window}</p>;`,
    "/dependency/width.js",
  );

  expect(result).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("/dependency/width.js"));
});

test("tells the server code of a layer from the code of the test", () => {
  const serverCode = createServerCode(registry, { browserModules: ["test/**"] });
  serverCode.configure(root);
  serverCode.addTestFiles((file) => file.endsWith(".test.tsx"));
  // A second project that shares the plugin.
  serverCode.addTestFiles((file) => file.endsWith("vitest.setup.ts"));
  const file = (name: string) => path.join(root, name);
  const packageOf = (name: string) => fileURLToPath(import.meta.resolve(name));

  // Everything in the ssr layer is server code, but nothing in the browser's.
  expect(serverCode.isServerCode(file("app/page.test.tsx"), "ssr")).toBe(true);
  expect(serverCode.isServerCode(file("app/page.tsx"), "browser")).toBe(false);

  // The rsc layer shares its environment with the test.
  expect(serverCode.isServerCode(file("app/page.tsx"), "rsc")).toBe(true);
  expect(serverCode.isServerCode(file("node_modules/zod/index.js"), "rsc")).toBe(true);
  expect(serverCode.isServerCode(file("app/page.test.tsx"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(file("vitest.setup.ts"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(file("test/render.tsx"), "rsc")).toBe(false);
  // Vitest, and the provider that drives the browser for it.
  expect(serverCode.isServerCode(packageOf("vitest"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(packageOf("@vitest/browser-playwright"), "rsc")).toBe(false);

  // The runtime of this package is written for where it runs.
  const ownRuntime = fileURLToPath(new URL("./ssr.ts", import.meta.url));
  expect(serverCode.isServerCode(ownRuntime, "ssr")).toBe(false);
  expect(serverCode.isServerCode("\0virtual:module", "ssr")).toBe(false);
});
