import { RSC_HEADER } from "next/dist/client/components/app-router-headers.js";
import { getServerActionRequestMetadata } from "next/dist/server/lib/server-action-request-meta.js";
import { HttpResponse, http, passthrough } from "msw";
import {
  dispatchNextAppRouteRequest,
  dispatchNextAppPageActionPost,
  dispatchNextAppPageRscGet,
} from "./src/server/next-server.ts";
import type {
  NextRouteHandlerManifestEntry,
  NextRouteManifest,
  NextRouteManifestEntry,
} from "./request-router.ts";

export const nextRscRequestHandlers = [
  http.post(
    ({ request }) => getNextActionRequestMetadata(request).isFetchAction,
    async ({ request }) => {
      const { actionId } = getNextActionRequestMetadata(request);
      if (!actionId) return;

      const delegatedResponse = await dispatchNextAppPageActionPost({
        request,
        manifest: await loadNextRouteManifest(),
      });
      if (delegatedResponse) return delegatedResponse;

      return createUnhandledAppPageRequestResponse(request, "Server Action POST");
    },
  ),
  http.get(
    ({ request }) => request.headers.has(RSC_HEADER),
    async ({ request }) => {
      const delegatedResponse = await dispatchNextAppPageRscGet({
        request,
        manifest: await loadNextRouteManifest(),
      });
      if (delegatedResponse) return delegatedResponse;

      return createUnhandledAppPageRequestResponse(request, "RSC GET");
    },
  ),
  http.all("*", async ({ request }) => {
    if (isViteInternalRequest(request)) {
      return passthrough();
    }

    const delegatedResponse = await dispatchNextAppRouteRequest({
      request,
      manifest: await loadNextRouteManifest(),
    });
    if (delegatedResponse) return delegatedResponse;

    return passthrough();
  }),
];

function isViteInternalRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname.startsWith("/@") || pathname.startsWith("/__vitest");
}

function createUnhandledAppPageRequestResponse(request: Request, requestKind: string) {
  const { pathname } = new URL(request.url);
  return HttpResponse.text(
    `No generated Next Edge App Page handler found for ${requestKind} "${pathname}".`,
    { status: 404 },
  );
}

function getNextActionRequestMetadata(request: Request) {
  return getServerActionRequestMetadata(
    request as Parameters<typeof getServerActionRequestMetadata>[0],
  );
}

async function loadNextRouteManifest(): Promise<NextRouteManifest> {
  const { nextRouteManifest, nextRouteHandlerManifest, routing } =
    await import("virtual:vitest-plugin-rsc/next-routes");
  return {
    pages: nextRouteManifest as NextRouteManifestEntry[],
    routeHandlers: nextRouteHandlerManifest as NextRouteHandlerManifestEntry[],
    routingData: routing,
  };
}
