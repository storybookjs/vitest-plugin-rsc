import type { GlobalErrorState } from "next/dist/client/components/app-router-instance.js";
import { createHrefFromUrl } from "next/dist/client/components/router-reducer/create-href-from-url.js";
import { createInitialRouterState } from "next/dist/client/components/router-reducer/create-initial-router-state.js";
import type { AppRouterState } from "next/dist/client/components/router-reducer/router-reducer-types.js";
import type { InitialRSCPayload } from "next/dist/shared/lib/app-router-types";

export type InitialFlightPayload = Partial<InitialRSCPayload> & Pick<InitialRSCPayload, "f">;

export type NextRouterStateSnapshot = {
  state: AppRouterState;
  globalErrorState: GlobalErrorState;
};

export function GlobalError() {
  return null;
}

const globalErrorState: GlobalErrorState = [GlobalError, null];

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/app-index.tsx#L374-L383
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/components/router-reducer/create-initial-router-state.ts
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/app-render/app-render.tsx#L2221-L2260
// Adaptation: component tests mount NextAppRouter without running Next's
// app-index hydrate() bootstrap, so this builds the same initial router state
// from the Flight payload returned by the Vite/Vitest app-render bridge.
// Begin adapted: Next.js initial router state payload bridge
export function createNextRouterStateSnapshot({
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
}
// End adapted
