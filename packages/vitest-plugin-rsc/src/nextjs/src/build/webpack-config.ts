import { fileURLToPath } from "node:url";
import { defaultConfig } from "next/dist/server/config-shared.js";
import type { Alias, Plugin } from "vite";
import {
  loadNextProjectConfig,
  type NextConfigLike,
  type NextCustomRoutes,
  type NextImageConfig,
} from "../../config.ts";
import { createProjectRequire, getProjectRoot, tryResolveFromProject } from "../../plugin-utils.ts";

// Mirror/adapt: Next.js webpack config aliases, defines, and runtime shims.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/create-compiler-aliases.ts#L203-L246
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/create-compiler-aliases.ts#L449-L477
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/define-env.ts#L1-L370
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack-config.ts#L2028-L2035
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/alias/react-dom-server.ts#L1-L27
// Adaptation: Vite owns plugin composition and module resolution here, but
// the aliases and defines mirror the concrete Next webpack/compiler sources
// that select App Router API entries, vendored React layers, edge polyfills,
// framework defines, and react-dom/server behavior.

// Begin adapted: Next.js webpack-config aliases and defines
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/create-compiler-aliases.ts#L203-L246
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/create-compiler-aliases.ts#L449-L477
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/define-env.ts#L1-L370
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack-config.ts#L2028-L2035
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/alias/react-dom-server.ts#L1-L27
// Adaptation: Use installed Next helpers where possible and translate their
// webpack alias output into Vite alias/plugin objects.
const supportedEdgeNativeModules = ["buffer", "events", "assert"] as const;

type NextCompilerAliasesModule = {
  createVendoredReactAliases(
    bundledReactChannel: "" | "-experimental",
    options: {
      layer: string;
      isBrowser: boolean;
      isEdgeServer: boolean;
      reactProductionProfiling: boolean;
    },
  ): Record<string, string | string[]>;
};

type NextDefineEnvModule = {
  getDefineEnv(options: {
    isTurbopack: boolean;
    config: NextConfigLike;
    dev: boolean;
    distDir: string;
    projectPath: string;
    fetchCacheKeyPrefix: string | undefined;
    hasRewrites: boolean;
    isClient: boolean;
    isEdgeServer: boolean;
    isNodeServer: boolean;
    clientRouterFilters: undefined;
    middlewareMatchers: undefined;
    rewrites: {
      beforeFiles: unknown[];
      afterFiles: unknown[];
      fallback: unknown[];
    };
  }): Record<string, unknown>;
};

export type NextDefineEnvs = {
  edge: Record<string, string>;
  browser: Record<string, string>;
};

// Begin copy: Next.js default cacheLife profiles
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/config-shared.ts
// Adaptation: Next 16.0.x/16.1.x can expose cache components without a
// populated defaultConfig.cacheLife in this test adapter path. Keep the minimum
// default profile table so use-cache-wrapper always receives the required
// "default" profile, then layer project config on top.
const fallbackNextCacheLifeProfiles = {
  default: { stale: undefined, revalidate: 900, expire: 4294967294 },
  seconds: { stale: 30, revalidate: 1, expire: 60 },
  minutes: { stale: 300, revalidate: 60, expire: 3600 },
  hours: { stale: 300, revalidate: 3600, expire: 86400 },
  days: { stale: 300, revalidate: 86400, expire: 604800 },
  weeks: { stale: 300, revalidate: 604800, expire: 2592000 },
  max: { stale: 300, revalidate: 2592000, expire: 31536000 },
} as const;
// End copy

// Vite equivalents of the Next webpack aliases we rely on. Keep these aligned
// with Next's app-router API and React Server Components alias layers:
// https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/create-compiler-aliases.ts#L203-L246
// https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/create-compiler-aliases.ts#L449-L477

export function appRouterApiPlugin(environmentName: string, isServerOnlyLayer: boolean): Plugin {
  let aliases: Record<string, string> = {};

  return {
    name: `next-rsc-app-router-api:${environmentName}`,
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === environmentName;
    },
    configResolved(config) {
      aliases = createAppRouterApiAliasesFromNext(getProjectRoot(config), isServerOnlyLayer);
    },
    async resolveId(source, importer, options) {
      const replacement = aliases[source];
      if (!replacement) {
        return;
      }

      return this.resolve(replacement, importer, {
        ...options,
        skipSelf: true,
      });
    },
  };
}

