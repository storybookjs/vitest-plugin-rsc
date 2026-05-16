import { defaultConfig } from "next/dist/server/config-shared.js";
import { readNextDefineNumber } from "../app-render/types.ts";

type NextIncrementalCacheConstructor =
  typeof import("next/dist/server/lib/incremental-cache/index.js").IncrementalCache;

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/web/adapter.ts#L217-L235
// Adaptation: Vitest browser workers do not run Next's web adapter, but
// imported Next cache internals still read the same global.
// Begin adapted: Next.js Edge incremental cache global shape
export function ensureNextEdgeIncrementalCache(
  IncrementalCache: NextIncrementalCacheConstructor,
  nextCacheGeneration: number,
) {
  const globalScope = globalThis as typeof globalThis & {
    __incrementalCache?: unknown;
    __incrementalCacheShared?: boolean;
  };

  if (globalScope.__incrementalCache) return;

  globalScope.__incrementalCacheShared = true;
  globalScope.__incrementalCache = createNextEdgeIncrementalCache(
    IncrementalCache,
    nextCacheGeneration,
  );
}

function createNextEdgeIncrementalCache(
  IncrementalCache: NextIncrementalCacheConstructor | undefined,
  nextCacheGeneration: number,
) {
  if (!IncrementalCache) {
    throw new Error("Invariant: Next IncrementalCache was not loaded.");
  }

  return new IncrementalCache({
    fs: {} as never,
    dev: false,
    requestHeaders: {},
    minimalMode: true,
    fetchCacheKeyPrefix: `vitest-plugin-rsc-${nextCacheGeneration}`,
    serverDistDir: "/",
    maxMemoryCacheSize: readNextDefineNumber(
      process.env.__NEXT_CACHE_MAX_MEMORY_SIZE,
      defaultConfig.cacheMaxMemorySize ?? 50 * 1024 * 1024,
    ),
    flushToDisk: false,
    getPrerenderManifest: () => ({
      version: 4,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: {
        previewModeId: "vitest-plugin-rsc",
        previewModeSigningKey: "vitest-plugin-rsc",
        previewModeEncryptionKey: "vitest-plugin-rsc",
      },
    }),
  });
}
// End adapted
