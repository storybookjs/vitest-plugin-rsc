import { expect, test } from "vitest";
import { withModuleFileUrls } from "./module-files.ts";

const file = "/app/node_modules/.vite/deps/pglite.js";

test("makes a URL of a file next to the module its file: URL", () => {
  const code = [
    `const wasm = new URL("../../@electric-sql/pglite/dist/pglite.wasm", import.meta.url);`,
    `const data = new URL('./pglite.data', import.meta.url, );`,
  ].join("\n");
  expect(withModuleFileUrls(code, file)?.code).toBe(
    [
      `const wasm = new URL("file:///app/node_modules/@electric-sql/pglite/dist/pglite.wasm");`,
      `const data = new URL("file:///app/node_modules/.vite/deps/pglite.data");`,
    ].join("\n"),
  );
});

test("leaves what is not a file next to the module", () => {
  // A glob of Vite's, a path of the server, a package, and no URL at all.
  for (const code of [
    "new URL(`./locale/${name}.json`, import.meta.url)",
    `new URL("/favicon.ico", import.meta.url)`,
    `new URL("pkg/file.wasm", import.meta.url)`,
    `const here = import.meta.url;`,
  ]) {
    expect(withModuleFileUrls(code, file)).toBeUndefined();
  }
});
