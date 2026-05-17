import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Alias, type Plugin, type UserConfig, type ViteDevServer } from "vite";
import { expect, test } from "vitest";
import { vitestPluginRSC } from "../index.ts";
import { vitestPluginNext } from "./plugin.ts";

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
  expect(JSON.parse(rscDefine["process.env.__NEXT_CACHE_LIFE"]!)).toEqual(
    expect.objectContaining({
      default: expect.objectContaining({ revalidate: 900, expire: 4294967294 }),
      "notes-demo-fast": { stale: 1, revalidate: 1, expire: 60 },
    }),
  );
  expect(rscDefine["process.env.__NEXT_PROJECT_ROOT"]).toBe(
    JSON.stringify(path.resolve(fixtureRoot)),
  );
  expect(rscDefine["process.env.__NEXT_DIST_DIR"]).toBe(JSON.stringify(".next"));

  const browserDefine = getEnvironmentDefine(config, "react_client");
  expect(browserDefine["process.env.NEXT_RUNTIME"]).toBe('""');
  expect(browserDefine["process.browser"]).toBe("true");
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

    expect(code).toContain("registerClientReference");
    expect(code).toContain("/@id/__x00__rsc:cjs-browser-esm:");
    expect(code).not.toContain("next-entry-base-client-reference");
    expect(code).not.toContain("__cjs_module_runner_transform = true");
    expect(code).not.toContain("node_modules/next/dist/client/components/layout-router.js");

    const globalErrorChunk = findOptimizedChunk(
      cacheDir,
      "next_dist_client_components_builtin_global-error__js.js",
    );
    const globalErrorCode = fs.readFileSync(globalErrorChunk, "utf8");
    const globalErrorRuntimeChunk = findImportedChunk(
      globalErrorChunk,
      globalErrorCode,
      /^global-error-/,
    );
    const globalErrorRuntimeCode = globalErrorRuntimeChunk
      ? fs.readFileSync(globalErrorRuntimeChunk, "utf8")
      : globalErrorCode;

    expect(globalErrorRuntimeCode).toContain("registerClientReference");
    expect(globalErrorRuntimeCode).not.toContain("__cjs_module_runner_transform");
  } finally {
    await server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 10_000);

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

async function warmOptimizers(server: ViteDevServer, environmentNames: string[]) {
  for (const environmentName of environmentNames) {
    await warmOptimizer(server, environmentName);
  }
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

function findImportedChunk(
  importer: string,
  code: string,
  basenamePattern: RegExp,
): string | undefined {
  for (const match of code.matchAll(/(?:from "\.\/|import\("\.\/)([^")]+\.js)/g)) {
    const basename = match[1];
    if (basename && basenamePattern.test(basename)) {
      return path.join(path.dirname(importer), basename);
    }
  }
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
