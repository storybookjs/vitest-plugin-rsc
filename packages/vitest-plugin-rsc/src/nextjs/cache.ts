import { NEXT_CACHE_IMPLICIT_TAG_ID } from "next/dist/lib/constants";
import { IncrementalCache } from "next/dist/server/lib/incremental-cache";
import { tagsManifest } from "next/dist/server/lib/incremental-cache/tags-manifest.external";
import { nodeFs } from "next/dist/server/lib/node-fs-methods";
import {
  initializeCacheHandlers,
  registerCustomCacheHandlers,
  setCacheHandler,
} from "next/dist/server/use-cache/handlers";
import { cacheHandler, cacheHandlers } from "virtual:vitest-plugin-rsc/next-cache-handlers";
import { nextConfig, preview } from "virtual:vitest-plugin-rsc/next-manifest";
import { prerenderManifest } from "./build-output.ts";
import { registry } from "./registry.ts";

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

// Changes when the caches are reset, and is part of every key from then on:
// no test finds what an earlier one stored. That also goes for a cached
// function that was still running when its test ended, and stores its result
// afterwards under the key it already had.
let generation = 0;
// Also for the keys of a `"use cache"` function, which Next keeps in a cache
// of its own, in the rsc layer: use-cache.ts.
registry.cacheGeneration = () => generation;
// The cache of the server now: of the request it handles, or between requests.
let current: IncrementalCache | undefined;
// The class of the app's `cacheHandler`, once loaded.
let CurCacheHandler: unknown;
let loading: Promise<void> | undefined;

// The handler a module exports, as Next's server takes it: its default
// export, or the default of that.
const handlerOf = (module: { default?: unknown }) => {
  const handler = (module.default || module) as { default?: unknown };
  return handler.default || handler;
};

/**
 * Loads the cache handlers that `next.config` names, as Next's server does
 * before its first request: `cacheHandler`, the class of the handler of this
 * cache, and `cacheHandlers`, the handler of each kind of `"use cache"`.
 * Without them, Next's own handlers keep the entries in memory.
 */
export function loadCacheHandlers(): Promise<void> {
  loading ??= (async () => {
    if (cacheHandler) CurCacheHandler = handlerOf(await cacheHandler());
    // Next's own handlers of `"use cache"`, which an app without handlers of
    // its own has too: Next's config has `cacheHandlers: {}` by default.
    initializeCacheHandlers(nextConfig.cacheMaxMemorySize);
    await registerCustomCacheHandlers(async () => {
      for (const [kind, load] of Object.entries(cacheHandlers)) {
        setCacheHandler(kind, handlerOf(await load()) as never);
      }
    });
  })();
  return loading;
}

/**
 * Puts the cache of the server back in the global Next reads it from. Next's
 * route module leaves one of its own there. A request that was left can end
 * long after its test: the cache is the one of now, not of that request.
 */
export function restoreIncrementalCache(): void {
  globalThis.__incrementalCache = current;
}

/**
 * Gives a request the cache of the server, with the options that
 * `getIncrementalCache()` of Next's server passes. Without headers it is the
 * cache between requests, for a test that calls a cached function itself.
 */
export function shareIncrementalCache(headers = new Headers()): void {
  globalThis.__incrementalCache = current = new IncrementalCache({
    // With these two Next takes its own handler, the one `next start` uses,
    // which keeps the entries in memory. Next looks on disk for the response
    // of a page or a route handler that is not in memory: the file system is
    // the stand-in of node-platform.ts, which has no file. Its paths are under
    // the directory of a build, which is not the root: Next holds a path to
    // be inside it.
    fs: nodeFs,
    serverDistDir: "/.next/server",
    dev: false,
    minimalMode: false,
    flushToDisk: false,
    requestHeaders: Object.fromEntries(headers),
    allowedRevalidateHeaderKeys: nextConfig.experimental.allowedRevalidateHeaderKeys,
    fetchCacheKeyPrefix: `${nextConfig.experimental.fetchCacheKeyPrefix ?? ""}${generation}`,
    maxMemoryCacheSize: nextConfig.cacheMaxMemorySize,
    previewProps: preview,
    CurCacheHandler: CurCacheHandler as never,
    // What Next's route module reads too: build-output.ts.
    prerenderManifest,
  });
}

/**
 * Makes the server forget what it has cached and which tags were revalidated.
 * The entries of before stay in Next's memory store, which is bounded by
 * `cacheMaxMemorySize`, under keys that are not asked for again. Not the
 * prerendered pages and route handlers, whose keys are their pathnames:
 * those are expired as `revalidatePath("/", "layout")` expires them, by the
 * tag that each of them has, for the layout of the root. So is what an app's
 * own `cacheHandler` keeps of them. What the build prerenders stays: that
 * is the app's code (build-output.ts).
 */
export async function resetCaches(): Promise<void> {
  tagsManifest.clear();
  generation++;
  shareIncrementalCache();
  if (!hasPrerenders()) return;
  // Next expires an entry by a tag that expired after the entry was stored,
  // to the millisecond: the tag expires in the next one.
  const stored = realNow();
  while (realNow() === stored) await new Promise((resolve) => nativeSetTimeout(resolve, 1));
  await current!.revalidateTag(`${NEXT_CACHE_IMPLICIT_TAG_ID}/layout`);
}

// A test's own timers may be fake.
const realNow = Date.now.bind(Date);
const nativeSetTimeout = globalThis.setTimeout;
// Whether the build prerenders a route, which the server then keeps.
const hasPrerenders = () =>
  Object.keys(prerenderManifest.routes).length > 0 ||
  Object.keys(prerenderManifest.dynamicRoutes).length > 0;

shareIncrementalCache();
