import "./globals.ts";
import { PageStore } from "./page-store.ts";
import { registry, type Opened } from "./registry.ts";
import { takesRequest } from "./server-in-front.ts";
import { loadedSsrLayer, ssrLayer } from "./server-layers.ts";

// The tab's requests to the app: which ones are the app's, what a browser
// sends with them, and who answers them. Evaluating this module installs
// the `fetch` of the browser and the one of the server, and the page's
// `document.cookie`: both entries of the plugin import it, see index.ts and
// client-components.ts.
//
// What a request of the app waits for: the ssr layer, which the first one
// that the server handles starts to load, if the entry of the host has not,
// see server-layers.ts. Nothing else does. Which requests are the app's is
// the document's to say, without the ssr layer: see `takesRequest()`. So
// the host's own requests go to the network at once, and leaving a page
// before the layer is there has no request of the server to settle, nor a
// cache to forget.

type SsrLayer = Awaited<ReturnType<typeof ssrLayer>>;
// Changes each time leaving a page settles the server, also with no page
// open: see `handledByServer()`.
let generation = 0;

// What Next's server answers a request with, once the ssr layer is there. A
// request that waited for the layer while a page was left is one of that
// page, and is dropped, as `settleRequests()` in ssr.ts drops one that waited
// for the server then. A layer that failed to load fails the request.
async function handledByServer(
  ...[request, options]: Parameters<SsrLayer["handleRequest"]>
): Promise<Response | undefined> {
  const loaded = loadedSsrLayer();
  if (loaded) return loaded.handleRequest(request, options);
  const sent = generation;
  const layer = await ssrLayer();
  if (sent !== generation) {
    throw new DOMException("The page was left before the server responded.", "AbortError");
  }
  return layer.handleRequest(request, options);
}

/**
 * Settles the requests of a page that is left: the ones that wait for the
 * server, and the ones that wait for the ssr layer to load, are dropped.
 */
export async function settleRequests(): Promise<void> {
  generation++;
  await loadedSsrLayer()?.settleRequests();
}

const nativeFetch = globalThis.fetch;

// The origin of the app is also the origin of the dev server, which serves the
// modules of the test and of the app. So a same-origin `fetch` is the app's
// when Next's router or a Server Action sends it, which mark their requests,
// or when the server in front of the app has something for it: see
// `takesRequest()`. Everything else goes to the network.
type AppRequest = {
  url: URL;
  method: string;
  headers: Headers;
  /** Sent by Next itself: it gets the not-found page where the app has no route. */
  marked: boolean;
};

function sameOriginRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): AppRequest | undefined {
  const request = input instanceof Request ? input : undefined;
  const url = new URL(request ? request.url : String(input), window.location.href);
  if (url.origin !== window.location.origin) return;
  const headers = new Headers(init?.headers ?? request?.headers);
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  return { url, method, headers, marked: headers.has("rsc") || headers.has("next-action") };
}

// The headers and the cookies of the browser's requests to the app: the
// `headers` of `renderServer()`, until the test opens something else, and the
// app's cookies, until the test ends. `document.cookie` is a view of the
// cookies. See page-store.ts.
//
// A plain value, not a store of the plugin's AsyncLocalStorage: what sends a
// request, like a click or a timer of the app, runs outside any scope of it.
// The document has one page open at a time, so there is one store. The
// requests of a page that overlap, like a streamed response and a Server
// Action, share it, as they share the cookies of a browser. A request takes
// the store once, when it starts, and writes the cookies it gets to that one.
// `cleanup()` makes a new one: a request that answers after its test does not
// write to the next test's.
let store = new PageStore();

/** The store of the requests that start now. */
export function pageStore(): PageStore {
  return store;
}

/** Forgets the headers and the cookies: the requests from here on take a new store. */
export function newPageStore(): void {
  store = new PageStore();
}

