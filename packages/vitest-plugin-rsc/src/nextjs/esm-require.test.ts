import { runInNewContext } from "node:vm";
import { rolldown, type Plugin } from "rolldown";
import { expect, test } from "vitest";
import { esmRequirePlugin } from "./esm-require.ts";

// Modules of CommonJS that require an ES module, bundled by Rolldown as the
// optimizer bundles them, with the plugin or without.
const files: Record<string, string> = {
  "/entry.js": `import { requireB } from "./a.cjs";\nexport { requireB };`,
  "/a.cjs": `exports.requireB = () => require("./b.js");`,
  "/b.js": `export let count = 0;\nexport function add() { count++; }`,
};
const virtual: Plugin = {
  name: "virtual",
  resolveId: (source) => (source.startsWith("./") ? source.slice(1) : source),
  load: (id) => files[id],
};

async function bundled(plugins: Plugin[]) {
  const build = await rolldown({ input: "/entry.js", plugins: [virtual, ...plugins] });
  const { output } = await build.generate({ format: "cjs", exports: "named" });
  const cjs = { exports: {} as { requireB: () => { count: number; add(): void } } };
  runInNewContext(output[0].code, { module: cjs, exports: cjs.exports });
  return cjs.exports;
}

test("a require() of an ES module returns the same object every time, as in Node.js", async () => {
  const { requireB } = await bundled([esmRequirePlugin() as Plugin]);

  expect(requireB()).toBe(requireB());
});

test("the object has the exports of the module, as they are when they are read", async () => {
  const { requireB } = await bundled([esmRequirePlugin() as Plugin]);
  const b = requireB();
  b.add();

  expect(requireB().count).toBe(1);
  expect(Object.keys(b)).toEqual(["add", "count"]);
});

test("Rolldown's own runtime makes a new object for each require()", async () => {
  // When this fails, Rolldown caches by itself, and the plugin can go.
  const { requireB } = await bundled([]);

  expect(requireB()).not.toBe(requireB());
});
