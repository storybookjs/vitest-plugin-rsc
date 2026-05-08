"use client";

import React, { useMemo } from "react";
import {
  AppRouterContext,
  LayoutRouterContext,
  GlobalLayoutRouterContext,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  SearchParamsContext,
  PathnameContext,
  PathParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { useActionQueue } from "next/dist/client/components/use-action-queue";
import { RedirectBoundary } from "next/dist/client/components/redirect-boundary";
import { getSelectedParams } from "next/dist/client/components/router-reducer/compute-changed-path";
import {
  publicAppRouterInstance,
  type AppRouterActionQueue,
} from "next/dist/client/components/app-router-instance";

export function AppRouter({ actionQueue }: { actionQueue: AppRouterActionQueue }) {
  const { canonicalUrl, cache, tree, nextUrl, focusAndScrollRef } = useActionQueue(actionQueue);

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
            <GlobalLayoutRouterContext.Provider value={{ tree, focusAndScrollRef, nextUrl }}>
              <AppRouterContext.Provider value={publicAppRouterInstance}>
                <LayoutRouterContext.Provider
                  value={{
                    parentTree: tree,
                    parentCacheNode: cache,
                    url: canonicalUrl,
                    parentSegmentPath: null,
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