// The page of the app that is open, which Next's requests are of: see the
// browser's `fetch` below. Without one, a request of Next's has no page to
// hear it.
let page: object | undefined;

/** Says which page of the app is open: none once it is left. */
export function openedPage(opened: object | undefined): void {
  page = opened;
}

// What a browser adds to a request for the app's origin, with the headers and
// the cookies of the store. A request with `credentials: "omit"` has none of
// the cookies.
function browserHeaders(
  headers: Headers,
  url: URL,
  method: string,
  from: PageStore,
  credentials = true,
): Headers {
  headers.set("host", url.host);
  from.headers.forEach((value, name) => {
    if (!headers.has(name)) headers.set(name, value);
  });
  if (!headers.has("user-agent")) headers.set("user-agent", navigator.userAgent);
  if (method !== "GET" && method !== "HEAD" && !headers.has("origin")) {
    headers.set("origin", url.origin);
  }
  // A `cookie` header of the request's own is the test's, for that request
  // alone: the `fetch` of a browser drops one. Else the cookies of the store.
  if (credentials && !headers.has("cookie")) {
    const cookie = from.cookieHeader();
    if (cookie) headers.set("cookie", cookie);
  }
  return headers;
}

// A page of another origin is not the app's: a browser would leave the app for
// it, and this document has the test to keep.
export function leftTheApp(url: URL): Error {
  return new Error(
    `vitest-plugin-rsc: the app navigated to another origin: ${url.href}. ` +
      `A browser would leave the app for it, which a test cannot do.`,
  );
}

