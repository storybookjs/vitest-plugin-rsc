import type { Plugin, ResolvedConfig } from "vite";
import { expect, test, vi } from "vitest";
import { lookupEnvironment, mapOfRelatedLookup, useServerPlugin } from "./related-lookup.ts";

// Vite RSC's plugin that makes a server reference, which says what it was
// called with, next to one that it leaves as it is.
const makeReference = vi.fn(async (code: string, id: string) => `reference of ${id}: ${code}`);
const filter = { code: "use server" };
const makePlugins = () =>
  mapOfRelatedLookup([
    { name: useServerPlugin, transform: { filter, handler: makeReference } },
    { name: "rsc:other" },
  ]) as [Plugin, Plugin, Plugin];

type Hook = (this: unknown, ...args: unknown[]) => unknown;
const hookOf = (hook: unknown) =>
  (typeof hook === "function" ? hook : (hook as { handler: Hook }).handler) as Hook;

// The config of a project of Vitest, and a context of a transform in one of
// its environments.
const projectConfig = () => ({}) as ResolvedConfig;
const inEnvironment = (name: string, config: ResolvedConfig) => ({
  environment: { name, getTopLevelConfig: () => config },
});
const configure = (lookup: Plugin, config: ResolvedConfig, { browser }: { browser: boolean }) =>
  hookOf(lookup.configureVitest).call(lookup, {
    project: { config: { browser: { enabled: browser } }, vite: { config } },
  });

const action = '"use server"; export async function save() {}';
const reference = `reference of /app/save.ts: ${action}`;

test("in Browser Mode the lookup's environment keeps the code of a Server Action", async () => {
  const [lookup, useServer] = makePlugins();
  const config = projectConfig();
  configure(lookup, config, { browser: true });
  const transform = hookOf(useServer.transform);

  expect(
    await transform.call(inEnvironment(lookupEnvironment, config), action, "/app/save.ts"),
  ).toBeUndefined();
  expect(await transform.call(inEnvironment("client", config), action, "/app/save.ts")).toBe(
    reference,
  );
  // With Vite RSC's filter.
  expect(useServer.transform).toMatchObject({ filter });
});

test("a module that Vite RSC refuses still fails in the lookup's environment", async () => {
  const [lookup, useServer] = makePlugins();
  const config = projectConfig();
  configure(lookup, config, { browser: true });
  makeReference.mockRejectedValueOnce(new Error("only async functions"));

  await expect(
    hookOf(useServer.transform).call(
      inEnvironment(lookupEnvironment, config),
      '"use server"; export const limit = 5;',
      "/app/save.ts",
    ),
  ).rejects.toThrow("only async functions");
});

test("a server that a project in Node.js shares does not draw the map", async () => {
  const [lookup, useServer] = makePlugins();
  const shared = projectConfig();
  configure(lookup, shared, { browser: true });
  configure(lookup, shared, { browser: false });

  expect(
    await hookOf(useServer.transform).call(
      inEnvironment(lookupEnvironment, shared),
      action,
      "/app/save.ts",
    ),
  ).toBe(reference);
});

test("Vite RSC makes every reference for a project in Node.js, and without Vitest", async () => {
  const [lookup, useServer] = makePlugins();
  const inNode = projectConfig();
  configure(lookup, inNode, { browser: false });
  const transform = hookOf(useServer.transform);

  expect(
    await transform.call(inEnvironment(lookupEnvironment, inNode), action, "/app/save.ts"),
  ).toBe(reference);
  expect(
    await transform.call(inEnvironment(lookupEnvironment, projectConfig()), action, "/app/save.ts"),
  ).toBe(reference);
});

test("leaves Vite RSC's other plugins as they are, and says when its plugin is gone", () => {
  expect(makePlugins()[2]).toEqual({ name: "rsc:other" });
  expect(() => mapOfRelatedLookup([{ name: "rsc:other" }])).toThrow(
    "Vite RSC has no plugin `rsc:use-server` anymore",
  );
});
