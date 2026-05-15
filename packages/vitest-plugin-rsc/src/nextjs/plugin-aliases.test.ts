import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Alias, type Plugin, type UserConfig, type ViteDevServer } from "vite";
import { expect, test } from "vitest";
import { vitestPluginRSC } from "../index";
import { nextTesterHtmlPath, vitestPluginNext } from "./plugin";

const fixtureRoot = fileURLToPath(
  new URL("../../../../playground/nextjs-notes-demo/", import.meta.url),
);
const noMswFixtureRoot = fileURLToPath(
  new URL("../../../../playground/nextjs-no-msw-demo/", import.meta.url),
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
  expect(JSON.parse(rewritesDefine!)).toEqual(
    expect.objectContaining({
      afterFiles: expect.arrayContaining([
        expect.objectContaining({ source: "/next-config-rewrite", destination: "/next-apis" }),
        expect.objectContaining({
          source: "/next-apis",
          destination: "/route-patterns/conventions?from=after-files-shadow",
        }),
      ]),
    }),
  );
  expect(rscDefine["process.env.__NEXT_CACHE_MAX_MEMORY_SIZE"]).toBe("52428800");
  expect(JSON.parse(rscDefine["process.env.__NEXT_CACHE_HANDLERS"]!)).toEqual({
    "notes-custom": expect.stringContaining("cache-handler.mjs"),
  });
  expect(rscDefine["process.env.__NEXT_PROJECT_ROOT"]).toBe(
    JSON.stringify(path.resolve(fixtureRoot)),
  );
  expect(rscDefine["process.env.__NEXT_DIST_DIR"]).toBe(JSON.stringify(".next"));

  const browserDefine = getEnvironmentDefine(config, "react_client");
  expect(browserDefine["process.env.NEXT_RUNTIME"]).toBe('""');
  expect(browserDefine["process.browser"]).toBe("true");
});

test("sets the Next tester HTML in Vitest browser projects by default", async () => {
  const config = await resolveNextPluginConfig();

  expect(getBrowserTesterHtmlPath(config)).toBe(nextTesterHtmlPath);
});

test("adds Next app source files as optimizer scan entries", async () => {
  const config = await resolveNextPluginConfig();

  expect(getEnvironmentOptimizeDepsEntries(config, "client")).toContain(
    "app/**/*.{js,jsx,ts,tsx,md,mdx}",
  );
  expect(getEnvironmentOptimizeDepsEntries(config, "react_client")).toContain(
    "app/**/*.{js,jsx,ts,tsx,md,mdx}",
  );
  expect(getEnvironmentOptimizeDepsEntries(config, "react_ssr")).toContain(
    "app/**/*.{js,jsx,ts,tsx,md,mdx}",
  );
});

test("rewrites Next server-runtime checks only for Next internals in the RSC environment", async () => {
  const plugin = findNextPlugin("next-rsc-server-next-internals");
  const transform = getHookHandler(plugin.transform);
  const code = `
    export const runtime = process.env.NEXT_RUNTIME;
    export const hasWindow = typeof window !== "undefined";
    export const indexedWindow = typeof window.document;
  `;

  expect(plugin.applyToEnvironment?.({ name: "client" } as never)).toBe(true);
  expect(plugin.applyToEnvironment?.({ name: "react_client" } as never)).toBe(false);

  const result = (await transform.call(
    {} as never,
    code,
    path.join(fixtureRoot, "node_modules/next/dist/server/app-render/work-async-storage.js"),
  )) as { code: string };

  expect(result.code).toContain('export const runtime = "edge";');
  expect(result.code).toContain('export const hasWindow = "undefined" !== "undefined";');
  expect(result.code).toContain("export const indexedWindow = typeof window.document;");
  expect(
    await transform.call({} as never, code, path.join(fixtureRoot, "node_modules/react/index.js")),
  ).toBeUndefined();
});

