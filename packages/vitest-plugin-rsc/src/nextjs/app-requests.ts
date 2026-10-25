import "./globals.ts";
import pageHost from "virtual:vitest-plugin-rsc/page-host";
import { runtimeRequestInit } from "../runtime-request-init.ts";
import { speedFeature } from "./speed-features.ts";
import { PageStore } from "./page-store.ts";
import { registry, type Opened } from "./registry.ts";
import { takesRequest } from "./server-in-front.ts";
import { loadedSsrLayer, ssrLayer } from "./server-layers.ts";

// The tab's requests to the app: which ones are the app's, what a browser
// sends with them, and who answers them. Evaluating this module installs
// the `fetch` of the server. The one of the browser, `pageFetch()`, is the
// document's while a browser context of the app is open: see
// browser-context.ts.
//
// What a request of the app waits for: the ssr layer, which the first one
// that the server handles starts to load, if the entry of the host has not,
// see server-layers.ts. Nothing else does. Which requests are the app's is
// the document's to say, without the ssr layer: see `takesRequest()`. So
// the host's own requests go to the network at once, and leaving a page
// before the layer is there has no request of the server to settle, nor a
// cache to forget.

type SsrLayer = Awaited<ReturnType<typeof ssrLayer>>;

// The headers of the requests to the app and of its answers are the server's
// (page-host.ts): in a browser the page's own, in a DOM of Node.js Node's,
// whatever the page's are by then, like a patch of a mock of the network.
// And the requests of the server to the network are the server's: in a DOM of
// Node.js the page's `Request` is the DOM's, like happy-dom's.
const { Headers, Request: ServerNativeRequest } = pageHost.serverWebApis;

// Whether `value` is a request, of the page's web APIs or of the server's.
const isRequest = (value: unknown): value is Request =>
  value instanceof Request || value instanceof ServerNativeRequest;

// What Next's server answers a request with, once the ssr layer is there.
// As with `fetch`, a request whose signal has aborted is not sent: the
// document of a page load that was left while it waited for the layer, as a
// host cleans up before what it shows next. Every other request that waited
// is sent, like one of the host's own that the proxy runs on. A request of a
// page that was left once the layer is there, the server drops: see
// `settleRequests()` in ssr.ts. A layer that failed to load fails the
// request.
async function handledByServer(
  ...[request, options]: Parameters<SsrLayer["handleRequest"]>
): Promise<Response | undefined> {
  const layer = loadedSsrLayer() ?? (await ssrLayer());
  request.signal?.throwIfAborted();
  return layer.handleRequest(request, options);
}

// The network, for what is not the app's: the browser's own `fetch`.
const nativeFetch = registry.network;

// The browser's `fetch`, for a request of the server to the network. Next's
// `fetch` makes a `Request` that it is given again, with its body as a
// stream, and a browser sends a stream over HTTP/2 only: over HTTP/1.1 it
// fails with "Failed to fetch", where Node's `fetch` sends it. So the body
// goes read, the same bytes. A request without a body goes as it is. Not for
// the page's own requests: a browser's `fetch` is what they have.
async function networkFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!init?.body && !(isRequest(input) && input.body)) return nativeFetch(input, init);
  const request = new ServerNativeRequest(input, runtimeRequestInit(init, pageHost.serverWebApis));
  // A request with a body, so not a GET.
  // oxlint-disable-next-line unicorn/no-invalid-fetch-options
  return nativeFetch(new ServerNativeRequest(request, { body: await request.arrayBuffer() }));
}

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
  const request = isRequest(input) ? input : undefined;
  const url = new URL(request ? request.url : String(input), window.location.href);
  // A Blob URL has the origin of the document that made it, and is the
  // document's own, like a `data:` URL: the browser answers it at once.
  if (url.origin !== window.location.origin || url.protocol === "blob:") return;
  const headers = new Headers(init?.headers ?? request?.headers);
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  return { url, method, headers, marked: headers.has("rsc") || headers.has("next-action") };
}

// The signal of the page of the app that is open, which Next's requests are
// of: see the browser's `fetch` below. It aborts as the page is left, and
// goes once the page is. Without a page, a request of Next's has none to
// hear it.
let page: AbortSignal | undefined;
// Whether the router of a page outlives it: in the kept app of `keepApp` (see
// `renderAgain()` in client.tsx) the modules of Next's router stay, and so
// does what they count, like the prefetches in flight. A request that never
// settles would count for good, so one of a page that was left fails as the
// page is left, as a browser stops the requests of a page it unloads. The
// page says so first, with `pagehide`, as a browser's does: Next's router
// reports no failure of a request then (see `leave()` of `Page` in page.ts).
// Not a Server Action: Next rejects the call of the action with its failure,
// and code that does not wait for the call, like `onClick={() => action()}`,
// would reject unhandled. It hears nothing, as without `keepApp`: the queue
// it waits in is its page's alone, which no page after it uses.
let routerOutlivesPage = false;

/** Says which page of the app is open, by its signal, which aborts as it is left. */
export function setOpenPage(signal: AbortSignal | undefined): void {
  page = signal;
}

