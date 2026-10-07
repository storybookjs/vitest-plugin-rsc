import { IncrementalCache } from "next/dist/server/lib/incremental-cache";
import { tagsManifest } from "next/dist/server/lib/incremental-cache/tags-manifest.external";
import { getEdgePreviewProps } from "next/dist/server/web/get-edge-preview-props";
import type { CacheFs } from "next/dist/shared/lib/utils";
import { nextConfig } from "virtual:vitest-plugin-rsc/next-manifest";

// Next's Data Cache: what `unstable_cache` and a cached `fetch` keep between
// requests. This is a module of the ssr layer, and its cache serves both
// server layers.
//
// An edge function of Next has no cache of its own: its adapter makes an
// IncrementalCache without a handler for every request, which stores nothing.
// The server in front of it brings the cache. `next start` makes one for a
// request and shares it with the edge function through these two globals, and
// so does this. That is one cache for the pages and the route handlers, so a
// `revalidateTag()` in a route handler reaches what a page has cached.

declare global {
  var __incrementalCache: IncrementalCache | undefined;
  var __incrementalCacheShared: boolean | undefined;
}

const config = nextConfig as {
  cacheMaxMemorySize?: number;
  experimental?: { fetchCacheKeyPrefix?: string; allowedRevalidateHeaderKeys?: string[] };
};

// Changes when the caches are reset, and is part of every key from then on:
// no test finds what an earlier one stored. That also goes for a cached
// function that was still running when its test ended, and stores its result
// afterwards under the key it already had.
let generation = 0;

/**
 * Gives a request the cache of the server, with the options that
 * `getIncrementalCache()` of Next's server passes. Without headers it is the
 * cache between requests, for a test that calls a cached function itself.
 */
export function shareIncrementalCache(headers = new Headers()): void {
  const previewProps = getEdgePreviewProps();
  globalThis.__incrementalCacheShared = true;
  globalThis.__incrementalCache = new IncrementalCache({
    // With these two Next takes its own handler, the one `next start` uses,
    // which keeps the entries in memory. It only reads or writes files on
    // Node.js and with `flushToDisk`, so the file system is never asked.
    fs: {} as CacheFs,
    serverDistDir: "/",
    dev: false,
    minimalMode: false,
    flushToDisk: false,
    requestHeaders: Object.fromEntries(headers),
    allowedRevalidateHeaderKeys: config.experimental?.allowedRevalidateHeaderKeys,
    fetchCacheKeyPrefix: `${config.experimental?.fetchCacheKeyPrefix ?? ""}${generation}`,
    maxMemoryCacheSize: config.cacheMaxMemorySize,
    previewProps,
    // An edge function has no prerendered routes: this is the manifest Next's
    // edge adapter passes, with a version its type does not have.
    prerenderManifest: {
      version: -1 as never,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: previewProps,
    },
  });
}

/**
 * Makes the server forget what it has cached and which tags were revalidated.
 * The entries of before stay in Next's memory store, which is bounded by
 * `cacheMaxMemorySize`, under keys that are not asked for again.
 */
export function resetCaches(): void {
  tagsManifest.clear();
  generation++;
  shareIncrementalCache();
}

shareIncrementalCache();
