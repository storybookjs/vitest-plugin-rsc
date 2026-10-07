import { IncrementalCache } from "next/dist/server/lib/incremental-cache";
import { tagsManifest } from "next/dist/server/lib/incremental-cache/tags-manifest.external";
import { getEdgePreviewProps } from "next/dist/server/web/get-edge-preview-props";
import type { CacheFs } from "next/dist/shared/lib/utils";
import { nextConfig } from "virtual:vitest-plugin-rsc/next-manifest";

// Next's Data Cache, for both server layers. An edge function of Next has no
// cache of its own: the server in front of it makes one for a request and
// shares it through these two globals. `next start` does, and so does this.

declare global {
  var __incrementalCache: IncrementalCache | undefined;
  var __incrementalCacheShared: boolean | undefined;
}

// Part of every key, and changed by a reset: no test finds what an earlier
// one stored, also not what a cached function stores after its test ended.
let generation = 0;

/**
 * Gives a request the cache of the server. Without headers it is the cache
 * between requests, for a test that calls a cached function itself.
 */
export function shareIncrementalCache(headers = new Headers()): void {
  const previewProps = getEdgePreviewProps();
  globalThis.__incrementalCacheShared = true;
  globalThis.__incrementalCache = new IncrementalCache({
    // With these two Next takes its own handler, which keeps the entries in
    // memory. Without `flushToDisk` the file system is never asked.
    // project.ts checks that the installed Next still takes these options.
    fs: {} as CacheFs,
    serverDistDir: "/",
    dev: false,
    minimalMode: false,
    flushToDisk: false,
    requestHeaders: Object.fromEntries(headers),
    allowedRevalidateHeaderKeys: nextConfig.experimental.allowedRevalidateHeaderKeys,
    fetchCacheKeyPrefix: `${nextConfig.experimental.fetchCacheKeyPrefix ?? ""}${generation}`,
    maxMemoryCacheSize: nextConfig.cacheMaxMemorySize,
    previewProps,
    // The manifest Next's edge adapter passes, with a version its type lacks.
    prerenderManifest: {
      version: -1 as never,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: previewProps,
    },
  });
}

/** Makes the server forget what it has cached and which tags were revalidated. */
export function resetCaches(): void {
  tagsManifest.clear();
  generation++;
  shareIncrementalCache();
}

shareIncrementalCache();