/** Says whether the router of the pages outlives them, from now on. */
export function setRouterOutlivesPage(outlives: boolean): void {
  routerOutlivesPage = outlives;
}

// What a request of a page that was left gets, from the router that sent it:
// see `routerOutlivesPage`. `action` for a Server Action.
const pageLeft = () => new DOMException("The page was left.", "AbortError");
const failsAsPageLeft = (action: boolean) => routerOutlivesPage && !action;
function ofLeftPage(action: boolean): Promise<never> {
  return failsAsPageLeft(action) ? Promise.reject(pageLeft()) : never();
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

export type Sending<Passed = never> = {
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
  /**
   * A page load, which leaves the app when it is redirected to another
   * origin: one that the test opens, or one of the app's own, sent while the
   * page before it is still open (see `navigate()` in page.ts). That one
   * opens nothing of what the test opened, also after a redirect, and
   * starts no files of its route, which leaving that page would take back.
   * What it opens is its `opened`, after a redirect too: from a page of fast
   * mode's kept app, a page without HTML.
   */
  navigation?: "test" | "app";
  /** Who answers a request that the server has nothing for: see `HandleOptions.unrouted`. */
  network?: () => Promise<Response | NoInfer<Passed>>;
  /** What the request opens, not after a redirect: see `HandleOptions.opened`. */
  opened?: Opened;
};

// The network between a client and the Next.js server in the browser. For the
// browser it does what a browser does for a same-origin request: send the
// cookies, store the ones that come back, here with the store of the page.
// For either it follows redirects.
export async function sendRequest<Passed extends undefined = never>(
  request: Request,
  { from, credentials = true, navigation, network, opened }: Sending<Passed>,
): Promise<Response | NoInfer<Passed>> {
  let url = new URL(request.url);
  let method = request.method;
  // The request's own headers, until a redirect changes what it sends.
  let sent = request.headers;
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
    // What a page load of the app opens, at the URL it is at by now.
    const appOpened = opened ? { ...opened, pathname: url.pathname } : null;
    const response = await unlessAborted(
      handledByServer(
        { url: url.href, method, headers, body, signal: request.signal },
        {
          nested: !from,
          unrouted: network ? "pass" : "not-found",
          opened: navigation === "app" ? appOpened : redirected ? undefined : opened,
          pageLoad: navigation === "test",
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
      if (!redirected) sent = new Headers(sent);
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

// What client code gets of a response of the app: one of the page's own web
// APIs, without its `Set-Cookie` headers. A browser never shows a script
// those, a forbidden response header: they are the store's. `handleRequest()`
// keeps them, for the test. In a DOM of Node.js the server's response is
// Node's, where the page's are the DOM's, like happy-dom's.
function pageResponse(response: Response): Response {
  if (response instanceof Response && !response.headers.has("set-cookie")) return response;
  // As a list: the DOM's `Response` reads no `Headers` of another realm.
  const headers = [...response.headers].filter(([name]) => name !== "set-cookie");
  const { status, statusText, url, redirected } = response;
  return Object.defineProperties(new Response(response.body, { status, statusText, headers }), {
    url: { value: url },
    redirected: { value: redirected },
  });
}

// What a request that is not the app's goes to: a `fetch`, or, where the DOM
// hands the page's requests over (`interceptRequests()` of page-host.ts), one
// that answers none, and the DOM sends it.
type Network<Passed> = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response | Passed>;

// A `fetch` that sends a same-origin request to the app when it is the app's,
// and everything else to `network`. The browser's sends the headers and the
// cookies of `store()`, the store of the page as the request starts.
//
// `sent` is what `sameOriginRequest()` made of the request, undefined for
// one of another origin. Its caller makes it, once per `fetch`: the
// browser's `fetch`, `pageFetch()`, reads it too, to tell Next's own
// requests, and the server's makes it after its check of the URL. Reading
// the URL and the headers again would build both a second time.
type SameOriginFetch<Passed> = (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  sent: AppRequest | undefined,
) => Promise<Response | Passed>;

const appFetch =
  <Passed extends undefined>(
    store: (() => PageStore) | undefined,
    network: () => Network<NoInfer<Passed>>,
  ): SameOriginFetch<Passed> =>
  async (input, init, sent) => {
    const server = !store;
    // A server has no store.
    const from = store?.();
    if (!sent) return network()(input, init);
    const credentials =
      (init?.credentials ?? (isRequest(input) ? input.credentials : undefined)) !== "omit";
    if (!sent.marked) {
      // A browser's `fetch` drops a `cookie` header: the cookies are the store's.
      if (from) sent.headers.delete("cookie");
      const headers = from
        ? browserHeaders(sent.headers, sent.url, sent.method, from, credentials)
        : sent.headers;
      if (!(await takesRequest({ url: sent.url.href, headers }))) return network()(input, init);
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
    const spare = isRequest(input) && input.body ? input.clone() : input;
    // The server's Request keeps a `cookie` header, which a browser's drops.
    const request = server ? new registry.Request(input, init) : new Request(input, init);
    const response = await sendRequest<Passed>(request, {
      from,
      credentials,
      network: sent.marked ? undefined : () => network()(spare, init),
    });
    return from && response ? pageResponse(response) : response;
  };

// What a request of a page that was left gets: nothing, ever. One promise
// per request: a pending promise holds on to what awaits it.
const never = () => new Promise<never>(() => {});

// A prefetch of Next's router, which the speed feature `skipPrefetch` answers
// itself. Each has `priority: "low"`, and all but the data of a
// `<Link prefetch>` to a route the router knows a `next-router-prefetch`
// header too.
function isPrefetch(sent: AppRequest, init: RequestInit | undefined): boolean {
  return (
    sent.headers.has("rsc") &&
    (sent.headers.has("next-router-prefetch") || init?.priority === "low")
  );
}

// What a prefetch gets with `skipPrefetch`: no content, which the router
// takes for a miss, silently. It marks the prefetch of the route failed for
// a while, and a navigation to it fetches the page, as without a prefetch.
// In production every link that comes into view, and every link the pointer
// of a click passes, is prefetched, and the server takes one request at a
// time: the click of a test waited for them.
const noPrefetch = () => new Response(null, { status: 204 });

// What a page hears of a request that Next sent for it, one of its router
// or a Server Action: nothing once the page is left, as in a browser, where
// it is gone. Leaving drops the requests that wait for the server
// (`settleRequests()` in ssr.ts), and the router of that page, which is still
// there, would report that as an error while the next page runs: "Failed to
// fetch RSC payload". Nobody reads the body of a response that comes after
// that, so it stops.
async function heardBy<Passed extends undefined>(
  sender: AbortSignal,
  response: Promise<Response | Passed>,
  action: boolean,
): Promise<Response | Passed> {
  if (failsAsPageLeft(action)) return failsAsLeft(sender, response);
  const answered = await response.catch(() => undefined);
  if (!sender.aborted) return response;
  void answered?.body?.cancel().catch(() => {});
  return ofLeftPage(action);
}

// For a router that outlives its page: the request fails at once as the page
// is left, while the page still says that it is being left. What answers
// after that is not read.
function failsAsLeft<Passed extends undefined>(
  sender: AbortSignal,
  response: Promise<Response | Passed>,
): Promise<Response | Passed> {
  const left = new Promise<never>((_, reject) =>
    sender.addEventListener("abort", () => reject(pageLeft()), { once: true }),
  );
  left.catch(() => {});
  void response.then(
    (answered) => {
      if (sender.aborted) void answered?.body?.cancel().catch(() => {});
    },
    () => {},
  );
  return Promise.race([response, left]);
}

/**
 * The browser's `fetch` while a browser context of the app is open: what
 * Next's client router and Client Components call. `store()` is the store of
 * the context, and `network()` the `fetch` the document had before it, which
 * gets every request that is not the app's, or, where the DOM hands over the
 * page's requests, one that answers none, for the DOM to send. Without a
 * context, `network()` gets every request: code that took this `fetch` in a
 * context has the document's own after it.
 *
 * Next marks the requests it sends for a page, with an `rsc` or a
 * `next-action` header. They belong to the page that is open as they are
 * sent. Its router is there only once its page is, so without a page that
 * page was left, and it sends nothing more. A test asks with
 * `handleRequest()`.
 */
export function pageFetch<Passed extends undefined = never>(
  store: () => PageStore | undefined,
  network: () => Network<NoInfer<Passed>>,
): Network<Passed> {
  const browserFetch = appFetch<Passed>(() => store()!, network);
  return async (input, init) => {
    if (!store()) return network()(input, init);
    const sent = sameOriginRequest(input, init);
    if (!sent?.marked) return browserFetch(input, init, sent);
    const action = sent.headers.has("next-action");
    const sender = page;
    if (!sender || sender.aborted) return ofLeftPage(action);
    if (speedFeature("skipPrefetch") && isPrefetch(sent, init)) return noPrefetch();
    return heardBy(sender, browserFetch(input, init, sent), action);
  };
}
// The server's `fetch`. A request to the app itself is one the server makes
// while it handles another: Next renders the page a Server Action redirects
// to that way. It is chosen as the browser's is, and goes through the proxy
// too. Its redirects are followed, as the `fetch` of a server follows them.
const serverFetch = appFetch<never>(undefined, () => networkFetch);
registry.fetch = async (input, init) => {
  // A server has no page to resolve a path against: Node's `fetch` rejects it.
  if (!isRequest(input) && !URL.canParse(String(input))) {
    throw new TypeError(`Failed to parse URL from ${String(input)}`, {
      cause: new TypeError("Invalid URL"),
    });
  }
  return serverFetch(input, init, sameOriginRequest(input, init));
};
// Where the server reaches itself, which `next start` sets too. Next reads it
// when it needs it, from the global `process`.
process.env.__NEXT_PRIVATE_ORIGIN = window.location.origin;
