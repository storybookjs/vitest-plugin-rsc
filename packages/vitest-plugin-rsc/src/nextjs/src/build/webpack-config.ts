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
const supportedEdgeNativeModules = ["buffer", "events", "assert", "util"] as const;

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
        "next/link": "next/dist/client/app-dir/link.react-server",
        "next/link.js": "next/dist/client/app-dir/link.react-server",
        "next/navigation": "next/dist/client/components/navigation.react-server",
        "next/navigation.js": "next/dist/client/components/navigation.react-server",
      }
    : {
        "next/link": "next/dist/client/app-dir/link",
        "next/link.js": "next/dist/client/app-dir/link",
        "next/navigation": "next/dist/client/components/navigation",
        "next/navigation.js": "next/dist/client/components/navigation",
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
  ];

  // `next/dist/server/config-shared.js` is importable, but it touches `os.cpus`
  // during module evaluation. Alias `os` to a small browser shim so we can keep
  // importing Next's config defaults instead of copying them.
  const osBrowserShim = createNextjsSiblingPath("os-browser.js");
  aliases.push(
    { find: "node:os", replacement: osBrowserShim },
    { find: "os", replacement: osBrowserShim },
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
  return {
    browser:
      tryResolveFromProject(root, "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser") ??
      "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser",
    edge:
      tryResolveFromProject(root, "@vitejs/plugin-rsc/vendor/react-server-dom/client.edge") ??
      "@vitejs/plugin-rsc/vendor/react-server-dom/client.edge",
    serverEdge:
      tryResolveFromProject(root, "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge") ??
      "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge",
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

export function useNextCompiledOpenTelemetryApi(root: string): Plugin {
  const replacement = tryResolveFromProject(root, "next/dist/compiled/@opentelemetry/api");

  return {
    name: "next-rsc-edge-compiled-opentelemetry-api",
    enforce: "pre",
    resolveId(source) {
      if (source !== "@opentelemetry/api" || !replacement) {
        return;
      }

      return replacement;
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
      return environment.name === "client";
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

function createNextAppRenderSsrAliases(root: string) {
  // Mirrors Next's react-dom-server webpack alias for server/app-render and
  // metadata internals while keeping @vitejs/plugin-rsc in charge of the graph.
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
    /[/\\]next[/\\]dist[/\\](?:server[/\\](?:app-render|stream-utils)|lib[/\\]metadata)[/\\]/.test(
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
// End adapted
