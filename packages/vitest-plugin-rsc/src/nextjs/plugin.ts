import { fileURLToPath } from "node:url";
import type { Alias, Plugin, UserConfig } from "vite";
import { useNextAppRenderCompatibility } from "./app-render-compat-plugin";
import { useNextLinkClientReference } from "./client-reference-plugin";
import { loadNextProjectConfig, type NextConfigLike, type NextImageConfig } from "./config";
import { useNextFontLoader } from "./font-loader-plugin";
import { useNextImageClientReference } from "./image-plugin";
import { useNextMetadataImageLoader } from "./metadata-image-loader-plugin";
import { createProjectRequire, getProjectRoot, tryResolveFromProject } from "./plugin-utils";
import { useNextRouteManifest } from "./route-manifest-plugin";
import { useNextSwcTransform } from "./swc-transform-plugin";

const supportedEdgeNativeModules = ["buffer", "events", "assert", "util"] as const;
const virtualServerReferenceInfoId = "\0vitest-plugin-rsc:next-server-reference-info";
const virtualNextEntryBaseId = "\0vitest-plugin-rsc:next-entry-base";
const virtualNextEntryBaseClientReferencePrefix =
  "\0vitest-plugin-rsc:next-entry-base-client-reference:";
const virtualNextEntryBaseClientReferencePublicPrefix =
  "virtual:vitest-plugin-rsc/next-entry-base-client-reference/";
const virtualNextRootParamsId = "\0vitest-plugin-rsc:next-root-params";

const nextBrowserRuntimeOptimizeDeps = [
  "node:buffer",
  "vitest-plugin-rsc/async-local-storage",
] as const;

const nextClientRouterOptimizeDeps = [
  "next/dist/client/app-call-server.js",
  "next/dist/client/app-bootstrap.js",
  "next/dist/client/route-params.js",
  "next/dist/client/components/app-router.js",
  "next/dist/client/app-dir/link",
  "next/dist/client/app-dir/link.js",
  "next/dist/client/components/navigation.react-server",
  "next/dist/client/components/app-router-instance.js",
  "next/dist/client/components/navigation.react-server.js",
  "next/dist/client/components/redirect-boundary.js",
  "next/dist/client/components/router-reducer/compute-changed-path.js",
  "next/dist/client/components/router-reducer/create-href-from-url.js",
  "next/dist/client/components/router-reducer/create-initial-router-state.js",
  "next/dist/client/components/router-reducer/ppr-navigations.js",
  "next/dist/client/components/router-reducer/router-reducer.js",
  "next/dist/client/components/router-reducer/router-reducer-types.js",
  "next/dist/client/components/router-reducer/reducers/server-action-reducer.js",
  "next/dist/client/components/unresolved-thenable.js",
  "next/dist/shared/lib/server-reference-info.js",
  "next/dist/client/components/app-router-headers.js",
  "next/dist/client/components/http-access-fallback/http-access-fallback.js",
  "next/dist/client/components/redirect-error.js",
  "next/dist/client/components/redirect-status-code.js",
  "next/dist/client/components/redirect.js",
  "next/dist/server/lib/server-action-request-meta.js",
  "next/dist/client/components/use-action-queue.js",
  "next/dist/client/components/match-segments.js",
  "next/dist/shared/lib/app-router-context.shared-runtime.js",
  "next/dist/shared/lib/hooks-client-context.shared-runtime.js",
  "next/dist/shared/lib/server-inserted-html.shared-runtime.js",
] as const;

const nextClientNavigationOptimizeDeps = [
  "next/dist/client/components/navigation",
  "next/dist/client/components/navigation.js",
] as const;

const nextAppRouterApiOptimizeDeps = [
  "next/dist/api/app-dynamic",
  "next/dist/api/app-dynamic.js",
  "next/dist/api/error",
  "next/dist/api/error.js",
  "next/dist/client/components/catch-error",
  "next/dist/client/components/catch-error.js",
  "next/dist/client/components/noop-head",
  "next/dist/client/components/noop-head.js",
  "next/dist/client/web-vitals",
  "next/dist/client/web-vitals.js",
  "next/dist/compiled/web-vitals",
  "next/dist/shared/lib/app-dynamic",
  "next/dist/shared/lib/app-dynamic.js",
  "next/dist/shared/lib/lazy-dynamic/loadable",
  "next/dist/shared/lib/lazy-dynamic/loadable.js",
  "next/error",
  "next/error.js",
  "next/web-vitals",
  "next/web-vitals.js",
] as const;

const nextRootParamsOptimizeDepsExclude = ["next/root-params", "next/root-params.js"] as const;

