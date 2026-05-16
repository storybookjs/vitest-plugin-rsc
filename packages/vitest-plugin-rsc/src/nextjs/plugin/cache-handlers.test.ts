import { expect, test } from "vitest";
import { useNextCacheHandlers, virtualNextCacheHandlersPublicId } from "./cache-handlers.ts";
import { fixtureRoot, getHookHandler, noMswFixtureRoot } from "./test-utils.ts";

test("loads configured Next cache handlers from project config", async () => {
  const plugin = useNextCacheHandlers();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  expect(
    await resolveId.call({} as never, virtualNextCacheHandlersPublicId, undefined, {} as never),
  ).toBe(`\0${virtualNextCacheHandlersPublicId}`);
  const code = await load.call({} as never, `\0${virtualNextCacheHandlersPublicId}`, {} as never);
  expect(code).toContain("cache-handler.mjs");
  expect(code).toContain('"notes-custom": cacheHandler_0');
});

test("returns an empty cache handler map when none are configured", async () => {
  const plugin = useNextCacheHandlers();
  const configResolved = getHookHandler(plugin.configResolved);
  const load = getHookHandler(plugin.load);

  await configResolved.call({} as never, { root: noMswFixtureRoot, mode: "test" } as never);

  await expect(
    load.call({} as never, `\0${virtualNextCacheHandlersPublicId}`, {} as never),
  ).resolves.toBe("export const nextCacheHandlers = {};\n");
});
