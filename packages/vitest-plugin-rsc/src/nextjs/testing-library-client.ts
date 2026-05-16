import type { ServerActionCaller } from "../testing-library-client.tsx";

export type NextActionRequest = {
  id: string;
  reply: string | FormData;
  requestType: "next-action";
  routerState?: string | null;
  nextUrl?: string | null;
};

export type NextRouteRequest = {
  requestType: "next-route";
  url: string;
  routerState?: string | null;
  nextUrl?: string | null;
};

export type FetchNextRsc = (request: NextActionRequest | NextRouteRequest) => Promise<Response>;

export function createServerActionCaller({
  fetchRsc,
}: {
  fetchRsc: FetchNextRsc;
}): ServerActionCaller {
  const fetchRscSymbol = Symbol.for("vitest-plugin-rsc.nextjs.fetchRsc");
  const globalScope = globalThis as typeof globalThis & Record<symbol, FetchNextRsc | undefined>;
  globalScope[fetchRscSymbol] = fetchRsc;

  return {
    call: callNextServerAction,
    cleanup: () => {
      if (globalScope[fetchRscSymbol] === fetchRsc) {
        delete globalScope[fetchRscSymbol];
      }
    },
  };
}

async function callNextServerAction(id: string, args: unknown[]) {
  const { callServer } = await import("next/dist/client/app-call-server.js");
  return callServer(id, args);
}