const nextAppRouterClientApiOptimizeDeps = [
  "next/dist/client/add-base-path",
  "next/dist/client/add-base-path.js",
  "next/dist/client/app-dir/form",
  "next/dist/client/app-dir/form.js",
  "next/dist/client/app-dir/link",
  "next/dist/client/app-dir/link.js",
  "next/dist/client/request-idle-callback",
  "next/dist/client/request-idle-callback.js",
  "next/dist/client/script",
  "next/dist/client/script.js",
  "next/dist/client/set-attributes-from-props",
  "next/dist/client/set-attributes-from-props.js",
  "next/dist/client/components/links",
  "next/dist/client/components/links.js",
  "next/dist/client/components/segment-cache/types",
  "next/dist/client/components/segment-cache/types.js",
  "next/dist/client/form-shared",
  "next/dist/client/form-shared.js",
] as const;

const nextRscClientUtilityOptimizeDeps = [
  "next/dist/client/components/app-router-headers.js",
  "next/dist/client/components/http-access-fallback/http-access-fallback.js",
  "next/dist/client/components/navigation.react-server",
  "next/dist/client/components/navigation.react-server.js",
  "next/dist/client/components/redirect-error.js",
  "next/dist/client/components/redirect-status-code.js",
  "next/dist/client/components/redirect.js",
  "next/dist/server/lib/server-action-request-meta.js",
  "next/dist/shared/lib/server-reference-info.js",
] as const;

const nextEntryBaseClientReferenceOptimizeDeps = [
  "next/dist/client/components/client-page.js",
  "next/dist/client/components/client-segment.js",
  "next/dist/client/components/http-access-fallback/error-boundary.js",
  "next/dist/client/components/layout-router.js",
  "next/dist/client/components/render-from-template-context.js",
  "next/dist/lib/framework/boundary-components.js",
] as const;

const nextRscServerOptimizeDeps = [
  "next/dist/compiled/@opentelemetry/api",
  "next/cache",
  "next/headers",
  "next/server",
  "next/dist/compiled/@edge-runtime/cookies/index.js",
  "next/dist/server/node-environment-baseline.js",
  "next/dist/server/app-render/app-render.js",
  "next/dist/server/app-render/action-handler.js",
  "next/dist/server/app-render/action-async-storage.external.js",
  "next/dist/server/app-render/async-local-storage.js",
  "next/dist/server/app-render/work-async-storage.external.js",
  "next/dist/server/app-render/work-unit-async-storage.external.js",
  "next/dist/server/base-http/web.js",
  "next/dist/server/render-result.js",
  "next/dist/server/async-storage/request-store.js",
  "next/dist/server/async-storage/work-store.js",
  "next/dist/server/config-shared.js",
  "next/dist/server/request-meta.js",
  "next/dist/server/lib/implicit-tags.js",
  "next/dist/server/lib/incremental-cache/index.js",
  "next/dist/server/lib/incremental-cache/file-system-cache.js",
  "next/dist/server/lib/incremental-cache/memory-cache.external.js",
  "next/dist/server/lib/incremental-cache/tags-manifest.external.js",
  "next/dist/server/lib/patch-fetch.js",
  "next/dist/server/revalidation-utils.js",
  "next/dist/client/components/is-next-router-error.js",
  "next/dist/client/app-dir/link.react-server",
  "next/dist/client/app-dir/link.react-server.js",
  "next/dist/server/request/cookies.js",
  "next/dist/server/request/draft-mode.js",
  "next/dist/server/request/headers.js",
  "next/dist/server/request/params.js",
  "next/dist/server/request/root-params.js",
  "next/dist/server/request/search-params.js",
  "next/dist/server/web/spec-extension/adapters/headers.js",
  "next/dist/server/web/spec-extension/adapters/request-cookies.js",
  "next/dist/shared/lib/router/utils/parse-relative-url.js",
  "next/dist/shared/lib/get-img-props.js",
  "next/dist/shared/lib/image-config.js",
  "next/dist/shared/lib/image-loader.js",
  "next/dist/client/components/hooks-server-context.js",
  "next/dist/server/app-render/rsc/postpone.js",
  "next/dist/server/app-render/rsc/preloads.js",
  "next/dist/server/app-render/rsc/taint.js",
  "next/dist/server/app-render/collect-segment-data.js",
  "next/dist/lib/metadata/metadata.js",
  "next/dist/lib/metadata/get-metadata-route",
  "next/dist/lib/metadata/get-metadata-route.js",
] as const;

const nextOptionalAppRenderOptimizeDeps = [
  "next/dist/server/app-render/action-utils.js",
  "next/dist/server/app-render/encryption-utils.js",
  "next/dist/server/app-render/manifests-singleton.js",
  "next/dist/shared/lib/action-revalidation-kind.js",
] as const;

