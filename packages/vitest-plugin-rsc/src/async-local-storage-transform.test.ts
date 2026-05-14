import { parse } from "@babel/parser";
import { expect, test } from "vitest";
import { createAsyncLocalStorageTransformPlugin } from "./async-local-storage-transform";

type TransformOutput = { code: string };

const transformHook = createAsyncLocalStorageTransformPlugin().transform as (
  code: string,
  id: string,
) => TransformOutput | undefined;

function transform(code: string, id = "/workspace/src/example.test.tsx"): string | undefined {
  return transformHook(code, id)?.code;
}

function expectParseable(code: string): void {
  expect(() =>
    parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript", "importAttributes"],
    }),
  ).not.toThrow();
}

test("inserts the helper import after module directives", () => {
  const output = transform(`
"use client";

export async function load() {
  return await fetchData();
}
`);

  expect(output).toBeDefined();
  expect(output).toContain(
    `"use client";\n/* _processed_vitest_plugin_rsc_async_context */\nimport { executeAsync as __vitestPluginRscExecuteAsync } from "vitest-plugin-rsc/async-local-storage";`,
  );
  expectParseable(output!);
});

test("skips files that should not be transformed", () => {
  const code = "export async function load() { return await fetchData(); }";

  expect(transform(code, "/workspace/node_modules/pkg/file.ts")).toBeUndefined();
  expect(
    transform(code, "/workspace/packages/vitest-plugin-rsc/dist/testing-library-client.js"),
  ).toBeUndefined();
  expect(transform(code, "/workspace/src/vitest.setup.ts")).toBeUndefined();
  expect(transform("export function load() { return fetchData(); }")).toBeUndefined();
});

test("does not transform a file twice", () => {
  const output = transform("export async function load() { return await fetchData(); }");

  expect(output).toBeDefined();
  expect(transform(output!)).toBeUndefined();
});

test("keeps transformed nested awaits parseable", () => {
  const output = transform(`
export async function load() {
  return await first(await second());
}
`);

  expect(output).toBeDefined();
  expect(output).toContain("__vitestPluginRscExecuteAsync");
  expectParseable(output!);
});

test("does not inject an empty statement before single-statement loop bodies", () => {
  const output = transform(`
export async function visitAll(items: string[]) {
  for (const item of items) await visit(item);
}
`);

  expect(output).toBeDefined();
  expect(output).not.toContain("for (const item of items) ;(");
  expectParseable(output!);
});
