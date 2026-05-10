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
// https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/app-router.tsx
// https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/app-router-instance.ts

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
    throw new Error(
      "NextRouter must be rendered through renderServer from vitest-plugin-rsc/nextjs.",
    );
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

function ensureNextWindowGlobal() {
  if (typeof window === "undefined") return;

  // Next's real AppRouter records debug/navigation state on window.next from
  // effects that normally run after app-index creates this global:
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/app-router.tsx#L202-L208
  (window as typeof window & { next?: object }).next ??= {};
}
