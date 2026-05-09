"use client";
import { fn, type Mock } from "@vitest/spy";
import type {
  AppRouterActionQueue,
  DispatchStatePromise,
} from "next/dist/client/components/app-router-instance.js";
import { RedirectBoundary } from "next/dist/client/components/redirect-boundary.js";
import { getSelectedParams } from "next/dist/client/components/router-reducer/compute-changed-path.js";
import { createInitialRouterState } from "next/dist/client/components/router-reducer/create-initial-router-state.js";
import { reducer } from "next/dist/client/components/router-reducer/router-reducer.js";
import {
  dispatchAppRouterAction,
  useActionQueue,
} from "next/dist/client/components/use-action-queue.js";
import type {
  AppRouterState,
  ReducerActions,
  ReducerState,
} from "next/dist/client/components/router-reducer/router-reducer-types.js";
import {
  ACTION_HMR_REFRESH,
  ACTION_NAVIGATE,
  ACTION_REFRESH,
  ACTION_RESTORE,
  ACTION_SERVER_ACTION,
} from "next/dist/client/components/router-reducer/router-reducer-types.js";
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
import type {
  AppRouterInstance,
  NavigateOptions,
} from "next/dist/shared/lib/app-router-context.shared-runtime.js";
import { isThenable } from "next/dist/shared/lib/is-thenable.js";
import React, { type ReactNode, useMemo, useRef } from "react";
import { buildFlightRouterState } from "./flight-router-state";

// This test router is a small adapter around Next's App Router internals. Keep
// copied control flow aligned with Next rather than growing a parallel router:
// https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/app-router.tsx
// https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/app-router-instance.ts

declare global {
  var onNavigate: Mock<(url: URL) => void>;
}
globalThis.onNavigate = fn<(url: URL) => void>();

function GlobalError() {
  return null;
}

type NextRouterStateSnapshot = {
  state: AppRouterState;
};

export const NextRouter = ({
  children,
  url = "/",
  route,
}: {
  children: ReactNode;
  route?: string;
  url?: string;
}) => {
  route ??= url;
  const snapshot = useMemo(
    () => createNextRouterStateSnapshot({ children, route, url }),
    [children, route, url],
  );
  const actionQueueRef = useRef<AppRouterActionQueue | null>(null);

  actionQueueRef.current ??= createMutableActionQueue(snapshot.state);

  return <AppRouter actionQueue={actionQueueRef.current}></AppRouter>;
};

(NextRouter as unknown as { $$vitestPluginRscNextRouter: true }).$$vitestPluginRscNextRouter = true;

function createNextRouterStateSnapshot({
  children,
  route,
  url,
}: {
  children: ReactNode;
  route: string;
  url: string;
}): NextRouterStateSnapshot {
  const location = new URL(url, "http://localhost");

  return {
    state: createInitialRouterState({
      navigatedAt: Date.now(),
      initialRSCPayload: createInitialRSCPayload({
        canonicalUrl: location.pathname + location.search,
        initialTree: buildFlightRouterState(route, location.pathname, location.search),
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
  // Copied from Next's createMutableActionQueue, with the reducer hook swapped
  // so tests can observe navigations without fetching route payloads:
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/app-router-instance.ts#L220-L256
  const actionQueue: AppRouterActionQueue = {
    state: initialState,
    dispatch: (payload: ReducerActions, setState: DispatchStatePromise) =>
      dispatchAction(actionQueue, payload, setState),
    action: reduceRouterAction,
    pending: null,
    last: null,
    onRouterTransitionStart: null,
  };

  return actionQueue;
}

function reduceRouterAction(state: AppRouterState, action: ReducerActions): ReducerState {
  if (action.type === ACTION_NAVIGATE) {
    globalThis.onNavigate(action.url);
    return state;
  }

  return reducer(state, action);
}

function dispatchAction(
  actionQueue: AppRouterActionQueue,
  payload: ReducerActions,
  setState: DispatchStatePromise,
) {
  // Copied from Next's action queue dispatcher so discarded actions, refresh
  // scheduling, and async reducer state behave like the real App Router:
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/app-router-instance.ts#L71-L217
  let resolvers: {
    resolve: (value: ReducerState) => void;
    reject: (reason: unknown) => void;
  } = { resolve: setState, reject: () => {} };

  if (payload.type !== ACTION_RESTORE) {
    const deferredPromise = new Promise<AppRouterState>((resolve, reject) => {
      resolvers = { resolve, reject };
    });

    React.startTransition(() => {
      setState(deferredPromise);
    });
  }

  const newAction = {
    payload,
    next: null,
    resolve: resolvers.resolve,
    reject: resolvers.reject,
  };

  if (actionQueue.pending === null) {
    actionQueue.last = newAction;
    runAction({ actionQueue, action: newAction, setState });
  } else if (payload.type === ACTION_NAVIGATE || payload.type === ACTION_RESTORE) {
    actionQueue.pending.discarded = true;
    newAction.next = actionQueue.pending.next;
    runAction({ actionQueue, action: newAction, setState });
  } else {
    if (actionQueue.last !== null) {
      actionQueue.last.next = newAction;
    }
    actionQueue.last = newAction;
  }
}

function runAction({
  actionQueue,
  action,
  setState,
}: {
  actionQueue: AppRouterActionQueue;
  action: NonNullable<AppRouterActionQueue["pending"]>;
  setState: DispatchStatePromise;
}) {
  const prevState = actionQueue.state;

  actionQueue.pending = action;

  const actionResult = actionQueue.action(prevState, action.payload);

  function handleResult(nextState: AppRouterState) {
    if (action.discarded) {
      if (action.payload.type === ACTION_SERVER_ACTION && action.payload.didRevalidate) {
        actionQueue.needsRefresh = true;
      }
      runRemainingActions(actionQueue, setState);
      return;
    }

    actionQueue.state = nextState;
    runRemainingActions(actionQueue, setState);
    action.resolve(nextState);
  }

  if (isThenable(actionResult)) {
    actionResult.then(handleResult, (err) => {
      runRemainingActions(actionQueue, setState);
      action.reject(err);
    });
  } else {
    handleResult(actionResult);
  }
}

function runRemainingActions(actionQueue: AppRouterActionQueue, setState: DispatchStatePromise) {
  if (actionQueue.pending !== null) {
    actionQueue.pending = actionQueue.pending.next;
    if (actionQueue.pending !== null) {
      runAction({ actionQueue, action: actionQueue.pending, setState });
    }
  } else if (actionQueue.needsRefresh) {
    actionQueue.needsRefresh = false;
    actionQueue.dispatch({ type: "refresh" }, setState);
  }
}

function createPublicAppRouterInstance(): AppRouterInstance {
  return {
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    prefetch: () => {},
    replace: (href: string, _options?: NavigateOptions) => {
      dispatchAppRouterAction({
        type: ACTION_NAVIGATE,
        url: new URL(href, window.location.href),
        isExternalUrl: false,
        locationSearch: window.location.search,
        navigateType: "replace",
        scrollBehavior: 0,
      });
    },
    push: (href: string, _options?: NavigateOptions) => {
      dispatchAppRouterAction({
        type: ACTION_NAVIGATE,
        url: new URL(href, window.location.href),
        isExternalUrl: false,
        locationSearch: window.location.search,
        navigateType: "push",
        scrollBehavior: 0,
      });
    },
    refresh: () => {
      dispatchAppRouterAction({ type: ACTION_REFRESH });
    },
    hmrRefresh: () => {
      dispatchAppRouterAction({ type: ACTION_HMR_REFRESH });
    },
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
