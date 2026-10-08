import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { rolldown } from "rolldown";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { compileServerCode, createServerCode } from "./server-code.ts";

const registry = "globalThis.__server__";
// A project that has Vitest, for the packages of the test runner.
const root = fileURLToPath(new URL("../../../../playground/nextjs-e2e-demo", import.meta.url));

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
async function run(source: string): Promise<unknown> {
  const compiled = await compileServerCode(source, "/app/module.js", registry);
  return runInThisContext(`(() => { ${compiled?.code ?? source}\nreturn result; })()`);
}

test("answers typeof window as a server does, and replaces nothing else of it", async () => {
  expect(await run(`var result = [typeof window, typeof document, typeof location];`)).toEqual([
    "undefined",
    "undefined",
    "undefined",
  ]);
  expect(await run(`var result = typeof(window);`)).toBe("undefined");
  expect(await run(`function f(window) { return typeof window; } var result = f(1);`)).toBe(
    "number",
  );
  // As in a server bundle of Next, the name itself is left alone.
  expect(await run(`var result = window.innerWidth;`)).toBe(390);
  // A CommonJS module can return at its top level.
  const compiled = await compileServerCode(
    `if (typeof window === "undefined") return;\nmodule.exports = 1;`,
    "/dependency/index.js",
    registry,
  );
  expect(compiled?.code).toContain(`"undefined" === "undefined"`);
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

test("queues a microtask with the server's queueMicrotask", async () => {
  vi.stubGlobal("__server__", { queueMicrotask: () => "server microtask" });

  expect(await run(`var result = [typeof queueMicrotask, queueMicrotask(() => {})];`)).toEqual([
    "function",
    "server microtask",
  ]);
});

test("leaves code alone that names none of them", async () => {
  expect(
    await compileServerCode(`export const answer = 42;`, "/app/module.js", registry),
  ).toBeUndefined();
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
  const serverCode = createServerCode(registry, {
    browserModules: ["test/**", "**/node_modules/@testing-library/**"],
  });
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
  // A package is matched where the package manager really put it.
  const inStore = "/store/.pnpm/@testing-library+dom@10/node_modules/@testing-library/dom/x.js";
  expect(serverCode.isServerCode(inStore, "rsc")).toBe(false);
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

test("compiles the async functions of Next's wrapper of a cached function, and of no other package", () => {
  const { transform } = createServerCode(registry).asyncFunctionsOptimizerPlugin();
  const code = `export async function cache() { await generate(); }`;

  for (const file of [
    "esm/server/use-cache/use-cache-wrapper.js",
    "server/use-cache/cache-tag.js",
  ]) {
    expect(transform(code, `/app/node_modules/next/dist/${file}`)?.code).toContain(
      `await ${registry}.asyncFunctionHooks.s(`,
    );
  }
  expect(transform(code, "/app/node_modules/next/dist/esm/server/app-render/app-render.js")).toBe(
    undefined,
  );
  expect(transform(code, "/app/node_modules/zod/index.js")).toBeUndefined();
});

test("compiles the async functions of the app's server code in the rsc layer, not of a test file", () => {
  const serverCode = createServerCode(registry);
  serverCode.configure(root);
  serverCode.addTestFiles((file) => file.endsWith(".test.tsx"));
  const { transform } = serverCode.asyncFunctionsPlugin("client") as unknown as {
    transform(this: object, code: string, id: string): { code: string } | undefined;
  };
  const context = { environment: { config: { cacheDir: path.join(root, "node_modules/.vite") } } };
  const code = `export async function load() { await data(); }`;

  expect(transform.call(context, code, path.join(root, "app/page.tsx"))?.code).toContain(
    `await ${registry}.asyncFunctionHooks.s(`,
  );
  expect(transform.call(context, code, path.join(root, "app/app.test.tsx"))).toBeUndefined();
  // A dependency is compiled when it is pre-bundled, or not at all.
  const dependency = path.join(root, "node_modules/next/dist/server/next.js");
  expect(transform.call(context, code, dependency)).toBeUndefined();
});
