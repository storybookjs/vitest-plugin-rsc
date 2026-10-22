// What cache.ts, in the ssr layer, takes of Next's Data Cache and its cache
// handlers.

export { NEXT_CACHE_IMPLICIT_TAG_ID } from "next/dist/lib/constants";
export { IncrementalCache } from "next/dist/server/lib/incremental-cache";
export { tagsManifest } from "next/dist/server/lib/incremental-cache/tags-manifest.external";
export { nodeFs } from "next/dist/server/lib/node-fs-methods";
export {
  initializeCacheHandlers,
  registerCustomCacheHandlers,
  setCacheHandler,
} from "next/dist/server/use-cache/handlers";
