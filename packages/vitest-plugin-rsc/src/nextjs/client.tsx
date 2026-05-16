"use client";
import "next/dist/client/app-bootstrap.js";
import NextAppRouter from "next/dist/client/components/app-router.js";
import type {
  AppRouterActionQueue,
  GlobalErrorState,
} from "next/dist/client/components/app-router-instance.js";
import { createMutableActionQueue as createNextMutableActionQueue } from "next/dist/client/components/app-router-instance.js";
import { createHrefFromUrl } from "next/dist/client/components/router-reducer/create-href-from-url.js";
import { createInitialRouterState } from "next/dist/client/components/router-reducer/create-initial-router-state.js";
import { reducer } from "next/dist/client/components/router-reducer/router-reducer.js";
import type { AppRouterState } from "next/dist/client/components/router-reducer/router-reducer-types.js";
import type { InitialRSCPayload } from "next/dist/shared/lib/app-router-types";
import React, { type ReactNode, useMemo, useRef } from "react";

// This test router is a small adapter around Next's App Router internals. Keep
// copied control flow aligned with Next rather than growing a parallel router:
// https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/client/components/app-router.tsx
// https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/client/components/app-router-instance.ts

let actionQueue: AppRouterActionQueue | null = null;
const globalErrorState: GlobalErrorState = [GlobalError, null];

// Next 16.0.x and 16.1.x render the dev HotReload wrapper inside AppRouter and
// require the websocket/static-indicator state that app-index normally creates.
// Component tests do not run Next's app-index bootstrap, so provide no-op dev
// state that matches that bootstrap shape.
const webSocket = {
  readyState: WebSocket.OPEN,
  OPEN: WebSocket.OPEN,
  send: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  close: () => {},
} as unknown as WebSocket;
const staticIndicatorState = { pathname: null, appIsrManifest: null };

type InitialFlightPayload = Partial<InitialRSCPayload> & Pick<InitialRSCPayload, "f">;

function GlobalError() {
  return null;
}

type NextRouterStateSnapshot = {
  state: AppRouterState;
  globalErrorState: GlobalErrorState;
};

export const NextRouter = ({
  route,
  url = "/",
  initialFlightPayload,
  initialRSCPayload,
}: {
  children?: ReactNode;
  route?: string;
  url?: string;
  initialFlightPayload?: InitialFlightPayload;
  initialRSCPayload?: InitialRSCPayload;
}) => {
  const snapshot = useMemo(
    () => createNextRouterStateSnapshot({ route, url, initialFlightPayload, initialRSCPayload }),
    [route, url, initialFlightPayload, initialRSCPayload],
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

  return (
    <NextAppRouter
      key={snapshotVersionRef.current}
      actionQueue={currentActionQueue}
      globalErrorState={snapshot.globalErrorState}
      webSocket={webSocket}
      staticIndicatorState={staticIndicatorState}
    />
  );
};

function createNextRouterStateSnapshot({
  route,
  url,
  initialFlightPayload,
  initialRSCPayload: providedInitialRSCPayload,
}: {
  route?: string;
  url: string;
  initialFlightPayload?: InitialFlightPayload;
  initialRSCPayload?: InitialRSCPayload;
}): NextRouterStateSnapshot {
  const location = new URL(url, "http://localhost");
  if (!initialFlightPayload && !providedInitialRSCPayload) {
    const routeHint = route ? ` for route "${route}"` : "";
    throw new Error(
      `NextRouter${routeHint} must be rendered through renderServer from vitest-plugin-rsc/nextjs.`,
    );
  }

  const initialRSCPayload =
    providedInitialRSCPayload ??
    createInitialRSCPayload({
      canonicalUrl: createHrefFromUrl(location, false),
      renderedSearch: initialFlightPayload!.q ?? location.search,
      flightPayload: initialFlightPayload!,
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
    globalErrorState: initialRSCPayload.G ?? globalErrorState,
  };
}

function createInitialRSCPayload(props: {
  canonicalUrl: string;
  renderedSearch: string;
  flightPayload: InitialFlightPayload;
}): InitialRSCPayload {
  // Begin copy: Next.js InitialRSCPayload shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/app-render.tsx#L2221-L2260
  // Adaptation: Next app-render provides the navigation Flight payload for the
  // fake route; component tests add the initial document-only fields normally
  // supplied by Next's app-index hydration path.
  return {
    ...props.flightPayload,
    c: props.canonicalUrl.split("/"),
    q: props.renderedSearch,
    i: props.flightPayload.i ?? false,
    m: props.flightPayload.m,
    G: [GlobalError, null],
    S: props.flightPayload.S ?? false,
    h: props.flightPayload.h ?? null,
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
  actionQueue.action = reducer;
  actionQueue.pending = null;
  actionQueue.last = null;
  actionQueue.needsRefresh = false;
  // End copy
  return actionQueue;
}