export function createAppRouterApiAliasesFromNext(
  root: string,
  isServerOnlyLayer: boolean,
): Record<string, string> {
  const appRouterEntrypoints = isServerOnlyLayer
    ? {
        "next/form": "next/dist/client/app-dir/form",
        "next/form.js": "next/dist/client/app-dir/form",
        "next/link": "next/dist/client/app-dir/link.react-server",
        "next/link.js": "next/dist/client/app-dir/link.react-server",
        "next/navigation": "next/dist/client/components/navigation.react-server",
        "next/navigation.js": "next/dist/client/components/navigation.react-server",
        "next/script": "next/dist/client/script",
        "next/script.js": "next/dist/client/script",
      }
    : {
        "next/form": "next/dist/client/app-dir/form",
        "next/form.js": "next/dist/client/app-dir/form",
        "next/link": "next/dist/client/app-dir/link",
        "next/link.js": "next/dist/client/app-dir/link",
        "next/navigation": "next/dist/client/components/navigation",
        "next/navigation.js": "next/dist/client/components/navigation",
        "next/script": "next/dist/client/script",
        "next/script.js": "next/dist/client/script",
      };

  try {
    const { createAppRouterApiAliases } = createProjectRequire(root)(
      "next/dist/build/create-compiler-aliases.js",
    ) as typeof import("next/dist/build/create-compiler-aliases.js");
    const aliases = createAppRouterApiAliases(isServerOnlyLayer);
    const result: Record<string, string> = {};

    for (const [source, replacement] of Object.entries(aliases)) {
      const match = source.match(/[/\\]next[/\\]([^/\\]+)\.js$/);
      if (!match) continue;

      result[`next/${match[1]}`] = replacement;
      result[`next/${match[1]}.js`] = replacement;
    }

    // Next's webpack aliases target resolved `next/*.js` API files. In Vite
    // we alias bare package IDs directly, so keep the same app-router layer
    // but point `link` and `navigation` at the implementation modules those
    // wrappers load.
    return { ...result, ...appRouterEntrypoints };
  } catch {
    return appRouterEntrypoints;
  }
}

export function createNextEdgeNativeAliases(root: string): Alias[] {
  const asyncHooksShim = tryResolveFromProject(root, "vitest-plugin-rsc/async-hooks");
  // Next's edge/client webpack builds polyfill these Node builtins with
  // Next-compiled browser packages. Vite does not run that webpack layer, so
  // resolve the same compiled packages from the user's Next installation:
  // https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack-config.ts#L2028-L2035
  const aliases: Alias[] = [
    { find: "node:async_hooks", replacement: asyncHooksShim ?? "vitest-plugin-rsc/async-hooks" },
    { find: "async_hooks", replacement: asyncHooksShim ?? "vitest-plugin-rsc/async-hooks" },
    {
      // Mirrors Next's browser/edge fallback for Node's `path` module.
      // Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack-config.ts#L1868-L1870
      find: "node:path",
      replacement: "next/dist/compiled/path-browserify",
    },
    {
      // Mirrors Next's browser/edge fallback for Node's `path` module.
      // Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack-config.ts#L1868-L1870
      find: "path",
      replacement: "next/dist/compiled/path-browserify",
    },
  ];

  // `next/dist/server/config-shared.js` is importable, but it touches `os.cpus`
  // during module evaluation. Alias `os` to a small browser shim so we can keep
  // importing Next's config defaults instead of copying them.
  const osBrowserShim = createNextjsSiblingPath("os-browser.js");
  aliases.push(
    { find: "node:os", replacement: osBrowserShim },
    { find: "os", replacement: osBrowserShim },
  );

  const utilBrowserShim =
    tryResolveFromProject(root, "next/dist/compiled/util") ?? "next/dist/compiled/util";
  const utilEdgeShim = createNextjsSiblingPath("util-edge.js");
  aliases.push(
    {
      // Next exposes `node:util` to Edge code as a sandbox native module subset.
      // Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/server/web/sandbox/context.ts#L237-L244
      find: "node:util",
      replacement: utilEdgeShim,
    },
    {
      // Mirrors Next's browser/client fallback for bare `util`.
      // Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/webpack-config.ts#L1892-L1894
      find: "util",
      replacement: utilBrowserShim,
    },
  );

  for (const mod of supportedEdgeNativeModules) {
    const replacement = tryResolveFromProject(root, `next/dist/compiled/${mod}`);
    if (!replacement) continue;

    aliases.push({ find: `node:${mod}`, replacement }, { find: mod, replacement });
  }

  const processPolyfill = tryResolveFromProject(root, "next/dist/compiled/process");
  if (processPolyfill) {
    aliases.push({ find: "process", replacement: processPolyfill });
  }

  aliases.push({
    find: "@opentelemetry/api",
    replacement: "next/dist/compiled/@opentelemetry/api",
  });

  return aliases;
}

