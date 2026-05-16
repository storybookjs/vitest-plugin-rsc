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
  provideBufferLikeNextWebpack,
  treatNextInternalsAsServerInRsc,
  useNextCompiledOpenTelemetryApi,
  useNextReactDomServerAlias,
} from "./src/build/webpack-config.ts";
import { createNextSourceOptimizerEntries } from "./src/build/entries.ts";
import { useNextFontLoader } from "./src/build/webpack/loaders/next-font-loader/index.ts";
import { useNextImageClientReference } from "./src/build/webpack/loaders/next-image-loader/index.ts";
import { useNextMetadataImageLoader } from "./src/build/webpack/loaders/next-metadata-image-loader.ts";
import { useNextAppRenderCompatibility } from "./src/server/app-render/app-render.ts";
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

export function vitestPluginNext(): Plugin[] {
  return [
    useVitestServerReferenceInfo(),
    treatNextInternalsAsServerInRsc(),
    disableNextDevServerRuntime(),
    useNextReactDomServerAlias(),
    ...useNextCjsBrowserBoundaries({ name: "next-rsc:cjs-browser-transform" }),
    ...useNextAppRenderCompatibility(),
    useNextCacheHandlers(),
    useNextSwcTransform(),
    useNextUseCacheTransform(),
    useNextFontLoader(),
    useNextImageClientReference(),
    useNextMetadataImageLoader(),
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
      const nextSourceOptimizerEntries = createNextSourceOptimizerEntries(root);
      const nextCjsBoundaryOptions = await createNextCjsBrowserBoundaryOptions(root);

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
          include: [...nextOptimizeDeps.appRouterApi, ...nextOptimizeDeps.testingLibrary],
          exclude: [...nextRootParamsOptimizeDepsExclude],
          entries: nextSourceOptimizerEntries,
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
              entries: nextSourceOptimizerEntries,
              include: [
                ...nextOptimizeDeps.rscServer,
                ...nextOptimizeDeps.optionalAppRender,
                ...nextOptimizeDeps.browserRuntime,
                ...nextOptimizeDeps.rscClientUtility,
                ...nextOptimizeDeps.builtinError,
                ...nextOptimizeDeps.routeUtility,
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
                  ...cjsBrowserPlugin({
                    ...nextCjsBoundaryOptions,
                    name: "next-rsc:optimizer-cjs-browser-transform",
                    boundary: {
                      ...nextCjsBoundaryOptions.boundary,
                      proxy: true,
                    },
                  }),
                  ...useNextAppRenderCompatibility(root),
                  useNextCacheHandlers(root),
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
              entries: nextSourceOptimizerEntries,
              include: [
                ...nextOptimizeDeps.browserRuntime,
                ...nextOptimizeDeps.clientRouter,
                ...nextOptimizeDeps.clientNavigation,
                ...nextOptimizeDeps.appRouterApi,
                ...nextOptimizeDeps.appRouterClientApi,
                ...nextOptimizeDeps.entryBaseClientReference,
                ...nextOptimizeDeps.image,
              ],
              rolldownOptions: {
                transform: {
                  define: nextDefineEnvs.browser,
                },
                plugins: [
                  useVitestServerReferenceInfo(root),
                  disableNextDevServerRuntime(),
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
                    "react-server-dom-webpack/client.browser": reactServerDomWebpackAliases.browser,
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
              entries: nextSourceOptimizerEntries,
              include: [
                ...nextOptimizeDeps.browserRuntime,
                ...nextOptimizeDeps.clientRouter,
                ...nextOptimizeDeps.clientNavigation,
                ...nextOptimizeDeps.appRouterApi,
                ...nextOptimizeDeps.appRouterClientApi,
                ...nextOptimizeDeps.entryBaseClientReference,
                ...nextOptimizeDeps.image,
                "react-dom/server.browser",
              ],
              rolldownOptions: {
                transform: {
                  define: nextDefineEnvs.browser,
                },
                plugins: [
                  useVitestServerReferenceInfo(root),
                  disableNextDevServerRuntime(),
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
  };
}