// As with `fetch`, what waits on a signal rejects as soon as it aborts, with
// its reason. The answer may still come, or fail: a render that goes on
// without its request fails in its own ways. Nobody reads that answer, and
// `abandon` lets go of what it started.
export function unlessAborted<T>(
  answer: Promise<T>,
  signal: AbortSignal,
  abandon: (answer: Promise<T>) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      reject(signal.reason);
      answer.catch(() => {});
      abandon(answer);
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    answer.then(
      (response) => {
        signal.removeEventListener("abort", abort);
        resolve(response);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

type Sending = {
  /**
   * The store of the page, as it was when the request started: what it sends
   * besides its own headers, and where the cookies of its responses go. None
   * for a request the server makes to itself while it handles another. That
   * one carries the headers it was given, cookies included, and does not wait
   * for the request it is part of.
   */
  from: PageStore | undefined;
  /**
   * Whether it sends the cookies of the store and keeps the ones it gets: not
   * with `credentials: "omit"`. A `cookie` header of its own it sends either way.
   */
  credentials?: boolean;
  /** A page load, which leaves the app when it is redirected to another origin. */
  navigation?: boolean;
  /** Who answers a request that the server has nothing for: see `HandleOptions.unrouted`. */
  network?: () => Promise<Response>;
  /** What the request opens, not after a redirect: see `HandleOptions.opened`. */
  opened?: Opened;
};

// The network between a client and the Next.js server in the browser. For the
// browser it does what a browser does for a same-origin request: send the
// cookies, store the ones that come back, here with the store of the page.
// For either it follows redirects.
export async function sendRequest(
  request: Request,
  { from, credentials = true, navigation = false, network, opened }: Sending,
): Promise<Response> {
  let url = new URL(request.url);
  let method = request.method;
  const sent = new Headers(request.headers);
  // A `cookie` header of the test's own goes with the redirects the request
  // follows, with the cookies those set, as Next sends the cookies of a
  // Server Action with the page it redirects to.
  const own = from && credentials && sent.has("cookie") ? new PageStore() : undefined;
  own?.seed(sent.get("cookie")!);
  // Read once: a 307 or 308 sends the body again.
  let body = request.body ? new Uint8Array(await request.arrayBuffer()) : null;
  let redirected = false;
  // As many as a browser follows.
  let redirects = 0;

  for (;;) {
    const headers = from
      ? browserHeaders(new Headers(sent), url, method, from, credentials)
      : new Headers(sent);
    const response = await unlessAborted(
      handledByServer(
        { url: url.href, method, headers, body, signal: request.signal },
        {
          nested: !from,
          unrouted: network ? "pass" : "not-found",
          opened: redirected ? undefined : opened,
          pageLoad: navigation,
        },
      ),
      request.signal,
      (answer) => void answer.then((late) => late?.body?.cancel()).catch(() => {}),
    );
    if (!response) {
      // After a redirect it is another request than the one that was passed in.
      return redirected
        ? nativeFetch(url, { method, headers: sent, body, signal: request.signal })
        : network!();
    }
    if (credentials) from?.receive(response.headers.getSetCookie());

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      if (request.redirect === "manual") {
        Object.defineProperties(response, { url: { value: url.href } });
        return response;
      }
      if (request.redirect === "error") {
        throw new TypeError("fetch failed", {
          cause: new Error(`unexpected redirect of ${url.href} to ${location}`),
        });
      }
      url = new URL(location, url);
      // As in `fetch`: a 301 or 302 turns a POST into a GET, a 303 anything
      // but a GET or HEAD. The rest repeat the request. The headers of a body
      // go with the body.
      const { status } = response;
      if (
        ((status === 301 || status === 302) && method === "POST") ||
        (status === 303 && method !== "GET" && method !== "HEAD")
      ) {
        method = "GET";
        body = null;
        for (const name of ["encoding", "language", "location", "type"]) {
          sent.delete(`content-${name}`);
        }
      }
      redirected = true;
      if (++redirects > 20) {
        throw new Error(
          `vitest-plugin-rsc: too many redirects for ${request.url}. ` +
            `The last one was to ${url.href}.`,
        );
      }
      if (url.origin !== window.location.origin) {
        if (navigation) throw leftTheApp(url);
        // The credentials of the app's origin are not for another one: `fetch`
        // drops them on such a redirect. A `cookie` header the browser's
        // `fetch` drops itself.
        sent.delete("authorization");
        return nativeFetch(url, { method, headers: sent, body, signal: request.signal });
      }
      if (own) {
        own.receive(response.headers.getSetCookie());
        sent.set("cookie", own.cookieHeader());
      }
      continue;
    }

    Object.defineProperties(response, {
      url: { value: url.href },
      redirected: { value: redirected },
    });
    return response;
  }
}

// What client code gets of a response of the app. A browser never shows a
// script the `Set-Cookie` headers of a response, a forbidden response header:
// they are the store's. `handleRequest()` keeps them, for the test.
function withoutSetCookie(response: Response): Response {
  // Also a response of the network, which is the browser's already.
  if (!response.headers.has("set-cookie")) return response;
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  const { status, statusText, url, redirected } = response;
  return Object.defineProperties(new Response(response.body, { status, statusText, headers }), {
    url: { value: url },
    redirected: { value: redirected },
  });
}

// A `fetch` that sends a same-origin request to the app when it is the app's,
// and everything else to the network.
const appFetch =
  (server: boolean): typeof fetch =>
  async (input, init) => {
    // The store of the page, as the request starts. A server has none.
    const from = server ? undefined : store;
    // A server has no page to resolve a path against: Node's `fetch` rejects it.
    if (server && !(input instanceof Request) && !URL.canParse(String(input))) {
      throw new TypeError(`Failed to parse URL from ${String(input)}`, {
        cause: new TypeError("Invalid URL"),
      });
    }
    const sent = sameOriginRequest(input, init);
    if (!sent) return nativeFetch(input, init);
    // A browser's `fetch` drops a `cookie` header: the cookies are the store's.
    if (from) sent.headers.delete("cookie");
    const credentials =
      (init?.credentials ?? (input instanceof Request ? input.credentials : undefined)) !== "omit";
    const headers = from
      ? browserHeaders(new Headers(sent.headers), sent.url, sent.method, from, credentials)
      : sent.headers;
    if (!sent.marked && !(await takesRequest({ url: sent.url.href, headers }))) {
      return nativeFetch(input, init);
    }
    // After a `redirect()` in a Server Action, Next fetches the page it
    // redirects to from itself, with the headers of its response so far, and
    // renders it into the response of the action: what Next's router shows
    // next. For a request that shows no page, like the one of
    // `runInServerAction()`, the page does not render: an answer without a
    // Flight payload has Next send the redirect alone.
    if (
      server &&
      sent.method === "GET" &&
      sent.headers.get("rsc") === "1" &&
      sent.headers.has("x-action-redirect") &&
      registry.openedByRequest.getStore()?.rendersRedirect === false
    ) {
      return new registry.Response(null, { status: 204 });
    }
    // The request, for the network: a body can be read once.
    const spare = input instanceof Request && input.body ? input.clone() : input;
    // The server's Request keeps a `cookie` header, which a browser's drops.
    const request = server ? new registry.Request(input, init) : new Request(input, init);
    const response = await sendRequest(request, {
      from,
      credentials,
      network: sent.marked ? undefined : () => nativeFetch(spare, init),
    });
    return from ? withoutSetCookie(response) : response;
  };

// What a request of a page that was left gets: nothing, ever. One promise
// per request: a pending promise holds on to what awaits it.
const never = () => new Promise<never>(() => {});

// What a page hears of a request that Next sent for it, one of its router
// or a Server Action: nothing once the page is left, as in a browser, where
// it is gone. Leaving drops the requests that wait for the server
// (`settleRequests()` in ssr.ts), and the router of that page, which is still
// there, would report that as an error while the next page runs: "Failed to
// fetch RSC payload". Nobody reads the body of a response that comes after
// that, so it stops.
async function heardBy(sender: object, response: Promise<Response>): Promise<Response> {
  const answered = await response.catch(() => undefined);
  if (page === sender) return response;
  void answered?.body?.cancel().catch(() => {});
  return never();
}

const browserFetch = appFetch(false);

// The browser's `fetch`: what Next's client router and Client Components call.
// Next marks the requests it sends for a page, with an `rsc` or a
// `next-action` header. They belong to the page that is open as they are
// sent. Its router is there only once its page is, so without a page that
// page was left, and it sends nothing more. A test asks with
// `handleRequest()`.
globalThis.fetch = async (input, init) => {
  if (!sameOriginRequest(input, init)?.marked) return browserFetch(input, init);
  const sender = page;
  return sender ? heardBy(sender, browserFetch(input, init)) : never();
};
// A script of the page reads and writes the app's cookies with
// `document.cookie`, as in a browser, where it is a view of the cookie jar.
// The jar here is the store, and the browser's own is the tab's: the cookies
// other documents of the origin set, like Vitest's UI, the manager document
// of another host or another app on `localhost`. The app neither reads nor
// writes those.
Object.defineProperty(document, "cookie", {
  configurable: true,
  get: () => store.documentCookie(),
  set: (cookie: unknown) => store.write(String(cookie)),
});
// The Cookie Store API is a view of the browser's own jar, so the page has
// none, as in a browser without it. Code that uses it checks for it first,
// like Next's own.
for (const name of ["cookieStore", "CookieStore", "CookieChangeEvent"]) {
  Reflect.deleteProperty(window, name);
}
// The server's `fetch`. A request to the app itself is one the server makes
// while it handles another: Next renders the page a Server Action redirects
// to that way. It is chosen as the browser's is, and goes through the proxy
// too. Its redirects are followed, as the `fetch` of a server follows them.
registry.fetch = appFetch(true);
// Where the server reaches itself, which `next start` sets too. Next reads it
// when it needs it, from the global `process`.
process.env.__NEXT_PRIVATE_ORIGIN = window.location.origin;