export function useNextCompiledOpenTelemetryApi(): Plugin {
  return {
    name: "next-rsc-compiled-opentelemetry-api",
    enforce: "pre",
    transform(code, id) {
      if (!/[/\\]next[/\\]dist[/\\]server[/\\]lib[/\\]trace[/\\]tracer\.js(?:\?|$)/.test(id)) {
        return;
      }

      const nextCode = code.replaceAll(
        "require('@opentelemetry/api')",
        "require('next/dist/compiled/@opentelemetry/api')",
      );
      if (nextCode === code) return;

      return { code: nextCode, map: null };
    },
  };
}

function createNextjsSiblingPath(fileName: string) {
  const currentFile = fileURLToPath(import.meta.url);
  const relativePath = /[/\\]src[/\\]build[/\\]webpack-config\.[cm]?[jt]s$/.test(currentFile)
    ? `../../${fileName}`
    : /[/\\]plugin[/\\][^/\\]+$/.test(currentFile)
      ? `../${fileName}`
      : `./${fileName}`;
  return fileURLToPath(new URL(relativePath, import.meta.url));
}

export function createOptimizeDepsResolveAliases(
  edgeNativeAliases: Alias[],
  aliases: Record<string, string>,
  extraAliases: Alias[] = [],
) {
  return {
    ...Object.fromEntries(
      edgeNativeAliases
        .filter((alias): alias is Alias & { find: string } => typeof alias.find === "string")
        .map((alias) => [alias.find, alias.replacement]),
    ),
    ...Object.fromEntries(
      extraAliases
        .filter((alias): alias is Alias & { find: string } => typeof alias.find === "string")
        .map((alias) => [alias.find, alias.replacement]),
    ),
    ...aliases,
  };
}

export function createNextVendoredReactAliases({
  root,
  layer,
  isBrowser,
  isEdgeServer,
}: {
  root: string;
  layer: "rsc" | "app-pages-browser";
  isBrowser: boolean;
  isEdgeServer: boolean;
}): Alias[] {
  try {
    const { createVendoredReactAliases } = createProjectRequire(root)(
      "next/dist/build/create-compiler-aliases.js",
    ) as NextCompilerAliasesModule;
    const aliases = createVendoredReactAliases("", {
      layer,
      isBrowser,
      isEdgeServer,
      reactProductionProfiling: false,
    });

    return Object.entries(aliases)
      .flatMap(([source, replacement]): Alias[] => {
        if (Array.isArray(replacement) || !isReactPackageAlias(source)) return [];

        const find = source.endsWith("$") ? source.slice(0, -1) : source;
        return [
          {
            find,
            replacement: tryResolveFromProject(root, replacement) ?? replacement,
          },
        ];
      })
      .sort((a, b) => String(b.find).length - String(a.find).length);
  } catch {
    return [];
  }
}

function isReactPackageAlias(source: string) {
  const find = source.endsWith("$") ? source.slice(0, -1) : source;
  return (
    find === "react" ||
    find.startsWith("react/") ||
    find === "react-dom" ||
    find.startsWith("react-dom/") ||
    find === "next/dist/compiled/react" ||
    find.startsWith("next/dist/compiled/react/") ||
    find === "next/dist/compiled/react-dom" ||
    find.startsWith("next/dist/compiled/react-dom/")
  );
}

export function createReactServerDomWebpackAliases(root: string) {
  // Mirrors Next's vendored React aliases for RSDW. The client/browser and
  // edge entries should come from the installed Next package so Vite's dep
  // optimizer sees the same targets as Next webpack.
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/create-compiler-aliases.ts#L244-L417
  return {
    browser:
      tryResolveFromProject(root, "next/dist/compiled/react-server-dom-webpack/client.browser") ??
      "next/dist/compiled/react-server-dom-webpack/client.browser",
    edge:
      tryResolveFromProject(root, "next/dist/compiled/react-server-dom-webpack/client.edge") ??
      "next/dist/compiled/react-server-dom-webpack/client.edge",
    ssr: createNextjsSiblingPath("react-server-dom-webpack-ssr.ts"),
    serverEdge:
      tryResolveFromProject(root, "next/dist/compiled/react-server-dom-webpack/server.edge") ??
      "next/dist/compiled/react-server-dom-webpack/server.edge",
    staticEdge:
      tryResolveFromProject(root, "next/dist/compiled/react-server-dom-webpack/static.edge") ??
      "next/dist/compiled/react-server-dom-webpack/static.edge",
  };
}

