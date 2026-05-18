import { virtualNextCacheHandlersPublicId } from "./handlers.ts";

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/use-cache/use-cache-wrapper.ts#L1084-L1138
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/edge-ssr-app.ts#L91-L94
// Adaptation: @vitejs/plugin-rsc hoists inline `"use cache"` functions in this
// adapter. The virtual runtime module bridges that output into Next's real
// `cache(kind, id, boundArgsLength, originalFn, args)` runtime and initializes
// Next's cache handler registry before the cached function runs.
// Begin adapted: Next.js use-cache runtime wrapper bridge
export const virtualNextUseCacheRuntimeId = "\0vitest-plugin-rsc:next-use-cache-runtime";
export const virtualNextUseCacheRuntimePublicId =
  "virtual:vitest-plugin-rsc/next-use-cache-runtime";

export function createNextUseCacheRuntimeModule() {
  return `import { cache as __next_use_cache } from "next/dist/server/use-cache/use-cache-wrapper.js";
import { defaultConfig as __next_default_config } from "next/dist/server/config-shared.js";
import { initializeCacheHandlers as __next_initialize_cache_handlers, setCacheHandler as __next_set_cache_handler } from "next/dist/server/use-cache/handlers.js";
import { nextCacheHandlers as __next_cache_handlers } from ${JSON.stringify(virtualNextCacheHandlersPublicId)};

let __next_cache_handlers_promise;

function __next_read_define_number(value, fallback) {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.length === 0) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function __next_read_define_object(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function __next_ensure_cache_handlers() {
  __next_initialize_cache_handlers(
    __next_read_define_number(
      process.env.__NEXT_CACHE_MAX_MEMORY_SIZE,
      __next_default_config.cacheMaxMemorySize ?? 50 * 1024 * 1024,
    ),
  );
  const configuredCacheHandlers = __next_read_define_object(process.env.__NEXT_CACHE_HANDLERS);
  for (const [kind, handlerPath] of Object.entries(configuredCacheHandlers)) {
    if (typeof handlerPath !== "string" || handlerPath.length === 0) continue;
    const cacheHandler = __next_cache_handlers[kind];
    if (cacheHandler) __next_set_cache_handler(kind, cacheHandler);
  }
}

export function __next_rsc_use_cache(kind, id, originalFn) {
  return async (...args) => {
    __next_cache_handlers_promise ??= __next_ensure_cache_handlers();
    await __next_cache_handlers_promise;
    return __next_use_cache(kind, id, 0, originalFn, args);
  };
}
`;
}
// End adapted
