import { createNavigation } from "./navigation-shim.ts";
import { channelTo } from "./node-channel.ts";
import "./node-dom.ts";
import type { PageHost, WebApis } from "./page-host.ts";
import { runtimeRequestInit } from "./runtime-request-init.ts";

// The host of a page in a worker of Node.js, with a DOM of happy-dom or
// jsdom: Vitest without Browser Mode, which has no WebSocket to the dev
// server: its channel is the plugin's own listener of HTTP on the loopback
// (node-channel.ts). The plugin makes the host with the listener's origin
// (index.ts).

// What worker-web-apis.ts kept of Node's own, as Vitest loads it first in the
// worker (index.ts).
const webApisKey = Symbol.for("vitest-plugin-rsc:worker-web-apis");
const webApis: WebApis =
  (globalThis as unknown as Record<PropertyKey, WebApis | undefined>)[webApisKey] ??
  missingWebApis();

function missingWebApis(): never {
  throw new Error(
    "vitest-plugin-rsc: the worker of Node.js did not load the plugin's worker-web-apis.ts first, " +
      "which keeps the web APIs of Node.js for the server, before the DOM replaces them.",
  );
}

// What happy-dom's window has of its own: the settings of its browser, which
// its `Fetch` reads at every request, its interceptor among them.
type HappyDom = {
  settings: {
    fetch: {
      interceptor: {
        beforeAsyncRequest?: (context: { request: Request }) => Promise<Response | void>;
      } | null;
    };
  };
};
const happyDom = (window as unknown as { happyDOM?: HappyDom }).happyDOM;

// With happy-dom, the page's fetch API is the DOM's own, as a browser's is
// the page's: its `fetch`, `XMLHttpRequest` and the resources it loads go
// through its `Fetch`, whose interceptor hands the app's requests to the
// server (`interceptRequests()`), and sends the rest to the network itself.
//
// jsdom has none of its own: there the page's fetch API is Node's, which
// sends what the page sends to the app or to Node's `fetch`. The DOM keeps
// its own `FormData`, which reads a form, and its `Blob`, `File` and
// `AbortController`: a request of the page takes them as Node's. A body that
// the page's `Response` reads stays Node's: see "What a DOM of Node.js does
// otherwise than a browser" in docs/internals/architecture.md.
if (!happyDom) {
  const scope = globalThis as unknown as Record<string, unknown>;
  const { Request: NodeRequest, fetch: nodeFetch } = webApis;

  // A `Request` of the page, as a browser's: a relative URL is of the page,
  // and a body or a signal of the DOM's is one of Node's. Any request is one.
  class PageRequest extends NodeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(
        input instanceof NodeRequest ? input : new URL(String(input), location.href),
        runtimeRequestInit(init, webApis),
      );
    }

    static override [Symbol.hasInstance](value: unknown): boolean {
      return Function.prototype[Symbol.hasInstance].call(
        this === PageRequest ? NodeRequest : this,
        value,
      );
    }
  }

  scope.Request = PageRequest;
  scope.Response = webApis.Response;
  scope.Headers = webApis.Headers;
  scope.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    nodeFetch(new PageRequest(input, init));
}

// The statuses whose response has no body, which the DOM's `Response` takes
// none for.
const nullBodyStatuses = new Set([101, 103, 204, 205, 304]);

// A response of the server, or of Node's `fetch` after a redirect away from
// the app, as one of the DOM's: what the page reads, `instanceof` included,
// is the DOM's own. Its `Set-Cookie` headers, which a browser never shows a
// page, stay the server's.
function pageResponse(response: Response): Response {
  // Of the DOM's already, like one without `Set-Cookie` that the page made.
  if ((response as unknown) instanceof window.Response) return response;
  const headers = new window.Headers();
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") headers.append(name, value);
  });
  const { status, statusText, url, redirected } = response;
  const body = nullBodyStatuses.has(status) ? null : response.body;
  return Object.defineProperties(new window.Response(body, { status, statusText, headers }), {
    url: { value: url },
    redirected: { value: redirected },
  });
}

// The DOM has no Navigation API: see navigation-shim.ts.
const navigation = createNavigation(window);

/** The host of the page, whose dev server listens at `origin`. */
export function nodeHost(origin: string): PageHost {
  const { request, listen } = channelTo(origin);
  return {
    request,
    listen,
    navigation,
    loadsStylesheets: false,
    serverWebApis: webApis,
    interceptRequests: (answer) => {
      if (!happyDom) return false;
      happyDom.settings.fetch.interceptor = {
        beforeAsyncRequest: async ({ request }) => {
          const response = await answer(request);
          return response && pageResponse(response);
        },
      };
      return true;
    },
  };
}
