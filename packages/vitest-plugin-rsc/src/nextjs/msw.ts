import type { FetchRsc } from "../testing-library-client";
import {
  ACTION_HEADER,
  NEXT_ROUTER_STATE_TREE_HEADER,
  RSC_CONTENT_TYPE_HEADER,
  RSC_HEADER,
} from "next/dist/client/components/app-router-headers.js";
import { HttpResponse, http } from "msw";

export const nextRscRequestHandlers = [
  http.post(
    ({ request }) => request.headers.has(ACTION_HEADER),
    async ({ request }) => {
      const actionId = request.headers.get(ACTION_HEADER);
      if (!actionId) return;

      const fetchRsc = (globalThis as typeof globalThis & Record<symbol, FetchRsc | undefined>)[
        Symbol.for("vitest-plugin-rsc.nextjs.fetchRsc")
      ];
      if (!fetchRsc) {
        return HttpResponse.text(
          "Next server actions require initialize({ nextRscRequestsViaMsw: true }) before using nextRscRequestHandlers.",
          { status: 500 },
        );
      }

      const reply = await readActionReply(request);
      const response = await fetchRsc({ id: actionId, reply, requestType: "next-action" });
      if (response instanceof Response) {
        return response;
      }
      return new Response(response, {
        headers: { "content-type": RSC_CONTENT_TYPE_HEADER },
      });
    },
  ),
  http.get(
    ({ request }) => request.headers.has(RSC_HEADER),
    async ({ request }) => {
      const fetchRsc = (globalThis as typeof globalThis & Record<symbol, FetchRsc | undefined>)[
        Symbol.for("vitest-plugin-rsc.nextjs.fetchRsc")
      ];
      if (!fetchRsc) {
        return HttpResponse.text(
          "Next RSC requests require initialize({ nextRscRequestsViaMsw: true }) before using nextRscRequestHandlers.",
          { status: 500 },
        );
      }

      const response = await fetchRsc({
        requestType: "next-route",
        url: request.url,
        routerState: request.headers.get(NEXT_ROUTER_STATE_TREE_HEADER),
      });
      if (response instanceof Response) {
        return response;
      }
      return new Response(response, {
        headers: { "content-type": RSC_CONTENT_TYPE_HEADER },
      });
    },
  ),
];

async function readActionReply(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("multipart/form-data") ? request.formData() : request.text();
}
