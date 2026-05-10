import { Buffer } from "node:buffer";

type RunPhase = "render" | "action";

type MaybePromise<T> = T | Promise<T>;

export type NextRequestContext = {
  run<T>(phase: RunPhase, callback: () => MaybePromise<T>): MaybePromise<T>;
  completeAction(): MaybePromise<{ shouldRender: boolean; headers?: HeadersInit }>;
};

export type NextRequestContextOptions = {
  url?: string;
  headers?: Headers | Record<string, string>;
};

type NextIncrementalCacheConstructor =
  typeof import("next/dist/server/lib/incremental-cache/index.js").IncrementalCache;

let NextIncrementalCache: NextIncrementalCacheConstructor | undefined;
let nextCacheGeneration = 0;

export async function resetNextRequestContextCache(): Promise<void> {
  // Reset Next's patched fetch the same way the dev router does:
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/server/lib/router-server.ts#L153-L158
  const globalScope = globalThis as typeof globalThis & {
    __incrementalCache?: unknown;
    __incrementalCacheShared?: boolean;
  };

  const [{ tagsManifest }, { IncrementalCache }, patchFetchModule] = await Promise.all([
    import("next/dist/server/lib/incremental-cache/tags-manifest.external.js"),
    import("next/dist/server/lib/incremental-cache/index.js"),
    import("next/dist/server/lib/patch-fetch.js"),
  ]);

  const patchedFetch = globalThis.fetch as typeof fetch & {
    __nextPatched?: true;
    _nextOriginalFetch?: typeof fetch;
  };
  if (patchedFetch.__nextPatched && patchedFetch._nextOriginalFetch) {
    globalThis.fetch = patchedFetch._nextOriginalFetch;
  }
  (globalThis as Record<symbol, unknown>)[patchFetchModule.NEXT_PATCH_SYMBOL] = false;

  tagsManifest.clear();
  globalScope.__incrementalCache = undefined;
  globalScope.__incrementalCacheShared = undefined;
  nextCacheGeneration += 1;
  NextIncrementalCache = IncrementalCache;
}

