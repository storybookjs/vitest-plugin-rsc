import { urlToUrlWithoutFlightMarker } from "next/dist/client/route-params.js";
import { parseAndValidateFlightRouterState } from "next/dist/server/app-render/parse-and-validate-flight-router-state.js";
import type {
  ActionFlightResponse,
  FlightDataPath,
  NavigationFlightResponse,
} from "next/dist/shared/lib/app-router-types";
import type { ReactNode } from "react";
import { buildFlightRouterStateWithNext } from "./flight-router-state";
import { createSeedDataFromFlightRouterState } from "./flight-seed-data";
import { findNextRouterElement, type NextRouterElementProps } from "./router-element";

export async function createNextRouteResponse(
  root: ReactNode,
  url: string,
  routerState?: string | null,
  couldBeIntercepted = false,
): Promise<NavigationFlightResponse> {
  const location = urlToUrlWithoutFlightMarker(new URL(url));
  const rootFlightData = await createRootNavigationFlightData(root, {
    url: location,
    routerState,
  });
  if (!rootFlightData) {
    return { f: [], q: location.search, i: couldBeIntercepted, S: false, h: null };
  }

  // Begin copy: Next.js NavigationFlightResponse payload shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/app-render.tsx#L761-L770
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/shared/lib/app-router-types.ts#L365-L393
  // Adaptation: component tests build only the root patch that their test
  // router can model.
  const response: NavigationFlightResponse = {
    b: "",
    f: [rootFlightData],
    q: location.search,
    i: couldBeIntercepted,
    S: false,
    h: null,
  };
  // End copy
  return response;
}

export async function createNextActionResponse(
  root: ReactNode,
  returnValue: unknown,
  shouldRender: boolean,
  routerState?: string | null,
  couldBeIntercepted = false,
): Promise<ActionFlightResponse> {
  const actionResult = Promise.resolve(returnValue);
  if (!shouldRender) {
    // Begin copy: Next.js ActionFlightResponse skipped page rendering shape
    // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/app-render.tsx#L641-L645
    // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/app-render.tsx#L749-L758
    const response: ActionFlightResponse = {
      a: actionResult,
      f: "",
      q: "",
      i: couldBeIntercepted,
    };
    // End copy
    return response;
  }

  const nextRouter = findNextRouterElement(root);
  const props = nextRouter?.props as NextRouterElementProps | undefined;
  const location = new URL(props?.url ?? "/", "http://localhost");
  const rootFlightData = await createRootNavigationFlightData(root, {
    url: location,
    routerState,
  });
  if (!rootFlightData) {
    // Begin copy: Next.js ActionFlightResponse empty Flight data shape
    // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/app-render.tsx#L641-L645
    // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/app-render.tsx#L749-L758
    const response: ActionFlightResponse = {
      a: actionResult,
      f: "",
      q: location.search,
      i: couldBeIntercepted,
    };
    // End copy
    return response;
  }

  // Begin copy: Next.js ActionFlightResponse payload shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/app-render.tsx#L749-L758
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/client/components/router-reducer/reducers/server-action-reducer.ts#L246-L299
  const response: ActionFlightResponse = {
    b: "",
    a: actionResult,
    f: [rootFlightData],
    q: location.search,
    i: couldBeIntercepted,
  };
  // End copy
  return response;
}

async function createRootNavigationFlightData(
  root: ReactNode,
  {
    url,
    routerState,
  }: {
    url: URL;
    routerState?: string | null;
  },
): Promise<FlightDataPath | undefined> {
  const nextRouter = findNextRouterElement(root);
  if (!nextRouter) return;

  const props = nextRouter.props as NextRouterElementProps;
  const route = props.route ?? new URL(props.url ?? url.pathname, "http://localhost").pathname;
  const tree =
    parseAndValidateFlightRouterState(routerState ?? undefined) ??
    (await buildFlightRouterStateWithNext(route, url.pathname, url.search));
  const seedData = createSeedDataFromFlightRouterState(tree, props.children);

  // Begin copy: Next.js FlightDataPath root patch shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/walk-tree-with-flight-router-state.tsx#L401-L410
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/shared/lib/app-router-types.ts#L286-L302
  const flightDataPath = [tree, seedData, null, false] satisfies FlightDataPath;
  // End copy
  return flightDataPath;
}
