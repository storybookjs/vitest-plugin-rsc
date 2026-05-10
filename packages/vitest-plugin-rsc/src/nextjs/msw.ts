import type { FetchRsc } from "../testing-library-client";
import { HttpResponse, http } from "msw";

export const serverActionHandlers = [
  http.post(
    ({ request }) => request.headers.has("next-action"),
    async ({ request }) => {
      const actionId = request.headers.get("next-action");
      if (!actionId) return;

      const fetchRsc = (globalThis as typeof globalThis & Record<symbol, FetchRsc | undefined>)[
        Symbol.for("vitest-plugin-rsc.nextjs.fetchRsc")
      ];
      if (!fetchRsc) {
        return HttpResponse.text(
          "Next server actions require initialize({ serverActionsViaMsw: true }) before using serverActionHandlers.",
          { status: 500 },
        );
      }

      const reply = await readActionReply(request);
      const response = await fetchRsc({ id: actionId, reply, requestType: "next-action" });
      if (response instanceof Response) {
        return response;
      }
      return new Response(response, {
        headers: { "content-type": "text/x-component" },
      });
    },
  ),
  http.get(
    ({ request }) => request.headers.has("rsc"),
    async ({ request }) => {
      const fetchRsc = (globalThis as typeof globalThis & Record<symbol, FetchRsc | undefined>)[
        Symbol.for("vitest-plugin-rsc.nextjs.fetchRsc")
      ];
      if (!fetchRsc) {
        return HttpResponse.text(
          "Next route refresh requests require initialize({ serverActionsViaMsw: true }) before using serverActionHandlers.",
          { status: 500 },
        );
      }

      const response = await fetchRsc({
        requestType: "next-route",
        url: request.url,
        routerState: request.headers.get("next-router-state-tree"),
      });
      if (response instanceof Response) {
        return response;
      }
      return new Response(response, {
        headers: { "content-type": "text/x-component" },
      });
    },
  ),
];

async function readActionReply(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("multipart/form-data") ? request.formData() : request.text();
}
