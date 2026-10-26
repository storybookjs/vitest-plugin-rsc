import fs from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import os from "node:os";
import { rolldown, type Plugin } from "rolldown";
import { expect, test } from "vitest";
import {
  generated,
  handWritten,
  outputDir,
  unenvModules,
  written,
} from "../../scripts/node-modules.ts";
import {
  browserMapping,
  isNativeNodeModule,
  isNodeModule,
  nativeRequirePlugin,
  nodeModuleOf,
} from "./node-builtins.ts";

// The built files, which a run of the source uses too.
const nodeDir = path.resolve(outputDir, "../../dist/node");

test("gives the file of the package's module for a module of Node.js, with or without `node:`", () => {
  expect(nodeModuleOf("node:fs", "stand-ins")).toBe(`${nodeDir}/fs.js`);
  expect(nodeModuleOf("fs", "stand-ins")).toBe(`${nodeDir}/fs.js`);
  expect(nodeModuleOf("node:fs/promises", "stand-ins")).toBe(`${nodeDir}/fs/promises.js`);
  expect(nodeModuleOf("os", "stand-ins")).toBe(`${nodeDir}/os.js`);
  expect(nodeModuleOf("node:sqlite", "stand-ins")).toBe(`${nodeDir}/sqlite.js`);
  expect(nodeModuleOf("node:crypto", "stand-ins")).toBe(`${nodeDir}/crypto.js`);
  expect(isNodeModule(`${nodeDir}/fs.js`)).toBe(true);
  expect(isNodeModule(path.resolve(nodeDir, "../nextjs/ssr.js"))).toBe(false);
  expect(isNodeModule("vitest-plugin-rsc/node/fs")).toBe(false);
});

test("leaves a package alone, and the package's own `async_hooks`", () => {
  expect(nodeModuleOf("memfs", "stand-ins")).toBeUndefined();
  expect(nodeModuleOf("fs-extra", "stand-ins")).toBeUndefined();
  expect(nodeModuleOf("node:async_hooks", "stand-ins")).toBeUndefined();
});

test("gives Node's own module in a worker of Node.js, by its `node:` name", () => {
  expect(nodeModuleOf("fs", "native")).toBe("node:fs");
  expect(nodeModuleOf("node:fs/promises", "native")).toBe("node:fs/promises");
  expect(nodeModuleOf("net", "native")).toBe("node:net");
  expect(nodeModuleOf("node:test", "native")).toBe("node:test");
  expect(nodeModuleOf("memfs", "native")).toBeUndefined();
  expect(isNativeNodeModule("node:net")).toBe(true);
  expect(isNativeNodeModule(`${nodeDir}/net.js`)).toBe(false);
  // Every one of them: none is a stand-in there.
  const names = builtinModules.filter((name) => !name.startsWith("_") && name !== "async_hooks");
  expect(names.filter((name) => !nodeModuleOf(name, "native"))).toEqual([]);
});

// A package of CommonJS for Node.js, like `@sentry/nextjs`, which requires
// `node:async_hooks`, pre-bundled as the optimizer of a server layer bundles
// it in a worker of Node.js, where the optimizer leaves the module out.
// Rolldown's runtime for a browser has no `require` to call: it throws.
test("has a pre-bundle in a worker of Node.js import what a package requires of Node.js, `async_hooks` too", async () => {
  const files: Record<string, string> = {
    "/entry.js": `module.exports = [require("node:async_hooks"), require("async_hooks"), require("fs")];`,
  };
  const build = await rolldown({
    input: "/entry.js",
    platform: "browser",
    plugins: [
      nativeRequirePlugin() as Plugin,
      {
        name: "left-out",
        resolveId: (source) => (source in files ? source : { id: source, external: true }),
        load: (id) => files[id],
      },
    ],
  });
  const { output } = await build.generate({ format: "esm" });

  expect(output[0].code).not.toContain("require(");
  for (const name of ["node:async_hooks", "async_hooks", "fs"]) {
    expect(output[0].code).toContain(`from "${name}"`);
  }
});

