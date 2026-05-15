import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformHoistInlineDirective } from "@vitejs/plugin-rsc/transforms";
import type { Alias, Plugin, UserConfig } from "vite";
import { parseAstAsync } from "vite";
import { useNextAppRenderCompatibility } from "./app-render-compat-plugin";
import { useNextLinkClientReference } from "./client-reference-plugin";
import {
  loadNextProjectConfig,
  type NextConfigLike,
  type NextCustomRoutes,
  type NextImageConfig,
} from "./config";
import { useNextFontLoader } from "./font-loader-plugin";
import { useNextImageClientReference } from "./image-plugin";
import { useNextMetadataImageLoader } from "./metadata-image-loader-plugin";
import {
  createProjectRequire,
  getProjectRoot,
  normalizePath,
  tryResolveFromProject,
} from "./plugin-utils";
import { useNextRouteManifest } from "./route-manifest-plugin";
import { useNextSwcTransform } from "./swc-transform-plugin";

const supportedEdgeNativeModules = ["buffer", "events", "assert", "util"] as const;
const virtualServerReferenceInfoId = "\0vitest-plugin-rsc:next-server-reference-info";
const virtualNextEntryBaseClientReferencePrefix =
  "\0vitest-plugin-rsc:next-entry-base-client-reference:";
const virtualNextEntryBaseClientReferencePublicPrefix =
  "virtual:vitest-plugin-rsc/next-entry-base-client-reference/";
const virtualNextBuiltinGlobalErrorStubPublicId =
  "virtual:vitest-plugin-rsc/next-builtin-global-error-stub";
const virtualNextBuiltinGlobalErrorStubId = `\0${virtualNextBuiltinGlobalErrorStubPublicId}`;
const virtualNextRootParamsId = "\0vitest-plugin-rsc:next-root-params";
const virtualNextUseCacheRuntimeId = "\0vitest-plugin-rsc:next-use-cache-runtime";
const virtualNextUseCacheRuntimePublicId = "virtual:vitest-plugin-rsc/next-use-cache-runtime";
export const nextTesterHtmlPath = fileURLToPath(new URL("./tester.html", import.meta.url));

type VitestBrowserConfig = {
  enabled?: boolean;
  testerHtmlPath?: string;
  instances?: Array<{
    testerHtmlPath?: string;
  }>;
};

type VitestUserConfig = UserConfig & {
  test?: {
    browser?: false | VitestBrowserConfig;
  };
};

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
  "next/dist/server/app-render/entry-base.js",
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
  "next/dist/server/lib/cache-handlers/default.js",
  "next/dist/server/lib/patch-fetch.js",
  "next/dist/server/revalidation-utils.js",
  "next/dist/server/use-cache/handlers.js",
  "next/dist/server/use-cache/use-cache-wrapper.js",
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
      hasRewrites: hasNextRewrites(projectConfig.customRoutes.rewrites),
      clientRouterFilters: undefined,
      middlewareMatchers: undefined,
      rewrites: projectConfig.customRoutes.rewrites,
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

function useNextReactDomServerAlias(initialRoot = process.cwd()): Plugin {
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

// Next's app-render entry-base is a server-layer CJS module that re-exports
// client components via relative require() calls. Next's webpack/Turbopack
// layer metadata keeps those imports as client references. Vite/Rolldown dep
// optimization otherwise inlines the CJS "use client" modules into the RSC
// optimized chunk, so they execute with React Server aliases. Keep the real
// Next entry-base module, but intercept only these entry-base imports so the
// RSC graph receives client references and the browser/SSR graphs load the
// real Next client modules. A generic upstream fix in @vitejs/plugin-rsc would
// be to preserve CJS "use client" dependency boundaries during RSC dep
// optimization: externalize/proxy those modules instead of inlining them into
// the server optimized chunk, then register the proxy with registerClientReference.
function useNextEntryBaseClientReferences(initialRoot = process.cwd()): Plugin {
  let root = initialRoot;

  return {
    name: "next-rsc-entry-base-client-references",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
    },
    resolveId(source, importer) {
      if (source.startsWith(virtualNextEntryBaseClientReferencePrefix)) {
        return source;
      }
      if (source.startsWith(virtualNextEntryBaseClientReferencePublicPrefix)) {
        const moduleId = source.slice(virtualNextEntryBaseClientReferencePublicPrefix.length);
        return `${virtualNextEntryBaseClientReferencePrefix}${encodeURIComponent(moduleId)}`;
      }
      if (!importer || !isNextEntryBaseModule(importer)) {
        return;
      }

      const moduleId = resolveNextEntryBaseClientReferenceModuleId(root, source, importer);
      if (!moduleId) {
        return;
      }

      return `${virtualNextEntryBaseClientReferencePrefix}${encodeURIComponent(moduleId)}`;
    },
    load(id) {
      if (!id.startsWith(virtualNextEntryBaseClientReferencePrefix)) return;

      const moduleId = decodeURIComponent(
        id.slice(virtualNextEntryBaseClientReferencePrefix.length),
      );
      if (!this.environment || this.environment.name === "client") {
        return createNextEntryBaseServerClientReferenceModule(root, moduleId);
      }

      return createNextEntryBaseClientReferenceModule(root, moduleId);
    },
  };
}

