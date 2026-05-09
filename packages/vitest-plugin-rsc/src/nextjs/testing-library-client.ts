import * as React from "react";
import type { FetchRsc } from "../testing-library-client";

export function createServerActionCaller({ fetchRsc }: { fetchRsc: FetchRsc }) {
  const cleanup = installNextServerActionFetchBridge(fetchRsc);

  return {
    call: callNextServerAction,
    cleanup,
  };
}

function installNextServerActionFetchBridge(fetchRsc: FetchRsc) {
  const originalFetch = globalThis.fetch;
  const bridgedFetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const method = init?.method ?? request?.method;
    const headers = new Headers(init?.headers ?? request?.headers);
    const actionId = headers.get("next-action");

    // Next's server-action reducer hardcodes an HTTP POST transport:
    // packages/next/src/client/components/router-reducer/reducers/server-action-reducer.ts
    // In browser component tests there is no Next HTTP server, so this
    // adapts only that internal action POST back into the in-process RSC
    // renderer while leaving normal user/MSW fetches alone.
    if (method === "POST" && actionId) {
      const reply = init?.body ?? (request ? await request.clone().formData() : undefined);
      const response = await fetchRsc({ id: actionId, reply, requestType: "next-action" });
      if (response instanceof Response) {
        return response;
      }
      return new Response(response, {
        headers: { "content-type": "text/x-component" },
      });
    }

    return originalFetch(input, init);
  };
  globalThis.fetch = bridgedFetch;

  return () => {
    if (globalThis.fetch === bridgedFetch) {
      globalThis.fetch = originalFetch;
    }
  };
}

async function callNextServerAction(id: string, args: unknown[]) {
  const [{ dispatchAppRouterAction }, { ACTION_SERVER_ACTION }] = await Promise.all([
    import("next/dist/client/components/use-action-queue.js"),
    import("next/dist/client/components/router-reducer/router-reducer-types.js"),
  ]);

  // Mirrors Next's app-call-server.ts, but this is imported from the browser
  // client environment so React resolves to the client build with
  // startTransition:
  // https://github.com/vercel/next.js/blob/938c286bac984aa7275bb4c18aa0c154b443aa93/packages/next/src/client/app-call-server.ts
  return new Promise((resolve, reject) => {
    React.startTransition(() => {
      dispatchAppRouterAction({
        type: ACTION_SERVER_ACTION,
        actionId: id,
        actionArgs: args,
        resolve,
        reject,
      });
    });
  });
}
