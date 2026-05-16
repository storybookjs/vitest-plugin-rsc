import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Alias, Plugin } from "vite";

const supportedEdgeNativeModules = ["buffer", "events", "assert", "util"] as const;
// Begin copy: Next.js ACTION_ID_EXPECTED_LENGTH
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/action-handler.ts#L1372-L1375
const ACTION_ID_EXPECTED_LENGTH = 42;
// End copy
const virtualServerReferenceInfoId = "\0vitest-plugin-rsc:next-server-reference-info";

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

function getProjectRoot(config: { root?: string }): string {
  return path.resolve(config.root ?? process.cwd());
}

function createProjectRequire(root: string): NodeJS.Require {
  return createRequire(path.join(root, "package.json"));
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

function tryResolveFromProject(root: string, id: string): string | undefined {
  try {
    return createProjectRequire(root).resolve(id);
  } catch {
    return;
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
  const osBrowserShimExtension = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
  const osBrowserShim = fileURLToPath(
    new URL(`./os-browser${osBrowserShimExtension}`, import.meta.url),
  );
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
) {
  return {
    ...Object.fromEntries(
      edgeNativeAliases
        .filter((alias): alias is Alias & { find: string } => typeof alias.find === "string")
        .map((alias) => [alias.find, alias.replacement]),
    ),
    ...aliases,
  };
}

function createReactServerDomWebpackAliases(root: string) {
  return {
    browser:
      tryResolveFromProject(root, "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser") ??
      "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser",
    edge:
      tryResolveFromProject(root, "@vitejs/plugin-rsc/vendor/react-server-dom/client.edge") ??
      "@vitejs/plugin-rsc/vendor/react-server-dom/client.edge",
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
  // Begin copy: Next.js action ID shape check
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/action-handler.ts#L1433-L1464
  // Adaptation: Vite's RSC action IDs are not Next action IDs, so only delegate
  // to Next's imported parser for hex IDs with Next's expected length.
  const isNextActionId = id.length === ${ACTION_ID_EXPECTED_LENGTH} && /^[0-9a-fA-F]+$/.test(id);
  // End copy
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
    name: "next-rsc-server-window-checks",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    transform(code, id) {
      if (!isNextInternalModule(id) || !/\btypeof\s+window\b/.test(code)) return;

      const nextCode = rewriteTypeofWindowChecks(code);
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

export function vitestPluginNext(): Plugin[] {
  return [
    useVitestServerReferenceInfo(),
    treatNextInternalsAsServerInRsc(),
    appRouterApiPlugin("client", true),
    appRouterApiPlugin("react_client", false),
    {
      name: "next-rsc-plugin",
      config(config) {
        const root = getProjectRoot(config);
        const edgeNativeAliases = createNextEdgeNativeAliases(root);
        const rscAppRouterAliases = createAppRouterApiAliasesFromNext(root, true);
        const reactClientAppRouterAliases = createAppRouterApiAliasesFromNext(root, false);
        const reactServerDomWebpackAliases = createReactServerDomWebpackAliases(root);

        return {
          define: {
            "process.env": JSON.stringify({ NEXT_RUNTIME: "edge" }),
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
          environments: {
            client: {
              resolve: {
                conditions: ["edge-light", "react-server"],
                alias: [
                  {
                    find: "react-server-dom-webpack/client",
                    replacement: reactServerDomWebpackAliases.edge,
                  },
                ],
              },
              optimizeDeps: {
                include: [
                  "next/dist/compiled/@opentelemetry/api",
                  "next/cache",
                  "next/headers",
                  "next/dist/compiled/@edge-runtime/cookies/index.js",
                  "next/dist/server/node-environment-baseline.js",
                  "next/dist/server/app-render/action-async-storage.external.js",
                  "next/dist/server/app-render/async-local-storage.js",
                  "next/dist/server/app-render/work-async-storage.external.js",
                  "next/dist/server/app-render/work-unit-async-storage.external.js",
                  "next/dist/server/async-storage/request-store.js",
                  "next/dist/server/async-storage/work-store.js",
                  "next/dist/server/config-shared.js",
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
                  "next/dist/server/web/spec-extension/adapters/headers.js",
                  "next/dist/server/web/spec-extension/adapters/request-cookies.js",
                  "next/dist/shared/lib/server-inserted-html.shared-runtime.js",
                  "node:buffer",
                  "vitest-plugin-rsc/async-local-storage",
                  "next/dist/client/app-call-server.js",
                  "next/dist/client/route-params.js",
                  "next/dist/client/components/app-router.js",
                  "next/dist/client/app-dir/link",
                  "next/dist/client/app-dir/link.js",
                  "next/dist/client/components/navigation",
                  "next/dist/client/components/navigation.react-server",
                  "next/dist/client/components/app-router-instance.js",
                  "next/dist/client/components/navigation.js",
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
                  "next/dist/client/flight-data-helpers.js",
                  "next/dist/server/lib/server-action-request-meta.js",
                  "next/dist/client/components/use-action-queue.js",
                  "next/dist/server/app-render/create-flight-router-state-from-loader-tree.js",
                  "next/dist/server/app-render/get-short-dynamic-param-type.js",
                  "next/dist/server/app-render/parse-and-validate-flight-router-state.js",
                  "next/dist/server/request/draft-mode.js",
                  "next/dist/shared/lib/segment.js",
                  "next/dist/shared/lib/is-thenable.js",
                  "next/dist/shared/lib/router/utils/get-dynamic-param.js",
                  "next/dist/shared/lib/router/utils/get-segment-param.js",
                  "next/dist/shared/lib/app-router-context.shared-runtime.js",
                  "next/dist/shared/lib/hooks-client-context.shared-runtime.js",
                  "next/dist/shared/lib/server-inserted-html.shared-runtime.js",
                ],
                needsInterop: ["next/cache"],
                rolldownOptions: {
                  plugins: [
                    useVitestServerReferenceInfo(root),
                    treatNextInternalsAsServerInRsc(),
                    useNextCompiledOpenTelemetryApi(root),
                  ],
                  resolve: {
                    alias: {
                      ...createOptimizeDepsResolveAliases(edgeNativeAliases, rscAppRouterAliases),
                      "react-server-dom-webpack/client": reactServerDomWebpackAliases.edge,
                    },
                  },
                },
              },
            },
            react_client: {
              resolve: {
                conditions: ["edge-light", "browser"],
                alias: [
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
                include: [
                  "node:buffer",
                  "vitest-plugin-rsc/async-local-storage",
                  "next/dist/client/app-call-server.js",
                  "next/dist/client/route-params.js",
                  "next/dist/client/components/app-router.js",
                  "next/dist/client/app-dir/link",
                  "next/dist/client/app-dir/link.js",
                  "next/dist/client/components/navigation",
                  "next/dist/client/components/navigation.react-server",
                  "next/dist/client/components/app-router-instance.js",
                  "next/dist/client/components/navigation.js",
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
                  "next/dist/client/flight-data-helpers.js",
                  "next/dist/server/lib/server-action-request-meta.js",
                  "next/dist/client/components/use-action-queue.js",
                  "next/dist/server/app-render/create-flight-router-state-from-loader-tree.js",
                  "next/dist/server/app-render/get-short-dynamic-param-type.js",
                  "next/dist/server/app-render/parse-and-validate-flight-router-state.js",
                  "next/dist/shared/lib/segment.js",
                  "next/dist/shared/lib/is-thenable.js",
                  "next/dist/shared/lib/router/utils/get-dynamic-param.js",
                  "next/dist/shared/lib/router/utils/get-segment-param.js",
                  "next/dist/shared/lib/app-router-context.shared-runtime.js",
                  "next/dist/shared/lib/hooks-client-context.shared-runtime.js",
                  "next/dist/shared/lib/server-inserted-html.shared-runtime.js",
                ],
                rolldownOptions: {
                  plugins: [
                    useVitestServerReferenceInfo(root),
                    useNextCompiledOpenTelemetryApi(root),
                  ],
                  resolve: {
                    alias: {
                      ...createOptimizeDepsResolveAliases(
                        edgeNativeAliases,
                        reactClientAppRouterAliases,
                      ),
                      "react-server-dom-webpack/client": reactServerDomWebpackAliases.browser,
                      "react-server-dom-webpack/client.browser":
                        reactServerDomWebpackAliases.browser,
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
