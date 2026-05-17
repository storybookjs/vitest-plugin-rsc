import { createRequire } from "node:module";
import { virtualNextEdgeAppRoutePublicId } from "../../../../../virtual-ids.ts";
import {
  nextEdgeSsrEntryResourceQuery,
  rewriteNextEdgeUserlandImport,
  withNextEdgeWebCryptoPrelude,
} from "../next-edge-ssr-loader/index.ts";

// Direct Next artifact: Next.js edge-app-route entry generation.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-edge-app-route-loader/index.ts#L9-L17
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-edge-app-route-loader/index.ts#L100-L116
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/edge-app-route.ts
// Note: `createNextEdgeAppRouteEntrypointSource` invokes Next's installed
// `loadEntrypoint("edge-app-route")` path directly. The virtual-source helpers
// preserve the webpack loader's `VAR_USERLAND` / `VAR_PAGE` contract for Vite.

// Begin adapted: Vite virtual source plumbing for Next Edge App Route
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-edge-app-route-loader/index.ts#L9-L17
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-edge-app-route-loader/index.ts#L100-L116
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/edge-app-route.ts
// Adaptation: Preserve Next's `modulePath` / `VAR_USERLAND` and `VAR_PAGE`
// template inputs while addressing the generated app-route userland through
// Vite virtual modules.
type LoadEntrypoint = (
  entrypoint: "edge-app-route",
  replacements: Record<`VAR_${string}`, string>,
  injections?: Record<string, string>,
  imports?: Record<string, string | null>,
) => Promise<string>;

type NextSwcBindings = {
  loadBindings(): Promise<void>;
};

export type NextEdgeAppRouteEntrypointOptions = {
  userland: string;
  page: string;
  cacheHandlerImports?: string;
  edgeCacheHandlersRegistration?: string;
  incrementalCacheHandler?: string | null;
};

const requireFromPackage = createRequire(import.meta.url);

export function createNextEdgeAppRouteUserlandSource({
  appRouteVirtualSource,
  pagePath,
}: {
  appRouteVirtualSource: string;
  pagePath: string;
}) {
  return `${appRouteVirtualSource}!${pagePath}?${nextEdgeSsrEntryResourceQuery}`;
}

export function createNextEdgeAppRouteEntrypointVirtualSource({
  userland,
  page,
}: Pick<NextEdgeAppRouteEntrypointOptions, "userland" | "page">) {
  const params = new URLSearchParams({
    VAR_USERLAND: userland,
    VAR_PAGE: page,
  });

  return `${virtualNextEdgeAppRoutePublicId}?${params}`;
}

export function parseNextEdgeAppRouteEntrypointOptions(
  params: URLSearchParams,
): NextEdgeAppRouteEntrypointOptions {
  return {
    userland: getRequiredParam(params, "VAR_USERLAND"),
    page: getRequiredParam(params, "VAR_PAGE"),
  };
}

function getRequiredParam(params: URLSearchParams, name: string) {
  const value = params.get(name);
  if (!value) {
    throw new Error(`Missing ${name} for Next Edge App Route virtual module.`);
  }
  return value;
}
// End adapted

// Direct invocation: Next.js edge-app-route template expansion.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-edge-app-route-loader/index.ts#L100-L116
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/edge-app-route.ts
// Note: This should stay a direct installed Next call unless Vite needs to
// translate a concrete webpack-only boundary in the generated template.

export async function createNextEdgeAppRouteEntrypointSource({
  userland,
  page,
  cacheHandlerImports = "\n",
  edgeCacheHandlersRegistration = "\n",
  incrementalCacheHandler = null,
}: NextEdgeAppRouteEntrypointOptions) {
  const { loadBindings } = requireFromPackage("next/dist/build/swc") as NextSwcBindings;
  await loadBindings();

  const { loadEntrypoint } = requireFromPackage("next/dist/build/load-entrypoint") as {
    loadEntrypoint: LoadEntrypoint;
  };

  return withNextEdgeWebCryptoPrelude(
    rewriteNextEdgeUserlandImport(
      await loadEntrypoint(
        "edge-app-route",
        {
          VAR_USERLAND: userland,
          VAR_PAGE: page,
        },
        {
          cacheHandlerImports,
          edgeCacheHandlersRegistration,
        },
        {
          incrementalCacheHandler,
        },
      ),
      { namespace: "module", userland },
    ),
  );
}
