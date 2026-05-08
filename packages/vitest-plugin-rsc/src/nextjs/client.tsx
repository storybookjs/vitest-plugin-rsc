"use client";
import { fn, type Mock } from "@vitest/spy";
import {
  type AppRouterActionQueue,
  publicAppRouterInstance,
} from "next/dist/client/components/app-router-instance.js";
import { RedirectBoundary } from "next/dist/client/components/redirect-boundary.js";
import { getSelectedParams } from "next/dist/client/components/router-reducer/compute-changed-path.js";
import { createInitialRouterState } from "next/dist/client/components/router-reducer/create-initial-router-state.js";
import { useActionQueue } from "next/dist/client/components/use-action-queue.js";
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
import React, { type ReactNode, useMemo } from "react";
import { buildFlightRouterState } from "./flight-router-state";

declare global {
  var onNavigate: Mock<(url: URL) => void>;
}
globalThis.onNavigate = fn<(url: URL) => void>();

function GlobalError() {
  return null;
}

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
  const location = new URL(url, "http://localhost");

  const actionQueue: AppRouterActionQueue = {
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
    dispatch: (payload, setState) => {
      if (payload.type === "navigate") {
        globalThis.onNavigate(payload.url);
      }
    },
    action: (state, action) => {
      throw new Error("action not implemented");
    },
    pending: null,
    last: null,
    onRouterTransitionStart: null,
  };
  return <AppRouter actionQueue={actionQueue}></AppRouter>;
};

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

export function AppRouter({ actionQueue }: { actionQueue: AppRouterActionQueue }) {
  const { canonicalUrl, cache, tree, nextUrl, previousNextUrl, focusAndScrollRef } =
    useActionQueue(actionQueue);

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
              <AppRouterContext.Provider value={publicAppRouterInstance}>
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