function isNextEntryBaseModule(id: string) {
  return /[/\\]next[/\\]dist[/\\]server[/\\]app-render[/\\]entry-base\.js(?:\?|$)/.test(id);
}

function createNextEntryBaseClientReferenceModule(root: string, moduleId: string) {
  const exports = getNextEntryBaseClientReferenceExports(root, moduleId).join(", ");

  return `"use client";\nexport { ${exports} } from ${JSON.stringify(moduleId)};\n`;
}

function createNextEntryBaseServerClientReferenceModule(root: string, moduleId: string) {
  const encodedModuleId = encodeURIComponent(moduleId);
  const id = `/@id/__x00__${virtualNextEntryBaseClientReferencePrefix.slice(1)}${encodedModuleId}`;
  const exports = getNextEntryBaseClientReferenceExports(root, moduleId);
  const namedExports = exports
    .filter((name) => name !== "default")
    .map((name) => `export const ${name} = createClientReference(${JSON.stringify(name)});`)
    .join("\n");
  const defaultExport = exports.includes("default")
    ? `export default createClientReference("default");`
    : "";

  return `
import { registerClientReference } from "@vitejs/plugin-rsc/react/rsc";

function createClientReference(name) {
  return registerClientReference(
    function() {
      throw new Error("Unexpectedly client reference export '" + name + "' is called on server");
    },
    ${JSON.stringify(id)},
    name
  );
}

${defaultExport}
${namedExports}
`;
}

function getNextEntryBaseClientReferenceExports(root: string, moduleId: string) {
  const moduleFile = tryResolveFromProject(root, moduleId);
  if (!moduleFile) {
    throw new Error(`Could not resolve ${moduleId} for Next entry-base client reference.`);
  }

  try {
    const exports = readNextCommonJsExports(moduleFile) ?? [];
    if (exports.length === 0) {
      throw new Error(`No CommonJS exports found in ${moduleId}.`);
    }
    return exports;
  } catch (error) {
    throw new Error(`Could not read exports from ${moduleId}.`, { cause: error });
  }
}

function resolveNextEntryBaseClientReferenceModuleId(
  root: string,
  source: string,
  importer: string,
) {
  const importerFile = importer.split("?")[0];
  if (!importerFile) return;

  const moduleFile = resolveNextEntryBaseImport(source, importerFile);
  if (!moduleFile || !isNextClientModuleFile(moduleFile)) return;

  return createNextDistModuleId(root, moduleFile);
}

function resolveNextEntryBaseImport(source: string, importerFile: string) {
  if (!source.startsWith(".")) return;

  const resolved = path.resolve(path.dirname(importerFile), source);
  for (const file of [resolved, `${resolved}.js`, path.join(resolved, "index.js")]) {
    if (fs.existsSync(file)) return file;
  }
}

