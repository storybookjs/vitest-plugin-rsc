import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { compileCommonJs } from "./commonjs.ts";

const compile = async (code: string) => (await compileCommonJs(code))?.code;

// What `$$cjsRequire()` of a compiled module returns for a namespace.
async function requireOf(namespace: object): Promise<unknown> {
  const code = await compile(`const a = require("a");`);
  const helper = code!.split("\n").find((line) => line.startsWith("const $$cjsRequire"))!;
  return runInNewContext(`${helper}; $$cjsRequire(ns)`, { ns: namespace });
}

test("imports what a module requires next to its imports", async () => {
  const code = await compile(
    `import { b } from "./b";\nconst { PHASE } = require("next/constants");\nexport const c = PHASE + b;`,
  );

  expect(code).toMatch(/^import \* as \$\$cjs0 from "next\/constants";\n/);
  expect(code).toContain(`const { PHASE } = $$cjsRequire($$cjs0);`);
  expect(code).not.toContain("export default");
});

test("imports a module once for every require of it", async () => {
  const code = await compile(
    `function a() { return require("./a"); }\nfunction b() { return require("./a").b; }\nexport { a, b };`,
  );

  expect(code!.match(/^import /gm)).toHaveLength(1);
  expect(code).toContain("return $$cjsRequire($$cjs0).b;");
});

test("gives a module of CommonJS module.exports as its default export, and its names", async () => {
  const code = await compile(
    `const store = require("./store");\nexports.get = () => store;\nmodule.exports.set = () => {};`,
  );

  expect(code).toContain("var module = { exports: {} }, exports = module.exports;");
  expect(code).toContain(`export { $$cjsExports as default, $$cjsExports as $$cjsModuleExports };`);
  expect(code).toContain("export { $$cjs_get as get };");
  expect(code).toContain("export { $$cjs_set as set };");
});

test("takes module.exports as it is once the module has run", async () => {
  const code = await compile(`module.exports = class Handler {};`);

  expect(code!.indexOf("var $$cjsExports = module.exports;")).toBeGreaterThan(
    code!.indexOf("module.exports = class Handler {};"),
  );
});

test("returns what Node.js returns for a require", async () => {
  const handler = { get() {} };
  // A module compiled here: its module.exports.
  expect(await requireOf({ $$cjsModuleExports: handler, default: handler })).toBe(handler);
  // An ES module: its namespace.
  const namespace = Object.defineProperty({ default: handler }, Symbol.toStringTag, {
    value: "Module",
  });
  expect(await requireOf(namespace)).toBe(namespace);
  // A dependency of CommonJS that Vite pre-bundled, as Vite's interop has it.
  expect(await requireOf({ ...handler, default: handler })).toBe(handler);
  const esModule = { __esModule: true, default: handler };
  expect(await requireOf(esModule)).toBe(esModule);
});

test("leaves a module that has require as a name of its own", async () => {
  expect(
    await compile(
      `import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\nrequire("./a");`,
    ),
  ).toBeUndefined();
});

test("leaves require.resolve(), a require of what is no string, and an ES module", async () => {
  expect(await compile(`export const file = require.resolve("./handler");`)).toBeUndefined();
  expect(
    await compile(`const a = require.resolve("./a");\nconst b = require(\`./\${a}\`);`),
  ).toBeUndefined();
  expect(await compile(`export const exports = 1;\nconst a = { module: 1 };`)).toBeUndefined();
});

test("keeps the directives of the module at its top", async () => {
  const code = await compile(
    `"use cache";\nconst { x } = require("./x");\nexport async function f() { return x; }`,
  );

  expect(code).toMatch(/^"use cache";\nimport \* as \$\$cjs0 from "\.\/x";\n/);
});

test("requires the value of a JSON file and the classes of a stylesheet", async () => {
  const code = await compile(
    `const items = require("./items.json");\nconst styles = require("./a.module.css");\nexport { items, styles };`,
  );

  expect(code).toContain("const items = $$cjs0.default;");
  expect(code).toContain("const styles = $$cjs1.default;");
  expect(code).not.toContain("$$cjsRequire");
});

test("throws in a try for a module that is not there, so that its catch runs", async () => {
  const code = (
    await compileCommonJs(
      `let sharp;\ntry { sharp = require("sharp"); } catch { sharp = null; }\nconst a = require("./a");\nexport { sharp, a };`,
      { resolves: async (source) => source !== "sharp" },
    )
  )?.code;

  expect(code).not.toContain('from "sharp"');
  expect(code).toContain('sharp = $$cjsMissing("sharp");');
  expect(code).toContain('import * as $$cjs0 from "./a";');
  expect(
    runInNewContext(
      `${code!.split("\n").find((line) => line.startsWith("const $$cjsMissing"))}; (() => { try { $$cjsMissing("sharp") } catch (e) { return e.message } })()`,
    ),
  ).toBe("Cannot find module 'sharp'");
});

test("parses TypeScript", async () => {
  const code = (
    await compileCommonJs(`const a: string = require("./a") as string;\nexport { a };`, {
      lang: "ts",
    })
  )?.code;

  expect(code).toContain("const a: string = $$cjsRequire($$cjs0) as string;");
});