export function useNextServerOnlyAlias(initialRoot = process.cwd()): Plugin {
  let replacement = tryResolveFromProject(initialRoot, "next/dist/compiled/server-only/empty");

  return {
    name: "next-rsc-server-only-alias",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client" || environment.name === "react_ssr";
    },
    configResolved(config) {
      replacement = tryResolveFromProject(
        getProjectRoot(config),
        "next/dist/compiled/server-only/empty",
      );
    },
    resolveId(source) {
      if (source === "server-only" && replacement) {
        return replacement;
      }
    },
  };
}

export async function createNextImageConfig(
  root: string,
  mode: string,
): Promise<NextImageConfig | undefined> {
  try {
    return (await loadNextProjectConfig(root, mode)).nextImageConfig;
  } catch {
    return;
  }
}

export async function createNextDefineEnvs(
  root: string,
  mode: string,
  nextImageConfig: NextImageConfig | undefined,
): Promise<NextDefineEnvs> {
  try {
    const projectRequire = createProjectRequire(root);
    const { getDefineEnv } = projectRequire("next/dist/build/define-env.js") as NextDefineEnvModule;
    const projectConfig = await loadNextProjectConfig(root, mode);
    const { nextConfig } = projectConfig;
    const baseOptions = {
      isTurbopack: false,
      config: nextConfig,
      dev: projectConfig.isDev,
      distDir: projectConfig.distDir,
      projectPath: root,
      fetchCacheKeyPrefix: nextConfig.experimental?.fetchCacheKeyPrefix,
      hasRewrites: hasNextRewrites(projectConfig.customRoutes.rewrites),
      clientRouterFilters: undefined,
      middlewareMatchers: undefined,
      rewrites: projectConfig.customRoutes.rewrites,
    } satisfies Omit<
      Parameters<NextDefineEnvModule["getDefineEnv"]>[0],
      "isClient" | "isEdgeServer" | "isNodeServer"
    >;

    // Import Next's define-env implementation instead of maintaining a local
    // table of framework flags.
    // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/define-env.ts
    return {
      edge: {
        ...normalizeNextTestDefineEnv(
          getDefineEnv({
            ...baseOptions,
            isClient: false,
            isEdgeServer: true,
            isNodeServer: false,
          }),
          "edge",
        ),
        ...createNextRuntimeConfigDefines(root, projectConfig.distDir, nextConfig),
      },
      browser: {
        ...normalizeNextTestDefineEnv(
          getDefineEnv({
            ...baseOptions,
            isClient: true,
            isEdgeServer: false,
            isNodeServer: false,
          }),
          "",
        ),
        ...createNextRuntimeConfigDefines(root, projectConfig.distDir, nextConfig),
      },
    };
  } catch {
    return createFallbackNextDefineEnvs(nextImageConfig);
  }
}

function createNextRuntimeConfigDefines(root: string, distDir: string, nextConfig: NextConfigLike) {
  return {
    "process.env.__NEXT_CACHE_HANDLERS": JSON.stringify(nextConfig.cacheHandlers ?? {}),
    "process.env.__NEXT_CACHE_LIFE": JSON.stringify(createNextCacheLifeProfiles(nextConfig)),
    "process.env.__NEXT_CACHE_MAX_MEMORY_SIZE": JSON.stringify(
      nextConfig.cacheMaxMemorySize ?? null,
    ),
    "process.env.__NEXT_DIST_DIR": JSON.stringify(distDir),
    "process.env.__NEXT_PROJECT_ROOT": JSON.stringify(root),
  };
}