const nextBuiltinErrorOptimizeDeps = [
  "next/dist/client/components/builtin/default.js",
  "next/dist/client/components/builtin/forbidden.js",
  "next/dist/client/components/builtin/global-error.js",
  "next/dist/client/components/builtin/not-found.js",
  "next/dist/client/components/builtin/unauthorized.js",
] as const;

const nextRouteUtilityOptimizeDeps = [
  "next/dist/shared/lib/segment.js",
  "next/dist/shared/lib/router/utils/app-paths.js",
  "next/dist/shared/lib/router/utils/route-matcher.js",
  "next/dist/shared/lib/router/utils/route-regex.js",
] as const;

const nextImageOptimizeDeps = [
  "next/dist/client/image-component.js",
  "next/dist/client/use-merged-ref.js",
  "next/dist/shared/lib/get-img-props.js",
  "next/dist/shared/lib/head.js",
  "next/dist/shared/lib/head-manager-context.shared-runtime.js",
  "next/dist/shared/lib/image-config.js",
  "next/dist/shared/lib/image-config-context.shared-runtime.js",
  "next/dist/shared/lib/image-external.js",
  "next/dist/shared/lib/image-loader.js",
  "next/dist/shared/lib/router-context.shared-runtime.js",
] as const;

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

type NextRootParamsLoaderContext = {
  getOptions(): {
    appDir: string;
    pageExtensions: string[];
  };
  addContextDependency(directory: string): void;
};

type NextRootParamsLoaderModule = {
  default?: (this: NextRootParamsLoaderContext) => Promise<string> | string;
} & ((this: NextRootParamsLoaderContext) => Promise<string> | string);

type NextDefineEnvs = {
  edge: Record<string, string>;
  browser: Record<string, string>;
};

// Vite equivalents of the Next webpack aliases we rely on. Keep these aligned
// with Next's app-router API and React Server Components alias layers:
// https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/create-compiler-aliases.ts#L203-L246
// https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/create-compiler-aliases.ts#L449-L477

function appRouterApiPlugin(environmentName: string, isServerOnlyLayer: boolean): Plugin {
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

function useNextRootParams(environmentName: string, isServerOnlyLayer: boolean): Plugin {
  let root = "";
  let mode = "test";
  let resolvedNextRootParamsId: string | undefined;
  let rootParamsModule: Promise<string> | undefined;

  return {
    name: `next-rsc-root-params:${environmentName}`,
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === environmentName;
    },
    configResolved(config) {
      root = getProjectRoot(config);
      mode = config.mode;
      resolvedNextRootParamsId = tryResolveFromProject(root, "next/root-params");
    },
    resolveId(source) {
      const [id] = source.split("?", 1);
      if (
        id === "next/root-params" ||
        id === "next/root-params.js" ||
        id === resolvedNextRootParamsId
      ) {
        return virtualNextRootParamsId;
      }
    },
    async load(id) {
      if (id !== virtualNextRootParamsId) {
        return;
      }

      rootParamsModule ??= createNextRootParamsModule({
        isServerOnlyLayer,
        mode,
        root,
      });
      return rootParamsModule;
    },
  };
}

async function createNextRootParamsModule({
  isServerOnlyLayer,
  mode,
  root,
}: {
  isServerOnlyLayer: boolean;
  mode: string;
  root: string;
}) {
  if (!isServerOnlyLayer) {
    return createNextInvalidImportModule(
      "'next/root-params' cannot be imported from a Client Component module. It should only be used from a Server Component.",
    );
  }

  const projectConfig = await loadNextProjectConfig(root, mode);
  const { nextConfig } = projectConfig;
  const isRootParamsEnabled =
    nextConfig.experimental?.rootParams ?? nextConfig.cacheComponents ?? false;

  if (!isRootParamsEnabled) {
    return createNextInvalidImportModule(
      "'next/root-params' can only be imported when `experimental.rootParams` is enabled.",
    );
  }

  const appDir = projectConfig.appDir;
  if (!appDir) {
    return createNextInvalidImportModule(
      "'next/root-params' can only be used with the App Directory.",
    );
  }

  const projectRequire = createProjectRequire(root);
  let loaderModule: NextRootParamsLoaderModule;
  try {
    loaderModule = projectRequire(
      "next/dist/build/webpack/loaders/next-root-params-loader.js",
    ) as NextRootParamsLoaderModule;
  } catch {
    return createNextInvalidImportModule(
      "'next/root-params' is not supported by this Next.js version.",
    );
  }
  const rootParamsLoader = loaderModule.default ?? loaderModule;
  const pageExtensions = projectConfig.pageExtensions;

  return rootParamsLoader.call({
    addContextDependency: () => {},
    getOptions: () => ({ appDir, pageExtensions }),
  });
}

