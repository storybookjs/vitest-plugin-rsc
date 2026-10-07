import { IncrementalCache } from "next/dist/server/lib/incremental-cache";
import FileSystemCache from "next/dist/server/lib/incremental-cache/file-system-cache";
import { getMemoryCache } from "next/dist/server/lib/incremental-cache/memory-cache.external";
import { tagsManifest } from "next/dist/server/lib/incremental-cache/tags-manifest.external";
import { getEdgePreviewProps } from "next/dist/server/web/get-edge-preview-props";
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

// Changes when the caches are reset. Work of a test that has ended can still
// finish and store its result. Under the prefix of its own test, no later
// test finds it.
let generation = 0;

/**
 * Gives a request the cache of the server, the way `getIncrementalCache()` of
 * Next's server does. Its handler is the one `next start` uses, which keeps
 * the entries in memory. It has no disk here to write them to as well.
 *
 * Without headers it is the cache between requests, for a test that calls a
 * cached function itself.
 */
export function shareIncrementalCache(headers = new Headers()): void {
  const previewProps = getEdgePreviewProps();
  globalThis.__incrementalCacheShared = true;
  // These are the options of next@16.4. The package is type-checked against
  // the Next of its older helpers, where they had other names.
  const options = {
    dev: false,
    minimalMode: false,
    flushToDisk: false,
    requestHeaders: Object.fromEntries(headers),
    allowedRevalidateHeaderKeys: config.experimental?.allowedRevalidateHeaderKeys,
    fetchCacheKeyPrefix: `${config.experimental?.fetchCacheKeyPrefix ?? ""}${generation}`,
    maxMemoryCacheSize: config.cacheMaxMemorySize,
    previewProps,
    // An edge function has no prerendered routes: this is the manifest Next's
    // edge adapter passes.
    prerenderManifest: {
      version: -1,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: previewProps,
    },
    CurCacheHandler: FileSystemCache,
  };
  globalThis.__incrementalCache = new IncrementalCache(
    options as unknown as ConstructorParameters<typeof IncrementalCache>[0],
  );
}

/** Forgets what the server has cached, and which tags were revalidated. */
export function resetCaches(): void {
  // The entries are in a store of Next's that lives as long as the module.
  if (config.cacheMaxMemorySize) {
    const entries = getMemoryCache(config.cacheMaxMemorySize);
    for (const key of Array.from(entries, ([key]) => key)) entries.remove(key);
  }
  tagsManifest.clear();
  generation++;
  shareIncrementalCache();
}

shareIncrementalCache();
