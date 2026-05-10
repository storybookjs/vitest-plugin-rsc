"use client";
import { fn, type Mock } from "@vitest/spy";
import NextAppRouter from "next/dist/client/components/app-router.js";
import type {
  AppRouterActionQueue,
  GlobalErrorState,
} from "next/dist/client/components/app-router-instance.js";
import { createMutableActionQueue as createNextMutableActionQueue } from "next/dist/client/components/app-router-instance.js";
import LayoutRouter from "next/dist/client/components/layout-router.js";
import RenderFromTemplateContext from "next/dist/client/components/render-from-template-context.js";
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
  FlightSegmentPath,
  InitialRSCPayload,
} from "next/dist/shared/lib/app-router-types";
import React, {
  Children,
  cloneElement,
  createElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useMemo,
  useRef,
} from "react";

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
        seedData: isDocumentRoot(children)
          ? createDocumentSeedData(children, initialTree)
          : [children, {}, null, false, null],
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

function isDocumentRoot(children: ReactNode) {
  return isValidElement(children) && children.type === "html";
}

function createDocumentSeedData(
  children: ReactNode,
  initialTree: FlightRouterState,
): CacheNodeSeedData {
  if (!isValidElement(children)) {
    throw new Error("NextRouter document mode expects a single root layout element.");
  }
  const root = children as ReactElement<{ children?: ReactNode }>;

  return [
    createDocumentRoot(root, createParallelRouteProps(initialTree).children),
    createParallelRouteSeedData(getDocumentBodyChildren(root), initialTree),
    null,
    false,
    null,
  ];
}

function createDocumentRoot(root: ReactElement<{ children?: ReactNode }>, children: ReactNode) {
  return cloneElement(root, {
    children: Children.map(root.props.children, (child) => {
      if (isValidElement(child) && child.type === "body") {
        return cloneElement(child as ReactElement<{ children?: ReactNode }>, { children });
      }
      return child;
    }),
  });
}

function getDocumentBodyChildren(root: ReactElement<{ children?: ReactNode }>) {
  const body = Children.toArray(root.props.children).find(
    (child) => isValidElement(child) && child.type === "body",
  );
  return isValidElement(body) ? body.props.children : root.props.children;
}

function createParallelRouteSeedData(
  leaf: ReactNode,
  tree: FlightRouterState,
): Record<string, CacheNodeSeedData | null> {
  return Object.fromEntries(
    Object.entries(tree[1]).map(([parallelRouteKey, childTree]) => [
      parallelRouteKey,
      createSeedDataForTree(leaf, childTree),
    ]),
  );
}

function createSeedDataForTree(leaf: ReactNode, tree: FlightRouterState): CacheNodeSeedData {
  const parallelRouteSeedData = createParallelRouteSeedData(leaf, tree);
  const parallelRouteProps = createParallelRouteProps(tree);

  return [
    Object.keys(tree[1]).length === 0 ? (
      leaf
    ) : (
      <Fragment key={createRouterCacheKey(tree[0])}>{parallelRouteProps.children}</Fragment>
    ),
    parallelRouteSeedData,
    null,
    false,
    null,
  ];
}

function createParallelRouteProps(tree: FlightRouterState): Record<string, ReactNode> {
  return Object.fromEntries(
    Object.keys(tree[1]).map((parallelRouterKey) => [
      parallelRouterKey,
      createElement(LayoutRouter, {
        parallelRouterKey,
        error: undefined,
        errorStyles: undefined,
        errorScripts: undefined,
        template: createElement(RenderFromTemplateContext),
        templateStyles: undefined,
        templateScripts: undefined,
        notFound: undefined,
        forbidden: undefined,
        unauthorized: undefined,
      }),
    ]),
  );
}

function createRouterCacheKey(segment: FlightSegmentPath[number]) {
  return Array.isArray(segment) ? segment.join("|") : segment;
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