test("has a module for every module of Node.js but a few", () => {
  // Not the internals of Node's own, like `_stream_duplex`.
  const names = builtinModules.filter((name) => !name.startsWith("_"));
  const without = names.filter((name) => !nodeModuleOf(name, "stand-ins"));
  expect(without.sort()).toEqual(["async_hooks", "node:sea", "node:test", "node:test/reporters"]);
});

test("ships a module for everything unenv stands in for, as the generator writes it", () => {
  for (const name of unenvModules()) {
    expect(fs.existsSync(path.join(outputDir, `${name}.ts`)), name).toBe(true);
  }
  // The files on disk are what `pnpm generate` writes: a bump of unenv, or a
  // change of the script, is followed by a run of it.
  const files = generated();
  expect([...written().keys()].sort()).toEqual([...files.keys()].sort());
  for (const [file, code] of files) expect(written().get(file), file).toBe(code);
  expect([...handWritten]).toEqual([
    "assert",
    "buffer",
    "crypto",
    "path",
    "stream",
    "stream/consumers",
    "stream/promises",
    "string_decoder",
    "timers",
    "timers/promises",
    "util",
    "zlib",
  ]);
  expect(fs.existsSync(path.join(outputDir, "crypto.ts"))).toBe(true);
});

test("gives `fs` the exports of unenv's, from the disk on its global, and `fs/promises` that disk", () => {
  const code = generated().get("fs.ts")!;
  expect(code).toContain("[diskGlobal] ??= createDisk()");
  expect(code).toContain(
    'export const readFileSync = fs.readFileSync ?? missing("fs.readFileSync");',
  );
  expect(code).toContain('export const promises = fs.promises ?? missing("fs.promises");');
  const promises = generated().get("fs/promises.ts")!;
  expect(promises).toContain('import fs from "vitest-plugin-rsc/node/fs";');
  expect(promises).toContain(
    'export const readFile = promises.readFile ?? missing("fs/promises.readFile");',
  );
});

test("gives `process` the page's, with its own functions, and unenv's for the rest", () => {
  const code = generated().get("process.ts")!;
  expect(code).toContain("(globalThis as Record<string, any>).process ??= {");
  expect(code).toContain("export default new Proxy(process, {");
  expect(code).toContain("export const hrtime = process.hrtime ?? unenv.hrtime;");
  expect(code).toContain("export const env = process.env ?? unenv.env;");
  expect(code).toContain("export const emitWarning = process.emitWarning ?? unenv.emitWarning;");
});

test("gives another module unenv's, with its default export", () => {
  expect(generated().get("os.ts")).toBe(
    "// Generated by scripts/node-modules.ts: do not edit, run `pnpm generate`.\n" +
      "// `node:os` of Node.js, as unenv has it in a browser.\n" +
      'export * from "unenv/node/os";\n' +
      'export { default } from "unenv/node/os";\n',
  );
  // The strict assert and the POSIX path are the package's own modules'.
  expect(generated().get("assert/strict.ts")).toContain(
    'import assert from "vitest-plugin-rsc/node/assert";',
  );
  expect(generated().get("path/win32.ts")).toContain(
    'import path from "vitest-plugin-rsc/node/path";',
  );
});

test("reads what a dependency's `browser` field says it uses for a module", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "node-builtins-"));
  try {
    const pkg = path.join(dir, "node_modules", "some-db");
    fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
    fs.writeFileSync(
      path.join(pkg, "package.json"),
      JSON.stringify({ name: "some-db", browser: { fs: false, url: false, os: "./os.js" } }),
    );
    const importer = path.join(pkg, "dist", "index.js");
    expect(browserMapping("fs", importer)).toBe(false);
    expect(browserMapping("url", `${importer}?v=1`)).toBe(false);
    expect(browserMapping("os", importer)).toBe("./os.js");
    expect(browserMapping("http", importer)).toBeUndefined();
    // By the specifier as written, as Vite maps it.
    expect(browserMapping("node:fs", importer)).toBeUndefined();
    // Not the app's own field: Next's server does not read it.
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ browser: { fs: false } }));
    expect(browserMapping("fs", path.join(dir, "app", "page.tsx"))).toBeUndefined();
    expect(browserMapping("fs", undefined)).toBeUndefined();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
