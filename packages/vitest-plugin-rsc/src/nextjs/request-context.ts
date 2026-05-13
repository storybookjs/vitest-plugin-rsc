import { Buffer } from "node:buffer";
import "next/dist/server/node-environment-baseline";
import { NEXT_ACTION_REVALIDATED_HEADER } from "next/dist/client/components/app-router-headers.js";
import { actionAsyncStorage } from "next/dist/server/app-render/action-async-storage.external.js";
import {
  workAsyncStorage,
  type WorkStore,
} from "next/dist/server/app-render/work-async-storage.external.js";
import {
  workUnitAsyncStorage,
  type RequestStore,
} from "next/dist/server/app-render/work-unit-async-storage.external.js";
import {
  ActionDidNotRevalidate,
  ActionDidRevalidateStaticAndDynamic,
  type ActionRevalidationKind,
} from "next/dist/shared/lib/action-revalidation-kind.js";
import {
  createRequestStoreForRender,
  synchronizeMutableCookies,
} from "next/dist/server/async-storage/request-store.js";
import { createWorkStore } from "next/dist/server/async-storage/work-store.js";
import { defaultConfig } from "next/dist/server/config-shared.js";
import { getImplicitTags } from "next/dist/server/lib/implicit-tags.js";
import { IncrementalCache } from "next/dist/server/lib/incremental-cache/index.js";
import { tagsManifest } from "next/dist/server/lib/incremental-cache/tags-manifest.external.js";
import { NEXT_PATCH_SYMBOL, patchFetch } from "next/dist/server/lib/patch-fetch.js";
import { executeRevalidates } from "next/dist/server/revalidation-utils.js";
import { getModifiedCookieValues } from "next/dist/server/web/spec-extension/adapters/request-cookies.js";

type RunPhase = "render" | "action" | "action-render";

type MaybePromise<T> = T | Promise<T>;

export type NextRequestContext = {
  run<T>(phase: RunPhase, callback: () => MaybePromise<T>): MaybePromise<T>;
  completeAction(options?: {
    forceRender?: boolean;
  }): MaybePromise<{ shouldRender: boolean; headers?: HeadersInit }>;
};

export type NextRequestContextOptions = {
  url?: string;
  route?: string;
  headers?: Headers | Record<string, string>;
};

type NextIncrementalCacheConstructor =
  typeof import("next/dist/server/lib/incremental-cache/index.js").IncrementalCache;

let NextIncrementalCache: NextIncrementalCacheConstructor | undefined;
let nextCacheGeneration = 0;

export async function resetNextRequestContextCache(): Promise<void> {
  // Reset Next's patched fetch the same way the dev router does:
  // https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/lib/router-server.ts#L153-L158
  const globalScope = globalThis as typeof globalThis & {
    __incrementalCache?: unknown;
    __incrementalCacheShared?: boolean;
  };

  const patchedFetch = globalThis.fetch as typeof fetch & {
    __nextPatched?: true;
    _nextOriginalFetch?: typeof fetch;
  };
  if (patchedFetch.__nextPatched && patchedFetch._nextOriginalFetch) {
    globalThis.fetch = patchedFetch._nextOriginalFetch;
  }
  (globalThis as Record<symbol, unknown>)[NEXT_PATCH_SYMBOL] = false;

  tagsManifest.clear();
  globalScope.__incrementalCache = undefined;
  globalScope.__incrementalCacheShared = undefined;
  nextCacheGeneration += 1;
  NextIncrementalCache = IncrementalCache;
}

