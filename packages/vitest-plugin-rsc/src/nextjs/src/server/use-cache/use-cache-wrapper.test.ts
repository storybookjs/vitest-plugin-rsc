import { expect, test } from "vitest";
import { virtualNextCacheHandlersPublicId } from "./handlers.ts";
import {
  createNextUseCacheRuntimeModule,
  virtualNextUseCacheRuntimePublicId,
} from "./use-cache-wrapper.ts";

test("emits a virtual runtime module that bridges hoisted functions to Next cache", () => {
  const code = createNextUseCacheRuntimeModule();

  expect(virtualNextUseCacheRuntimePublicId).toBe(
    "virtual:vitest-plugin-rsc/next-use-cache-runtime",
  );
  expect(code).toContain('from "next/dist/server/use-cache/use-cache-wrapper.js"');
  expect(code).toContain('from "next/dist/server/use-cache/handlers.js"');
  expect(code).toContain(JSON.stringify(virtualNextCacheHandlersPublicId));
  expect(code).toContain("__next_initialize_cache_handlers(");
  expect(code).toContain("__next_set_cache_handler(kind, cacheHandler)");
  expect(code).toContain("__next_use_cache(kind, id, 0, originalFn, args)");
});
