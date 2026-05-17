import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type Alias, type Plugin, type UserConfig, type ViteDevServer } from "vite";
import { expect, test } from "vitest";
import { vitestPluginRSC } from "../index.ts";
import { vitestPluginNext } from "./plugin.ts";
import * as edgeUtil from "./util-edge.ts";
import * as browserUtil from "./util-browser.ts";
import { virtualNextEntrypointsPublicId } from "./virtual-ids.ts";

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
  expect(findAlias(rscAliases, "react-server-dom-webpack/server")).toEqual(
    expect.stringContaining("next/dist/compiled/react-server-dom-webpack/server.edge"),
  );
  expect(findAlias(rscAliases, "@opentelemetry/api")).toContain(
    "next/dist/compiled/@opentelemetry/api",
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
    "next/dist/compiled/react-server-dom-webpack/client.browser",
  );

  const reactSsrAliases = getEnvironmentAliases(config, "react_ssr");
  expect(findAlias(reactSsrAliases, "react-server-dom-webpack/client")).toContain(
    "react-server-dom-webpack-ssr.ts",
  );
  expect(findAlias(reactSsrAliases, "react-server-dom-webpack/server")).toContain(
    "next/dist/compiled/react-server-dom-webpack/server.edge",
  );
  expect(findAlias(reactSsrAliases, "react-server-dom-webpack/static")).toContain(
    "next/dist/compiled/react-server-dom-webpack/static.edge",
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

  const reactSsrDefine = getEnvironmentDefine(config, "react_ssr");
  expect(reactSsrDefine["process.env.NEXT_RUNTIME"]).toBe('"edge"');
});

test("does not install a synthetic Next entry-base client boundary", () => {
  expect(vitestPluginNext().map((plugin) => plugin.name)).not.toContain(
    "next-rsc-entry-base-use-client-boundary",
  );
});

test("installs Next metadata route loader resolution", () => {
  expect(vitestPluginNext().map((plugin) => plugin.name)).toContain(
    "next-rsc-metadata-route-loader",
  );
});

test("preserves source conditions for the internal Next App Router client boundary", async () => {
  const config = await resolveNextPluginConfig({
    resolve: {
      conditions: ["vitest-plugin-rsc-source", "test"],
    },
  });

  expect(getEnvironmentConditions(config, "client")).toEqual([
    "vitest-plugin-rsc-source",
    "edge-light",
    "react-server",
  ]);
  expect(getEnvironmentConditions(config, "react_client")).toEqual([
    "vitest-plugin-rsc-source",
    "edge-light",
    "browser",
  ]);
  expect(getEnvironmentConditions(config, "react_ssr")).toEqual([
    "vitest-plugin-rsc-source",
    "edge-light",
    "browser",
  ]);
  expect(config.environments?.react_client?.optimizeDeps?.include).toContain(
    "vitest-plugin-rsc/nextjs/client",
  );
  expect(config.environments?.react_ssr?.optimizeDeps?.include).not.toContain(
    "vitest-plugin-rsc/nextjs/client",
  );
});

