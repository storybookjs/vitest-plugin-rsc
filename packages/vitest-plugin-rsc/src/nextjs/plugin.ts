import type { Plugin } from "vite";
import { cjsBrowserPlugin } from "../cjs-browser-plugin.ts";
import {
  appRouterApiPlugin,
  createAppRouterApiAliasesFromNext,
  createNextDefineEnvs,
  createNextEdgeNativeAliases,
  createNextImageConfig,
  createNextVendoredReactAliases,
  createOptimizeDepsResolveAliases,
  createReactServerDomWebpackAliases,
  disableNextDevServerRuntime,
  patchReactServerDomWebpackRequire,
  provideBufferLikeNextWebpack,
  treatNextInternalsAsServerInRsc,
  useNextCompiledOpenTelemetryApi,
  useNextReactServerConditionForServerBundles,
  useNextReactDomServerAlias,
  useNextServerOnlyAlias,
  useNextSharedAsyncStorageLayer,
} from "./src/build/webpack-config.ts";
import { createNextSourceOptimizerEntries } from "./src/build/entries.ts";
import { useNextFontLoader } from "./src/build/webpack/loaders/next-font-loader/index.ts";
import { useNextImageClientReference } from "./src/build/webpack/loaders/next-image-loader/index.ts";
import { useNextMetadataImageLoader } from "./src/build/webpack/loaders/next-metadata-image-loader.ts";
import { useNextMetadataRouteLoader } from "./src/build/webpack/loaders/next-metadata-route-loader.ts";
import { useNextCacheHandlers } from "./src/server/use-cache/handlers.ts";
import { nextRootParamsOptimizeDepsExclude, resolveNextOptimizeDeps } from "./plugin/optimizer.ts";
import {
  createNextCjsBrowserBoundaryOptions,
  useNextCjsBrowserBoundaries,
} from "./plugin/cjs-browser-boundaries.ts";
import { useNextRootParams } from "./src/build/webpack/loaders/next-root-params-loader.ts";
import { useVitestServerReferenceInfo } from "./src/shared/lib/server-reference-info.ts";
import {
  createNextTesterHtmlConfig,
  nextTesterHtmlPath,
  useNextBrowserPolyfills,
} from "./plugin/tester-html.ts";
import { useNextUseCacheTransform } from "./plugin/use-cache.ts";
import { getProjectRoot } from "./plugin-utils.ts";
import { useNextRouteManifest } from "./route-manifest-plugin.ts";
import { useNextSwcTransform } from "./src/build/webpack/loaders/next-swc-loader.ts";

export { nextTesterHtmlPath };

type OptimizeDepsWithEntries = {
  entries?: string | string[];
};

const vitestPluginRscSourceCondition = "vitest-plugin-rsc-source";
const nextEdgeAppPageRouteModuleAliases = [
  {
    find: "next/dist/server/route-modules/app-page/module.compiled",
    replacement: "next/dist/server/route-modules/app-page/module.js",
  },
  {
    find: "next/dist/server/route-modules/app-page/module.compiled.js",
    replacement: "next/dist/server/route-modules/app-page/module.js",
  },
] as const;

export function vitestPluginNext(): Plugin[] {
  return [
    useVitestServerReferenceInfo(),
    useNextCompiledOpenTelemetryApi(),
    treatNextInternalsAsServerInRsc(),
    disableNextDevServerRuntime(),
    useNextReactDomServerAlias(),
    useNextReactServerConditionForServerBundles(),
    ...useNextCjsBrowserBoundaries({ name: "next-rsc:cjs-browser-transform" }),
    useNextServerOnlyAlias(),
    useNextCacheHandlers(),
    useNextSwcTransform(),
    useNextSharedAsyncStorageLayer(),
    useNextUseCacheTransform(),
    useNextFontLoader(),
    useNextImageClientReference(),
    useNextMetadataImageLoader(),
    useNextMetadataRouteLoader(),
    useNextRouteManifest(),
    useNextRootParams("client", true),
    useNextRootParams("react_client", false),
    useNextRootParams("react_ssr", false),
    useNextBrowserPolyfills(),
    appRouterApiPlugin("client", true),
    appRouterApiPlugin("react_client", false),
    appRouterApiPlugin("react_ssr", false),
    createNextPluginConfig(),
    provideBufferLikeNextWebpack(),
  ];
}