function createNextCacheLifeProfiles(nextConfig: NextConfigLike) {
  return {
    ...fallbackNextCacheLifeProfiles,
    ...readObject(defaultConfig.cacheLife),
    ...readObject(nextConfig.cacheLife),
  };
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function hasNextRewrites(rewrites: NextCustomRoutes["rewrites"]) {
  return (
    rewrites.beforeFiles.length > 0 ||
    rewrites.afterFiles.length > 0 ||
    rewrites.fallback.length > 0
  );
}

function normalizeNextTestDefineEnv(defineEnv: Record<string, unknown>, nextRuntime: string) {
  const serializableDefineEnv = Object.fromEntries(
    Object.entries(defineEnv).flatMap(([key, value]) => {
      if (value === undefined) return [];
      return [[key, typeof value === "string" ? value : JSON.stringify(value)]];
    }),
  );

  return {
    ...serializableDefineEnv,
    "process.env.NEXT_RUNTIME": JSON.stringify(nextRuntime),
    "process.env.__NEXT_DEV_SERVER": JSON.stringify(""),
  };
}

function createFallbackNextDefineEnvs(
  nextImageConfig: NextImageConfig | undefined,
): NextDefineEnvs {
  const common = {
    "process.env.__NEXT_APP_NAV_FAIL_HANDLING": JSON.stringify(false),
    "process.env.__NEXT_CACHE_COMPONENTS": JSON.stringify(false),
    "process.env.__NEXT_CACHE_HANDLERS": JSON.stringify({}),
    "process.env.__NEXT_CACHE_MAX_MEMORY_SIZE": JSON.stringify(null),
    "process.env.__NEXT_CLIENT_ROUTER_DYNAMIC_STALETIME": JSON.stringify("0"),
    "process.env.__NEXT_CLIENT_ROUTER_STATIC_STALETIME": JSON.stringify("300"),
    "process.env.__NEXT_CLIENT_SEGMENT_CACHE": JSON.stringify(true),
    "process.env.__NEXT_DEV_SERVER": JSON.stringify(""),
    "process.env.__NEXT_DIST_DIR": JSON.stringify(".next"),
    "process.env.__NEXT_DYNAMIC_ON_HOVER": JSON.stringify(false),
    "process.env.__NEXT_PROJECT_ROOT": JSON.stringify(""),
    ...(nextImageConfig
      ? { "process.env.__NEXT_IMAGE_OPTS": JSON.stringify(nextImageConfig) }
      : {}),
  };

  return {
    edge: {
      ...common,
      "process.env.NEXT_RUNTIME": JSON.stringify("edge"),
      "process.browser": JSON.stringify(false),
    },
    browser: {
      ...common,
      "process.env.NEXT_RUNTIME": JSON.stringify(""),
      "process.browser": JSON.stringify(true),
    },
  };
}

export function useNextReactDomServerAlias(initialRoot = process.cwd()): Plugin {
  let reactDomServerAlias: string | undefined;
  let appRenderSsrAliases: Record<string, string> = {};

  function refreshAliases(root: string) {
    reactDomServerAlias = tryResolveFromProject(
      root,
      "next/dist/build/webpack/alias/react-dom-server.js",
    );
    appRenderSsrAliases = createNextAppRenderSsrAliases(root);
  }

  refreshAliases(initialRoot);

  return {
    name: "next-rsc-react-dom-server-alias",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client" || environment.name === "react_ssr";
    },
    configResolved(config) {
      refreshAliases(getProjectRoot(config));
    },
    resolveId(source, importer) {
      if (isNextAppRenderSsrImporter(importer)) {
        const replacement = appRenderSsrAliases[source];
        if (replacement) return replacement;
      }

      if (
        reactDomServerAlias &&
        (source === "react-dom/server" ||
          source === "react-dom/server.js" ||
          source === "react-dom/server.edge" ||
          source === "react-dom/server.edge.js")
      ) {
        return reactDomServerAlias;
      }

      if (!isReactDomServerImporter(importer)) return;

      return appRenderSsrAliases[source];
    },
  };
}

const nextAsyncStorageInstanceExports: Record<string, string> = {
  "action-async-storage-instance": "actionAsyncStorageInstance",
  "dynamic-access-async-storage-instance": "dynamicAccessAsyncStorageInstance",
  "work-async-storage-instance": "workAsyncStorageInstance",
  "work-unit-async-storage-instance": "workUnitAsyncStorageInstance",
};

export function useNextSharedAsyncStorageLayer(): Plugin {
  return {
    name: "next-rsc-shared-async-storage-layer",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client" || environment.name === "react_ssr";
    },
    transform(code, id) {
      const instanceName = getNextAsyncStorageInstanceExport(id);
      if (!instanceName) return;

      const cjsCreateAsyncLocalStorage = "(0, _asynclocalstorage.createAsyncLocalStorage)()";
      const esmCreateAsyncLocalStorage = "createAsyncLocalStorage()";
      const cjsInitializer = `const ${instanceName} = ${cjsCreateAsyncLocalStorage};`;
      const esmInitializer = `export const ${instanceName} = ${esmCreateAsyncLocalStorage};`;
      const sharedStorage = `globalThis[Symbol.for("vitest-plugin-rsc.next.shared-async-storage.${instanceName}")]`;

      // Mirrors Next's shared webpack layer for async-storage modules while Vite
      // keeps RSC and SSR in separate module graphs.
      // Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack-config.ts#L1179-L1185
      const nextCode = code
        .replace(
          cjsInitializer,
          `const ${instanceName} = (${sharedStorage} ??= ${cjsCreateAsyncLocalStorage});`,
        )
        .replace(
          esmInitializer,
          `export const ${instanceName} = (${sharedStorage} ??= ${esmCreateAsyncLocalStorage});`,
        );

      if (nextCode === code) return;
      return { code: nextCode, map: null };
    },
  };
}

