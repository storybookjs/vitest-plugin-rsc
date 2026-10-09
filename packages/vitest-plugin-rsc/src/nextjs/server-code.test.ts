import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import { rolldown } from "rolldown";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { compileServerCode, createServerCode } from "./server-code.ts";

const registry = "globalThis.__server__";
// A project that has Vitest, for the packages of the test runner.
const root = fileURLToPath(new URL("../../../../playground/nextjs-e2e-demo", import.meta.url));

// A browser, as far as server code can tell.
beforeEach(() => {
  vi.stubGlobal("window", { innerWidth: 390 });
  vi.stubGlobal("document", { title: "Browser" });
  vi.stubGlobal("location", { href: "http://browser.test/" });
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

test("never takes the plugin, or what it is built on, for a package of the host", () => {
  // A host whose framework depends on the plugin, like Storybook's.
  const hostRoot = fileURLToPath(
    new URL("../../../../playground/nextjs-host-demo", import.meta.url),
  );
  const serverCode = createServerCode(registry, {
    host: { files: ["stories/**"], packages: ["storybook", "@storybook/*"] },
  });
  serverCode.configure(hostRoot);
  const packageOf = (name: string) => fileURLToPath(import.meta.resolve(name));

  const storybook = fs.realpathSync(path.join(hostRoot, "node_modules/storybook"));
  expect(serverCode.isServerCode(path.join(storybook, "dist/test/index.js"), "rsc")).toBe(false);
  // Vite RSC's Flight server, which the framework reaches through the plugin.
  expect(serverCode.isServerCode(packageOf("@vitejs/plugin-rsc/rsc"), "rsc")).toBe(true);
});

test("has the browser layer load the packages of a UI of the host itself, and knows its files", () => {
  const hostRoot = fileURLToPath(
    new URL("../../../../playground/nextjs-host-demo", import.meta.url),
  );
  const serverCode = createServerCode(registry, {
    host: {
      files: ["stories/**/*.stories.tsx"],
      packages: ["storybook", "@storybook/*"],
      ui: { packages: ["@storybook/addon-docs", "storybook/theming"], files: ["stories/**/*.mdx"] },
    },
  });
  serverCode.configure(hostRoot);

  expect(serverCode.isHostPackage("storybook/preview-api")).toBe(true);
  expect(serverCode.isHostPackage("@storybook/addon-docs")).toBe(false);
  expect(serverCode.isHostPackage("@storybook/addon-docs/blocks")).toBe(false);
  expect(serverCode.isHostPackage("storybook/theming")).toBe(false);
  expect(serverCode.isHostPackage("storybook/theming-other")).toBe(true);

  const docs = path.join(hostRoot, "stories/introduction.mdx");
  expect(serverCode.isHostUiFile(docs)).toBe(true);
  // A file of the host too, which keeps the browser's globals.
  expect(serverCode.isHostFile(docs)).toBe(true);
  expect(serverCode.isHostUiFile(path.join(hostRoot, "stories/greeting.stories.tsx"))).toBe(false);
});