test("importReactClient target resolves through the react_client source graph only", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-next-client-routing-"));
  let server: ViteDevServer | undefined;

  try {
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    fs.symlinkSync(path.join(fixtureRoot, "node_modules"), path.join(root, "node_modules"), "dir");

    server = await createServer({
      root,
      cacheDir: path.join(root, ".vite"),
      configFile: false,
      envFile: false,
      logLevel: "silent",
      resolve: {
        conditions: ["vitest-plugin-rsc-source", "test"],
      },
      server: { middlewareMode: true },
      plugins: [vitestPluginRSC(), vitestPluginNext()],
    });

    const resolved = await server.environments.react_client!.pluginContainer.resolveId(
      "vitest-plugin-rsc/nextjs/client",
    );

    expect(resolved?.id).toContain("packages/vitest-plugin-rsc/src/nextjs/client.tsx");
    expect(server.config.environments.react_client!.optimizeDeps.include).toContain(
      "vitest-plugin-rsc/nextjs/client",
    );
  } finally {
    await server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("appends Next route optimizer entries without replacing Vitest browser entries", async () => {
  const plugin = findNextPlugin("next-rsc-plugin");
  const configResolved = getHookHandler(plugin.configResolved);
  const config = {
    root: fixtureRoot,
    optimizeDeps: { entries: ["vitest.setup.ts"] },
    environments: {
      client: { optimizeDeps: { entries: ["client-entry.ts"] } },
      react_client: { optimizeDeps: { entries: ["react-client-entry.ts"] } },
      react_ssr: { optimizeDeps: { entries: ["react-ssr-entry.ts"] } },
    },
  };

  await configResolved.call({} as never, config as never);

  expect(config.optimizeDeps.entries).toEqual(["vitest.setup.ts", virtualNextEntrypointsPublicId]);
  expect(config.environments.client.optimizeDeps.entries).toEqual([
    "client-entry.ts",
    virtualNextEntrypointsPublicId,
  ]);
  expect(config.environments.react_client.optimizeDeps.entries).toEqual([
    "react-client-entry.ts",
    virtualNextEntrypointsPublicId,
  ]);
  expect(config.environments.react_ssr.optimizeDeps.entries).toEqual([
    "react-ssr-entry.ts",
    virtualNextEntrypointsPublicId,
  ]);
});

test("prewarms shared browser setup Next deps in the top-level optimizer", async () => {
  const config = await resolveNextPluginConfig();
  const include = config.optimizeDeps?.include ?? [];
  const rscInclude = config.environments?.client?.optimizeDeps?.include ?? [];

  expect(include).toEqual(
    expect.arrayContaining([
      "@next/routing",
      "next/dist/server/app-render/app-render.js",
      "next/dist/server/route-modules/app-page/module.js",
      "next/dist/server/web/adapter",
      "next/dist/client/components/builtin/default.js",
      "vitest-plugin-rsc/async-local-storage",
    ]),
  );
  expect(rscInclude).toEqual(
    expect.arrayContaining([
      "next/dist/client/components/client-page.js",
      "next/dist/client/components/layout-router.js",
      "next/dist/lib/framework/boundary-components.js",
    ]),
  );
});

test("prebundle aliases react-server-dom-webpack client imports through installed Next", async () => {
  const config = await resolveNextPluginConfig();

  expect(getOptimizeDepsAlias(config, "react-server-dom-webpack/client")).toContain(
    "next/dist/compiled/react-server-dom-webpack/client.edge",
  );
  expect(getOptimizeDepsAlias(config, "react-server-dom-webpack/server")).toContain(
    "next/dist/compiled/react-server-dom-webpack/server.edge",
  );
  expect(getOptimizeDepsAlias(config, "react-server-dom-webpack/server")).not.toContain(
    "server.node",
  );
  expect(getOptimizeDepsAlias(config, "react-server-dom-webpack/static")).toContain(
    "next/dist/compiled/react-server-dom-webpack/static.edge",
  );
  expect(getOptimizeDepsAlias(config, "react-server-dom-webpack/static")).not.toContain(
    "static.node",
  );
  expect(
    getEnvironmentOptimizeDepsAlias(config, "react_client", "react-server-dom-webpack/client"),
  ).toContain("next/dist/compiled/react-server-dom-webpack/client.browser");
  expect(
    getEnvironmentOptimizeDepsAlias(config, "react_client", "react-server-dom-webpack/client"),
  ).not.toContain("client.node");
  expect(
    getEnvironmentOptimizeDepsAlias(config, "react_ssr", "react-server-dom-webpack/client"),
  ).toContain("react-server-dom-webpack-ssr.ts");
  expect(
    getEnvironmentOptimizeDepsAlias(config, "react_ssr", "react-server-dom-webpack/client"),
  ).not.toContain("client.node");
  expect(getEnvironmentOptimizeDepsPluginNames(config, "react_client")).not.toContain(
    "next-rsc-server-next-internals",
  );
  expect(getEnvironmentOptimizeDepsPluginNames(config, "react_client")).toContain(
    "next-rsc-patch-react-server-dom-webpack-require",
  );
  expect(getEnvironmentOptimizeDepsPluginNames(config, "react_ssr")).toContain(
    "next-rsc-patch-react-server-dom-webpack-require",
  );
});

test("optimizes Next router RSDW client imports with environment aliases", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-next-rsdw-client-"));
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
      logLevel: "silent",
      server: { middlewareMode: true },
      plugins: [vitestPluginRSC(), vitestPluginNext()],
    });

    await warmOptimizers(server, ["react_client", "react_ssr"]);

    const reactClientRouterCode = fs.readFileSync(
      findOptimizedChunk(
        cacheDir,
        "deps_react_client",
        "next_dist_client_components_app-router-instance__js.js",
      ),
      "utf8",
    );
    const reactSsrRouterCode = fs.readFileSync(
      findOptimizedChunk(
        cacheDir,
        "deps_react_ssr",
        "next_dist_client_components_app-router-instance__js.js",
      ),
      "utf8",
    );

    expect(reactClientRouterCode).toContain(
      "next/dist/compiled/react-server-dom-webpack/client.browser.js",
    );
    expect(reactClientRouterCode).toContain("__vite_rsc_require__");
    expect(reactClientRouterCode).not.toContain("__webpack_require__");
    expect(reactClientRouterCode).not.toContain('require("react-server-dom-webpack/client")');
    expect(reactSsrRouterCode).toContain("react-server-dom-webpack-ssr.ts");
    expect(reactSsrRouterCode).toContain("next/dist/compiled/react-server-dom-webpack/client.edge");
    expect(reactSsrRouterCode).toContain("__vite_rsc_require__");
    expect(reactSsrRouterCode).not.toContain("__webpack_require__");
    expect(reactSsrRouterCode).not.toContain("react-server-dom-webpack/client.node");
    expect(reactSsrRouterCode).not.toContain('require("react-server-dom-webpack/client")');
  } finally {
    await server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 10_000);

