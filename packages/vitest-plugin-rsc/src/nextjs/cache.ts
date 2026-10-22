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
import { forgetBuilt, keptAsBuilt, prerenderManifest } from "./build-output.ts";
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

// Changes when the caches are reset, and is part of every key from then on,
// and of the directory of the build on the disk: no test finds what an
// earlier one stored. That also goes for a cached function, or a prerender,
// that was still running when its test ended, and stores its result
// afterwards, under the key it already had and in the directory it had.
let generation = 0;
/** The directory of the build on the server's disk, `/.next/<generation>`. */
export const buildDir = (): string => `/.next/${generation}`;
// Also for the keys of a `"use cache"` function, which Next keeps in a cache
// of its own, in the rsc layer: use-cache.ts.
registry.cacheGeneration = () => generation;
registry.buildDir = buildDir;
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
  const cache = new IncrementalCache({
    // With these two Next takes its own handler, the one `next start` uses.
    // It keeps the entries on the disk, as `next start` keeps a prerendered
    // page and a cached fetch in `.next/`: the disk is the stand-in of the
    // package (src/node/fs.ts), which `cleanup()` empties. Not in Next's
    // memory store, which is one for the process and nothing empties. In the
    // directory of this generation's build: a request of an earlier test
    // that is still running writes to its own.
    fs: nodeFs,
    serverDistDir: `${buildDir()}/server`,
    dev: false,
    minimalMode: false,
    flushToDisk: true,
    maxMemoryCacheSize: 0,
    requestHeaders: Object.fromEntries(headers),
    allowedRevalidateHeaderKeys: nextConfig.experimental.allowedRevalidateHeaderKeys,
    fetchCacheKeyPrefix: `${nextConfig.experimental.fetchCacheKeyPrefix ?? ""}${generation}`,
    previewProps: preview,
    CurCacheHandler: CurCacheHandler as never,
    // What Next's route module reads too: build-output.ts.
    prerenderManifest,
  });
  // What Next's handler keeps of a page it prerenders, as the build keeps it.
  const set = cache.set.bind(cache);
  cache.set = ((...args: Parameters<typeof set>) => {
    keptAsBuilt(args[0], args[1], args[2] as { route?: { sourceRoute?: string } }, generation);
    return set(...args);
  }) as typeof set;
  globalThis.__incrementalCache = current = cache;
}

/**
 * Makes the server forget which tags were revalidated, and what it has
 * cached: the entries are on the server's disk, which `cleanup()` empties
 * after this. The generation keeps a cached function that was still running
 * when its test ended from being found under its key. An app's own
 * `cacheHandler` keeps the prerendered pages and route handlers where it
 * does, under their pathnames: those are expired as `revalidatePath("/",
 * "layout")` expires them, by the tag each of them has for the root layout.
 * What the build prerenders stays: that is the app's code (build-output.ts).
 */
export async function resetCaches(): Promise<void> {
  tagsManifest.clear();
  forgetBuilt();
  generation++;
  shareIncrementalCache();
  if (!CurCacheHandler || !hasPrerenders()) return;
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
