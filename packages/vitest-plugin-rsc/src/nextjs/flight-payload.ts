import { urlToUrlWithoutFlightMarker } from "next/dist/client/route-params.js";
import { parseAndValidateFlightRouterState } from "next/dist/server/app-render/parse-and-validate-flight-router-state.js";
import type {
  ActionFlightResponse,
  CacheNodeSeedData,
  FlightDataPath,
  FlightRouterState,
  NavigationFlightResponse,
} from "next/dist/shared/lib/app-router-types";
import type { ReactNode } from "react";
import { buildFlightRouterStateWithNext } from "./flight-router-state";
import { findNextRouterElement, type NextRouterElementProps } from "./router-element";

export async function createNextRouteResponse(
  root: ReactNode,
  url: string,
  routerState?: string | null,
): Promise<NavigationFlightResponse> {
  const location = urlToUrlWithoutFlightMarker(new URL(url));
  const rootFlightData = await createRootNavigationFlightData(root, {
    url: location,
    routerState,
  });
  if (!rootFlightData) {
    return { f: [], q: location.search, i: false, S: false, h: null };
  }

  // Mirrors the regular RSC response shape produced by Next's private
  // generateDynamicRSCPayload path. We build only the root patch that our test
  // router can model, then let Next's client fetchServerResponse/reducers
  // consume it normally:
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/server/app-render/app-render.tsx#L628-L760
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/router-reducer/fetch-server-response.ts#L266-L270
  return {
    b: "",
    f: [rootFlightData],
    q: location.search,
    i: false,
    S: false,
    h: null,
  };
}

export async function createNextActionResponse(
  root: ReactNode,
  returnValue: unknown,
  shouldRender: boolean,
): Promise<ActionFlightResponse> {
  const actionResult = Promise.resolve(returnValue);
  if (!shouldRender) {
    return { a: actionResult, f: "", q: "", i: false };
  }

  const nextRouter = findNextRouterElement(root);
  const props = nextRouter?.props as NextRouterElementProps | undefined;
  const location = new URL(props?.url ?? "/", "http://localhost");
  const rootFlightData = await createRootNavigationFlightData(root, { url: location });
  if (!rootFlightData) {
    return { a: actionResult, f: "", q: location.search, i: false };
  }

  // Mirrors the action branch of Next's private generateDynamicRSCPayload.
  // The POST itself is issued and decoded by Next's serverActionReducer; this
  // supplies the minimal Flight body that reducer expects after the action
  // runs in the component-test server context:
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/server/app-render/app-render.tsx#L700-L708
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/server/app-render/action-handler.ts#L1160-L1225
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/components/router-reducer/reducers/server-action-reducer.ts#L246-L299
  return {
    b: "",
    a: actionResult,
    f: [rootFlightData],
    q: location.search,
    i: false,
  };
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
  const route = props.route ?? props.url ?? url.pathname;
  const tree =
    parseAndValidateFlightRouterState(routerState ?? undefined) ??
    (await buildFlightRouterStateWithNext(route, url.pathname, url.search));
  const seedData = createSeedDataFromFlightRouterState(tree, props.children);

  return [tree, seedData, null, false] satisfies FlightDataPath;
}

function createSeedDataFromFlightRouterState(
  tree: FlightRouterState,
  children: ReactNode,
): CacheNodeSeedData {
  // Next normally creates CacheNodeSeedData through createComponentTree while
  // walking a real loader tree. Component tests already provide the rendered
  // RSC node, so we construct the same recursive seed-data shape and put that
  // node at each segment that the App Router can request:
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/server/app-render/create-component-tree.tsx#L73-L128
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/shared/lib/app-router-types.ts#L249-L271
  const parallelRoutes: CacheNodeSeedData[1] = {};
  for (const [parallelRouteKey, childTree] of Object.entries(tree[1])) {
    parallelRoutes[parallelRouteKey] = createSeedDataFromFlightRouterState(childTree, children);
  }

  return [children, parallelRoutes, null, false, null];
}
