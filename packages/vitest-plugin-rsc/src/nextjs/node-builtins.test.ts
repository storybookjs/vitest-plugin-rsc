import fs from "node:fs";
import { builtinModules } from "node:module";
import os from "node:os";
import path from "node:path";
import { parseAst } from "vite";
import { expect, test } from "vitest";
import { createNodeBuiltins } from "./node-builtins.ts";
import { createNodePlatform } from "./node-platform.ts";

const builtins = createNodeBuiltins("\0bridge/");
const platform = createNodePlatform("registry", "\0bridge/");

test("stands in for a module of Node.js with or without `node:`, once for both", () => {
  expect(builtins.moduleOf("node:fs")).toBe("\0bridge/builtin:fs");
  expect(builtins.moduleOf("fs")).toBe("\0bridge/builtin:fs");
  expect(builtins.moduleOf("node:fs/promises")).toBe("\0bridge/builtin:fs/promises");
  expect(builtins.moduleOf("os")).toBe("\0bridge/builtin:os");
  expect(builtins.moduleOf("node:sqlite")).toBe("\0bridge/builtin:sqlite");
});

test("leaves a package alone, and the package's own `async_hooks`", () => {
  expect(builtins.moduleOf("memfs")).toBeUndefined();
  expect(builtins.moduleOf("fs-extra")).toBeUndefined();
  expect(builtins.moduleOf("node:async_hooks")).toBeUndefined();
});

test("has a stand-in that parses for every module of Node.js but a few", () => {
  const without: string[] = [];
  for (const name of builtinModules.filter((name) => !name.startsWith("_"))) {
    const id = builtins.moduleOf(name) ?? platform.moduleOf(name);
    if (!id) {
      without.push(name);
      continue;
    }
    const code = builtins.load(id.slice("\0bridge/".length)) ?? platform.load(id.slice(8));
    expect(() => parseAst(code!), name).not.toThrow();
  }
  // The package's own `async_hooks`, and what a browser has no use for.
  // Next's aliases come first in a layer, see project/layers.ts.
  expect(without.sort()).toEqual(["async_hooks", "node:sea", "node:test", "node:test/reporters"]);
});

test("gives `fs` the exports of unenv's, from the disk on its global", () => {
  const code = builtins.load("builtin:fs")!;

  expect(code).toContain("globalThis.__vitest_plugin_rsc_disk__ ??=");
  expect(code).toContain("export const readFileSync = fs.readFileSync");
  expect(code).toContain("export const promises = fs.promises");
});

test("gives `process` the page's, with its own functions", () => {
  const code = builtins.load("builtin:process")!;

  expect(code).toContain("const process = (globalThis.process ??= { env: {} });");
  expect(code).toContain("export const hrtime = process.hrtime;");
  expect(code).toContain("export const env = process.env;");
});

test("gives another module unenv's, from the package, with its default export", () => {
  expect(builtins.load("builtin:path/posix")).toBe(
    'import * as unenv from "unenv/node/path/posix";\n' +
      'export * from "unenv/node/path/posix";\n' +
      "export default unenv.default;\n",
  );
  expect(builtins.importsOwn("unenv/node/path/posix", "\0bridge/builtin:path/posix")).toBe(true);
  expect(builtins.importsOwn("unenv/node/os", "/app/lib/os.ts")).toBe(false);
});

test("imports memfs from this package", () => {
  expect(builtins.importsOwn("memfs", "\0bridge/builtin:fs")).toBe(true);
  expect(builtins.importsOwn("memfs", "/app/lib/disk.ts")).toBe(false);
});

test("leaves a module to Vite for a dependency whose `browser` field maps it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "node-builtins-"));
  const dependency = path.join(dir, "node_modules", "dependency");
  fs.mkdirSync(path.join(dependency, "dist"), { recursive: true });
  const browser = { fs: false, "node:os": false, url: "./url.js" };
  for (const root of [dir, dependency]) {
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ browser }));
  }
  const importer = path.join(dependency, "dist", "index.js?v=1");

  expect(builtins.mappedBy("fs", importer)).toBe(true);
  expect(builtins.mappedBy("node:fs", importer)).toBe(true);
  expect(builtins.mappedBy("os", importer)).toBe(true);
  // To a file of its own, which Vite then gives it.
  expect(builtins.mappedBy("url", importer)).toBe(true);
  expect(builtins.mappedBy("http", importer)).toBe(false);
  expect(builtins.mappedBy("fs", "\0bridge/builtin:fs")).toBe(false);
  // Not the app's own field: Next's server does not read it.
  expect(builtins.mappedBy("fs", path.join(dir, "app", "page.tsx"))).toBe(false);
});

test("gives `crypto` the rest of Node's exports, which throw", () => {
  const code = platform.load("node-crypto")!;

  expect(code).toContain('export const createHmac = missing("crypto.createHmac");');
  expect(code).toContain("export const constants = {};");
  expect(code).toContain("export const subtle = web.subtle;");
});
