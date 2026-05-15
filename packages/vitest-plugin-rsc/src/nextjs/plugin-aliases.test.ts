import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Alias, Plugin, UserConfig } from "vite";
import { expect, test } from "vitest";
import { nextTesterHtmlPath, vitestPluginNext } from "./plugin";

const fixtureRoot = fileURLToPath(
  new URL("../../../../playground/nextjs-notes-demo/", import.meta.url),
);

test("aliases React packages through Next's vendored React for app-router environments", async () => {
  const config = await resolveNextPluginConfig();

  const rscAliases = getEnvironmentAliases(config, "client");
  expect(findAlias(rscAliases, "react")).toContain("next/dist/compiled/react/react.react-server");
  expect(findAlias(rscAliases, "react/compiler-runtime")).toContain(
    "next/dist/compiled/react/compiler-runtime",
  );
  expect(findAlias(rscAliases, "react/jsx-dev-runtime")).toContain(
    "next/dist/compiled/react/jsx-dev-runtime.react-server",
  );
  expect(findAlias(rscAliases, "react/jsx-runtime")).toContain(
    "next/dist/compiled/react/jsx-runtime.react-server",
  );
  expect(findAlias(rscAliases, "react-dom")).toContain(
    "next/dist/compiled/react-dom/react-dom.react-server",
  );
  expect(findAlias(rscAliases, "react-dom/server")).toContain(
    "next/dist/build/webpack/alias/react-dom-server",
  );
  expect(findAlias(rscAliases, "react-dom/static")).toContain(
    "next/dist/compiled/react-dom/static.edge",
  );
  expect(findAlias(rscAliases, "react-server-dom-webpack/server")).toBe(
    "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge",
  );

  const browserAliases = getEnvironmentAliases(config, "react_client");
  expect(findAlias(browserAliases, "react")).toContain("next/dist/compiled/react/index.js");
  expect(findAlias(browserAliases, "react/compiler-runtime")).toContain(
    "next/dist/compiled/react/compiler-runtime",
  );
  expect(findAlias(browserAliases, "react/jsx-dev-runtime")).toContain(
    "next/dist/compiled/react/jsx-dev-runtime",
  );
  expect(findAlias(browserAliases, "react/jsx-runtime")).toContain(
    "next/dist/compiled/react/jsx-runtime",
  );
  expect(findAlias(browserAliases, "react-dom/client")).toContain(
    "next/dist/compiled/react-dom/client",
  );
  expect(findAlias(browserAliases, "react-dom/server")).toContain(
    "next/dist/compiled/react-dom/server.browser",
  );
  expect(findAlias(browserAliases, "react-dom/static")).toContain(
    "next/dist/compiled/react-dom/static.browser",
  );
  expect(findAlias(browserAliases, "react-server-dom-webpack/client")).toContain(
    "@vitejs/plugin-rsc",
  );
  expect(findAlias(browserAliases, "react-server-dom-webpack/client")).toContain(
    "react-server-dom/client.browser",
  );

  const rscDefine = getEnvironmentDefine(config, "client");
  expect(rscDefine["process.env.NEXT_RUNTIME"]).toBe('"edge"');
  expect(rscDefine["process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS"]).toBe("true");
  expect(rscDefine["process.env.__NEXT_HAS_REWRITES"]).toBe("true");
  expect(rscDefine["process.env.__NEXT_BUNDLER"]).toBe('"Webpack"');
  expect(rscDefine["process.env.__NEXT_DEV_SERVER"]).toBe('""');
  const rewritesDefine = rscDefine["process.env.__NEXT_REWRITES"];
  expect(rewritesDefine).toBeDefined();
  expect(JSON.parse(rewritesDefine!)).toMatchObject({
    afterFiles: [{ source: "/next-config-rewrite", destination: "/next-apis" }],
  });

  const browserDefine = getEnvironmentDefine(config, "react_client");
  expect(browserDefine["process.env.NEXT_RUNTIME"]).toBe('""');
  expect(browserDefine["process.browser"]).toBe("true");
});

test("sets the Next tester HTML in Vitest browser projects by default", async () => {
  const config = await resolveNextPluginConfig();

  expect(getBrowserTesterHtmlPath(config)).toBe(nextTesterHtmlPath);
});

test("does not replace a user-provided Vitest browser tester HTML", async () => {
  const config = await resolveNextPluginConfig({
    test: {
      browser: {
        testerHtmlPath: "/custom/tester.html",
      },
    },
  } as UserConfig);

  expect(getBrowserTesterHtmlPath(config)).toBeUndefined();
});

test("does not replace user-provided Vitest browser instance tester HTML", async () => {
  const config = await resolveNextPluginConfig({
    test: {
      browser: {
        instances: [{ testerHtmlPath: "/custom/chromium.html" }],
      },
    },
  } as UserConfig);

  expect(getBrowserTesterHtmlPath(config)).toBeUndefined();
});

