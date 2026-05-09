import type { FetchRsc } from "../testing-library-client";
import { HttpResponse, http, passthrough } from "msw";

export function mswHandlers() {
  return [
    http.post("*", async ({ request }) => {
      const actionId = request.headers.get("next-action");
      if (!actionId) {
        return passthrough();
      }

      const fetchRsc = (globalThis as typeof globalThis & Record<symbol, FetchRsc | undefined>)[
        Symbol.for("vitest-plugin-rsc.nextjs.fetchRsc")
      ];
      if (!fetchRsc) {
        return HttpResponse.text(
          "Next server actions require initialize({ serverActionsViaMsw: true }) before using mswHandlers().",
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
    }),
  ];
}

async function readActionReply(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("multipart/form-data")
    ? request.formData()
    : request.text();
}