function createNextInvalidImportModule(message: string) {
  return `throw new Error(${JSON.stringify(message)});\nexport {};`;
}

function filterResolvableOptimizeDeps(root: string, deps: readonly string[]): string[] {
  const projectRequire = createProjectRequire(root);
  return deps.filter((dep) => {
    try {
      projectRequire.resolve(dep);
      return true;
    } catch {
      return false;
    }
  });
}

function createAppRouterApiAliasesFromNext(
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

function createNextEdgeNativeAliases(root: string): Alias[] {
  // Next's edge/client webpack builds polyfill these Node builtins with
  // Next-compiled browser packages. Vite does not run that webpack layer, so
  // resolve the same compiled packages from the user's Next installation:
  // https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack-config.ts#L2028-L2035
  const aliases: Alias[] = [
    { find: "node:async_hooks", replacement: "vitest-plugin-rsc/async-hooks" },
    { find: "async_hooks", replacement: "vitest-plugin-rsc/async-hooks" },
  ];

  // `next/dist/server/config-shared.js` is importable, but it touches `os.cpus`
  // during module evaluation. Alias `os` to a small browser shim so we can keep
  // importing Next's config defaults instead of copying them.
  const osBrowserShim = fileURLToPath(new URL("./os-browser.js", import.meta.url));
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

function createOptimizeDepsResolveAliases(
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

function createNextVendoredReactAliases({
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

function createReactServerDomWebpackAliases(root: string) {
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

async function createNextImageConfig(
  root: string,
  mode: string,
): Promise<NextImageConfig | undefined> {
  try {
    return (await loadNextProjectConfig(root, mode)).nextImageConfig;
  } catch {
    return;
  }
}

async function createNextDefineEnvs(
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
      hasRewrites: false,
      clientRouterFilters: undefined,
      middlewareMatchers: undefined,
      rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
    } satisfies Omit<
      Parameters<NextDefineEnvModule["getDefineEnv"]>[0],
      "isClient" | "isEdgeServer" | "isNodeServer"
    >;

    return {
      edge: normalizeNextTestDefineEnv(
        getDefineEnv({
          ...baseOptions,
          isClient: false,
          isEdgeServer: true,
          isNodeServer: false,
        }),
        "edge",
      ),
      browser: normalizeNextTestDefineEnv(
        getDefineEnv({
          ...baseOptions,
          isClient: true,
          isEdgeServer: false,
          isNodeServer: false,
        }),
        "",
      ),
    };
  } catch {
    return createFallbackNextDefineEnvs(nextImageConfig);
  }
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
    "process.env.__NEXT_CLIENT_ROUTER_DYNAMIC_STALETIME": JSON.stringify("0"),
    "process.env.__NEXT_CLIENT_ROUTER_STATIC_STALETIME": JSON.stringify("300"),
    "process.env.__NEXT_CLIENT_SEGMENT_CACHE": JSON.stringify(true),
    "process.env.__NEXT_DEV_SERVER": JSON.stringify(""),
    "process.env.__NEXT_DYNAMIC_ON_HOVER": JSON.stringify(false),
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

function useNextCompiledOpenTelemetryApi(root: string): Plugin {
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

function useNextReactDomServerAlias(root = process.cwd()): Plugin {
  const reactDomServerAlias = tryResolveFromProject(
    root,
    "next/dist/build/webpack/alias/react-dom-server.js",
  );
  const appRenderSsrAliases = createNextAppRenderSsrAliases(root);

  return {
    name: "next-rsc-react-dom-server-alias",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
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

function useVitestServerReferenceInfo(root = process.cwd()): Plugin {
  const original = tryResolveFromProject(root, "next/dist/shared/lib/server-reference-info.js");

  return {
    name: "next-rsc-server-reference-info",
    enforce: "pre",
    async resolveId(source, importer, options) {
      // Next's server-action reducer imports this helper to omit unused action
      // arguments from hex-encoded Next action IDs. Vite RSC action IDs are not
      // Next hex IDs, so we alias the helper and preserve all args for those
      // IDs while copying Next's behavior for real hex IDs.
      if (
        source !== "next/dist/shared/lib/server-reference-info.js" &&
        source !== "next/dist/shared/lib/server-reference-info" &&
        !(source.endsWith("/shared/lib/server-reference-info") && importer?.includes("/next/dist/"))
      ) {
        return;
      }

      return virtualServerReferenceInfoId;
    },
    load(id) {
      if (id !== virtualServerReferenceInfoId) return;
      if (!original) {
        throw new Error("Could not resolve next/dist/shared/lib/server-reference-info.js");
      }

      return `
import {
  extractInfoFromServerReferenceId as extractNextInfoFromServerReferenceId,
  omitUnusedArgs,
} from ${JSON.stringify(original)};

export { omitUnusedArgs };

export function extractInfoFromServerReferenceId(id) {
  const isNextActionId = id.length > 0 && !id.includes("#") && /^[0-9a-fA-F]+$/.test(id);
  return isNextActionId
    ? extractNextInfoFromServerReferenceId(id)
    : {
        type: "server-action",
        usedArgs: [true, true, true, true, true, true],
        hasRestArgs: true,
      };
}
`;
    },
  };
}

type NextEntryBaseClientReferenceName =
  | "boundary-components"
  | "client-page"
  | "client-segment"
  | "error-boundary"
  | "layout-router"
  | "render-from-template-context";

const nextEntryBaseClientReferenceImports: Record<string, NextEntryBaseClientReferenceName> = {
  "../../client/components/client-page": "client-page",
  "../../client/components/client-page.js": "client-page",
  "../../client/components/client-segment": "client-segment",
  "../../client/components/client-segment.js": "client-segment",
  "../../client/components/http-access-fallback/error-boundary": "error-boundary",
  "../../client/components/http-access-fallback/error-boundary.js": "error-boundary",
  "../../client/components/layout-router": "layout-router",
  "../../client/components/layout-router.js": "layout-router",
  "../../client/components/render-from-template-context": "render-from-template-context",
  "../../client/components/render-from-template-context.js": "render-from-template-context",
  "../../lib/framework/boundary-components": "boundary-components",
  "../../lib/framework/boundary-components.js": "boundary-components",
};

function useNextEntryBase(): Plugin {
  return {
    name: "next-rsc-entry-base",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    resolveId(source) {
      if (
        source === "next/dist/server/app-render/entry-base" ||
        source === "next/dist/server/app-render/entry-base.js"
      ) {
        return virtualNextEntryBaseId;
      }
    },
    load(id) {
      if (id !== virtualNextEntryBaseId) return;

      const clientReference = (name: NextEntryBaseClientReferenceName) =>
        `${virtualNextEntryBaseClientReferencePublicPrefix}${name}`;

      return `
	// Begin copy: Next.js app-render entry-base export surface
	// Source: next/dist/server/app-render/entry-base.js export surface in the
	// project Next.js version.
	// Adaptation: real Next entry-base eagerly imports client components before
	// Vite RSC can wrap them as client references, so this adapter keeps those
	// client imports explicit while delegating the rest to real Next modules.
	import { captureOwnerStack, createElement, Fragment } from "react";
	import {
	  createTemporaryReferenceSet,
	  decodeAction,
	  decodeFormState,
	  decodeReply,
	  renderToReadableStream,
	} from "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge";
	import LayoutRouter, { LoadingBoundaryProvider } from ${JSON.stringify(clientReference("layout-router"))};
	import RenderFromTemplateContext from ${JSON.stringify(clientReference("render-from-template-context"))};
	import { ClientPageRoot } from ${JSON.stringify(clientReference("client-page"))};
	import { ClientSegmentRoot } from ${JSON.stringify(clientReference("client-segment"))};
	import { HTTPAccessFallbackBoundary } from ${JSON.stringify(clientReference("error-boundary"))};
	import { RootLayoutBoundary } from ${JSON.stringify(clientReference("boundary-components"))};
	import { actionAsyncStorage } from "next/dist/server/app-render/action-async-storage.external.js";
	import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external.js";
	import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external.js";
	import { collectPrefetchHints, collectSegmentData } from "next/dist/server/app-render/collect-segment-data.js";
	import { patchFetch as patchNextFetch } from "next/dist/server/lib/patch-fetch.js";
	import { createMetadataComponents } from "next/dist/lib/metadata/metadata.js";
	import * as hooksServerContext from "next/dist/client/components/hooks-server-context.js";
import {
  createPrerenderSearchParamsForClientPage,
  createServerSearchParamsForServerPage,
} from "next/dist/server/request/search-params.js";
import {
  createPrerenderParamsForClientSegment,
  createServerParamsForServerSegment,
} from "next/dist/server/request/params.js";
import { Postpone } from "next/dist/server/app-render/rsc/postpone.js";
import { preconnect, preloadFont, preloadStyle } from "next/dist/server/app-render/rsc/preloads.js";
import { taintObjectReference } from "next/dist/server/app-render/rsc/taint.js";

function SegmentViewNode({ children }) {
  return children;
}

export {
  ClientPageRoot,
  ClientSegmentRoot,
  Fragment,
  HTTPAccessFallbackBoundary,
  InstantValidation,
  LayoutRouter,
  LoadingBoundaryProvider,
  Postpone,
  RenderFromTemplateContext,
  RootLayoutBoundary,
  SegmentViewNode,
	  actionAsyncStorage,
	  captureOwnerStack,
	  collectPrefetchHints,
	  collectSegmentData,
	  createElement,
	  createMetadataComponents,
	  createPrerenderParamsForClientSegment,
  createPrerenderSearchParamsForClientPage,
  createServerParamsForServerSegment,
	  createServerSearchParamsForServerPage,
	  createTemporaryReferenceSet,
	  decodeAction,
	  decodeFormState,
	  decodeReply,
	  preconnect,
	  preloadFont,
	  preloadStyle,
	  prerender,
	  renderToReadableStream,
	  taintObjectReference,
	  workAsyncStorage,
	  workUnitAsyncStorage,
	};

	export const SegmentViewStateNode = SegmentViewNode;
	export const serverHooks = hooksServerContext;
	function InstantValidation() {
	  return undefined;
	}
	export function patchFetch() {
	  return patchNextFetch({
	    workAsyncStorage,
	    workUnitAsyncStorage,
	  });
	}
	async function prerender(model, clientModules, options) {
	  return { prelude: await renderToReadableStream(model, clientModules, options) };
	}
	// End copy
	`;
    },
  };
}

function useNextEntryBaseClientReferences(): Plugin {
  return {
    name: "next-rsc-entry-base-client-references",
    enforce: "pre",
    resolveId(source, importer) {
      if (source.startsWith(virtualNextEntryBaseClientReferencePrefix)) {
        return source;
      }
      if (source.startsWith(virtualNextEntryBaseClientReferencePublicPrefix)) {
        const reference = source.slice(
          virtualNextEntryBaseClientReferencePublicPrefix.length,
        ) as NextEntryBaseClientReferenceName;
        return `${virtualNextEntryBaseClientReferencePrefix}${reference}`;
      }
      if (!importer || !isNextEntryBaseModule(importer)) {
        return;
      }

      const reference = nextEntryBaseClientReferenceImports[source];
      if (!reference) {
        return;
      }

      return `${virtualNextEntryBaseClientReferencePrefix}${reference}`;
    },
    load(id) {
      if (!id.startsWith(virtualNextEntryBaseClientReferencePrefix)) return;

      const reference = id.slice(
        virtualNextEntryBaseClientReferencePrefix.length,
      ) as NextEntryBaseClientReferenceName;
      return createNextEntryBaseClientReferenceModule(reference);
    },
  };
}

function isNextEntryBaseModule(id: string) {
  return /[/\\]next[/\\]dist[/\\]server[/\\]app-render[/\\]entry-base\.js(?:\?|$)/.test(id);
}

function createNextEntryBaseClientReferenceModule(reference: NextEntryBaseClientReferenceName) {
  switch (reference) {
    case "boundary-components":
      return `"use client";\nexport { MetadataBoundary, OutletBoundary, RootLayoutBoundary, ViewportBoundary } from "next/dist/lib/framework/boundary-components.js";\n`;
    case "client-page":
      return `"use client";\nexport { ClientPageRoot } from "next/dist/client/components/client-page.js";\n`;
    case "client-segment":
      return `"use client";\nexport { ClientSegmentRoot } from "next/dist/client/components/client-segment.js";\n`;
    case "error-boundary":
      return `"use client";\nexport { HTTPAccessFallbackBoundary } from "next/dist/client/components/http-access-fallback/error-boundary.js";\n`;
    case "layout-router":
      return `"use client";\nexport { default, LoadingBoundaryProvider } from "next/dist/client/components/layout-router.js";\n`;
    case "render-from-template-context":
      return `"use client";\nexport { default } from "next/dist/client/components/render-from-template-context.js";\n`;
  }
}

function provideBufferLikeNextWebpack(): Plugin {
  return {
    name: "next-rsc-edge-provide-buffer",
    enforce: "pre",
    transform(code, id) {
      if (
        !id.includes("/next/dist/") ||
        id.includes("/next/dist/compiled/buffer/") ||
        !/\bBuffer\b/.test(code)
      ) {
        return;
      }

      // Next's webpack compiler uses ProvidePlugin for Buffer in client and
      // edge bundles. Vite has no direct equivalent, so apply the same import
      // only to Next internals:
      // https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack-config.ts#L2028-L2035
      return {
        code: `import { Buffer } from "node:buffer";\n${code}`,
        map: null,
      };
    },
  };
}

function treatNextInternalsAsServerInRsc(): Plugin {
  return {
    name: "next-rsc-server-next-internals",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    transform(code, id) {
      if (!isNextInternalModule(id)) return;

      let nextCode = rewriteNextRuntimeChecks(code);
      nextCode = rewriteTypeofWindowChecks(nextCode);
      if (nextCode === code) return;

      return { code: nextCode, map: null };
    },
  };
}

function disableNextDevServerRuntime(): Plugin {
  return {
    name: "next-rsc-disable-next-dev-server-runtime",
    enforce: "pre",
    transform(code, id) {
      if (!isNextInternalModule(id)) return;

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

function rewriteTypeofWindowChecks(code: string) {
  return code.replace(/\btypeof\s+window\b(?!\s*[.[\]])/g, '"undefined"');
}

function rewriteNextRuntimeChecks(code: string) {
  return code.replace(/\bprocess\.env\.NEXT_RUNTIME\b/g, '"edge"');
}

function rewriteNextDevServerChecks(code: string) {
  return code.replace(/\bprocess\.env\.__NEXT_DEV_SERVER\b/g, "false");
}

export function vitestPluginNext(): Plugin[] {
  return [
    useVitestServerReferenceInfo(),
    treatNextInternalsAsServerInRsc(),
    disableNextDevServerRuntime(),
    useNextReactDomServerAlias(),
    useNextEntryBase(),
    useNextEntryBaseClientReferences(),
    ...useNextAppRenderCompatibility(),
    useNextLinkClientReference(),
    useNextSwcTransform(),
    useNextFontLoader(),
    useNextImageClientReference(),
    useNextMetadataImageLoader(),
    useNextRouteManifest(),
    useNextRootParams("client", true),
    useNextRootParams("react_client", false),
    useNextRootParams("react_ssr", false),
    appRouterApiPlugin("client", true),
    appRouterApiPlugin("react_client", false),
    appRouterApiPlugin("react_ssr", false),
    {
      name: "next-rsc-plugin",
      async config(config, env) {
        const root = getProjectRoot(config);
        const edgeNativeAliases = createNextEdgeNativeAliases(root);
        const rscAppRouterAliases = createAppRouterApiAliasesFromNext(root, true);
        const reactClientAppRouterAliases = createAppRouterApiAliasesFromNext(root, false);
        const reactServerDomWebpackAliases = createReactServerDomWebpackAliases(root);
        const rscReactAliases = createNextVendoredReactAliases({
          root,
          layer: "rsc",
          isBrowser: false,
          isEdgeServer: true,
        });
        const browserReactAliases = createNextVendoredReactAliases({
          root,
          layer: "app-pages-browser",
          isBrowser: true,
          isEdgeServer: false,
        });
        const nextImageConfig = await createNextImageConfig(root, env.mode);
        const nextOptionalAppRenderDeps = filterResolvableOptimizeDeps(
          root,
          nextOptionalAppRenderOptimizeDeps,
        );
        const nextDefineEnvs = await createNextDefineEnvs(root, env.mode, nextImageConfig);

        return {
          define: {
            global: "globalThis",
            __dirname: JSON.stringify(null),
          },
          resolve: {
            alias: [
              ...edgeNativeAliases,
              {
                find: "@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client.ts",
                replacement: "next/dist/client/dev/noop-turbopack-hmr",
              },
            ],
          },
          optimizeDeps: {
            include: [...nextAppRouterApiOptimizeDeps],
            exclude: [...nextRootParamsOptimizeDepsExclude],
            rolldownOptions: {
              plugins: [disableNextDevServerRuntime()],
            },
          },
          environments: {
            client: {
              define: nextDefineEnvs.edge,
              resolve: {
                conditions: ["edge-light", "react-server"],
                alias: [
                  ...rscReactAliases,
                  {
                    find: "react-server-dom-webpack/client",
                    replacement: reactServerDomWebpackAliases.edge,
                  },
                  {
                    find: "react-server-dom-webpack/server",
                    replacement: "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge",
                  },
                  {
                    find: "react-server-dom-webpack/static",
                    replacement: "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge",
                  },
                ],
              },
              optimizeDeps: {
                exclude: [...nextRootParamsOptimizeDepsExclude],
                include: [
                  ...nextRscServerOptimizeDeps,
                  ...nextOptionalAppRenderDeps,
                  ...nextBrowserRuntimeOptimizeDeps,
                  ...nextRscClientUtilityOptimizeDeps,
                  ...nextBuiltinErrorOptimizeDeps,
                  ...nextRouteUtilityOptimizeDeps,
                ],
                rolldownOptions: {
                  transform: {
                    define: nextDefineEnvs.edge,
                  },
                  plugins: [
                    useVitestServerReferenceInfo(root),
                    treatNextInternalsAsServerInRsc(),
                    disableNextDevServerRuntime(),
                    useNextReactDomServerAlias(root),
                    useNextEntryBaseClientReferences(),
                    ...useNextAppRenderCompatibility(root),
                    useNextLinkClientReference(),
                    useNextImageClientReference(),
                    useNextCompiledOpenTelemetryApi(root),
                  ],
                  resolve: {
                    alias: {
                      ...createOptimizeDepsResolveAliases(
                        edgeNativeAliases,
                        rscAppRouterAliases,
                        rscReactAliases,
                      ),
                      "react-server-dom-webpack/client": reactServerDomWebpackAliases.edge,
                      "react-server-dom-webpack/server": reactServerDomWebpackAliases.serverEdge,
                      "react-server-dom-webpack/static": reactServerDomWebpackAliases.serverEdge,
                    },
                  },
                },
              },
            },
            react_client: {
              define: nextDefineEnvs.browser,
              resolve: {
                conditions: ["edge-light", "browser"],
                alias: [
                  ...browserReactAliases,
                  {
                    find: "react-server-dom-webpack/client",
                    replacement: reactServerDomWebpackAliases.browser,
                  },
                  {
                    find: "react-server-dom-webpack/client.browser",
                    replacement: reactServerDomWebpackAliases.browser,
                  },
                ],
              },
              optimizeDeps: {
                exclude: [...nextRootParamsOptimizeDepsExclude],
                include: [
                  ...nextBrowserRuntimeOptimizeDeps,
                  ...nextClientRouterOptimizeDeps,
                  ...nextClientNavigationOptimizeDeps,
                  ...nextAppRouterApiOptimizeDeps,
                  ...nextAppRouterClientApiOptimizeDeps,
                  ...nextEntryBaseClientReferenceOptimizeDeps,
                  ...nextImageOptimizeDeps,
                ],
                rolldownOptions: {
                  transform: {
                    define: nextDefineEnvs.browser,
                  },
                  plugins: [
                    useVitestServerReferenceInfo(root),
                    disableNextDevServerRuntime(),
                    useNextLinkClientReference(),
                    useNextCompiledOpenTelemetryApi(root),
                  ],
                  resolve: {
                    alias: {
                      ...createOptimizeDepsResolveAliases(
                        edgeNativeAliases,
                        reactClientAppRouterAliases,
                        browserReactAliases,
                      ),
                      "react-server-dom-webpack/client": reactServerDomWebpackAliases.browser,
                      "react-server-dom-webpack/client.browser":
                        reactServerDomWebpackAliases.browser,
                    },
                  },
                },
              },
            },
            react_ssr: {
              define: nextDefineEnvs.browser,
              resolve: {
                conditions: ["edge-light", "browser"],
                alias: [
                  ...browserReactAliases,
                  {
                    find: "react-server-dom-webpack/client",
                    replacement: reactServerDomWebpackAliases.edge,
                  },
                  {
                    find: "react-server-dom-webpack/client.browser",
                    replacement: reactServerDomWebpackAliases.edge,
                  },
                ],
              },
              optimizeDeps: {
                exclude: [...nextRootParamsOptimizeDepsExclude],
                include: [
                  ...nextBrowserRuntimeOptimizeDeps,
                  ...nextClientRouterOptimizeDeps,
                  ...nextClientNavigationOptimizeDeps,
                  ...nextAppRouterApiOptimizeDeps,
                  ...nextAppRouterClientApiOptimizeDeps,
                  ...nextEntryBaseClientReferenceOptimizeDeps,
                  ...nextImageOptimizeDeps,
                  "react-dom/server.browser",
                ],
                rolldownOptions: {
                  transform: {
                    define: nextDefineEnvs.browser,
                  },
                  plugins: [
                    useVitestServerReferenceInfo(root),
                    disableNextDevServerRuntime(),
                    useNextLinkClientReference(),
                    useNextCompiledOpenTelemetryApi(root),
                  ],
                  resolve: {
                    alias: {
                      ...createOptimizeDepsResolveAliases(
                        edgeNativeAliases,
                        reactClientAppRouterAliases,
                        browserReactAliases,
                      ),
                      "react-server-dom-webpack/client": reactServerDomWebpackAliases.edge,
                      "react-server-dom-webpack/client.browser": reactServerDomWebpackAliases.edge,
                    },
                  },
                },
              },
            },
          },
        };
      },
    },
    provideBufferLikeNextWebpack(),
  ];
}
