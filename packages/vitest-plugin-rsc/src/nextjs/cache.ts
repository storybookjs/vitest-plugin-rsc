import { IncrementalCache } from "next/dist/server/lib/incremental-cache";
import { tagsManifest } from "next/dist/server/lib/incremental-cache/tags-manifest.external";
import type { CacheFs } from "next/dist/shared/lib/utils";
import { nextConfig } from "virtual:vitest-plugin-rsc/next-manifest";

// Next's Data Cache: what `unstable_cache` and a cached `fetch` keep between
// requests. This is a module of the ssr layer, and its cache serves both
// server layers.
//
// Next's Node.js server makes a cache for every request, with a handler that
// keeps its entries in the memory of the process and in `.next/`. The server
// here makes it, with the options `getIncrementalCache()` of Next's route
// module passes, and gives it to Next for a request: node-server.ts. That is
// one cache for the pages and the route handlers, so a `revalidateTag()` in
// a route handler reaches what a page has cached.

declare global {
  var __incrementalCache: IncrementalCache | undefined;
}

/** The keys of draft mode, which a build writes to `.next/`: see project.ts. */
export const preview = {
  previewModeId: process.env.__NEXT_PREVIEW_MODE_ID ?? "",
  previewModeSigningKey: process.env.__NEXT_PREVIEW_MODE_SIGNING_KEY ?? "",
  previewModeEncryptionKey: process.env.__NEXT_PREVIEW_MODE_ENCRYPTION_KEY ?? "",
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
    allowedRevalidateHeaderKeys: nextConfig.experimental.allowedRevalidateHeaderKeys,
    fetchCacheKeyPrefix: `${nextConfig.experimental.fetchCacheKeyPrefix ?? ""}${generation}`,
    maxMemoryCacheSize: nextConfig.cacheMaxMemorySize,
    previewProps: preview,
    // No route is prerendered: nothing is built.
    prerenderManifest: { version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [], preview },
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
