"use client";
import "next/dist/client/app-bootstrap.js";
import NextAppRouter from "next/dist/client/components/app-router.js";
import type { AppRouterActionQueue } from "next/dist/client/components/app-router-instance.js";
import type { InitialRSCPayload } from "next/dist/shared/lib/app-router-types";
import { useMemo, useRef } from "react";
import { staticIndicatorState, webSocket } from "./src/client/app-index.ts";
import { createMutableActionQueue } from "./src/client/components/app-router-instance.ts";
import {
  createNextRouterStateSnapshot,
  type InitialFlightPayload,
  type NextRouterStateSnapshot,
} from "./src/client/components/router-reducer/create-initial-router-state.ts";

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/app-index.tsx#L276-L420
// Adaptation: Vitest applies generated Edge App Page document HTML through an
// inert DOMParser snapshot and reuses the browser document across tests, so the
// one-shot `app-index` module bootstrap cannot own hydrateRoot yet. This file is
// intentionally internal: `vitest-plugin-rsc/nextjs/client` is not exported.
// Begin adapted: Next.js App Router document hydration boundary
export function NextAppRouterHydrationBoundary({
  route,
  url = "/",
  initialFlightPayload,
  initialRSCPayload,
}: {
  route?: string;
  url?: string;
  initialFlightPayload?: InitialFlightPayload;
  initialRSCPayload?: InitialRSCPayload;
}) {
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
    throw new Error("Invariant: Next App Router action queue was not initialized.");
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
}
// End adapted
