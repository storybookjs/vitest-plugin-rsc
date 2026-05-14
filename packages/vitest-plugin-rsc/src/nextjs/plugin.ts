import { Buffer } from "node:buffer";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Alias, Plugin, UserConfig } from "vite";

const supportedEdgeNativeModules = ["buffer", "events", "assert", "util"] as const;
const virtualServerReferenceInfoId = "\0vitest-plugin-rsc:next-server-reference-info";
const virtualNextRouteManifestId = "\0vitest-plugin-rsc:next-route-manifest";
const virtualNextRouteManifestPublicId = "virtual:vitest-plugin-rsc/next-routes";
const virtualNextRouteTreeIdPrefix = "\0vitest-plugin-rsc:next-route-tree?";
const virtualNextRouteTreePublicId = "virtual:vitest-plugin-rsc/next-route-tree";
const virtualNextRouteEmptyModuleId = "\0vitest-plugin-rsc:next-route-empty-module";
const virtualNextRouteEmptyModulePublicId = "virtual:vitest-plugin-rsc/next-route-empty-module";
const virtualNextEntryBaseId = "\0vitest-plugin-rsc:next-entry-base";
const virtualNextEntryBasePublicId = "virtual:vitest-plugin-rsc/next-entry-base";
const virtualNextMetadataImageLoaderPrefix = "\0vitest-plugin-rsc:next-metadata-image-loader:";
const virtualNextEntryBaseClientReferencePrefix =
  "\0vitest-plugin-rsc:next-entry-base-client-reference:";
const virtualNextEntryBaseClientReferencePublicPrefix =
  "virtual:vitest-plugin-rsc/next-entry-base-client-reference/";
const virtualNextAppRouterServerStubId = "\0vitest-plugin-rsc:next-app-router-server-stub";
const virtualNextAppRouterInstanceServerStubId =
  "\0vitest-plugin-rsc:next-app-router-instance-server-stub";
const virtualNextServerInsertedHtmlStubId = "\0vitest-plugin-rsc:next-server-inserted-html-stub";
const virtualNextImageConfigContextStubId = "\0vitest-plugin-rsc:next-image-config-context-stub";
const virtualNextServerOnlyStubId = "\0vitest-plugin-rsc:next-server-only-stub";

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
  "next/dist/server/request/search-params.js",
  "next/dist/server/web/spec-extension/adapters/headers.js",
  "next/dist/server/web/spec-extension/adapters/request-cookies.js",
  "next/dist/shared/lib/router/utils/parse-relative-url.js",
  "next/dist/client/components/hooks-server-context.js",
  "next/dist/server/app-render/rsc/postpone.js",
  "next/dist/server/app-render/rsc/preloads.js",
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
    serverEdge:
      tryResolveFromProject(root, "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge") ??
      "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge",
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

type NextRouteManifestBuildEntry = {
  route: string;
  appDir: string;
  appPath: string;
  appPaths: readonly string[];
  allNormalizedAppPaths: readonly string[];
  pageFile: string;
};

function useNextRouteManifest(): Plugin {
  let root = process.cwd();

  return {
    name: "next-rsc-route-manifest",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
    },
    resolveId(source) {
      const [sourceFile] = source.split("?");
      if (
        sourceFile &&
        path.isAbsolute(sourceFile) &&
        !fs.existsSync(sourceFile) &&
        isInNextAppDir(root, sourceFile)
      ) {
        return virtualNextRouteEmptyModuleId;
      }

      if (source === virtualNextRouteManifestPublicId) {
        return virtualNextRouteManifestId;
      }
      if (source.startsWith(`${virtualNextRouteTreePublicId}?`)) {
        return `${virtualNextRouteTreeIdPrefix}${source.slice(virtualNextRouteTreePublicId.length + 1)}`;
      }
      if (source === virtualNextRouteEmptyModulePublicId) {
        return virtualNextRouteEmptyModuleId;
      }
    },
    async load(id) {
      if (id === virtualNextRouteEmptyModuleId) {
        return "export default function VitestNextEmptyRouteModule() { return null; }";
      }

      if (id.startsWith(virtualNextRouteTreeIdPrefix)) {
        const params = new URLSearchParams(id.slice(virtualNextRouteTreeIdPrefix.length));
        const pageFile = params.get("pageFile");
        if (!pageFile) {
          throw new Error("Missing pageFile for Next route tree virtual module.");
        }

        const entries = await scanNextAppRoutes(root);
        const entry = entries.find((candidate) => candidate.pageFile === pageFile);
        if (!entry) {
          throw new Error(`No Next app route entry found for ${pageFile}.`);
        }

        const { code, watchFiles } = await generateNextRouteTreeModule(root, entry, entries);
        for (const file of watchFiles) {
          this.addWatchFile(file);
        }
        return code;
      }

      if (id === virtualNextRouteManifestId) {
        const entries = await scanNextAppRoutes(root);
        for (const entry of entries) {
          this.addWatchFile(entry.pageFile);
        }

        return generateNextRouteManifest(entries);
      }
    },
  };
}

