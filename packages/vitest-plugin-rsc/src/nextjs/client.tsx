"use client";
import { fn, type Mock } from "@vitest/spy";
import NextAppRouter from "next/dist/client/components/app-router.js";
import type {
  AppRouterActionQueue,
  GlobalErrorState,
} from "next/dist/client/components/app-router-instance.js";
import { createMutableActionQueue as createNextMutableActionQueue } from "next/dist/client/components/app-router-instance.js";
import { createInitialRouterState } from "next/dist/client/components/router-reducer/create-initial-router-state.js";
import { reducer } from "next/dist/client/components/router-reducer/router-reducer.js";
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
import React, { type ReactNode, useMemo, useRef } from "react";

// This test router is a small adapter around Next's App Router internals. Keep
// copied control flow aligned with Next rather than growing a parallel router:
// https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/client/components/app-router.tsx
// https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/client/components/app-router-instance.ts

declare global {
  var onNavigate: Mock<(url: URL) => void>;
}
globalThis.onNavigate = fn<(url: URL) => void>();
let actionQueue: AppRouterActionQueue | null = null;
const globalErrorState: GlobalErrorState = [GlobalError, null];

function GlobalError() {
  return null;
}

type NextRouterStateSnapshot = {
  state: AppRouterState;
};

export const NextRouter = ({
  children,
  route,
  url = "/",
  initialTree,
  initialSeedData,
}: {
  children: ReactNode;
  route?: string;
  url?: string;
  initialTree?: FlightRouterState;
  initialSeedData?: CacheNodeSeedData;
}) => {
  const snapshot = useMemo(
    () => createNextRouterStateSnapshot({ route, url, initialTree, initialSeedData }),
    [route, url, initialTree, initialSeedData],
  );
  const actionQueueRef = useRef<AppRouterActionQueue | null>(null);
  const snapshotRef = useRef<NextRouterStateSnapshot | null>(null);
  const snapshotVersionRef = useRef(0);

  if (snapshotRef.current !== snapshot) {
    actionQueueRef.current = createMutableActionQueue(snapshot.state);
    snapshotRef.current = snapshot;
    snapshotVersionRef.current += 1;
  }
  const currentActionQueue = actionQueueRef.current;
  if (!currentActionQueue) {
    throw new Error("Invariant: NextRouter action queue was not initialized.");
  }

  ensureNextWindowGlobal();

  return (
    <NextAppRouter
      key={snapshotVersionRef.current}
      actionQueue={currentActionQueue}
      globalErrorState={globalErrorState}
    />
  );
};

(NextRouter as unknown as { $$vitestPluginRscNextRouter: true }).$$vitestPluginRscNextRouter = true;

function createNextRouterStateSnapshot({
  route,
  url,
  initialTree,
  initialSeedData,
}: {
  route?: string;
  url: string;
  initialTree?: FlightRouterState;
  initialSeedData?: CacheNodeSeedData;
}): NextRouterStateSnapshot {
  const location = new URL(url, "http://localhost");
  if (!initialTree || !initialSeedData) {
    const routeHint = route ? ` for route "${route}"` : "";
    throw new Error(
      `NextRouter${routeHint} must be rendered through renderServer from vitest-plugin-rsc/nextjs.`,
    );
  }

  return {
    state: createInitialRouterState({
      navigatedAt: Date.now(),
      initialRSCPayload: createInitialRSCPayload({
        canonicalUrl: location.pathname + location.search,
        initialTree,
        renderedSearch: location.search,
        seedData: initialSeedData,
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
  // Begin copy: Next.js InitialRSCPayload shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/app-render.tsx#L2221-L2260
  // Adaptation: component tests provide the root seed data directly instead of
  // running Next's full app-render request pipeline.
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
  // End copy
}

function createMutableActionQueue(initialState: AppRouterState): AppRouterActionQueue {
  // Begin copy: Next.js mutable action queue state shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/client/components/app-router-instance.ts#L220-L256
  // Adaptation: reuse Next's action queue implementation, but reset the private
  // mutable queue fields before each component-test router mount.
  actionQueue ??= createNextMutableActionQueue(initialState, null);
  actionQueue.state = initialState;
  actionQueue.action = reduceRouterAction;
  actionQueue.pending = null;
  actionQueue.last = null;
  actionQueue.needsRefresh = false;
  // End copy
  return actionQueue;
}

function reduceRouterAction(state: AppRouterState, action: ReducerActions): ReducerState {
  if (action.type === ACTION_NAVIGATE) {
    globalThis.onNavigate(action.url);
    return state;
  }

  return reducer(state, action);
}

function ensureNextWindowGlobal() {
  if (typeof window === "undefined") return;

  // Begin copy: Next.js window.next app-router global
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/client/components/app-router.tsx#L202-L208
  // Adaptation: component tests do not run Next's app-index bootstrap.
  (window as typeof window & { next?: object }).next ??= {};
  // End copy
}
