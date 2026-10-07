import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
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
async function run(source: string): Promise<unknown> {
  const compiled = await compileServerCode(source, "/app/module.js", registry);
  return runInThisContext(`(() => { ${compiled?.code ?? source}\nreturn result; })()`);
}

test("hides the globals of a tab", async () => {
  expect(await run(`var result = [typeof window, typeof document, typeof location];`)).toEqual([
    "undefined",
    "undefined",
    "undefined",
  ]);
  await expect(run(`var result = window.innerWidth;`)).rejects.toThrow(TypeError);
  expect(await run(`var result = [globalThis.window, typeof globalThis.document];`)).toEqual([
    undefined,
    "undefined",
  ]);
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

test("keeps the code of a function, for an app that sends it to the browser as text", async () => {
  const source = `function setTheme() { document.title = localStorage.getItem("theme"); }`;

  expect(await run(`${source} var result = setTheme.toString();`)).toBe(source);
});

test("keeps what is first in a module first", async () => {
  const compiled = await compileServerCode(
    `"use client";\nexport const width = typeof window;`,
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
});

test("leaves code alone that names none of them", async () => {
  expect(
    await compileServerCode(`export const answer = 42;`, "/app/module.js", registry),
  ).toBeUndefined();
});

test("tells the server code of a layer from the code of the test", () => {
  const serverCode = createServerCode(registry, { testModules: ["test/**"] });
  serverCode.configure(root);
  serverCode.setTestFiles((file) => file.endsWith(".test.tsx"));
  const file = (name: string) => path.join(root, name);
  const vitest = fileURLToPath(import.meta.resolve("vitest"));

  // Everything in the ssr layer is server code, but nothing in the browser's.
  expect(serverCode.isServerCode(file("app/page.test.tsx"), "ssr")).toBe(true);
  expect(serverCode.isServerCode(file("app/page.tsx"), "browser")).toBe(false);

  // The rsc layer shares its environment with the test.
  expect(serverCode.isServerCode(file("app/page.tsx"), "rsc")).toBe(true);
  expect(serverCode.isServerCode(file("node_modules/zod/index.js"), "rsc")).toBe(true);
  expect(serverCode.isServerCode(file("app/page.test.tsx"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(file("test/render.tsx"), "rsc")).toBe(false);
  expect(serverCode.isServerCode(vitest, "rsc")).toBe(false);

  // The runtime of this package is written for where it runs.
  const ownRuntime = fileURLToPath(new URL("./ssr.ts", import.meta.url));
  expect(serverCode.isServerCode(ownRuntime, "ssr")).toBe(false);
  expect(serverCode.isServerCode("\0virtual:module", "ssr")).toBe(false);
});
