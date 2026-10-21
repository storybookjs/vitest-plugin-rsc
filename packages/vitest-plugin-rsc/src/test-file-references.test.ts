import type { Plugin, TransformResult } from "vite";
import { expect, test, vi } from "vitest";
import { referencingTestFilesLast, testFilesPlugin } from "./test-file-references.ts";

// Vite RSC's plugin that makes a client reference, which says what it was
// called with, with a filter and an order of its hook, next to one that it
// leaves as it is.
const makeReference = vi.fn(async (code: string, id: string) => `reference of ${id}: ${code}`);
const filter = { code: "use client" };
const [useClient, testFiles, other] = referencingTestFilesLast([
  { name: "rsc:use-client", transform: { filter, order: "pre", handler: makeReference } },
  { name: "rsc:other" },
]) as [Plugin, Plugin, Plugin];

// A context of a transform, in a config whose plugin of vitestPluginNext()
// says which modules are the test files of Vitest.
const config = {
  plugins: [
    {
      name: testFilesPlugin,
      api: { isModuleOfTestFile: (id: string) => id.endsWith(".test.tsx") },
    },
  ],
};
const context = { environment: { getTopLevelConfig: () => config } };
type Hook = { handler(this: unknown, code: string, id: string): Promise<TransformResult> };
const handlerOf = (plugin: Plugin) => (plugin.transform as Hook).handler;
const run = (plugin: Plugin, code: string, id: string) => handlerOf(plugin).call(context, code, id);

// A file with the directive, as written and compiled.
const written = '"use client"; as written';
const compiled = '"use client"; compiled';

test("makes the reference of any other file as Vite RSC does", async () => {
  expect(await run(useClient, written, "/app/counter.tsx")).toBe(
    `reference of /app/counter.tsx: ${written}`,
  );
  expect(await run(testFiles, compiled, "/app/counter.tsx")).toBeUndefined();
  expect(useClient.enforce).toBeUndefined();
});

test("makes the reference of a test file among the plugins enforced last, of the code they compiled", async () => {
  expect(await run(useClient, written, "/app/a.test.tsx")).toBeUndefined();
  expect(await run(testFiles, compiled, "/app/a.test.tsx")).toBe(
    `reference of /app/a.test.tsx: ${compiled}`,
  );
  expect(testFiles.enforce).toBe("post");
});

test("leaves Vite RSC's other plugins as they are", () => {
  expect(other).toEqual({ name: "rsc:other" });
});

test("makes every reference as Vite RSC does without vitestPluginNext()", async () => {
  const withoutNext = { environment: { getTopLevelConfig: () => ({ plugins: [] }) } };
  expect(await handlerOf(useClient).call(withoutNext, written, "/app/a.test.tsx")).toBe(
    `reference of /app/a.test.tsx: ${written}`,
  );
});

test("leaves a test file without the directive to Vite RSC's plugin, which removes what it referenced", async () => {
  expect(await run(useClient, "code", "/app/a.test.tsx")).toBe(
    "reference of /app/a.test.tsx: code",
  );
  expect(await run(testFiles, "code", "/app/a.test.tsx")).toBeUndefined();
});

test("keeps the filter of Vite RSC's hook, and its order for the modules of the normal order", () => {
  expect(useClient.transform).toMatchObject({ filter, order: "pre" });
  // An order would move the test files out of the plugins enforced last.
  expect(testFiles.transform).toMatchObject({ filter, order: null });
});

test("makes the reference of a hook that is a function", async () => {
  const [useClient, testFiles] = referencingTestFilesLast([
    { name: "rsc:use-client", transform: makeReference },
  ]) as [Plugin, Plugin];
  expect(await run(useClient, written, "/app/counter.tsx")).toBe(
    `reference of /app/counter.tsx: ${written}`,
  );
  expect(await run(testFiles, compiled, "/app/a.test.tsx")).toBe(
    `reference of /app/a.test.tsx: ${compiled}`,
  );
});

test("says so when Vite RSC has no plugin that makes the reference", () => {
  expect(() => referencingTestFilesLast([{ name: "rsc:other" }])).toThrow("rsc:use-client");
});

test("says so when Vite RSC's plugin has no transform", () => {
  expect(() => referencingTestFilesLast([{ name: "rsc:use-client" }])).toThrow(
    "Vite RSC's plugin `rsc:use-client` has no transform anymore.",
  );
});
