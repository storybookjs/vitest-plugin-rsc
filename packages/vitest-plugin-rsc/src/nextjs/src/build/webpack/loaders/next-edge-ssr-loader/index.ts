import { createRequire } from "node:module";
import { virtualNextEdgeSsrAppPublicId } from "../../../../../virtual-ids.ts";

// Direct Next artifact: Next.js edge-ssr-app entry generation.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/lib/constants.ts#L216-L221
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-edge-ssr-loader/index.ts#L183-L188
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/edge-ssr-app.ts
// Note: `createNextEdgeAppPageEntrypointSource` invokes Next's installed
// `loadEntrypoint("edge-ssr-app")` path directly. The virtual-source helpers
// are Vite query plumbing around that generated template, not a local edge
// renderer.

// Begin adapted: Vite virtual source plumbing for Next Edge App Page
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/lib/constants.ts#L216-L221
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-edge-ssr-loader/index.ts#L183-L188
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/edge-ssr-app.ts
// Adaptation: Preserve Next's `VAR_USERLAND` and `VAR_PAGE` template inputs
// while addressing the generated app-page userland through Vite virtual modules.
type LoadEntrypoint = (
  entrypoint: "edge-ssr-app",
  replacements: Record<`VAR_${string}`, string>,
  injections?: Record<string, string>,
  imports?: Record<string, string | null>,
) => Promise<string>;

type NextSwcBindings = {
  loadBindings(): Promise<void>;
};

export type NextEdgeAppPageEntrypointOptions = {
  userland: string;
  page: string;
  cacheHandlerImports?: string;
  cacheHandlerRegistration?: string;
  incrementalCacheHandler?: string | null;
};

const requireFromPackage = createRequire(import.meta.url);

export const nextEdgeSsrEntryResourceQuery = "__next_edge_ssr_entry__";

export function createNextEdgeAppPageUserlandSource({
  appPageVirtualSource,
  pagePath,
}: {
  appPageVirtualSource: string;
  pagePath: string;
}) {
  return `${appPageVirtualSource}!${pagePath}?${nextEdgeSsrEntryResourceQuery}`;
}

export function createNextEdgeAppPageEntrypointVirtualSource({
  userland,
  page,
}: Pick<NextEdgeAppPageEntrypointOptions, "userland" | "page">) {
  const params = new URLSearchParams({
    VAR_USERLAND: userland,
    VAR_PAGE: page,
  });

  return `${virtualNextEdgeSsrAppPublicId}?${params}`;
}

export function parseNextEdgeAppPageEntrypointOptions(
  params: URLSearchParams,
): NextEdgeAppPageEntrypointOptions {
  return {
    userland: getRequiredParam(params, "VAR_USERLAND"),
    page: getRequiredParam(params, "VAR_PAGE"),
  };
}

function getRequiredParam(params: URLSearchParams, name: string) {
  const value = params.get(name);
  if (!value) {
    throw new Error(`Missing ${name} for Next Edge App Page virtual module.`);
  }
  return value;
}
// End adapted

// Direct invocation: Next.js edge-ssr-app template expansion.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-edge-ssr-loader/index.ts#L183-L188
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/edge-ssr-app.ts
// Note: This should stay a direct installed Next call unless Vite needs to
// translate a concrete webpack-only boundary in the generated template.

export async function createNextEdgeAppPageEntrypointSource({
  userland,
  page,
  cacheHandlerImports = "\n",
  cacheHandlerRegistration = "\n",
  incrementalCacheHandler = null,
}: NextEdgeAppPageEntrypointOptions) {
  const { loadBindings } = requireFromPackage("next/dist/build/swc") as NextSwcBindings;
  await loadBindings();

  const { loadEntrypoint } = requireFromPackage("next/dist/build/load-entrypoint") as {
    loadEntrypoint: LoadEntrypoint;
  };

  return withNextEdgeWebCryptoPrelude(
    rewriteNextEdgeUserlandImport(
      await loadEntrypoint(
        "edge-ssr-app",
        {
          VAR_USERLAND: userland,
          VAR_PAGE: page,
        },
        {
          cacheHandlerImports,
          cacheHandlerRegistration,
        },
        {
          incrementalCacheHandler,
        },
      ),
      { namespace: "pageMod", userland },
    ),
  );
}

export function rewriteNextEdgeUserlandImport(
  source: string,
  options: { namespace: string; userland: string },
) {
  const staticImport = `import * as ${options.namespace} from ${JSON.stringify(options.userland)};`;
  const dynamicImport = `const ${options.namespace} = await import(${JSON.stringify(options.userland)});`;
  const rewritten = source.replace(staticImport, dynamicImport);
  if (rewritten === source) {
    throw new Error(
      `Could not rewrite generated Next Edge userland import for ${options.userland}.`,
    );
  }
  return rewritten;
}

export function withNextEdgeWebCryptoPrelude(source: string) {
  return [`import "vitest-plugin-rsc/nextjs/edge-web-crypto/install";`, source].join("\n");
}