function useNextMetadataImageLoader(): Plugin {
  let root = process.cwd();

  return {
    name: "next-rsc-metadata-image-loader",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
    },
    resolveId(source) {
      if (source.startsWith("next-metadata-image-loader?")) {
        return `${virtualNextMetadataImageLoaderPrefix}${encodeURIComponent(source)}`;
      }

      if (source.startsWith(virtualNextMetadataImageLoaderPrefix)) {
        return source;
      }
    },
    async load(id) {
      if (!id.startsWith(virtualNextMetadataImageLoaderPrefix)) return;

      const request = decodeURIComponent(id.slice(virtualNextMetadataImageLoaderPrefix.length));
      const { options, resourcePath, resourceQuery } = parseNextMetadataImageLoaderRequest(request);
      const loader = createProjectRequire(root)(
        "next/dist/build/webpack/loaders/next-metadata-image-loader.js",
      ) as {
        default: (
          this: NextMetadataImageLoaderContext,
          content: Buffer,
        ) => Promise<string> | string;
      };
      const content = await fs.promises.readFile(resourcePath);

      this.addWatchFile(resourcePath);

      return loader.default.call(
        {
          getOptions: () => options,
          resourcePath,
          resourceQuery,
          rootContext: root,
          context: path.dirname(resourcePath),
          options: {},
        },
        content,
      );
    },
  };
}

type NextMetadataImageLoaderContext = {
  getOptions(): NextMetadataImageLoaderOptions;
  resourcePath: string;
  resourceQuery: string;
  rootContext: string;
  context: string;
  options: Record<string, unknown>;
};

type NextMetadataImageLoaderOptions = {
  type: string;
  segment: string;
  pageExtensions: string[];
  basePath: string;
};

function parseNextMetadataImageLoaderRequest(request: string) {
  const [loaderRequest, resourceRequest] = splitOnce(request, "!");
  if (!loaderRequest || !resourceRequest) {
    throw new Error(`Invalid Next metadata image loader request: ${request}`);
  }

  const query = loaderRequest.slice("next-metadata-image-loader?".length);
  const params = new URLSearchParams(query);
  const [resourcePath, rawResourceQuery = ""] = splitOnce(resourceRequest, "?");

  if (!resourcePath) {
    throw new Error(`Missing resource path for Next metadata image loader request: ${request}`);
  }

  return {
    options: {
      type: params.get("type") ?? "icon",
      segment: params.get("segment") ?? "",
      pageExtensions: params.getAll("pageExtensions"),
      basePath: params.get("basePath") ?? "",
    },
    resourcePath,
    resourceQuery: rawResourceQuery ? `?${rawResourceQuery}` : "",
  };
}