function isNextClientModuleFile(file: string) {
  try {
    return hasUseClientDirective(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}

function hasUseClientDirective(code: string) {
  return /^\s*(?:["']use client["'];?)/.test(code);
}

function createNextDistModuleId(root: string, file: string) {
  const nextDistDir = path.dirname(tryResolveFromProject(root, "next/package.json") ?? "");
  const distDir = path.join(nextDistDir, "dist");
  const relative = path.relative(distDir, file);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return `next/dist/${normalizePath(relative)}`;
  }

  const marker = `${path.sep}node_modules${path.sep}next${path.sep}dist${path.sep}`;
  const markerIndex = file.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return `next/dist/${normalizePath(file.slice(markerIndex + marker.length))}`;
  }
}

function readNextCommonJsExports(file: string) {
  const code = fs.readFileSync(file, "utf8");
  const names: string[] = [];
  const seen = new Set<string>();
  const addName = (name: string) => {
    if (name === "__esModule" || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  const exportMarker = /0 && \(module\.exports = \{([\s\S]*?)\}\);/.exec(code);
  if (exportMarker) {
    for (const match of exportMarker[1]!.matchAll(/^\s*([A-Za-z_$][\w$]*|default):/gm)) {
      addName(match[1]!);
    }
  }

  for (const match of code.matchAll(/Object\.defineProperty\(exports,\s*["']([^"']+)["']/g)) {
    addName(match[1]!);
  }

  return names.length > 0 ? names : undefined;
}

function provideBufferLikeNextWebpack(): Plugin {
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

function useNextBuiltinGlobalErrorStub(): Plugin {
  return {
    name: "next-rsc-builtin-global-error-stub",
    enforce: "pre",
    resolveId(source) {
      if (source !== virtualNextBuiltinGlobalErrorStubPublicId) return;
      return virtualNextBuiltinGlobalErrorStubId;
    },
    load(id) {
      if (id !== virtualNextBuiltinGlobalErrorStubId) return;
      return `"use client";
export default function GlobalError() {
  return null;
}
`;
    },
  };
}

function useNextUseCacheTransform(): Plugin {
  let root = process.cwd();
  let mode = "test";
  let enabledPromise: Promise<boolean> | undefined;

  return {
    name: "next-rsc-use-cache-transform",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
      mode = config.mode;
      enabledPromise = undefined;
    },
    resolveId(source) {
      if (source === virtualNextUseCacheRuntimePublicId) {
        return virtualNextUseCacheRuntimeId;
      }
    },
    load(id) {
      if (id !== virtualNextUseCacheRuntimeId) return;

      return `import { cache as __next_use_cache } from "next/dist/server/use-cache/use-cache-wrapper.js";

export function __next_rsc_use_cache(kind, id, originalFn) {
  return async (...args) => __next_use_cache(kind, id, 0, originalFn, args);
}
`;
    },
    async transform(code, id) {
      if (
        !code.includes("use cache") ||
        !isUserSourceFile(id) ||
        isTestSourceFile(id) ||
        this.environment.name !== "client"
      ) {
        return;
      }

      enabledPromise ??= loadNextProjectConfig(root, mode).then(
        (projectConfig) => projectConfig.nextConfig.cacheComponents === true,
      );
      if (!(await enabledPromise)) return;

      const ast = await parseAstAsync(code, { lang: getParserLanguage(id) }, id);
      const result = transformHoistInlineDirective(code, ast as never, {
        runtime: (value, name, meta) => {
          const kind = getNextUseCacheKind(meta.directiveMatch[1]);
          return `__next_rsc_use_cache(${JSON.stringify(kind)}, ${JSON.stringify(
            createNextUseCacheFunctionId(root, id, name),
          )}, ${value})`;
        },
        directive: /^use cache(?:: ([\w-]+))?$/,
        rejectNonAsyncFunction: true,
        noExport: true,
      });
      if (!result.output.hasChanged()) return;

      result.output.prepend(
        `import { __next_rsc_use_cache } from ${JSON.stringify(virtualNextUseCacheRuntimePublicId)};\n`,
      );
      return {
        code: result.output.toString(),
        map: result.output.generateMap({ hires: "boundary" }),
      };
    },
  };
}

function getNextUseCacheKind(kind: string | undefined) {
  return kind ?? "default";
}

function createNextUseCacheFunctionId(root: string, id: string, name: string) {
  const file = id.replace(/\?.*$/, "");
  const relative = path.isAbsolute(file) ? normalizePath(path.relative(root, file)) : file;
  return `${relative}#${name}`;
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

function isUserSourceFile(id: string) {
  return (
    /\.(?:[cm]?[jt]sx?)($|\?)/.test(id) && !id.includes("/node_modules/") && !id.includes("/.vite/")
  );
}

function isTestSourceFile(id: string) {
  return /(?:^|[/\\])[^/\\]+\.(?:test|spec)\.[cm]?[jt]sx?(?:$|\?)/.test(id);
}

function getParserLanguage(id: string) {
  const file = id.replace(/\?.*$/, "");
  if (file.endsWith(".tsx")) return "tsx";
  if (file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts")) return "ts";
  if (file.endsWith(".jsx")) return "jsx";
  return "js";
}

export function vitestPluginNext(): Plugin[] {
  return [
    useVitestServerReferenceInfo(),
    treatNextInternalsAsServerInRsc(),
    disableNextDevServerRuntime(),
    useNextReactDomServerAlias(),
    useNextBuiltinGlobalErrorStub(),
    useNextEntryBaseClientReferences(),
    ...useNextAppRenderCompatibility(),
    useNextLinkClientReference(),
    useNextSwcTransform(),
    useNextUseCacheTransform(),
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
          ...createNextTesterHtmlConfig(config),
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

function createNextTesterHtmlConfig(config: UserConfig): UserConfig {
  const browser = (config as VitestUserConfig).test?.browser;
  if (browser === false || hasTesterHtmlPath(browser)) {
    return {};
  }

  return {
    test: {
      browser: {
        testerHtmlPath: nextTesterHtmlPath,
      },
    },
  } as UserConfig;
}

function hasTesterHtmlPath(browser: VitestBrowserConfig | undefined): boolean {
  return (
    typeof browser?.testerHtmlPath === "string" ||
    browser?.instances?.some((instance) => typeof instance.testerHtmlPath === "string") === true
  );
}
