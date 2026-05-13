import type { FetchNextRsc } from "./testing-library-client";
import {
  NEXT_URL,
  NEXT_ROUTER_STATE_TREE_HEADER,
  RSC_HEADER,
} from "next/dist/client/components/app-router-headers.js";
import { getServerActionRequestMetadata } from "next/dist/server/lib/server-action-request-meta.js";
import { HttpResponse, http } from "msw";

export const nextRscRequestHandlers = [
  http.post(
    ({ request }) => getNextActionRequestMetadata(request).isFetchAction,
    async ({ request }) => {
      const { actionId } = getNextActionRequestMetadata(request);
      if (!actionId) return;

      const fetchRsc = (globalThis as typeof globalThis & Record<symbol, FetchNextRsc | undefined>)[
        Symbol.for("vitest-plugin-rsc.nextjs.fetchRsc")
      ];
      if (!fetchRsc) {
        return HttpResponse.text(
          "Next server actions require initialize({ nextRscRequestsViaMsw: true }) before using nextRscRequestHandlers.",
          { status: 500 },
        );
      }

      const reply = await readActionReply(request);
      return fetchRsc({
        id: actionId,
        reply,
        requestType: "next-action",
        routerState: request.headers.get(NEXT_ROUTER_STATE_TREE_HEADER),
        nextUrl: request.headers.get(NEXT_URL),
      });
    },
  ),
  http.get(
    ({ request }) => request.headers.has(RSC_HEADER),
    async ({ request }) => {
      const fetchRsc = (globalThis as typeof globalThis & Record<symbol, FetchNextRsc | undefined>)[
        Symbol.for("vitest-plugin-rsc.nextjs.fetchRsc")
      ];
      if (!fetchRsc) {
        return HttpResponse.text(
          "Next RSC requests require initialize({ nextRscRequestsViaMsw: true }) before using nextRscRequestHandlers.",
          { status: 500 },
        );
      }

      return fetchRsc({
        requestType: "next-route",
        url: request.url,
        routerState: request.headers.get(NEXT_ROUTER_STATE_TREE_HEADER),
        nextUrl: request.headers.get(NEXT_URL),
      });
    },
  ),
];

function getNextActionRequestMetadata(request: Request) {
  return getServerActionRequestMetadata(
    request as Parameters<typeof getServerActionRequestMetadata>[0],
  );
}

async function readActionReply(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("multipart/form-data") ? request.formData() : request.text();
}
