"use client";
import { fn, type Mock } from "@vitest/spy";
import type { AppRouterActionQueue } from "next/dist/client/components/app-router-instance.js";
import {
  createMutableActionQueue as createNextMutableActionQueue,
  publicAppRouterInstance,
} from "next/dist/client/components/app-router-instance.js";
import { RedirectBoundary } from "next/dist/client/components/redirect-boundary.js";
import { getSelectedParams } from "next/dist/client/components/router-reducer/compute-changed-path.js";
import { createInitialRouterState } from "next/dist/client/components/router-reducer/create-initial-router-state.js";
import { reducer } from "next/dist/client/components/router-reducer/router-reducer.js";
import { useActionQueue } from "next/dist/client/components/use-action-queue.js";
import type {
  AppRouterState,
  ReducerActions,
  ReducerState,
} from "next/dist/client/components/router-reducer/router-reducer-types.js";
import { ACTION_NAVIGATE } from "next/dist/client/components/router-reducer/router-reducer-types.js";
import type {
  CacheNodeSeedData,
  FlightDataPath,
  FlightRouterState,
  InitialRSCPayload,
} from "next/dist/shared/lib/app-router-types";
import {
  AppRouterContext,
  GlobalLayoutRouterContext,
  LayoutRouterContext,
} from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import {
  PathnameContext,
  PathParamsContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime.js";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import React, { type ReactNode, useMemo, useRef } from "react";

// This test router is a small adapter around Next's App Router internals. Keep
// copied control flow aligned with Next rather than growing a parallel router:
// https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/app-router.tsx
// https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/app-router-instance.ts

declare global {
  var onNavigate: Mock<(url: URL) => void>;
}
globalThis.onNavigate = fn<(url: URL) => void>();
let actionQueue: AppRouterActionQueue | null = null;

function GlobalError() {
  return null;
}

type NextRouterStateSnapshot = {
  state: AppRouterState;
};

export const NextRouter = ({
  children,
  url = "/",
  initialTree,
}: {
  children: ReactNode;
  route?: string;
  url?: string;
  initialTree?: FlightRouterState;
}) => {
  const snapshot = useMemo(
    () => createNextRouterStateSnapshot({ children, url, initialTree }),
    [children, url, initialTree],
  );
  const actionQueueRef = useRef<AppRouterActionQueue | null>(null);

  actionQueueRef.current ??= createMutableActionQueue(snapshot.state);

  return <AppRouter actionQueue={actionQueueRef.current}></AppRouter>;
};

(NextRouter as unknown as { $$vitestPluginRscNextRouter: true }).$$vitestPluginRscNextRouter = true;

function createNextRouterStateSnapshot({
  children,
  url,
  initialTree,
}: {
  children: ReactNode;
  url: string;
  initialTree?: FlightRouterState;
}): NextRouterStateSnapshot {
  const location = new URL(url, "http://localhost");
  if (!initialTree) {
    throw new Error("NextRouter must be rendered through renderServer from vitest-plugin-rsc/nextjs.");
  }

  return {
    state: createInitialRouterState({
      navigatedAt: Date.now(),
      initialRSCPayload: createInitialRSCPayload({
        canonicalUrl: location.pathname + location.search,
        initialTree,
        renderedSearch: location.search,
        seedData: [children, {}, null, false, null],
      }),
      initialFlightStreamForCache: null,
      location: location as unknown as Location,
    }),
  };
}

function createInitialRSCPayload(props: {
  canonicalUrl: string;
  initialTree: FlightRouterState;
  renderedSearch: string;
  seedData: CacheNodeSeedData;
}): InitialRSCPayload {
  // Next creates InitialRSCPayload inline inside the private app-render
  // request pipeline; there is no exported constructor to import. Keep this
  // payload shape bluntly aligned with getRSCPayload and feed it to Next's
  // exported createInitialRouterState below:
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/server/app-render/app-render.tsx#L2221-L2260
  return {
    c: props.canonicalUrl.split("/"),
    q: props.renderedSearch,
    i: false,
    f: [[props.initialTree, props.seedData, null, false] satisfies FlightDataPath],
    m: undefined,
    G: [GlobalError, null],
    S: false,
    h: null,
  };
}

function createMutableActionQueue(initialState: AppRouterState): AppRouterActionQueue {
  // Reuse Next's action queue implementation. Next stores it in a private
  // module-global singleton, so component tests reuse that queue in the browser
  // worker and reset the mutable state before each router mount.
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/app-router-instance.ts#L220-L256
  actionQueue ??= createNextMutableActionQueue(initialState, null);
  actionQueue.state = initialState;
  actionQueue.action = reduceRouterAction;
  actionQueue.pending = null;
  actionQueue.last = null;
  actionQueue.needsRefresh = false;
  return actionQueue;
}

function reduceRouterAction(state: AppRouterState, action: ReducerActions): ReducerState {
  if (action.type === ACTION_NAVIGATE) {
    globalThis.onNavigate(action.url);
    return state;
  }

  return reducer(state, action);
}

function createPublicAppRouterInstance(): AppRouterInstance {
  return {
    ...publicAppRouterInstance,
    // Keep prefetch inert in component tests; Next's implementation would try
    // to fetch route payloads from an HTTP server.
    prefetch: () => {},
  };
}

export function AppRouter({ actionQueue }: { actionQueue: AppRouterActionQueue }) {
  // Reduced form of Next's Router component: it reuses Next's own contexts,
  // reducer state, RedirectBoundary, and selected-params logic, but omits
  // browser history/prefetch/dev-only concerns that are not meaningful in tests.
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/app-router.tsx#L154-L356
  const state = useActionQueue(actionQueue);
  const { canonicalUrl, cache, tree, nextUrl, previousNextUrl, focusAndScrollRef } = state;
  const appRouter = useMemo(() => createPublicAppRouterInstance(), []);

  const { searchParams, pathname } = useMemo(() => {
    const url = new URL(canonicalUrl, "http://localhost");
    return {
      searchParams: url.searchParams,
      pathname: url.pathname,
    };
  }, [canonicalUrl]);

  // Add memoized pathParams for useParams.
  const pathParams = useMemo(() => {
    return getSelectedParams(tree);
  }, [tree]);

  return (
    <>
      <PathParamsContext.Provider value={pathParams}>
        <PathnameContext.Provider value={pathname}>
          <SearchParamsContext.Provider value={searchParams}>
            <GlobalLayoutRouterContext.Provider
              value={{ tree, focusAndScrollRef, nextUrl, previousNextUrl }}
            >
              <AppRouterContext.Provider value={appRouter}>
                <LayoutRouterContext.Provider
                  value={{
                    parentTree: tree,
                    parentCacheNode: cache,
                    parentSegmentPath: null,
                    parentParams: pathParams,
                    parentLoadingData: null,
                    debugNameContext: "NextRouter",
                    url: canonicalUrl,
                    isActive: true,
                  }}
                >
                  <RedirectBoundary>{cache.rsc}</RedirectBoundary>
                </LayoutRouterContext.Provider>
              </AppRouterContext.Provider>
            </GlobalLayoutRouterContext.Provider>
          </SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </PathParamsContext.Provider>
    </>
  );
}