export async function createNextRequestContext({
  url = "/",
  route,
  headers = {},
}: NextRequestContextOptions = {}): Promise<NextRequestContext> {
  const location = new URL(url, "http://localhost");
  const requestHeaders =
    headers instanceof Headers ? headers : new Headers(Object.entries(headers));
  const responseHeaders = new Headers();
  const page = createPageFromRoutePattern(route ?? location.pathname);
  const implicitTags = await getImplicitTags(page, location.pathname, null);

  (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer ??= Buffer;
  patchFetch({ workAsyncStorage, workUnitAsyncStorage });
  NextIncrementalCache = IncrementalCache;
  ensureNextEdgeIncrementalCache(IncrementalCache);

  // Begin copy: Next.js createWorkStore setup
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/app-render.tsx#L3170-L3179
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/web/adapter.ts#L302-L337
  // Adaptation: component tests synthesize the minimal renderOpts/sharedContext
  // values needed by the imported Next work store.
  const workStore = createWorkStore({
    page,
    renderOpts: {
      supportsDynamicResponse: true,
      cacheComponents: false,
      cacheLifeProfiles: defaultConfig.cacheLife,
      experimental: {
        isRoutePPREnabled: false,
        authInterrupts: false,
      },
      waitUntil: () => {},
      onClose: () => {},
      onAfterTaskError: () => {},
    },
    buildId: "vitest-plugin-rsc",
    deploymentId: "vitest-plugin-rsc",
    previouslyRevalidatedTags: [],
  });
  // End copy

  // Begin copy: Next.js createRequestStoreForRender call shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/async-storage/request-store.ts#L145-L178
  // Adaptation: component tests pass a request-shaped object and collect
  // Set-Cookie writes in a Web Headers object instead of a BaseNextResponse.
  const requestStore = createRequestStoreForRender(
    { headers: requestHeaders } as never,
    undefined,
    {
      pathname: location.pathname,
      search: location.search,
    },
    {},
    implicitTags,
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
  // End copy

  return {
    run(phase, callback) {
      // Begin copy: Next.js request async storage execution
      // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/app-render.tsx#L3181-L3199
      // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/action-handler.ts#L729-L731
      // Adaptation: the generic test harness chooses the phase for render vs
      // action callbacks.
      requestStore.phase = phase === "action-render" ? "render" : phase;
      // Next uses nested `.run(...)` calls here. Our browser AsyncLocalStorage
      // shim currently closes a `.run(...)` frame once the direct callback
      // result settles, while React's RSC stream can continue rendering later
      // during stream consumption. Keep the request stores ambient for the
      // mounted test root and rely on test cleanup to reset the global shim.
      workAsyncStorage.enterWith(workStore as never);
      actionAsyncStorage.enterWith({ isAction: phase !== "render" });
      workUnitAsyncStorage.enterWith(requestStore as never);
      // End copy
      return callback();
    },
    async completeAction(options: { forceRender?: boolean } = {}) {
      const headers = new Headers(responseHeaders);
      addRevalidationHeader(headers, {
        workStore,
        requestStore,
      });
      // Begin copy: Next.js executeActionAndPrepareForRender render decision
      // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/action-handler.ts#L1287-L1340
      // Adaptation: the action already ran in the caller, so this copies only
      // the render/skip decision and render-phase preparation.
      const skipPageRendering =
        !options.forceRender &&
        (workStore.pathWasRevalidated === undefined ||
          workStore.pathWasRevalidated === ActionDidNotRevalidate);

      if (!skipPageRendering) {
        requestStore.phase = "render";
        synchronizeMutableCookies(requestStore);
        workStore.isDraftMode = requestStore.draftMode.isEnabled;
        await executeRevalidates(workStore);
      }
      // End copy

      if (skipPageRendering) {
        await executeRevalidates(workStore);
        // Next disposes the request store after the action response. Our test
        // harness keeps one context alive for the mounted root, so clear the
        // per-action markers after copying the Next action handling branches.
        workStore.pathWasRevalidated = undefined;
        workStore.pendingRevalidatedTags = [];
      }

      return {
        shouldRender: !skipPageRendering,
        headers: Array.from(headers).length > 0 ? headers : undefined,
      };
    },
  };
}

function createPageFromRoutePattern(routePattern: string) {
  const withLeadingSlash = routePattern.startsWith("/") ? routePattern : `/${routePattern}`;
  const route = withLeadingSlash.replace(/\/$/, "");
  return `${route === "" ? "/index" : route}/page`;
}

function addRevalidationHeader(
  headers: Headers,
  {
    workStore,
    requestStore,
  }: {
    workStore: WorkStore;
    requestStore: RequestStore;
  },
) {
  // Begin copy: Next.js addRevalidationHeader
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/action-handler.ts#L160-L210
  // Adaptation: component tests use a Web Headers object instead of Node's
  // res.setHeader, and the function arguments are narrowed to the fields used.
  // If a tag was revalidated, the client router needs to invalidate all the
  // client router cache as they may be stale. And if a path was revalidated, the
  // client needs to invalidate all subtrees below that path.
  // TODO: Currently we don't send the specific tags or paths to the client,
  // we just send a flag indicating that all the static data on the client
  // should be invalidated. In the future, this will likely be a Bloom filter
  // or bitmask of some kind.
  // TODO-APP: Currently the prefetch cache doesn't have subtree information,
  // so we need to invalidate the entire cache if a path was revalidated.
  // TODO-APP: Currently paths are treated as tags, so the second element of the tuple
  // is always empty.
  // Only count tags without a profile (updateTag) as requiring client cache invalidation
  // Tags with a profile (revalidateTag) use stale-while-revalidate and shouldn't
  // trigger immediate client-side cache invalidation
  const isTagRevalidated = workStore.pendingRevalidatedTags?.some(
    (item) => item.profile === undefined,
  )
    ? 1
    : 0;
  const isCookieRevalidated = getModifiedCookieValues(requestStore.mutableCookies).length ? 1 : 0;
  // First check if a tag, cookie, or path was revalidated.
  if (isTagRevalidated || isCookieRevalidated) {
    headers.set(
      NEXT_ACTION_REVALIDATED_HEADER,
      JSON.stringify(ActionDidRevalidateStaticAndDynamic),
    );
  } else if (
    // Check for refresh() actions. This will invalidate only the dynamic data.
    workStore.pathWasRevalidated !== undefined &&
    workStore.pathWasRevalidated !== ActionDidNotRevalidate
  ) {
    headers.set(
      NEXT_ACTION_REVALIDATED_HEADER,
      JSON.stringify(workStore.pathWasRevalidated satisfies ActionRevalidationKind),
    );
  }
  // End copy
}

function ensureNextEdgeIncrementalCache(IncrementalCache: NextIncrementalCacheConstructor) {
  const globalScope = globalThis as typeof globalThis & {
    __incrementalCache?: unknown;
    __incrementalCacheShared?: boolean;
  };

  if (globalScope.__incrementalCache) return;

  // Edge requests get a global IncrementalCache in Next's web adapter. We use
  // the same global shape so Next internals can find their cache normally:
  // https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/web/adapter.ts#L217-L235
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