test("optimizes real Next entry-base through use-client CJS boundaries in the RSC environment", async () => {
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
      "deps",
      "next_dist_server_app-render_entry-base__js.js",
    );
    const code = fs.readFileSync(entryBaseChunk, "utf8");

    expect(code).toContain("/@id/__x00__rsc:cjs-browser-esm:");
    expect(code).not.toContain("next-entry-base-client-reference");
    expect(code).toContain("registerClientReference");
    expect(code).not.toContain("__cjs_module_runner_transform = true");
    expect(code).not.toContain("node_modules/next/dist/client/components/layout-router.js");

    const globalErrorChunk = findOptimizedChunk(
      cacheDir,
      "deps",
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

test("react_ssr imports Next tracer with the compiled OpenTelemetry API shape", async () => {
  const virtualId = "virtual:vitest-plugin-rsc-next-tracer-import-shape";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-next-tracer-"));
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
      logLevel: "silent",
      server: { middlewareMode: true },
      plugins: [
        vitestPluginRSC(),
        vitestPluginNext(),
        {
          name: "next-tracer-import-shape-test",
          resolveId(source) {
            if (source === virtualId) return source;
          },
          load(id) {
            if (id !== virtualId) return;

            return `
              import * as api from "@opentelemetry/api";
              import * as compiledApi from "next/dist/compiled/@opentelemetry/api";
              import { getTracer } from "next/dist/server/lib/trace/tracer.js";

              export const aliasedCreateContextKeyType = typeof api.createContextKey;
              export const aliasedCreateContextKeyValueType = typeof api.createContextKey("vitest-plugin-rsc.next.trace");
              export const compiledCreateContextKeyType = typeof compiledApi.createContextKey;
              export const compiledCreateContextKeyValueType = typeof compiledApi.createContextKey("vitest-plugin-rsc.next.compiled-trace");
              export const tracerType = typeof getTracer();
            `;
          },
        },
      ],
    });

    await warmOptimizers(server, ["react_ssr"]);
    expect(
      findOptimizedChunk(cacheDir, "deps_react_ssr", "next_dist_server_lib_trace_tracer__js.js"),
    ).toBeTruthy();

    const reactSsrEnvironment = server.environments[
      "react_ssr"
    ] as (typeof server.environments)["react_ssr"] & {
      runner: {
        import<T>(id: string): Promise<T>;
      };
    };
    const mod = await reactSsrEnvironment.runner.import<{
      aliasedCreateContextKeyType: string;
      aliasedCreateContextKeyValueType: string;
      compiledCreateContextKeyType: string;
      compiledCreateContextKeyValueType: string;
      tracerType: string;
    }>(virtualId);

    expect(mod.aliasedCreateContextKeyType).toBe("function");
    expect(mod.aliasedCreateContextKeyValueType).toBe("symbol");
    expect(mod.compiledCreateContextKeyType).toBe("function");
    expect(mod.compiledCreateContextKeyValueType).toBe("symbol");
    expect(mod.tracerType).toBe("object");
  } finally {
    await server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 10_000);

test("react_ssr optimizer keeps Next setup-node-env on the edge path", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-next-setup-env-"));
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
      logLevel: "silent",
      server: { middlewareMode: true },
      plugins: [vitestPluginRSC(), vitestPluginNext()],
    });

    await warmOptimizers(server, ["react_ssr"]);

    const appPageModuleChunk = findOptimizedChunk(
      cacheDir,
      "deps_react_ssr",
      "next_dist_server_route-modules_app-page_module__js.js",
    );
    const appPageModuleCode = fs.readFileSync(appPageModuleChunk, "utf8");
    const setupNodeEnvChunk = findImportedChunk(
      appPageModuleChunk,
      appPageModuleCode,
      /^setup-node-env\.external-/,
    );
    const setupNodeEnvCode = setupNodeEnvChunk
      ? fs.readFileSync(setupNodeEnvChunk, "utf8")
      : appPageModuleCode;
    const entryBaseCode = fs.readFileSync(
      findOptimizedChunk(cacheDir, "deps_react_ssr", "next_dist_server_app-render_entry-base.js"),
      "utf8",
    );
    const renderResultCode = fs.readFileSync(
      findOptimizedChunk(cacheDir, "deps_react_ssr", "next_dist_server_render-result.js"),
      "utf8",
    );

    expect(entryBaseCode).not.toContain('__require("react-server-dom-webpack/server")');
    expect(entryBaseCode).not.toContain('__require("react-server-dom-webpack/static")');
    expect(entryBaseCode).not.toContain('__require("server-only")');
    expect(entryBaseCode).toContain("require_react()");
    expect(entryBaseCode).not.toContain(
      "ReactDOM = require_react_dom_react_server(), React = require_react()",
    );
    expect(setupNodeEnvCode).not.toContain("require_node_environment();");
    expect(setupNodeEnvCode).not.toContain('process.listeners("unhandledRejection")');
    expect(appPageModuleCode).toContain('crypto = globalThis["crypto"]');
    expect(appPageModuleCode).toContain("crypto.subtle.digest");
    expect(appPageModuleCode).toContain("crypto.randomUUID");
    expect(renderResultCode).toContain("Buffer");
    expect(renderResultCode).not.toContain("ReferenceError: Buffer is not defined");
  } finally {
    await server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 10_000);