function getNextAsyncStorageInstanceExport(id: string | undefined) {
  if (!id) return;

  const normalized = id.replaceAll("\\", "/").split("?")[0] ?? "";
  const match = normalized.match(
    /(?:^|[/\\])next\/dist\/(?:esm\/)?server\/app-render\/((?:work|work-unit|action|dynamic-access)-async-storage-instance)\.js$/,
  );
  const storageInstanceName = match?.[1];
  if (!storageInstanceName) return;

  return nextAsyncStorageInstanceExports[storageInstanceName];
}

function createNextAppRenderSsrAliases(root: string) {
  // Mirrors Next's SSR-layer React aliases for App Page route rendering while
  // keeping @vitejs/plugin-rsc in charge of the graph.
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack-config.ts#L1503-L1507
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack-config.ts#L1637-L1647
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack/alias/react-dom-server.ts
  const entries = {
    react: "next/dist/compiled/react",
    "react/jsx-runtime": "next/dist/compiled/react/jsx-runtime",
    "react/jsx-dev-runtime": "next/dist/compiled/react/jsx-dev-runtime",
    "react-dom": "next/dist/compiled/react-dom",
    "react-dom/server": "next/dist/build/webpack/alias/react-dom-server.js",
    "react-dom/server.edge": "next/dist/build/webpack/alias/react-dom-server.js",
    "react-dom/static": "next/dist/compiled/react-dom/static.edge",
    "react-dom/static.edge": "next/dist/compiled/react-dom/static.edge",
    "next/dist/compiled/react": "next/dist/compiled/react",
    "next/dist/compiled/react/jsx-runtime": "next/dist/compiled/react/jsx-runtime",
    "next/dist/compiled/react/jsx-dev-runtime": "next/dist/compiled/react/jsx-dev-runtime",
    "next/dist/compiled/react-dom": "next/dist/compiled/react-dom",
    "next/dist/compiled/react-dom/static.edge": "next/dist/compiled/react-dom/static.edge",
  };

  return Object.fromEntries(
    Object.entries(entries).flatMap(([source, replacement]) => {
      const resolved = tryResolveFromProject(root, replacement);
      return resolved ? [[source, resolved]] : [];
    }),
  );
}

function isNextAppRenderSsrImporter(importer: string | undefined) {
  return Boolean(
    importer &&
    /[/\\]next[/\\]dist[/\\](?:server[/\\](?:app-render|stream-utils|route-modules[/\\]app-page)|lib[/\\]metadata)[/\\]/.test(
      importer,
    ) &&
    !/[/\\]next[/\\]dist[/\\]server[/\\]app-render[/\\]entry-base\.js(?:\?|$)/.test(importer),
  );
}

function isReactDomServerImporter(importer: string | undefined) {
  return Boolean(
    importer &&
    /[/\\](?:react-dom-server|react-dom[/\\](?:cjs[/\\])?react-dom-server|react-dom[/\\](?:cjs[/\\])?server\.)/.test(
      importer,
    ),
  );
}

export function useNextReactServerConditionForServerBundles(initialRoot = process.cwd()): Plugin {
  let reactServerAliases: Alias[] = [];

  function refreshAliases(root: string) {
    reactServerAliases = createNextVendoredReactAliases({
      root,
      layer: "rsc",
      isBrowser: false,
      isEdgeServer: true,
    });
  }

  refreshAliases(initialRoot);

  return {
    name: "next-rsc-server-bundle-react-alias",
    enforce: "pre",
    configResolved(config) {
      refreshAliases(getProjectRoot(config));
    },
    transform(code, id) {
      if (!isReactServerConditionBundleImporter(id)) return;

      let nextCode = code;
      for (const source of ["react", "next/dist/compiled/react"]) {
        const replacement = findStringAliasReplacement(reactServerAliases, source);
        if (!replacement) continue;
        nextCode = nextCode
          .replaceAll(`require("${source}")`, `require(${JSON.stringify(replacement)})`)
          .replaceAll(`require('${source}')`, `require(${JSON.stringify(replacement)})`);
      }
      if (nextCode === code) return;

      return { code: nextCode, map: null };
    },
    resolveId(source, importer, options) {
      if (!isReactServerConditionBundleImporter(importer)) return;

      const replacement = findStringAliasReplacement(reactServerAliases, source);
      if (!replacement) return;

      return this.resolve(replacement, importer, {
        ...options,
        skipSelf: true,
      });
    },
  };
}

function findStringAliasReplacement(aliases: Alias[], source: string) {
  return aliases.find((alias): alias is Alias & { find: string } => alias.find === source)
    ?.replacement;
}