test("replaces next/root-params through Next's root params loader", async () => {
  const plugin = findNextPlugin("next-rsc-root-params:client");
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

test("proxies Next entry-base client imports as RSC client references", async () => {
  const plugin = findNextPlugin("next-rsc-entry-base-client-references");
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const entryBaseFile = path.join(
    fixtureRoot,
    "node_modules/next/dist/server/app-render/entry-base.js",
  );
  const encodedModuleId = encodeURIComponent("next/dist/client/components/layout-router.js");

  await configResolved.call({} as never, { root: fixtureRoot } as never);

  const resolved = (await resolveId.call(
    {} as never,
    "../../client/components/layout-router",
    entryBaseFile,
    {} as never,
  )) as string;
  const serverCode = (await load.call({} as never, resolved, {} as never)) as string;
  const browserCode = (await load.call(
    { environment: { name: "react_client" } } as never,
    resolved,
    {} as never,
  )) as string;

  expect(resolved).toBe(`\0vitest-plugin-rsc:next-entry-base-client-reference:${encodedModuleId}`);
  expect(serverCode).toContain(
    'import { registerClientReference } from "@vitejs/plugin-rsc/react/rsc"',
  );
  expect(serverCode).toContain(
    `"/@id/__x00__vitest-plugin-rsc:next-entry-base-client-reference:${encodedModuleId}"`,
  );
  expect(serverCode).toContain('export default createClientReference("default");');
  expect(serverCode).toContain(
    'export const LoadingBoundaryProvider = createClientReference("LoadingBoundaryProvider");',
  );
  expect(browserCode).toContain('"use client"');
  expect(browserCode).toContain("next/dist/client/components/layout-router.js");
});

test("proxies Next entry-base devtools client imports as RSC client references", async () => {
  const plugin = findNextPlugin("next-rsc-entry-base-client-references");
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const entryBaseFile = path.join(
    fixtureRoot,
    "node_modules/next/dist/server/app-render/entry-base.js",
  );
  const encodedModuleId = encodeURIComponent(
    "next/dist/next-devtools/userspace/app/segment-explorer-node.js",
  );

  await configResolved.call({} as never, { root: fixtureRoot } as never);

  const resolved = (await resolveId.call(
    {} as never,
    "../../next-devtools/userspace/app/segment-explorer-node",
    entryBaseFile,
    {} as never,
  )) as string;
  const serverCode = (await load.call({} as never, resolved, {} as never)) as string;
  const browserCode = (await load.call(
    { environment: { name: "react_client" } } as never,
    resolved,
    {} as never,
  )) as string;

  expect(resolved).toBe(`\0vitest-plugin-rsc:next-entry-base-client-reference:${encodedModuleId}`);
  expect(serverCode).toContain(
    'export const SegmentViewNode = createClientReference("SegmentViewNode");',
  );
  expect(serverCode).toContain(
    'export const SegmentViewStateNode = createClientReference("SegmentViewStateNode");',
  );
  expect(serverCode).toContain(
    'export const SegmentBoundaryTriggerNode = createClientReference("SegmentBoundaryTriggerNode");',
  );
  expect(browserCode).toContain('"use client"');
  expect(browserCode).toContain("next/dist/next-devtools/userspace/app/segment-explorer-node.js");
});

test("does not proxy Next entry-base server imports as client references", async () => {
  const plugin = findNextPlugin("next-rsc-entry-base-client-references");
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const entryBaseFile = path.join(
    fixtureRoot,
    "node_modules/next/dist/server/app-render/entry-base.js",
  );

  await configResolved.call({} as never, { root: fixtureRoot } as never);

  expect(
    await resolveId.call(
      {} as never,
      "../app-render/work-async-storage.external",
      entryBaseFile,
      {} as never,
    ),
  ).toBeUndefined();
});

test("hoists use cache directives to Next's cache wrapper when cacheComponents is enabled", async () => {
  const plugin = findNextPlugin("next-rsc-use-cache-transform");
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
  const plugin = findNextPlugin("next-rsc-use-cache-transform");
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

async function resolveNextPluginConfig(userConfig: UserConfig = {}): Promise<UserConfig> {
  const previousCwd = process.cwd();
  const plugin = findNextPlugin("next-rsc-plugin");

  const config = getHookHandler(plugin.config);
  process.chdir(fixtureRoot);
  try {
    return (await config.call(
      {} as never,
      { root: fixtureRoot, ...userConfig } as never,
      { command: "serve", mode: "test", isPreview: false, isSsrBuild: false } as never,
    )) as UserConfig;
  } finally {
    process.chdir(previousCwd);
  }
}

function findNextPlugin(name: string): Plugin {
  const plugin = vitestPluginNext().find((candidate) => candidate.name === name);
  if (!plugin) throw new Error(`Could not find ${name}.`);
  return plugin;
}

function findAlias(aliases: Alias[], find: string) {
  const match = aliases.find((alias): alias is Alias & { find: string } => alias.find === find);
  if (!match) throw new Error(`Expected alias for ${find}.`);
  return match.replacement;
}

function getEnvironmentAliases(config: UserConfig, environment: string): Alias[] {
  const resolve = config.environments?.[environment]?.resolve as { alias?: Alias[] } | undefined;
  return resolve?.alias ?? [];
}

function getEnvironmentDefine(config: UserConfig, environment: string): Record<string, string> {
  return (config.environments?.[environment]?.define ?? {}) as Record<string, string>;
}

function getBrowserTesterHtmlPath(config: UserConfig): string | undefined {
  return (config as { test?: { browser?: { testerHtmlPath?: string } } }).test?.browser
    ?.testerHtmlPath;
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
