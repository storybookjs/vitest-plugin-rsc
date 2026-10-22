import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { createNodePlatform, instrumentationRequire } from "./node-platform.ts";

const nodePlatform = createNodePlatform("registry", "\0");

test("gives the module that loads instrumentation.ts a `require` that finds no file, as Node.js finds none", async () => {
  // As Next's module loads the file, and takes an app without one.
  const code = `async function load(file) {
    try {
      return await require(file);
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
    }
  }`;
  const replaced = instrumentationRequire(code);
  if (typeof replaced === "string") throw new Error(replaced);

  const load = runInNewContext(`${replaced.toString()}\nload`);

  await expect(load("/.next/server/instrumentation.js")).resolves.toBeUndefined();
});

test("does not stand in for the module that loads instrumentation.ts", () => {
  const specifier = "next/dist/esm/server/lib/router-utils/instrumentation-globals.external.js";

  expect(nodePlatform.moduleOf(specifier)).toBeUndefined();
});

test.for([
  ["next/dist/server/node-environment", "\0node-environment"],
  ["next/dist/esm/server/node-environment-extensions/random.js", "\0node-environment"],
  ["next/dist/esm/build/adapter/setup-node-env.external", "\0node-environment"],
  ["next/dist/compiled/gzip-size", "\0gzip-size"],
  ["next/dist/compiled/gzip-size/index.js", "\0gzip-size"],
  ["next/dist/esm/server/route-modules/app-page/vendored/rsc/entrypoints.js", "\0vendored-react"],
  ["next/dist/esm/server/node-environment-baseline.js", undefined],
])("stands in for %s with %s", ([specifier, id]) => {
  expect(nodePlatform.moduleOf(specifier!)).toBe(id);
});