function isReactServerConditionBundleImporter(importer: string | undefined) {
  return Boolean(
    importer &&
    (isReactServerDomWebpackServerImporter(importer) || isReactDomReactServerImporter(importer)),
  );
}

function isReactServerDomWebpackServerImporter(importer: string) {
  return /[/\\](?:react-server-dom-webpack(?:-experimental)?[/\\](?:cjs[/\\])?react-server-dom-webpack-server|react-server-dom-webpack-server)\.(?:edge|browser|node)\./.test(
    importer,
  );
}

function isReactDomReactServerImporter(importer: string) {
  return /[/\\]react-dom(?:-experimental)?[/\\](?:cjs[/\\])?react-dom\.react-server\./.test(
    importer,
  );
}

export function provideBufferLikeNextWebpack(): Plugin {
  return {
    name: "next-rsc-edge-provide-buffer",
    enforce: "pre",
    transform(code, id) {
      if (
        !id.includes("/next/dist/") ||
        id.includes("/next/dist/compiled/buffer/") ||
        id.includes("/next/dist/server/stream-utils/uint8array-helpers") ||
        !/\bBuffer\b/.test(code)
      ) {
        return;
      }

      // Mirrors Next's webpack ProvidePlugin for Buffer in client and edge
      // bundles. Vite has no direct ProvidePlugin equivalent, so this import is
      // scoped to installed Next internals.
      // Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack-config.ts#L2028-L2035
      const bufferProvide = /\.cjs(?:[?#]|$)/.test(id)
        ? 'const { Buffer } = require("node:buffer");'
        : 'import { Buffer } from "node:buffer";';
      return {
        code: `${bufferProvide}\n${code}`,
        map: null,
      };
    },
  };
}

export function patchReactServerDomWebpackRequire(): Plugin {
  return {
    name: "next-rsc-patch-react-server-dom-webpack-require",
    enforce: "pre",
    transform(code, id) {
      if (
        (!code.includes("__webpack_require__") && !code.includes("globalThis.__next_require__")) ||
        !isReactServerDomWebpackRuntimeModule(id)
      ) {
        return;
      }

      // Mirrors @vitejs/plugin-rsc's RSDW webpack-require patch inside Vite's
      // optimizer. Optimized Next App Router deps can inline Next's compiled
      // react-server-dom-webpack client before the normal plugin transform runs.
      // Source: https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-rsc/src/core/plugin.ts
      let nextCode = code;
      if (nextCode.includes("__webpack_require__.u")) {
        nextCode = nextCode.replaceAll("__webpack_require__.u", "({}).u");
      }
      nextCode = nextCode.replaceAll("__webpack_require__", "__vite_rsc_require__");
      nextCode = nextCode.replaceAll("globalThis.__next_require__", "__vite_rsc_require__");
      if (nextCode === code) return;

      return { code: nextCode, map: null };
    },
  };
}

function isReactServerDomWebpackRuntimeModule(id: string | undefined) {
  return Boolean(
    id &&
    /[/\\](?:react-server-dom-webpack|react-server-dom-webpack-server|react-server-dom-client)(?:[/\\]|[.-])/.test(
      id,
    ),
  );
}

type NextServerInternalsMode = "rsc" | "react_ssr";

export function treatNextInternalsAsServerInRsc(
  options: { mode?: NextServerInternalsMode } = {},
): Plugin {
  return {
    name: "next-rsc-server-next-internals",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client" || environment.name === "react_ssr";
    },
    transform(code, id) {
      const mode = options.mode ?? getNextServerInternalsMode(this.environment?.name);
      if (!mode || !isNextServerRuntimeRewriteTarget(id, mode)) return;

      // Next compiles server-layer internals with server/edge constants through
      // its compiler define pipeline. Vite RSC defines the same values, but dep
      // optimization can evaluate Next internals before Vite's normal define pass
      // removes browser branches. In react_ssr, keep this scoped to installed
      // Next server/edge modules so browser App Router modules keep browser React
      // and browser feature checks.
      // Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/define-env.ts
      let nextCode = rewriteNextRuntimeChecks(code);
      nextCode = bindNextEdgeWebCryptoGlobal(nextCode, id);
      nextCode = rewriteNextEdgeWebCryptoGlobals(nextCode, id);
      nextCode = ensureNextRequestStreamingBodyDuplex(nextCode, id);
      nextCode = rewriteTypeofWindowChecks(nextCode);
      if (nextCode === code) return;

      return { code: nextCode, map: null };
    },
  };
}

function getNextServerInternalsMode(
  environmentName: string | undefined,
): NextServerInternalsMode | undefined {
  if (environmentName === "react_ssr") return "react_ssr";
  if (environmentName === "client" || environmentName === undefined) return "rsc";
}

function isNextServerRuntimeRewriteTarget(id: string, mode: NextServerInternalsMode) {
  if (!isNextInternalModule(id)) return false;
  if (mode === "rsc") return true;
  return isNextServerOrEdgeRuntimeModule(id) || isNextAppRouterInstanceModule(id);
}

export function disableNextDevServerRuntime(): Plugin {
  return {
    name: "next-rsc-disable-next-dev-server-runtime",
    enforce: "pre",
    transform(code, id) {
      if (!isNextInternalModule(id)) return;

      // Next dev-server-only branches are removed by Next's compiler/runtime
      // environment. Component tests do not run Next's dev server process, so
      // resolve those checks the same way for installed Next internals.
      // Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/define-env.ts
      const nextCode = rewriteNextDevServerChecks(code);
      if (nextCode === code) return;

      return { code: nextCode, map: null };
    },
  };
}

function isNextInternalModule(id: string) {
  return (
    /[/\\]next[/\\]dist[/\\]/.test(id) &&
    !/[/\\]next[/\\]dist[/\\]compiled[/\\]/.test(id) &&
    !/[/\\]node_modules[/\\]\.vite[/\\]/.test(id)
  );
}

function isNextServerOrEdgeRuntimeModule(id: string) {
  return /[/\\]next[/\\]dist[/\\](?:server|lib|build[/\\]adapter)[/\\]/.test(id);
}

function isNextAppRouterInstanceModule(id: string) {
  return /[/\\]next[/\\]dist[/\\]client[/\\]components[/\\]app-router-instance\.js(?:\?|$)/.test(
    id,
  );
}

function rewriteTypeofWindowChecks(code: string) {
  return code.replace(/\btypeof\s+window\b(?!\s*[.[\]])/g, '"undefined"');
}

function rewriteNextRuntimeChecks(code: string) {
  return code.replace(/\bprocess\.env\.NEXT_RUNTIME\b/g, '"edge"');
}

function rewriteNextEdgeWebCryptoGlobals(code: string, id: string) {
  if (isNextEdgeWebCryptoModule(id)) return code;

  // Keep Next's Edge Web Crypto calls bound to the browser's real global object
  // after Rolldown lowers optimized chunks. Dot access can be folded back to the
  // free `crypto` binding, which may not carry the full Web Crypto shape.
  return code.replace(/(?<![\w$.])crypto\.(subtle|randomUUID)\b/g, 'globalThis["crypto"].$1');
}

function bindNextEdgeWebCryptoGlobal(code: string, id: string) {
  if (!isNextEdgeWebCryptoModule(id)) return code;
  if (!/\bcrypto\.(?:subtle|randomUUID)\b/.test(code)) return code;
  if (/\b(?:const|let|var)\s+crypto\b/.test(code)) return code;

  return `const crypto = globalThis["crypto"];\n${code}`;
}

function isNextEdgeWebCryptoModule(id: string) {
  return /[/\\]next[/\\]dist[/\\](?:server[/\\](?:app-render[/\\](?:app-render|encryption-utils)|lib[/\\]incremental-cache[/\\]index)|build[/\\]templates[/\\]app-page)\.js(?:\?|$)/.test(
    id,
  );
}

function ensureNextRequestStreamingBodyDuplex(code: string, id: string) {
  if (!isNextRequestSpecExtensionModule(id)) return code;

  // NextRequest normally adds RequestInit.duplex for Node, while edge builds
  // skip it because the edge runtime supplies a compatible Request. Browser
  // mode still constructs a Web Request and requires the same standard duplex
  // flag when Next's adapter forwards a streaming Server Action body.
  // Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/web/spec-extension/request.ts#L37-L42
  return code.replace(
    /if \("edge" !== ['"]edge['"]\) \{\s*if \(init\.body && init\.duplex !== ['"]half['"]\) \{\s*init\.duplex = ['"]half['"];\s*\}\s*\}/,
    "if (init.body && init.duplex !== 'half') {\n            init.duplex = 'half';\n        }",
  );
}

function isNextRequestSpecExtensionModule(id: string) {
  return /[/\\]next[/\\]dist[/\\]server[/\\]web[/\\]spec-extension[/\\]request\.js(?:\?|$)/.test(
    id,
  );
}

function rewriteNextDevServerChecks(code: string) {
  return code.replace(/\bprocess\.env\.__NEXT_DEV_SERVER\b/g, "false");
}
// End adapted