function createNextPluginConfig(): Plugin {
  return {
    name: "next-rsc-plugin",
    async config(config, env) {
      const root = getProjectRoot(config);
      const edgeNativeAliases = createNextEdgeNativeAliases(root);
      const edgeOpenTelemetryAliases = edgeNativeAliases.filter(
        (alias) => alias.find === "@opentelemetry/api",
      );
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
      const nextOptimizeDeps = resolveNextOptimizeDeps(root);
      const nextDefineEnvs = await createNextDefineEnvs(root, env.mode, nextImageConfig);
      const nextEdgeOptimizerDefine = {
        ...nextDefineEnvs.edge,
        __dirname: JSON.stringify(null),
      };
      const nextBrowserOptimizerDefine = {
        ...nextDefineEnvs.browser,
        __dirname: JSON.stringify(null),
      };
      const nextSourceOptimizerEntries = createNextSourceOptimizerEntries(root);
      const nextOptimizeDepsEntryConfig =
        nextSourceOptimizerEntries.length === 0 ? { entries: [] as string[] } : {};
      const nextCjsBoundaryOptions = await createNextCjsBrowserBoundaryOptions(root);
      const internalReactClientSourceOptimizeDeps = hasConfiguredSourceCondition(config)
        ? ["vitest-plugin-rsc/nextjs/client"]
        : [];

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
              // Mirrors Next's Turbopack HMR client alias used when webpack code
              // imports the Turbopack runtime path in a non-Turbopack build.
              // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/create-compiler-aliases.ts
              find: "@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client.ts",
              replacement: "next/dist/client/dev/noop-turbopack-hmr",
            },
          ],
        },
        optimizeDeps: {
          include: [
            ...nextOptimizeDeps.appRouterApi,
            ...nextOptimizeDeps.testingLibrary,
            ...nextOptimizeDeps.rscServer,
            ...nextOptimizeDeps.optionalAppRender,
            ...nextOptimizeDeps.browserRuntime,
            ...nextOptimizeDeps.rscClientUtility,
            ...nextOptimizeDeps.edgeAppPage,
            ...nextOptimizeDeps.builtinError,
            ...nextOptimizeDeps.routeUtility,
          ],
          exclude: [...nextRootParamsOptimizeDepsExclude],
          ...nextOptimizeDepsEntryConfig,
          rolldownOptions: {
            plugins: [patchReactServerDomWebpackRequire(), disableNextDevServerRuntime()],
            resolve: {
              alias: {
                ...createOptimizeDepsResolveAliases(
                  edgeNativeAliases,
                  rscAppRouterAliases,
                  rscReactAliases,
                ),
                "react-server-dom-webpack/client": reactServerDomWebpackAliases.edge,
                "react-server-dom-webpack/server": reactServerDomWebpackAliases.serverEdge,
                "react-server-dom-webpack/static": reactServerDomWebpackAliases.staticEdge,
              },
            },
          },
        },
        environments: {
          client: {
            define: nextDefineEnvs.edge,
            resolve: {
              conditions: withConfiguredSourceConditions(config, ["edge-light", "react-server"]),
              alias: [
                ...edgeNativeAliases,
                ...rscReactAliases,
                {
                  find: "react-server-dom-webpack/client",
                  replacement: reactServerDomWebpackAliases.edge,
                },
                {
                  find: "react-server-dom-webpack/server",
                  replacement: reactServerDomWebpackAliases.serverEdge,
                },
                {
                  find: "react-server-dom-webpack/static",
                  replacement: reactServerDomWebpackAliases.staticEdge,
                },
              ],
            },
            optimizeDeps: {
              exclude: [...nextRootParamsOptimizeDepsExclude],
              ...nextOptimizeDepsEntryConfig,
              include: [
                ...nextOptimizeDeps.rscServer,
                ...nextOptimizeDeps.optionalAppRender,
                ...nextOptimizeDeps.browserRuntime,
                ...nextOptimizeDeps.rscClientUtility,
                ...nextOptimizeDeps.edgeAppPage,
                ...nextOptimizeDeps.entryBaseClientReference,
                ...nextOptimizeDeps.builtinError,
                ...nextOptimizeDeps.routeUtility,
              ],
              rolldownOptions: {
                transform: {
                  define: nextEdgeOptimizerDefine,
                },
                plugins: [
                  useVitestServerReferenceInfo(root),
                  patchReactServerDomWebpackRequire(),
                  useNextCompiledOpenTelemetryApi(),
                  provideBufferLikeNextWebpack(),
                  treatNextInternalsAsServerInRsc({ mode: "rsc" }),
                  useNextSharedAsyncStorageLayer(),
                  disableNextDevServerRuntime(),
                  useNextReactDomServerAlias(root),
                  ...cjsBrowserPlugin({
                    ...nextCjsBoundaryOptions,
                    name: "next-rsc:optimizer-cjs-browser-transform",
                    boundary: {
                      ...nextCjsBoundaryOptions.boundary,
                      proxy: true,
                    },
                  }),
                  useNextServerOnlyAlias(root),
                  useNextCacheHandlers(root),
                  useNextImageClientReference(),
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
                    "react-server-dom-webpack/static": reactServerDomWebpackAliases.staticEdge,
                  },
                },
              },
            },
          },
          react_client: {
            define: nextDefineEnvs.browser,
            resolve: {
              conditions: withConfiguredSourceConditions(config, ["edge-light", "browser"]),
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
              ...nextOptimizeDepsEntryConfig,
              include: [
                ...nextOptimizeDeps.browserRuntime,
                ...nextOptimizeDeps.clientRouter,
                ...nextOptimizeDeps.clientNavigation,
                ...nextOptimizeDeps.appRouterApi,
                ...nextOptimizeDeps.appRouterClientApi,
                ...nextOptimizeDeps.entryBaseClientReference,
                ...nextOptimizeDeps.image,
                ...internalReactClientSourceOptimizeDeps,
              ],
              rolldownOptions: {
                transform: {
                  define: nextBrowserOptimizerDefine,
                },
                plugins: [
                  useVitestServerReferenceInfo(root),
                  patchReactServerDomWebpackRequire(),
                  useNextCompiledOpenTelemetryApi(),
                  provideBufferLikeNextWebpack(),
                  disableNextDevServerRuntime(),
                ],
                resolve: {
                  alias: {
                    ...createOptimizeDepsResolveAliases(
                      edgeNativeAliases,
                      reactClientAppRouterAliases,
                      browserReactAliases,
                    ),
                    "react-server-dom-webpack/client": reactServerDomWebpackAliases.browser,
                    "react-server-dom-webpack/client.browser": reactServerDomWebpackAliases.browser,
                  },
                },
              },
            },
          },
          react_ssr: {
            define: nextDefineEnvs.edge,
            resolve: {
              conditions: withConfiguredSourceConditions(config, ["edge-light", "browser"]),
              alias: [
                ...edgeOpenTelemetryAliases,
                ...nextEdgeAppPageRouteModuleAliases,
                ...browserReactAliases,
                {
                  find: "react-server-dom-webpack/client",
                  replacement: reactServerDomWebpackAliases.ssr,
                },
                {
                  find: "react-server-dom-webpack/client.browser",
                  replacement: reactServerDomWebpackAliases.ssr,
                },
                {
                  find: "react-server-dom-webpack/server",
                  replacement: reactServerDomWebpackAliases.serverEdge,
                },
                {
                  find: "react-server-dom-webpack/static",
                  replacement: reactServerDomWebpackAliases.staticEdge,
                },
              ],
            },
            optimizeDeps: {
              exclude: [...nextRootParamsOptimizeDepsExclude],
              ...nextOptimizeDepsEntryConfig,
              include: [
                ...nextOptimizeDeps.browserRuntime,
                ...nextOptimizeDeps.clientRouter,
                ...nextOptimizeDeps.clientNavigation,
                ...nextOptimizeDeps.appRouterApi,
                ...nextOptimizeDeps.appRouterClientApi,
                ...nextOptimizeDeps.edgeAppPage,
                ...nextOptimizeDeps.entryBaseClientReference,
                ...nextOptimizeDeps.image,
                "react-dom/server.browser",
              ],
              rolldownOptions: {
                transform: {
                  define: nextEdgeOptimizerDefine,
                },
                plugins: [
                  useVitestServerReferenceInfo(root),
                  patchReactServerDomWebpackRequire(),
                  useNextCompiledOpenTelemetryApi(),
                  provideBufferLikeNextWebpack(),
                  treatNextInternalsAsServerInRsc({ mode: "react_ssr" }),
                  useNextSharedAsyncStorageLayer(),
                  disableNextDevServerRuntime(),
                  useNextReactServerConditionForServerBundles(root),
                  useNextServerOnlyAlias(root),
                ],
                resolve: {
                  alias: {
                    ...createOptimizeDepsResolveAliases(
                      edgeNativeAliases,
                      reactClientAppRouterAliases,
                      [...nextEdgeAppPageRouteModuleAliases, ...browserReactAliases],
                    ),
                    "react-server-dom-webpack/client": reactServerDomWebpackAliases.ssr,
                    "react-server-dom-webpack/client.browser": reactServerDomWebpackAliases.ssr,
                    "react-server-dom-webpack/server": reactServerDomWebpackAliases.serverEdge,
                    "react-server-dom-webpack/static": reactServerDomWebpackAliases.staticEdge,
                  },
                },
              },
            },
          },
        },
      };
    },
    configResolved(config) {
      const nextSourceOptimizerEntries = createNextSourceOptimizerEntries(getProjectRoot(config));
      if (nextSourceOptimizerEntries.length === 0) return;

      appendNextSourceOptimizerEntries(config.optimizeDeps, nextSourceOptimizerEntries);
      for (const environmentName of ["client", "react_client", "react_ssr"] as const) {
        appendNextSourceOptimizerEntries(
          config.environments[environmentName]?.optimizeDeps,
          nextSourceOptimizerEntries,
        );
      }
    },
  };
}

function hasConfiguredSourceCondition(config: { resolve?: { conditions?: string[] } }) {
  return config.resolve?.conditions?.includes(vitestPluginRscSourceCondition) ?? false;
}

function withConfiguredSourceConditions(
  config: { resolve?: { conditions?: string[] } },
  conditions: string[],
) {
  return hasConfiguredSourceCondition(config)
    ? [vitestPluginRscSourceCondition, ...conditions]
    : conditions;
}

function appendNextSourceOptimizerEntries(
  optimizeDeps: OptimizeDepsWithEntries | undefined,
  nextSourceOptimizerEntries: string[],
) {
  if (!optimizeDeps) return;

  const entries = Array.isArray(optimizeDeps.entries)
    ? optimizeDeps.entries
    : optimizeDeps.entries
      ? [optimizeDeps.entries]
      : [];
  optimizeDeps.entries = [...new Set([...entries, ...nextSourceOptimizerEntries])];
}