export async function createNextRequestContext({
  url = "/",
  headers = {},
}: NextRequestContextOptions = {}): Promise<NextRequestContext> {
  const [
    { actionAsyncStorage },
    { workAsyncStorage },
    { workUnitAsyncStorage },
    { createWorkStore },
    { createRequestStoreForRender, synchronizeMutableCookies },
    { IncrementalCache },
    patchFetchModule,
    requestCookiesModule,
    revalidationUtils,
    actionRevalidationKind,
  ] = await Promise.all([
    import("next/dist/server/app-render/action-async-storage.external.js"),
    import("next/dist/server/app-render/work-async-storage.external.js"),
    import("next/dist/server/app-render/work-unit-async-storage.external.js"),
    import("next/dist/server/async-storage/work-store.js"),
    import("next/dist/server/async-storage/request-store.js"),
    import("next/dist/server/lib/incremental-cache/index.js"),
    import("next/dist/server/lib/patch-fetch.js"),
    import("next/dist/server/web/spec-extension/adapters/request-cookies.js"),
    import("next/dist/server/revalidation-utils.js"),
    import("next/dist/shared/lib/action-revalidation-kind.js"),
  ]);

  const location = new URL(url, "http://localhost");
  const requestHeaders =
    headers instanceof Headers ? headers : new Headers(Object.entries(headers));
  const responseHeaders = new Headers();
  const page = `${location.pathname === "/" ? "/index" : location.pathname}/page`;

  // Match the App Router render setup by using Next's own work/request stores,
  // request cookie helpers, and patched fetch:
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/server/app-render/app-render.tsx#L2913-L3170
  (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer ??= Buffer;
  patchFetchModule.patchFetch({ workAsyncStorage, workUnitAsyncStorage });
  NextIncrementalCache = IncrementalCache;
  ensureNextEdgeIncrementalCache(IncrementalCache);

  const workStore = createWorkStore({
    page,
    renderOpts: {
      supportsDynamicResponse: true,
      cacheComponents: false,
      cacheLifeProfiles: {
        max: {
          stale: 300,
          revalidate: 900,
          expire: 4294967294,
        },
      },
      experimental: {
        isRoutePPREnabled: false,
        authInterrupts: false,
      },
      waitUntil: () => {},
      onClose: () => {},
      onAfterTaskError: () => {},
    },
    buildId: "vitest-plugin-rsc",
    previouslyRevalidatedTags: [],
  });
  workStore.pendingRevalidatedTags = [];
  workStore.pendingRevalidates = {};
  workStore.pendingRevalidateWrites = [];

  const requestStore = createRequestStoreForRender(
    { headers: requestHeaders } as never,
    undefined,
    {
      pathname: location.pathname,
      search: location.search,
    },
    {},
    { tags: [], expirationsByCacheKind: new Map() },
    (cookies: string[]) => {
      responseHeaders.delete("Set-Cookie");
      for (const cookie of cookies) {
        responseHeaders.append("Set-Cookie", cookie);
      }
    },
    {
      previewModeId: "vitest-plugin-rsc",
      previewModeSigningKey: "vitest-plugin-rsc",
      previewModeEncryptionKey: "vitest-plugin-rsc",
    },
    false,
    undefined,
    null,
    null,
  );

  return {
    run(phase, callback) {
      requestStore.phase = phase;
      workAsyncStorage.enterWith(workStore as never);
      actionAsyncStorage.enterWith({ isAction: phase === "action" });
      workUnitAsyncStorage.enterWith(requestStore as never);
      return callback();
    },
    async completeAction() {
      // Mirrors Next's server action revalidation header decision: updateTag
      // and cookies trigger static+dynamic invalidation; refresh() only marks
      // dynamic data stale. Next keeps this decision in the private
      // addRevalidationHeader helper inside action-handler.ts, so we cannot
      // import it directly.
      // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/server/app-render/action-handler.ts#L160-L210
      const isTagRevalidated = (workStore.pendingRevalidatedTags ?? []).some(
        (item: { profile?: unknown }) => item.profile === undefined,
      );
      const isCookieRevalidated =
        requestCookiesModule.getModifiedCookieValues(requestStore.mutableCookies as never).length >
        0;
      const revalidationKind =
        isTagRevalidated || isCookieRevalidated
          ? actionRevalidationKind.ActionDidRevalidateStaticAndDynamic
          : workStore.pathWasRevalidated;
      const shouldRender =
        revalidationKind !== undefined &&
        revalidationKind !== actionRevalidationKind.ActionDidNotRevalidate;

      actionAsyncStorage.enterWith({ isAction: false });
      if (shouldRender) {
        requestStore.phase = "render";
        synchronizeMutableCookies(requestStore);
      }
      // Use Next's own revalidation executor for tags, cache handlers, pending
      // writes, and incremental cache updates.
      // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/server/revalidation-utils.ts#L187-L212
      await revalidationUtils.executeRevalidates(workStore as never);
      if (!shouldRender) {
        workStore.pathWasRevalidated = undefined;
        workStore.pendingRevalidatedTags = [];
      }

      return {
        shouldRender,
        headers: shouldRender
          ? { "x-action-revalidated": JSON.stringify(revalidationKind) }
          : undefined,
      };
    },
  };
}

function ensureNextEdgeIncrementalCache(IncrementalCache: NextIncrementalCacheConstructor) {
  const globalScope = globalThis as typeof globalThis & {
    __incrementalCache?: unknown;
    __incrementalCacheShared?: boolean;
  };

  if (globalScope.__incrementalCache) return;

  // Edge requests get a global IncrementalCache in Next's web adapter. We use
  // the same global shape so Next internals can find their cache normally:
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/server/web/adapter.ts#L217-L235
  globalScope.__incrementalCacheShared = true;
  globalScope.__incrementalCache = createNextEdgeIncrementalCache(IncrementalCache);
}

function createNextEdgeIncrementalCache(
  IncrementalCache: NextIncrementalCacheConstructor | undefined = NextIncrementalCache,
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
    maxMemoryCacheSize: 50 * 1024 * 1024,
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
