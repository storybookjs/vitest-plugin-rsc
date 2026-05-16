"use client";
import "next/dist/client/app-bootstrap.js";
import NextAppRouter from "next/dist/client/components/app-router.js";
import type { AppRouterActionQueue } from "next/dist/client/components/app-router-instance.js";
import type { InitialRSCPayload } from "next/dist/shared/lib/app-router-types";
import React, { type ReactNode, useMemo, useRef } from "react";
import { staticIndicatorState, webSocket } from "./src/client/app-index.ts";
import {
  createNextRouterStateSnapshot,
  type InitialFlightPayload,
  type NextRouterStateSnapshot,
} from "./src/client/components/router-reducer/create-initial-router-state.ts";
import { createMutableActionQueue } from "./src/client/components/app-router-instance.ts";

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
