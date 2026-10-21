import type { Plugin } from "vite";
import { expect, test, vi } from "vitest";
import { referencingTestFilesLast, testFilesPlugin } from "./test-file-references.ts";

// Vite RSC's plugin that makes a client reference, which says what it was
// called with, next to one that it leaves as it is.
const makeReference = vi.fn(async (code: string, id: string) => `reference of ${id}: ${code}`);
const [useClient, testFiles, other] = referencingTestFilesLast([
  { name: "rsc:use-client", transform: { handler: makeReference } },
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
const run = (plugin: Plugin, code: string, id: string) =>
  (plugin.transform as (code: string, id: string) => unknown).call(context, code, id);

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
  const transform = useClient.transform as (code: string, id: string) => Promise<unknown>;
  expect(await transform.call(withoutNext, written, "/app/a.test.tsx")).toBe(
    `reference of /app/a.test.tsx: ${written}`,
  );
});

test("leaves a test file without the directive to Vite RSC's plugin, which removes what it referenced", async () => {
  expect(await run(useClient, "code", "/app/a.test.tsx")).toBe(
    "reference of /app/a.test.tsx: code",
  );
  expect(await run(testFiles, "code", "/app/a.test.tsx")).toBeUndefined();
});

test("says so when Vite RSC has no plugin that makes the reference", () => {
  expect(() => referencingTestFilesLast([{ name: "rsc:other" }])).toThrow("rsc:use-client");
});
