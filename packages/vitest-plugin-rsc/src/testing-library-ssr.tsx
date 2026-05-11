import * as React from "react";
import * as ReactDOMServer from "react-dom/server.browser";
import * as ReactClient from "@vitejs/plugin-rsc/react/ssr";
import type { RscPayload } from "./testing-library-client";

let ssrRequire: unknown;

export async function renderToHtml(stream: ReadableStream<Uint8Array>) {
  const previousRequire = globalThis.__vite_rsc_client_require__;
  globalThis.__vite_rsc_client_require__ = ssrRequire;
  try {
    const payload = ReactClient.createFromReadableStream<RscPayload>(stream);

    function Root() {
      return React.use(payload).root;
    }

    const htmlStream = await ReactDOMServer.renderToReadableStream(<Root />);
    return await new Response(htmlStream).text();
  } finally {
    globalThis.__vite_rsc_client_require__ = previousRequire;
  }
}

export function initialize() {
  if (ssrRequire) return;

  ReactClient.setRequireModule({
    load: (id) => import(/* @vite-ignore */ id),
  });
  ssrRequire = globalThis.__vite_rsc_client_require__;
}

declare global {
  var __vite_rsc_client_require__: unknown;
}