test("composes util aliases with Next browser and Edge shapes", async () => {
  const config = await resolveNextPluginConfig();
  const rootAliases = (config.resolve?.alias ?? []) as Alias[];
  const browserFormat = browserUtil.format as typeof import("node:util").format;
  const browserTypes = browserUtil.types as typeof import("node:util").types;
  const edgeFormat = edgeUtil.format as typeof import("node:util").format;
  const edgeTypes = edgeUtil.types as typeof import("node:util").types;
  const edgeCallbackify = edgeUtil.callbackify as typeof import("node:util").callbackify;
  const edgeCallbackified = edgeCallbackify(async () => "edge");
  const edgeCallbackifyResult = await new Promise<string>((resolve, reject) => {
    edgeCallbackified((error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });

  expect(findAlias(rootAliases, "util")).toContain("next/dist/compiled/util");
  expect(findAlias(rootAliases, "node:util")).toContain("util-edge.js");
  expect(getOptimizeDepsAlias(config, "util")).toContain("next/dist/compiled/util");
  expect(getOptimizeDepsAlias(config, "node:util")).toContain("util-edge.js");

  expect(browserFormat("%s-%d", "rsc", 1)).toBe("rsc-1");
  expect(typeof browserUtil.inspect).toBe("function");
  expect(typeof browserUtil.promisify).toBe("function");
  expect(browserTypes.isPromise(Promise.resolve())).toBe(true);
  expect("TextEncoder" in browserUtil).toBe(false);
  expect("TextDecoder" in browserUtil).toBe(false);

  expect(
    Object.keys(edgeUtil)
      .filter((key) => key !== "default")
      .sort(),
  ).toEqual(["_extend", "callbackify", "format", "inherits", "promisify", "types"]);
  expect(edgeFormat("%s-%d", "edge", 1)).toBe("edge-1");
  expect(edgeCallbackifyResult).toBe("edge");
  expect(typeof edgeUtil.promisify).toBe("function");
  expect(edgeTypes.isPromise(Promise.resolve())).toBe(true);
  expect("inspect" in edgeUtil).toBe(false);
  expect("TextDecoder" in edgeUtil).toBe(false);
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

function getEnvironmentConditions(config: UserConfig, environment: string): string[] {
  const resolve = config.environments?.[environment]?.resolve as
    | { conditions?: string[] }
    | undefined;
  return resolve?.conditions ?? [];
}

function getOptimizeDepsAlias(config: UserConfig, find: string): string {
  const optimizeDeps = config.optimizeDeps as
    | {
        rolldownOptions?: {
          resolve?: {
            alias?: Record<string, string>;
          };
        };
      }
    | undefined;
  const alias = optimizeDeps?.rolldownOptions?.resolve?.alias;
  const replacement = alias?.[find];
  if (!replacement) throw new Error(`Expected optimizeDeps alias for ${find}.`);
  return replacement;
}

function getEnvironmentOptimizeDepsAlias(config: UserConfig, environment: string, find: string) {
  const optimizeDeps = config.environments?.[environment]?.optimizeDeps as
    | {
        rolldownOptions?: {
          resolve?: {
            alias?: Record<string, string>;
          };
        };
      }
    | undefined;
  const replacement = optimizeDeps?.rolldownOptions?.resolve?.alias?.[find];
  if (!replacement) throw new Error(`Expected ${environment} optimizeDeps alias for ${find}.`);
  return replacement;
}

function getEnvironmentOptimizeDepsPluginNames(config: UserConfig, environment: string) {
  const optimizeDeps = config.environments?.[environment]?.optimizeDeps as
    | {
        rolldownOptions?: {
          plugins?: Plugin[];
        };
      }
    | undefined;
  return optimizeDeps?.rolldownOptions?.plugins?.map((plugin) => plugin.name) ?? [];
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

function findOptimizedChunk(
  cacheDir: string,
  environmentDepsDir: string,
  basename: string,
): string {
  const matches: string[] = [];
  collectFiles(path.join(cacheDir, environmentDepsDir), matches, basename);
  if (matches.length !== 1) {
    throw new Error(
      `Expected one optimized ${basename} chunk in ${environmentDepsDir}, found ${matches.length}.`,
    );
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