test("disables Next dev-server runtime checks only inside Next internals", async () => {
  const plugin = findNextPlugin("next-rsc-disable-next-dev-server-runtime");
  const transform = getHookHandler(plugin.transform);
  const code = `
    export const isNextDevServer = process.env.__NEXT_DEV_SERVER;
  `;

  const result = (await transform.call(
    {} as never,
    code,
    path.join(fixtureRoot, "node_modules/next/dist/client/components/app-router.js"),
  )) as { code: string };

  expect(result.code).toContain("export const isNextDevServer = false;");
  expect(
    await transform.call({} as never, code, path.join(fixtureRoot, "node_modules/react/index.js")),
  ).toBeUndefined();
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

test("proxies Next entry-base client imports with comment-wrapped CJS exports", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-next-"));
  try {
    const entryBaseFile = path.join(root, "node_modules/next/dist/server/app-render/entry-base.js");
    const moduleFile = path.join(
      root,
      "node_modules/next/dist/client/components/commented-export.js",
    );
    fs.mkdirSync(path.dirname(entryBaseFile), { recursive: true });
    fs.mkdirSync(path.dirname(moduleFile), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");
    fs.writeFileSync(entryBaseFile, "");
    fs.writeFileSync(
      moduleFile,
      `
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
Object.defineProperty(exports, /**
 * Next 16.0/16.1 SWC keeps comments before the export name.
 */ "default", {
  enumerable: true,
  get: function() { return CommentedExport; }
});
function CommentedExport() {}
`,
    );

    const plugin = findNextPlugin("next-rsc-entry-base-client-references");
    const configResolved = getHookHandler(plugin.configResolved);
    const resolveId = getHookHandler(plugin.resolveId);
    const load = getHookHandler(plugin.load);

    await configResolved.call({} as never, { root } as never);

    const resolved = (await resolveId.call(
      {} as never,
      "../../client/components/commented-export",
      entryBaseFile,
      {} as never,
    )) as string;
    const serverCode = (await load.call({} as never, resolved, {} as never)) as string;

    expect(serverCode).toContain('export default createClientReference("default");');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("optimizes real Next entry-base with client-reference proxies in the RSC environment", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-next-optimizer-"));
  const cacheDir = path.join(root, ".vite");
  let server: ViteDevServer | undefined;

  try {
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    fs.symlinkSync(path.join(fixtureRoot, "node_modules"), path.join(root, "node_modules"), "dir");

    server = await createServer({
      root,
      cacheDir,
      configFile: false,
      envFile: false,
      server: { middlewareMode: true },
      plugins: [vitestPluginRSC(), vitestPluginNext()],
    });

    await warmOptimizers(server, ["client", "react_client", "react_ssr"]);

    const entryBaseChunk = findOptimizedChunk(
      cacheDir,
      "next_dist_server_app-render_entry-base__js.js",
    );
    const code = fs.readFileSync(entryBaseChunk, "utf8");

    expect(code).toContain(
      'import { registerClientReference } from "@vitejs/plugin-rsc/react/rsc"',
    );
    expect(code).toContain("vitest-plugin-rsc:next-entry-base-client-reference:");
    expect(code).not.toContain("node_modules/next/dist/client/components/layout-router.js");
  } finally {
    await server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
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

test("binds closure values for hoisted use cache directives", async () => {
  const plugin = findNextPlugin("next-rsc-use-cache-transform");
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
  const plugin = findNextPlugin("next-rsc-use-cache-transform");
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
  const plugin = findNextPlugin("next-rsc-use-cache-transform");
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
  const plugin = findNextPlugin("next-rsc-use-cache-transform");
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

function getEnvironmentOptimizeDepsEntries(config: UserConfig, environment: string): string[] {
  return (config.environments?.[environment]?.optimizeDeps?.entries ?? []) as string[];
}

function getBrowserTesterHtmlPath(config: UserConfig): string | undefined {
  return (config as { test?: { browser?: { testerHtmlPath?: string } } }).test?.browser
    ?.testerHtmlPath;
}

async function warmOptimizers(server: ViteDevServer, environmentNames: string[]) {
  await Promise.all(
    environmentNames.map((environmentName) => warmOptimizer(server, environmentName)),
  );
}

async function warmOptimizer(server: ViteDevServer, environmentName: string) {
  const optimizer = server.environments[environmentName]?.depsOptimizer;
  if (!optimizer) throw new Error("Expected client deps optimizer.");

  await optimizer.init();
  if (optimizer.scanProcessing) {
    await optimizer.scanProcessing;
  }
  optimizer.run();
  await Promise.allSettled(
    optimizer.metadata.depInfoList.flatMap((dep) => (dep.processing ? [dep.processing] : [])),
  );
}

function findOptimizedChunk(cacheDir: string, basename: string): string {
  const matches: string[] = [];
  collectFiles(cacheDir, matches, basename);
  if (matches.length !== 1) {
    throw new Error(`Expected one optimized ${basename} chunk, found ${matches.length}.`);
  }
  return matches[0]!;
}

function collectFiles(directory: string, matches: string[], basename: string) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(file, matches, basename);
    } else if (entry.name === basename) {
      matches.push(file);
    }
  }
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
