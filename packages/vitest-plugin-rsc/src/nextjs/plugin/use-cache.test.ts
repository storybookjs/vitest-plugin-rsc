import path from "node:path";
import { expect, test } from "vitest";
import { useNextUseCacheTransform } from "./use-cache.ts";
import { fixtureRoot, getHookHandler, noMswFixtureRoot } from "./test-utils.ts";

test("hoists use cache directives to Next's cache wrapper when cacheComponents is enabled", async () => {
  const plugin = useNextUseCacheTransform();
  const configResolved = getHookHandler(plugin.configResolved);
  const transform = getHookHandler(plugin.transform);

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  const result = (await transform.call(
    { environment: { name: "client" } } as never,
    `
      export async function readCachedValue() {
        "use cache";
        return "cached";
      }
    `,
    path.join(fixtureRoot, "app/next-apis/use-cache-fixture.ts"),
  )) as { code: string };

  expect(result.code).toContain("virtual:vitest-plugin-rsc/next-use-cache-runtime");
  expect(result.code).toContain("__next_rsc_use_cache(");
  expect(result.code).toContain('"default"');
  expect(result.code).toContain("app/next-apis/use-cache-fixture.ts#$$hoist_0_readCachedValue");
  expect(result.code).toContain("export const readCachedValue");
  expect(result.code).toContain("async function $$hoist_0_readCachedValue()");
});

test("preserves Next use cache directive kinds", async () => {
  const plugin = useNextUseCacheTransform();
  const configResolved = getHookHandler(plugin.configResolved);
  const transform = getHookHandler(plugin.transform);

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  const result = (await transform.call(
    { environment: { name: "client" } } as never,
    `
      export async function readRemoteValue() {
        "use cache: remote";
        return "remote";
      }

      export async function readPrivateValue() {
        "use cache: private";
        return "private";
      }
    `,
    path.join(fixtureRoot, "app/next-apis/use-cache-kind-fixture.ts"),
  )) as { code: string };

  expect(result.code).toContain('"remote"');
  expect(result.code).toContain('"private"');
  expect(result.code).toContain("use-cache-kind-fixture.ts#$$hoist_0_readRemoteValue");
  expect(result.code).toContain("use-cache-kind-fixture.ts#$$hoist_1_readPrivateValue");
});

test("binds closure values for hoisted use cache directives", async () => {
  const plugin = useNextUseCacheTransform();
  const configResolved = getHookHandler(plugin.configResolved);
  const transform = getHookHandler(plugin.transform);

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  const result = (await transform.call(
    { environment: { name: "client" } } as never,
    `
      export async function readCachedValue(prefix: string) {
        async function inner(suffix: string) {
          "use cache";
          return prefix + ":" + suffix;
        }

        return inner("value");
      }
    `,
    path.join(fixtureRoot, "app/next-apis/use-cache-closure-fixture.ts"),
  )) as { code: string };

  expect(result.code).toContain("__next_rsc_use_cache(");
  expect(result.code).toContain("app/next-apis/use-cache-closure-fixture.ts#$$hoist_0_inner");
  expect(result.code).toContain("async function $$hoist_0_inner(prefix, suffix: string)");
  expect(result.code).toContain(".bind(null, prefix)");
});

test("rejects cached components with children until Next bound args are supported", async () => {
  const plugin = useNextUseCacheTransform();
  const configResolved = getHookHandler(plugin.configResolved);
  const transform = getHookHandler(plugin.transform);

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  await expect(
    transform.call(
      { environment: { name: "client" } } as never,
      `
        export async function CachedBox({ children }: { children: React.ReactNode }) {
          "use cache";

          return <section>{children}</section>;
        }
      `,
      path.join(fixtureRoot, "app/next-apis/use-cache-component-fixture.tsx"),
    ),
  ).rejects.toThrow(/cached components with children.*boundArgsLength/i);
});

test("does not hoist use cache directives when cacheComponents is disabled", async () => {
  const plugin = useNextUseCacheTransform();
  const configResolved = getHookHandler(plugin.configResolved);
  const transform = getHookHandler(plugin.transform);

  await configResolved.call({} as never, { root: noMswFixtureRoot, mode: "test" } as never);

  const result = await transform.call(
    { environment: { name: "client" } } as never,
    `
      export async function readCachedValue() {
        "use cache";
        return "cached";
      }
    `,
    path.join(noMswFixtureRoot, "app/use-cache-disabled-fixture.ts"),
  );

  expect(result).toBeUndefined();
});

test("does not hoist use cache files from another Next project root", async () => {
  const plugin = useNextUseCacheTransform();
  const configResolved = getHookHandler(plugin.configResolved);
  const transform = getHookHandler(plugin.transform);

  await configResolved.call({} as never, { root: noMswFixtureRoot, mode: "test" } as never);

  const result = await transform.call(
    { environment: { name: "client" } } as never,
    `
      export async function readCachedValue() {
        "use cache";
        return "cached";
      }
    `,
    path.join(fixtureRoot, "components/next-cache-probe.tsx"),
  );

  expect(result).toBeUndefined();
});
