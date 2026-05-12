import "next/dist/server/node-environment-baseline";
import { isNextRouterError } from "next/dist/client/components/is-next-router-error.js";
import type { CacheNodeSeedData, FlightRouterState } from "next/dist/shared/lib/app-router-types";
import { createElement, type ReactElement, type ReactNode } from "react";
import type { RenderConfiguration } from "../testing-library";
import {
  cleanup as baseCleanup,
  initialize as baseInitialize,
  renderServer as baseRenderServer,
} from "../testing-library";
import { NextRouter } from "vitest-plugin-rsc/nextjs/client";
import { createNextActionResponse, createNextRouteResponse } from "./flight-payload";
import { buildFlightRouterStateWithNext } from "./flight-router-state";
import { createSeedDataFromFlightRouterState } from "./flight-seed-data";
import { createNextRequestContext, resetNextRequestContextCache } from "./request-context";

export * from "../testing-library";

export type NextRenderConfiguration = Partial<RenderConfiguration> & {
  nextRscRequestsViaMsw?: boolean;
};

let config: NextRenderConfiguration = {
  nextRscRequestsViaMsw: false,
};

export function initialize(customConfig: NextRenderConfiguration = {}): void {
  config = {
    ...config,
    ...customConfig,
  };
  baseInitialize({
    serverActionCaller: config.nextRscRequestsViaMsw
      ? "vitest-plugin-rsc/nextjs/testing-library-client"
      : undefined,
    rootOptions: {
      onCaughtError: (error) => {
        if (isNextRouterError(error)) return;
        console.log(error);
      },
      ...(customConfig.rootOptions ?? {}),
    },
    ...config,
  });
}

type BaseRenderServerOptions = NonNullable<Parameters<typeof baseRenderServer>[1]>;
type NextRenderServerOptions = BaseRenderServerOptions & {
  url?: string;
  route?: string;
  headers?: Headers | Record<string, string>;
};

export async function renderServer(
  ui: ReactNode,
  { url, route, headers, ...options }: NextRenderServerOptions = {},
) {
  const requestUrl = url ?? "/";
  const requestRoute = route ?? new URL(requestUrl, "http://localhost").pathname;
  const serverContext = await createNextRequestContext({
    url: requestUrl,
    route: requestRoute,
    headers,
  });
  return baseRenderServer(ui, {
    ...options,
    serverContext: {
      run: serverContext.run,
      prepareRoot: ({ root }) => createNextRouterInitialTree(root, requestUrl, requestRoute),
      completeAction: config.nextRscRequestsViaMsw
        ? serverContext.completeAction
        : () => ({ shouldRender: true }),
      createActionResponse: config.nextRscRequestsViaMsw
        ? ({ root, returnValue, shouldRender }) =>
            createNextActionResponse(root, returnValue, shouldRender)
        : undefined,
      createRouteResponse: ({ root, request }) =>
        createNextRouteResponse(root, request.url, request.routerState),
    },
  });
}

async function createNextRouterInitialTree(
  node: ReactNode,
  defaultUrl: string,
  defaultRoute: string,
): Promise<ReactNode> {
  const location = new URL(defaultUrl, "http://localhost");
  const Router = NextRouter as (props: {
    children?: ReactNode;
    route?: string;
    url?: string;
    initialTree?: FlightRouterState;
    initialSeedData?: CacheNodeSeedData;
  }) => ReactElement | null;
  const initialTree = await buildFlightRouterStateWithNext(
    defaultRoute,
    location.pathname,
    location.search,
  );

  return createElement(
    Router,
    {
      url: defaultUrl,
      route: defaultRoute,
      initialTree,
      initialSeedData: createSeedDataFromFlightRouterState(initialTree, node),
    },
    node,
  );
}

export async function cleanup() {
  await baseCleanup();
  await resetNextRequestContextCache();
}

// @ts-ignore
const expect = globalThis[Symbol.for("expect-global")];

export async function expectToHaveBeenNavigatedTo(url: Partial<URL>) {
  expect(globalThis.onNavigate).toHaveBeenCalledWith(expect.objectContaining(url));
}