function splitOnce(value: string, separator: string): [string, string?] {
  const index = value.indexOf(separator);
  if (index < 0) return [value];

  return [value.slice(0, index), value.slice(index + separator.length)];
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
        source === "next/dist/server/app-render/entry-base.js" ||
        source === virtualNextEntryBasePublicId
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
	// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/entry-base.ts#L1-L98
	// Adaptation: Vite RSC provides the React Flight server implementation and
	// client references, while the remaining exports keep Next app-render using
	// its normal component-tree glue.
	import { createElement, Fragment } from "react";
	import { renderToReadableStream } from "@vitejs/plugin-rsc/vendor/react-server-dom/server.edge";
	import LayoutRouter, { LoadingBoundaryProvider } from ${JSON.stringify(clientReference("layout-router"))};
	import RenderFromTemplateContext from ${JSON.stringify(clientReference("render-from-template-context"))};
	import { ClientPageRoot } from ${JSON.stringify(clientReference("client-page"))};
	import { ClientSegmentRoot } from ${JSON.stringify(clientReference("client-segment"))};
	import { HTTPAccessFallbackBoundary } from ${JSON.stringify(clientReference("error-boundary"))};
	import { RootLayoutBoundary } from ${JSON.stringify(clientReference("boundary-components"))};
	import { patchFetch as patchNextFetch } from "next/dist/server/lib/patch-fetch.js";
	import { actionAsyncStorage } from "next/dist/server/app-render/action-async-storage.external.js";
	import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external.js";
	import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external.js";
	import { createMetadataComponents } from "next/dist/lib/metadata/metadata.js";
	import * as hooksServerContext from "next/dist/client/components/hooks-server-context.js";
import {
  createPrerenderSearchParamsForClientPage,
  createServerSearchParamsForServerPage as createNextServerSearchParamsForServerPage,
} from "next/dist/server/request/search-params.js";
import {
  createPrerenderParamsForClientSegment,
  createServerParamsForServerSegment as createNextServerParamsForServerSegment,
} from "next/dist/server/request/params.js";
import { Postpone } from "next/dist/server/app-render/rsc/postpone.js";
import { preconnect, preloadFont, preloadStyle } from "next/dist/server/app-render/rsc/preloads.js";

function SegmentViewNode({ children }) {
  return children;
}

function isCacheWorkUnitStore() {
  const store = workUnitAsyncStorage.getStore();
  return store?.type === "cache" || store?.type === "private-cache" || store?.type === "unstable-cache";
}

function isCacheContextInvariant(error, helperName) {
  return (
    error instanceof Error &&
    error.message ===
      "Invariant: " + helperName + " should not be called in cache contexts. This is a bug in Next.js."
  );
}

function createServerParamsForServerSegment(
  underlyingParams,
  optionalCatchAllParamName,
  varyParamsAccumulator,
  isRuntimePrefetchable
) {
  if (isCacheWorkUnitStore()) {
    return Promise.resolve(underlyingParams);
  }

  try {
    return createNextServerParamsForServerSegment(
      underlyingParams,
      optionalCatchAllParamName,
      varyParamsAccumulator,
      isRuntimePrefetchable
    );
  } catch (error) {
    if (isCacheContextInvariant(error, "createServerParamsForServerSegment")) {
      return Promise.resolve(underlyingParams);
    }
    throw error;
  }
}

function createServerSearchParamsForServerPage(
  underlyingSearchParams,
  varyParamsAccumulator,
  isRuntimePrefetchable
) {
  if (isCacheWorkUnitStore()) {
    return Promise.resolve(underlyingSearchParams);
  }

  try {
    return createNextServerSearchParamsForServerPage(
      underlyingSearchParams,
      varyParamsAccumulator,
      isRuntimePrefetchable
    );
  } catch (error) {
    if (isCacheContextInvariant(error, "createServerSearchParamsForServerPage")) {
      return Promise.resolve(underlyingSearchParams);
    }
    throw error;
  }
}

export {
  ClientPageRoot,
  ClientSegmentRoot,
  Fragment,
  HTTPAccessFallbackBoundary,
  LayoutRouter,
  LoadingBoundaryProvider,
  Postpone,
  RenderFromTemplateContext,
  RootLayoutBoundary,
  SegmentViewNode,
	  actionAsyncStorage,
	  createElement,
	  createMetadataComponents,
	  createPrerenderParamsForClientSegment,
  createPrerenderSearchParamsForClientPage,
  createServerParamsForServerSegment,
	  createServerSearchParamsForServerPage,
	  preconnect,
	  preloadFont,
	  preloadStyle,
	  renderToReadableStream,
	  workAsyncStorage,
	  workUnitAsyncStorage,
	};

	export const SegmentViewStateNode = SegmentViewNode;
	export const serverHooks = hooksServerContext;
	export function patchFetch() {
	  return patchNextFetch({
	    workAsyncStorage,
	    workUnitAsyncStorage,
	  });
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

function useNextAppRouterServerStub(): Plugin {
  return {
    name: "next-rsc-app-router-server-stub",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    resolveId(source, importer) {
      if (
        importer &&
        isNextAppRenderModule(importer) &&
        (source === "../../client/components/app-router" ||
          source === "../../client/components/app-router.js")
      ) {
        return virtualNextAppRouterServerStubId;
      }

      if (
        importer &&
        isNextAppRenderModule(importer) &&
        (source === "../../client/components/app-router-instance" ||
          source === "../../client/components/app-router-instance.js")
      ) {
        return virtualNextAppRouterInstanceServerStubId;
      }

      if (source === virtualNextAppRouterServerStubId) {
        return source;
      }

      if (source === virtualNextAppRouterInstanceServerStubId) {
        return source;
      }
    },
    load(id) {
      if (id === virtualNextAppRouterInstanceServerStubId) {
        return `
export function createMutableActionQueue(initialState) {
  return {
    state: initialState,
    dispatch() {},
    action() {
      return initialState;
    },
    pending: null,
    last: null,
    onRouterTransitionStart: null,
  };
}

export function dispatchNavigateAction() {}
export function dispatchTraverseAction() {}
export function getCurrentAppRouterState() {
  return null;
}

export const publicAppRouterInstance = {
  back() {},
  forward() {},
  prefetch() {},
  push() {},
  replace() {},
  refresh() {},
  hmrRefresh() {},
};
`;
      }

      if (id !== virtualNextAppRouterServerStubId) return;

      return `
import { createElement } from "react";

export default function AppRouter() {
  return createElement("vitest-next-app-router-stub");
}
`;
    },
  };
}

function useNextAppRenderReactDomServer(root = process.cwd()): Plugin {
  let reactDomServer = tryResolveFromProject(root, "react-dom/server.edge");
  let reactDomStatic = tryResolveFromProject(root, "react-dom/static.edge");

  return {
    name: "next-rsc-app-render-react-dom-server",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    configResolved(config) {
      const projectRoot = getProjectRoot(config);
      reactDomServer = tryResolveFromProject(projectRoot, "react-dom/server.edge");
      reactDomStatic = tryResolveFromProject(projectRoot, "react-dom/static.edge");
    },
    resolveId(source, importer) {
      if (!importer || !isNextAppRenderServerModule(importer)) return;

      if (source === "react-dom/server" && reactDomServer) {
        return reactDomServer;
      }

      if (source === "react-dom/static" && reactDomStatic) {
        return reactDomStatic;
      }
    },
  };
}

function useNextServerInsertedHtmlStub(): Plugin {
  return {
    name: "next-rsc-server-inserted-html-stub",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    resolveId(source, importer) {
      if (
        importer &&
        /[/\\]next[/\\]dist[/\\]server[/\\]app-render[/\\]server-inserted-html\.js(?:\?|$)/.test(
          importer,
        ) &&
        (source === "../../shared/lib/server-inserted-html.shared-runtime" ||
          source === "../../shared/lib/server-inserted-html.shared-runtime.js")
      ) {
        return virtualNextServerInsertedHtmlStubId;
      }

      if (source === virtualNextServerInsertedHtmlStubId) {
        return source;
      }
    },
    load(id) {
      if (id !== virtualNextServerInsertedHtmlStubId) return;

      return `
export const ServerInsertedHTMLContext = {
  Provider({ children }) {
    return children;
  },
};

export function useServerInsertedHTML(callback) {
}
`;
    },
  };
}

function useNextImageConfigContextStub(): Plugin {
  return {
    name: "next-rsc-image-config-context-stub",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    resolveId(source, importer) {
      if (
        importer &&
        isNextAppRenderModule(importer) &&
        (source === "../../shared/lib/image-config-context.shared-runtime" ||
          source === "../../shared/lib/image-config-context.shared-runtime.js")
      ) {
        return virtualNextImageConfigContextStubId;
      }

      if (source === virtualNextImageConfigContextStubId) {
        return source;
      }
    },
    load(id) {
      if (id !== virtualNextImageConfigContextStubId) return;

      return `
export const ImageConfigContext = {
  Provider({ children }) {
    return children;
  },
};
`;
    },
  };
}

function useNextServerOnlyStub(): Plugin {
  return {
    name: "next-rsc-server-only-stub",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    resolveId(source) {
      if (source === "server-only") {
        return virtualNextServerOnlyStubId;
      }

      if (source === virtualNextServerOnlyStubId) {
        return source;
      }
    },
    load(id) {
      if (id !== virtualNextServerOnlyStubId) return;

      return "export {};\n";
    },
  };
}

function isNextAppRenderModule(id: string) {
  return /[/\\]next[/\\]dist[/\\]server[/\\]app-render[/\\]app-render\.js(?:\?|$)/.test(id);
}

function isNextAppRenderServerModule(id: string) {
  return /[/\\]next[/\\]dist[/\\]server[/\\]app-render[/\\].+\.js(?:\?|$)/.test(id);
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

function isInNextAppDir(root: string, file: string) {
  const dirs = [path.join(root, "app"), path.join(root, "src", "app")];
  return dirs.some((dir) => {
    const relative = path.relative(dir, file);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

async function scanNextAppRoutes(root: string): Promise<NextRouteManifestBuildEntry[]> {
  const requireFromProject = createProjectRequire(root);
  const { findDir } = requireFromProject(
    "next/dist/lib/find-pages-dir.js",
  ) as typeof import("next/dist/lib/find-pages-dir.js");
  const appDir = findDir(root, "app");
  if (!appDir) return [];

  // Begin copy: Next.js dev app-page route matcher setup
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts#L16-L83
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.ts#L12-L42
  // Adaptation: Vitest asks the provider for matchers directly instead of
  // running the full Next dev server route matcher manager.
  const { DevAppPageRouteMatcherProvider } = requireFromProject(
    "next/dist/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.js",
  ) as typeof import("next/dist/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.js");
  const { DefaultFileReader } = requireFromProject(
    "next/dist/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.js",
  ) as typeof import("next/dist/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.js");
  const { sortPageObjects } = requireFromProject(
    "next/dist/shared/lib/router/utils/sortable-routes.js",
  ) as typeof import("next/dist/shared/lib/router/utils/sortable-routes.js");

  const provider = new DevAppPageRouteMatcherProvider(
    appDir,
    ["tsx", "ts", "jsx", "js", "mdx"],
    new DefaultFileReader({
      ignorePartFilter: (part: string) => part === "node_modules" || part.startsWith("."),
    }),
    false,
  );
  const matchers = await provider.matchers();
  // End copy

  const pageFileByAppPath = new Map<string, string>();
  const matcherByRoute = new Map<string, (typeof matchers)[number]>();

  for (const matcher of matchers) {
    pageFileByAppPath.set(matcher.definition.page, matcher.definition.filename);
    matcherByRoute.set(matcher.definition.pathname, matcher);
  }

  const entries = Array.from(matcherByRoute, ([route, matcher]) => {
    const appPath = matcher.definition.appPaths.at(-1) ?? matcher.definition.page;
    const pageFile = pageFileByAppPath.get(appPath) ?? matcher.definition.filename;

    return {
      route,
      appDir,
      appPath,
      appPaths: matcher.definition.appPaths,
      allNormalizedAppPaths: Array.from(matcherByRoute.keys()),
      pageFile,
    };
  });

  return Array.from(sortPageObjects(entries, (entry) => entry.route));
}

function generateNextRouteManifest(entries: NextRouteManifestBuildEntry[]) {
  const imports = entries
    .map((entry, index) => {
      const params = new URLSearchParams({ pageFile: entry.pageFile });
      return `import { loaderTree as loaderTree${index} } from ${JSON.stringify(`${virtualNextRouteTreePublicId}?${params}`)};`;
    })
    .join("\n");

  const manifest = `[${entries
    .map(
      (entry, index) => `{
        route: ${JSON.stringify(entry.route)},
        appPath: ${JSON.stringify(entry.appPath)},
        pageFile: ${JSON.stringify(entry.pageFile)},
        loaderTree: loaderTree${index},
      }`,
    )
    .join(",")}]`;

  return `${imports}\nexport const nextRouteManifest = ${manifest};\n`;
}

async function generateNextRouteTreeModule(
  root: string,
  entry: NextRouteManifestBuildEntry,
  entries: NextRouteManifestBuildEntry[],
) {
  assertRootLayoutExists(entry);

  const watchFiles = new Set<string>([entry.pageFile]);
  const loader = createProjectRequire(root)(
    "next/dist/build/webpack/loaders/next-app-loader/index.js",
  ) as {
    default: (this: NextAppLoaderContext) => Promise<string>;
  };
  // Begin copy: Next.js next-app-loader option shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/entries.ts#L584-L615
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L92-L127
  // Adaptation: Vite invokes the loader in-process to get the real loader tree
  // while replacing webpack's module graph with Vite virtual modules.
  const options = {
    name: `app${entry.appPath}`,
    page: entry.appPath,
    pagePath: `private-next-app-dir${entry.appPath}`,
    appDir: entry.appDir,
    appPaths: entry.appPaths,
    allNormalizedAppPaths: entry.allNormalizedAppPaths,
    preferredRegion: undefined,
    pageExtensions: ["tsx", "ts", "jsx", "js", "mdx"],
    assetPrefix: "",
    rootDir: root,
    tsconfigPath: path.join(root, "tsconfig.json"),
    isDev: false as const,
    basePath: "",
    nextConfigOutput: undefined,
    middlewareConfig: Buffer.from(JSON.stringify({ matchers: [] })).toString("base64"),
    isGlobalNotFoundEnabled: undefined,
  };
  // End copy
  const context: NextAppLoaderContext = {
    getOptions: () => options,
    _module: { buildInfo: {} },
    _compiler: { context: root },
    _compilation: undefined,
    addMissingDependency(file) {
      watchFiles.add(file);
    },
  };

  const generated = await loader.default.call(context);
  return {
    code: extractNextLoaderTreeModule(generated),
    watchFiles: [...watchFiles],
  };
}

type NextAppLoaderContext = {
  getOptions(): {
    name: string;
    page: string;
    pagePath: string;
    appDir: string;
    appPaths: readonly string[];
    allNormalizedAppPaths: readonly string[];
    preferredRegion: undefined;
    pageExtensions: string[];
    assetPrefix: string;
    rootDir: string;
    tsconfigPath: string;
    isDev: false;
    basePath: string;
    nextConfigOutput: undefined;
    middlewareConfig: string;
    isGlobalNotFoundEnabled: undefined;
  };
  _module: { buildInfo: Record<string, unknown> };
  _compiler: { context: string };
  _compilation: undefined;
  addMissingDependency(file: string): void;
};

function assertRootLayoutExists(entry: NextRouteManifestBuildEntry) {
  let currentDir = path.dirname(entry.pageFile);
  while (currentDir.startsWith(entry.appDir)) {
    if (findAppFile(currentDir, "layout")) return;
    if (currentDir === entry.appDir) break;
    currentDir = path.dirname(currentDir);
  }

  throw new Error(
    `Cannot render Next route ${entry.route} because no root layout was found above ${entry.pageFile}. Add an app/layout file or render a React node directly.`,
  );
}

function findAppFile(dir: string, basename: string) {
  const extensions = [".tsx", ".ts", ".jsx", ".js", ".mdx"];
  return extensions.find((ext) => fs.existsSync(path.join(dir, `${basename}${ext}`)));
}

function extractNextLoaderTreeModule(generated: string) {
  const treeStart = generated.indexOf("const tree =");
  const treeEnd = generated.indexOf("const __next_app_require__", treeStart);
  if (treeStart < 0 || treeEnd < 0) {
    throw new Error("Could not extract loader tree from Next app loader output.");
  }

  const treeCode = generated
    .slice(treeStart, treeEnd)
    .replace("const tree =", "export const loaderTree =");
  const referencedLoaders = new Set(
    Array.from(treeCode.matchAll(/\b([A-Za-z_$][\w$]*)\b/g), (match) => match[1]),
  );
  const moduleLoaders = generated
    .slice(0, treeStart)
    .split("\n")
    .filter((line) => {
      const match = line.match(/^const (\w+) = \(\) => import\(/);
      return match && referencedLoaders.has(match[1]!);
    })
    .join("\n");

  return rewriteNextAppLoaderImports(`${moduleLoaders}\n${treeCode}`);
}

function rewriteNextAppLoaderImports(code: string) {
  return code
    .replace(
      /import\((\/\*[\s\S]*?\*\/\s*)?(['"])([^'"]+)\2\)/g,
      (_match, comment: string | undefined, _quote: string, source: string) =>
        `import(${comment ?? ""}${JSON.stringify(toViteImportSource(source))})`,
    )
    .replace(
      /(from\s+)(['"])([^'"]+)\2/g,
      (_match, prefix: string, _quote: string, source: string) =>
        `${prefix}${JSON.stringify(toViteImportSource(source))}`,
    )
    .replace(
      /(import\s+)(['"])([^'"]+)\2/g,
      (_match, prefix: string, _quote: string, source: string) =>
        `${prefix}${JSON.stringify(toViteImportSource(source))}`,
    );
}

function toViteImportSource(source: string) {
  if (!path.isAbsolute(source)) return source;
  const [file] = source.split("?");
  if (file && !fs.existsSync(file)) return virtualNextRouteEmptyModulePublicId;

  return `/@fs/${normalizePath(source).replace(/^\//, "")}`;
}

function normalizePath(file: string) {
  return file.split(path.sep).join("/");
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

export function vitestPluginNext(): Plugin[] {
  return [
    useVitestServerReferenceInfo(),
    treatNextInternalsAsServerInRsc(),
    useNextEntryBase(),
    useNextEntryBaseClientReferences(),
    useNextAppRouterServerStub(),
    useNextAppRenderReactDomServer(),
    useNextServerInsertedHtmlStub(),
    useNextImageConfigContextStub(),
    useNextServerOnlyStub(),
    useNextMetadataImageLoader(),
    useNextRouteManifest(),
    appRouterApiPlugin("client", true),
    appRouterApiPlugin("react_client", false),
    appRouterApiPlugin("react_ssr", false),
    {
      name: "next-rsc-plugin",
      config(config) {
        const root = getProjectRoot(config);
        const edgeNativeAliases = createNextEdgeNativeAliases(root);
        const rscAppRouterAliases = createAppRouterApiAliasesFromNext(root, true);
        const reactClientAppRouterAliases = createAppRouterApiAliasesFromNext(root, false);
        const reactServerDomWebpackAliases = createReactServerDomWebpackAliases(root);
        const nextOptionalAppRenderDeps = filterResolvableOptimizeDeps(
          root,
          nextOptionalAppRenderOptimizeDeps,
        );

        return {
          define: {
            "process.env.NEXT_RUNTIME": JSON.stringify("edge"),
            "process.env.__NEXT_APP_NAV_FAIL_HANDLING": JSON.stringify(false),
            "process.env.__NEXT_CACHE_COMPONENTS": JSON.stringify(false),
            "process.env.__NEXT_CLIENT_ROUTER_DYNAMIC_STALETIME": JSON.stringify("0"),
            "process.env.__NEXT_CLIENT_ROUTER_STATIC_STALETIME": JSON.stringify("300"),
            "process.env.__NEXT_CLIENT_SEGMENT_CACHE": JSON.stringify(true),
            "process.env.__NEXT_DYNAMIC_ON_HOVER": JSON.stringify(false),
            "process.env": JSON.stringify({ NEXT_RUNTIME: "edge" }),
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
          environments: {
            client: {
              resolve: {
                conditions: ["edge-light", "react-server"],
                alias: [
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
                include: [
                  ...nextRscServerOptimizeDeps,
                  ...nextOptionalAppRenderDeps,
                  ...nextBrowserRuntimeOptimizeDeps,
                  ...nextRscClientUtilityOptimizeDeps,
                  ...nextBuiltinErrorOptimizeDeps,
                  ...nextRouteUtilityOptimizeDeps,
                ],
                needsInterop: ["next/cache"],
                exclude: ["next/dist/server/app-render/entry-base.js"],
                rolldownOptions: {
                  plugins: [
                    useVitestServerReferenceInfo(root),
                    treatNextInternalsAsServerInRsc(),
                    useNextEntryBaseClientReferences(),
                    useNextAppRouterServerStub(),
                    useNextAppRenderReactDomServer(root),
                    useNextServerInsertedHtmlStub(),
                    useNextImageConfigContextStub(),
                    useNextServerOnlyStub(),
                    useNextCompiledOpenTelemetryApi(root),
                  ],
                  resolve: {
                    alias: {
                      ...createOptimizeDepsResolveAliases(edgeNativeAliases, rscAppRouterAliases),
                      "react-server-dom-webpack/client": reactServerDomWebpackAliases.edge,
                      "react-server-dom-webpack/server": reactServerDomWebpackAliases.serverEdge,
                      "react-server-dom-webpack/static": reactServerDomWebpackAliases.serverEdge,
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
                  ...nextBrowserRuntimeOptimizeDeps,
                  ...nextClientRouterOptimizeDeps,
                  ...nextClientNavigationOptimizeDeps,
                  ...nextEntryBaseClientReferenceOptimizeDeps,
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
            react_ssr: {
              resolve: {
                conditions: ["edge-light", "browser"],
                alias: [
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
                include: [
                  ...nextBrowserRuntimeOptimizeDeps,
                  ...nextClientRouterOptimizeDeps,
                  ...nextClientNavigationOptimizeDeps,
                  ...nextEntryBaseClientReferenceOptimizeDeps,
                  "react-dom/server.browser",
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
