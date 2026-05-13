"use client";
import { fn, type Mock } from "@vitest/spy";
import NextAppRouter from "next/dist/client/components/app-router.js";
import type {
  AppRouterActionQueue,
  GlobalErrorState,
} from "next/dist/client/components/app-router-instance.js";
import {
  createMutableActionQueue as createNextMutableActionQueue,
  publicAppRouterInstance,
} from "next/dist/client/components/app-router-instance.js";
import { createHrefFromUrl } from "next/dist/client/components/router-reducer/create-href-from-url.js";
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

// Next 16.0.x and 16.1.x render the dev HotReload wrapper inside AppRouter and
// require a defined websocket so `useWebSocketPing` can send HMR pings. Component
// tests do not run Next's app-index bootstrap, so provide a no-op open socket.
// Next 16.2.x also accepts this prop, though the rest of the router bootstrap
// path no longer crashes when it is absent.
const webSocket = {
  readyState: WebSocket.OPEN,
  OPEN: WebSocket.OPEN,
  send: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  close: () => {},
} as unknown as WebSocket;

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
      webSocket={webSocket}
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

  const initialRSCPayload = createInitialRSCPayload({
    canonicalUrl: createHrefFromUrl(location, false),
    initialTree,
    renderedSearch: location.search,
    seedData: initialSeedData,
  });
  const initialRouterStateOptions = {
    navigatedAt: Date.now(),
    initialRSCPayload,
    initialFlightStreamForCache: null,
    // Version split:
    // - Next 16.0.x and 16.1.x initialize the client router from split fields:
    //   `initialCanonicalUrlParts`, `initialRenderedSearch`, and
    //   `initialFlightData`.
    // - Next 16.0.x also requires `initialParallelRoutes`; later 16.x versions
    //   ignore it because the segment cache hydration path replaced that field.
    // - Next 16.2.x initializes from the consolidated `initialRSCPayload` plus
    //   `initialFlightStreamForCache`.
    //
    // Supplying both shapes keeps this test router compatible across the
    // supported Next 16 minor lines; each Next version ignores the extra fields.
    initialCanonicalUrlParts: initialRSCPayload.c,
    initialRenderedSearch: initialRSCPayload.q,
    initialFlightData: initialRSCPayload.f,
    initialParallelRoutes: new Map(),
    location: location as unknown as Location,
  } as Parameters<typeof createInitialRouterState>[0] & Record<string, unknown>;

  return {
    state: createInitialRouterState(initialRouterStateOptions),
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
  // Source: https://github.com/vercel/next.js/blob/ee6e79b1/packages/next/src/client/app-bootstrap.ts#L13-L16
  // Source: https://github.com/vercel/next.js/blob/ee6e79b1/packages/next/src/client/components/app-router-instance.ts#L505-L508
  // Adaptation: component tests do not run Next's app-index bootstrap.
  const next = ((
    window as typeof window & {
      next?: { appDir?: true; router?: typeof publicAppRouterInstance };
    }
  ).next ??= {});
  next.appDir ??= true;
  next.router ??= publicAppRouterInstance;
  // End copy
}
