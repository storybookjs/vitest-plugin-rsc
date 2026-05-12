import type { FetchRsc } from "../testing-library-client";

export function createServerActionCaller({ fetchRsc }: { fetchRsc: FetchRsc }) {
  const fetchRscSymbol = Symbol.for("vitest-plugin-rsc.nextjs.fetchRsc");
  const globalScope = globalThis as typeof globalThis & Record<symbol, FetchRsc | undefined>;
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
