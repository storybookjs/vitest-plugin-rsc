import * as defaultCacheHandlerModule from "next/dist/server/lib/cache-handlers/default.external.js";

const defaultCacheHandler =
  defaultCacheHandlerModule.default?.default ??
  defaultCacheHandlerModule.default ??
  defaultCacheHandlerModule;

const stateSymbol = Symbol.for("vitest-plugin-rsc.nextjs.notesDemoCacheHandler");
const state = (globalThis[stateSymbol] ??= { events: [] });

export function getNotesCacheHandlerEvents() {
  return [...state.events];
}

export function resetNotesCacheHandlerEvents() {
  state.events.length = 0;
}

function record(event) {
  state.events.push(event);
}

export default {
  async get(cacheKey, softTags) {
    record("get");
    return defaultCacheHandler.get(cacheKey, softTags);
  },
  async set(cacheKey, pendingEntry) {
    record("set");
    return defaultCacheHandler.set(cacheKey, pendingEntry);
  },
  async refreshTags() {
    record("refreshTags");
    return defaultCacheHandler.refreshTags?.();
  },
  async getExpiration(tags) {
    record("getExpiration");
    return defaultCacheHandler.getExpiration?.(tags) ?? Infinity;
  },
  async updateTags(tags) {
    record("updateTags");
    return defaultCacheHandler.updateTags?.(tags);
  },
};
