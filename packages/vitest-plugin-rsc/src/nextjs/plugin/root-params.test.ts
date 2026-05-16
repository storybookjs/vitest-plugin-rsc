import { expect, test } from "vitest";
import { useNextRootParams } from "./root-params.ts";
import { fixtureRoot, getHookHandler } from "./test-utils.ts";

test("replaces next/root-params through Next's root params loader", async () => {
  const plugin = useNextRootParams("client", true);
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const previousCwd = process.cwd();

  process.chdir(fixtureRoot);
  try {
    await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

    expect(await resolveId.call({} as never, "next/root-params", undefined, {} as never)).toBe(
      "\0vitest-plugin-rsc:next-root-params",
    );
    expect(await load.call({} as never, "\0vitest-plugin-rsc:next-root-params", {} as never)).toBe(
      "export {}",
    );
  } finally {
    process.chdir(previousCwd);
  }
});

test("rejects next/root-params from client component environments", async () => {
  const plugin = useNextRootParams("react_client", false);
  const configResolved = getHookHandler(plugin.configResolved);
  const load = getHookHandler(plugin.load);

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  await expect(
    load.call({} as never, "\0vitest-plugin-rsc:next-root-params", {} as never),
  ).resolves.toContain("cannot be imported from a Client Component module");
});
