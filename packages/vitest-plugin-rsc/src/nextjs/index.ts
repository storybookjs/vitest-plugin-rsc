// Types `import.meta.hot` and `import.meta.env` below, as Vite gives them a
// module, without the rest of `vite/client`. The emitted .d.ts does not
// carry it.
/// <reference types="vite/types/importMeta.d.ts" />
import "./globals.ts";
import { createElement, type JSXElementConstructor, type ReactNode } from "react";
import { resetAsyncLocalStorage } from "../async-local-storage.ts";
import { checkFetchedModules, createEnvironmentRunner, environmentModule } from "../utils.ts";
import { callServerWithoutPage } from "./client-graph.ts";
import { documentUrl, loadDocument, unloadDocument } from "./document.ts";
import { recordListeners, recordMessageChannels } from "./leftovers.ts";
import { NodeOnPage } from "./node-on-page.ts";
import { PageStore } from "./page-store.ts";
import { openedAt, registry, type Opened } from "./registry.ts";
import { takesRequest } from "./server-in-front.ts";
import { ssrLayer } from "./server-layers.ts";

export { loadClientModule } from "./client-graph.ts";

// What a request of the app waits for: the ssr layer, which starts to load
// as this module evaluates, see server-layers.ts. Nothing else does. The
// server in front of the app is the document's, and says without a layer
// which requests are the app's: see `takesRequest()`. So the host's own
// requests go to the network at once, and leaving a page before the layer
// is there has no request of the server to settle, nor a cache to forget.
type SsrLayer = Awaited<typeof ssrLayer>;
let ssr: SsrLayer | undefined;
void ssrLayer.then(
  (layer) => (ssr = layer),
  () => {},
);
// How many pages were left: see `serverHandles()`.
let pagesLeft = 0;

// Hands a request to Next's server, once the ssr layer is there. A request
// that waited for the layer while a page was left is one of that page, and is
// dropped, as `settleRequests()` in ssr.ts drops one that waited for the
// server then. A layer that failed to load fails the request.
async function serverHandles(
  ...[request, options]: Parameters<SsrLayer["handleRequest"]>
): Promise<Response | undefined> {
  if (ssr) return ssr.handleRequest(request, options);
  const sent = pagesLeft;
  const layer = await ssrLayer;
  if (sent !== pagesLeft) {
    throw new DOMException("The page was left before the server responded.", "AbortError");
  }
  return layer.handleRequest(request, options);
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

// What was in the browser's storage before the app ran, and what another
// document of the origin stores in it later, like Vitest's UI or the manager
// document of another host: the host's to keep. The app runs in this
// document, and a document gets no `storage` event for its own writes. What
// the other document removes is no longer the host's.
const storages = new Map(
  [localStorage, sessionStorage].map((storage) => [storage, new Set(Object.keys(storage))]),
);
window.addEventListener("storage", ({ key, newValue, storageArea }) => {
  const keys = storageArea && storages.get(storageArea);
  if (!keys) return;
  if (key === null) keys.clear();
  else if (newValue === null) keys.delete(key);
  else keys.add(key);
});

// The keys that the host says are its own, by call: see `keepStorageKeys()`.
const hostKeys = new Set<readonly string[]>();
const isHostKey = (key: string) =>
  [...hostKeys].some((keys) =>
    keys.some((name) => (name.endsWith("*") ? key.startsWith(name.slice(0, -1)) : key === name)),
  );

/**
 * Says that keys of the browser's storage are the host's, so `cleanup()`
 * keeps them, in `localStorage` and `sessionStorage`. For what the host
 * stores while the app runs: in this document, which gets no `storage` event
 * for its own writes, or in another document just before a cleanup, as a
 * `storage` event comes later than the write. A key that ends in `*` is every
 * key that starts with what is before it. What was there before the app ran,
 * and what another document stores that this one has heard of, is kept
 * without it. Returns a function that takes these keys back: from then on
 * they are the app's again, unless another call names them.
 */
export function keepStorageKeys(keys: string[]): () => void {
  const declared = [...keys];
  hostKeys.add(declared);
  return () => void hostKeys.delete(declared);
}

// Removes what the app put in the browser's storage: what is not the host's.
function forgetStorage(): void {
  for (const [storage, keys] of storages) {
    for (const key of Object.keys(storage)) {
      if (!keys.has(key) && !isHostKey(key)) storage.removeItem(key);
    }
  }
}
// Also when the document goes without `cleanup()`, like an iframe that is
// taken out of its page: every other document of the origin heard of what
// the app stored, and would keep it as the host's, also after a reload. So a
// reload starts without it, as a test does.
window.addEventListener("pagehide", forgetStorage);

// A page of another origin is not the app's: a browser would leave the app for
// it, and this document has the test to keep.
function leftTheApp(url: URL): Error {
  return new Error(
    `vitest-plugin-rsc: the app navigated to another origin: ${url.href}. ` +
      `A browser would leave the app for it, which a test cannot do.`,
  );
}

// A navigation without a page of the app, which has the router: see the
// listener of `navigate` below.
function noRouter(url: URL): Error {
  return new Error(
    `vitest-plugin-rsc: a link or a form navigated to ${url.href}, and there is no page of the ` +
      `app to navigate in: no page of renderServer() is open, and a test file with "use client" ` +
      `has none. Test navigation in a page of renderServer(), in a test file without "use client".`,
  );
}

// As with `fetch`, what waits on a signal rejects as soon as it aborts, with
// its reason. The answer may still come, or fail: a render that goes on
// without its request fails in its own ways. Nobody reads that answer, and
// `abandon` lets go of what it started.
function unlessAborted<T>(
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
async function sendRequest(
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
      serverHandles(
        { url: url.href, method, headers, body, signal: request.signal },
        {
          nested: !from,
          unrouted: network ? "pass" : "not-found",
          opened: redirected ? undefined : opened,
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

/**
 * Sends a request to the Next.js server of the app, like `fetch` from a page
 * of the app would. Use it to assert on a response itself: its status, its
 * headers, its HTML or Flight body.
 *
 * The request carries the app's cookies and the `headers` of what
 * `renderServer()` opened, under its own. A `cookie` header is sent instead
 * of the app's cookies, with this request and the redirects it follows. The
 * cookies the server sets are the app's from then on:
 * `response.headers.getSetCookie()` has them, where the `fetch` of the page
 * does not show them.
 * One to the pathname of what `renderServer()` opened is that page's, as a
 * `fetch` of the page is: it gets the route of the node, and skips the proxy
 * if the page does.
 *
 * Ask the server yourself with this, not with `fetch`: a `fetch` with Next's
 * `rsc` or `next-action` header is Next's. It is the page's that is open as
 * it is sent, and it never settles once that page is left, or without one.
 */
export function handleRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Not the browser's Request, which drops a `cookie` header.
  const request = new registry.Request(input, init);
  return sendRequest(request, { from: store, credentials: request.credentials !== "omit" });
}

export type RunInServerActionOptions = {
  /**
   * The URL of the page the action is of. Defaults to `/`. For this request
   * its pathname gets a route of its own that renders nothing, with the params
   * the app's route for it has.
   */
  url?: string;
  /**
   * Whether the server in front of the app takes the request: `proxy.ts`, and
   * the `redirects`, `rewrites` and `headers` of `next.config`. Defaults to
   * `false`, as for a node. A redirect there rejects: the action did not run.
   */
  proxy?: boolean;
  /**
   * Headers for the request of the action, next to the ones a browser sends.
   * The ones that make it a Server Action are the plugin's: `accept`,
   * `content-type` and `next-action`. A `cookie` header is sent instead of
   * the app's cookies.
   */
  headers?: HeadersInit;
};

// The functions that `runInServerAction()` runs, by a number of their own.
let serverActionKeys = 0;

/**
 * Runs `action` as a Server Action of the page at `url`, the way Next runs
 * one: in the request of the action, where `cookies()` can be set and
 * `redirect()`, `refresh()` and `after()` work. Resolves with what it
 * returns, and rejects with what it throws, also the error of a `redirect()`.
 * Its arguments and its result are the test's own, not sent through Flight.
 *
 * It sends a Server Action request like the one of Next's router, to a route
 * at `url` that renders nothing, and opens no page: there is no app to start.
 * After a `redirect()` no page renders: open the page the action redirects
 * to in the test. A page that is open stays open. The request carries the app's cookies, the `headers` of
 * what `renderServer()` opened and the ones passed here, and the cookies the
 * action sets are the app's from then on. For code that a Server Action
 * calls; test a form of a page through the page.
 *
 * The function runs in the request, so it cannot send a request to the app
 * itself, which would wait for this one: call the app's code instead.
 */
export async function runInServerAction<T>(
  action: () => T,
  options: RunInServerActionOptions = {},
): Promise<Awaited<T>> {
  // The store of the test that runs the action, also after the `await` below.
  const from = store;
  const url = new URL(options.url ?? "/", window.location.origin);
  if (url.origin !== window.location.origin) {
    throw new Error(
      `vitest-plugin-rsc: a Server Action is of a page of the app, not of ${url.href}`,
    );
  }
  const { runInServerActionOfTest } = await import("./server-action.ts");
  const key = serverActionKeys++;
  const ran: { outcome?: { value: Awaited<T> } | { error: unknown } } = {};
  registry.serverActions.set(key, async () => {
    try {
      ran.outcome = { value: await action() };
    } catch (error) {
      ran.outcome = { error };
      // Next acts on what a Server Action throws: a `redirect()`, a `notFound()`.
      throw error;
    }
  });
  try {
    const headers = new Headers(options.headers);
    headers.set("accept", "text/x-component");
    headers.set("content-type", "text/plain;charset=UTF-8");
    headers.set("next-action", serverActionId(runInServerActionOfTest));
    // Its one argument, encoded as Next's router encodes the arguments of a
    // call: the number of the function to run.
    const request = new registry.Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify([key]),
      // A Server Action answers a `redirect()` itself, without a 3xx.
      redirect: "manual",
    });
    const response = await sendRequest(request, {
      from,
      opened: {
        pathname: url.pathname,
        proxy: options.proxy ?? false,
        node: { ui: null, layouts: false, files: [] },
        rendersRedirect: false,
      },
    });
    if (ran.outcome) {
      // The response, which no page is there to show, is read to its end, as
      // a browser reads it, so that the server has written it. It is short:
      // the route renders nothing, also after a `redirect()`, see `appFetch()`.
      // What fails in it, Next reports itself.
      await response.body?.pipeTo(new WritableStream()).catch(() => {});
    } else {
      // Not the action's: the proxy's, which can be anything.
      await response.body?.cancel();
      const location = response.headers.get("location");
      throw new Error(
        `vitest-plugin-rsc: the Server Action did not run: ${response.url} ` +
          (location ? `redirected to ${location}.` : `responded with ${response.status}.`),
      );
    }
  } finally {
    registry.serverActions.delete(key);
  }
  if ("error" in ran.outcome) throw ran.outcome.error;
  return ran.outcome.value;
}

// The id of a Server Action, which React's server reference carries: what
// Next's router sends in the `next-action` header.
function serverActionId(action: unknown): string {
  const id: unknown = Reflect.get(Object(action), "$$id");
  if (typeof id !== "string") {
    throw new Error(
      "vitest-plugin-rsc: Vite RSC did not compile the plugin's own Server Action. " +
        "Is `vitest-plugin-rsc` excluded from `optimizeDeps`?",
    );
  }
  return id;
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
async function heardBy(sender: Page, response: Promise<Response>): Promise<Response> {
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

// A page that is open, from when its document is there, with the node of
// `renderServer()` on it, and where it reports its errors.
type Page = {
  started: Promise<unknown>;
  unmount(): void;
  nodeOnPage?: NodeOnPage;
  errors: unknown[];
};

let page: Page | undefined;
// Tells a page load that the test has moved on: to another page, or to the
// next test.
let currentLoad: AbortController | undefined;

// What both forms of `renderServer()` send. They differ in what is around it.
type RequestOptions = {
  /** The URL to open. Defaults to `/`. */
  url?: string;
  /**
   * Headers for the requests of the browser to the app, next to the ones a
   * browser sends: the request of the document, and every one after it, like
   * a Server Action, a `router.refresh()`, a navigation or a `fetch`. Until
   * the test opens something else, or ends. A request keeps the headers it
   * sets itself. An `accept` header is for the document alone. A `cookie`
   * header sets those cookies for the app, as a `Set-Cookie` would: they go
   * with the document and the requests after it, until the server or a
   * script of the page changes them, or the test ends.
   */
  headers?: HeadersInit;
  /**
   * Stops the render when it aborts, as it stops a `fetch`: the page load
   * ends, the page is left, and `renderServer()` rejects at once with the
   * signal's reason, an `AbortError` unless it has another. Leaving goes on
   * after that, and the next `renderServer()` or `cleanup()` waits for it.
   * Once `renderServer()` has resolved, the page stays: leave it with
   * `unmount()` or `cleanup()`. An aborted signal opens nothing, and leaves
   * nothing either.
   */
  signal?: AbortSignal;
};

export type RenderServerOptions = RequestOptions & {
  /**
   * Whether the server in front of the app takes the request: `proxy.ts`, and
   * the `redirects`, `rewrites` and `headers` of `next.config`. Defaults to
   * `true`. With `false` the URL goes straight to the app's route for its
   * pathname, and so do the requests the page sends there while it is open:
   * Server Actions and `router.refresh()`. A navigation to another route goes
   * through it, as in the app.
   */
  proxy?: boolean;
  /**
   * Whether the layouts of the app render around the page. Defaults to
   * `true`, and `false` is not supported yet: to render a page on its own,
   * pass it as a node, `renderServer(<Page />, { url })`.
   */
  layouts?: boolean;
};

export type RenderServerResult = {
  /** The server's response to the request of the document. */
  response: Response;
  /**
   * The errors that React reported on the page, in order: what threw as the
   * server or the browser rendered, what an error boundary caught, what a
   * Server Action threw into a form or a transition. Not Next's own, like a
   * `redirect()` or a `notFound()`, which Next does not report either. Empty
   * when nothing failed. A render that fails still opens its page, with
   * Next's error page or the app's `error.tsx`, so `renderServer()` resolves
   * with the error here; it rejects when there is no page to open. The array
   * grows while the page is open, also with the pages the app loads from it,
   * until `unmount()`, `cleanup()` or another `renderServer()` leaves it.
   */
  errors: unknown[];
  /** Leaves the page. The cookies and the `headers` stay until the test ends. */
  unmount(): Promise<void>;
};

// The `unmount()` that `renderServer()` resolves with.
const unmount = () => leavePage("unmount()");

export type RenderComponentOptions = RequestOptions & {
  /**
   * Where the node renders. Defaults to a `<div>` appended to `baseElement`,
   * which `cleanup()` removes. A container of the test's is only emptied.
   */
  container?: HTMLElement;
  /** Defaults to the `container` of the test, or else to `document.body`. */
  baseElement?: HTMLElement;
  /** Wraps the node on the server. It can be a Server Component. */
  wrapper?: JSXElementConstructor<{ children: ReactNode }>;
  /**
   * For another host than Vitest: the files of the host that render the
   * node, for their CSS. A Vitest test never passes it: the plugin's setup
   * file fills in the setup files and the test file. Another host passes
   * the files of its own that render the node: absolute, or from the project
   * root without a leading slash, like `host/button.demo.tsx`. The node has
   * the stylesheets that these files import, as a page has those of its
   * route. What is passed replaces the default, it adds nothing to it. A
   * file that is not the host's, like one of the app, is left out, with a
   * warning. `host.files` of `vitestPluginNext()` says which files are the
   * host's at all, and in a static build only those have stylesheets.
   */
  hostFiles?: string[];
  /**
   * Whether the server in front of the app takes the request: `proxy.ts`, and
   * the `redirects`, `rewrites` and `headers` of `next.config`. Defaults to
   * `false`: the node renders at `url` as it is given, and so do its Server
   * Actions and `router.refresh()`. A navigation to another route goes
   * through it, as in the app.
   */
  proxy?: boolean;
  /**
   * Renders the node in place of the page at `url`, inside the layouts of the
   * app, with the `loading`, `error` and `not-found` of that route. The root
   * layout renders the document, so `container` and `baseElement` cannot be
   * passed, and the `container` in the result is the `<body>`. Defaults to
   * `false`.
   */
  layouts?: boolean;
};

export type RenderComponentResult = RenderServerResult & {
  container: HTMLElement;
  baseElement: HTMLElement;
  /**
   * What the container holds now, as a fragment of its own, for a snapshot.
   * Without the scripts that run, which are Next's and React's.
   */
  asFragment(): DocumentFragment;
  /**
   * Renders `ui` in place of the node, like Testing Library's `rerender`:
   * on the server, in one request of Next's router, as `router.refresh()`
   * sends, and without a page load, so the state of the Client Components in
   * the node stays. `ui` gets the same `wrapper`, and the page keeps its
   * `url`, `headers` and the other options: for others, call
   * `renderServer()`. Resolves once React has committed the new node, or a
   * later one, and run its effects. A Suspense boundary that is new in it
   * may still show its fallback.
   *
   * Every call is a request of its own, and React commits once the last has
   * answered: a host that renders often, as a user types, waits for one call
   * before it makes the next. When the app changes the history without a
   * request while it waits, like a hash link or `history.back()`, Next drops
   * the refresh, and the call waits for the next one.
   *
   * Rejects with a `NodeReplacedError` when something else is in the node's
   * place: an error page, a not-found page, a page the node redirected to,
   * or a route the app navigated to. Its `cause` is the error React reported
   * since the call, if any, which for `notFound()` and `redirect()` is
   * Next's own. In the layouts of a route, an error of a layout or of
   * another slot before the node has hydrated counts as one too. Rejects
   * when the page was left, and with an `AbortError` when it is left while
   * the node renders again.
   */
  rerender(ui: ReactNode): Promise<void>;
};

/**
 * Opens a route of the Next.js app, as a browser does: it requests
 * the document from the server, shows the HTML it gets back, and starts the
 * app's client code, which hydrates it. From there Next's own router is in
 * charge, so links, forms and Server Actions work as they do in the app.
 *
 * With a node, it renders that node in a container, like Testing Library
 * does, on a route of its own: one without the app's layouts, at the URL of
 * `url` with the params the app's route for it has. The request, the cookies,
 * the Server Actions and the router are Next's, as for a page. A navigation
 * to a route of the app loads that page.
 *
 * Two options say how much of the app is around it. `proxy` runs the server
 * in front of the app, `proxy.ts` and the routing of `next.config`, and
 * `layouts` renders the app's layouts. A route has both by default, and a
 * node neither.
 *
 * Resolves once the page has hydrated.
 */
export function renderServer(options: RenderServerOptions): Promise<RenderServerResult>;
export function renderServer(
  ui: ReactNode,
  options?: RenderComponentOptions,
): Promise<RenderComponentResult>;
export async function renderServer(
  ...args: [RenderServerOptions] | [ReactNode, RenderComponentOptions?]
): Promise<RenderServerResult | RenderComponentResult> {
  const [first, second] = args;
  const options: RenderComponentOptions = (isOptions(first) ? first : second) ?? {};
  const { signal } = options;
  // As `fetch` does: before it leaves the page that is open.
  signal?.throwIfAborted();
  const errors: unknown[] = [];
  const url = new URL(options.url ?? "/", window.location.origin);
  const headers = new Headers(options.headers);
  // A `cookie` header sets cookies in the store with the document, and every
  // request sends the cookies of the store: see `loadPage()`.
  const cookie = headers.get("cookie");
  headers.delete("cookie");
  // Each request after the document says itself what it accepts.
  const sticky = new Headers(headers);
  sticky.delete("accept");
  if (!headers.has("accept")) headers.set("accept", "text/html");
  const { pathname } = url;
  if (isOptions(first)) {
    if (first.layouts === false) {
      throw new Error(
        "vitest-plugin-rsc: `renderServer({ url, layouts: false })` is not supported yet. " +
          "To render a page without the layouts of the app, render it as a node: " +
          "`renderServer(<Page />, { url })`.",
      );
    }
    const opened = { pathname, proxy: first.proxy ?? true };
    return {
      response: await loadPage(
        url,
        { headers },
        { opened, headers: sticky, cookie, signal, errors },
      ),
      errors,
      unmount,
    };
  }

  const { wrapper, proxy = false } = options;
  const wrap = (node: ReactNode) => (wrapper ? createElement(wrapper, null, node) : node);
  // The files of the host that render the node, for their stylesheets.
  const files = options.hostFiles ?? registry.nodeFiles?.() ?? [];
  const layouts = options.layouts ?? false;
  const served = { ui: wrap(first), layouts, files, version: 0 };
  const opened: Opened = { pathname, proxy, node: served };
  // The node on its page, which `rerender()` waits for.
  const nodeOnPage = new NodeOnPage(pathname);
  const rerender = (next: ReactNode) => {
    // A navigation of the app on the client, in the layouts of a route, takes
    // the node's place before the node's effects say so.
    nodeOnPage.at(window.location.pathname);
    // The server reads both as it renders the route of the node.
    return nodeOnPage.rerender((version) => Object.assign(served, { ui: wrap(next), version }));
  };
  if (layouts) {
    if (options.container || options.baseElement) {
      throw new Error(
        "vitest-plugin-rsc: with `layouts` a node renders in the document of its route, whose " +
          "root layout has the <html> and the <body>. There is no `container` or `baseElement` " +
          "to pass.",
      );
    }
    const response = await loadPage(
      url,
      { headers },
      { opened, headers: sticky, cookie, nodeOnPage, signal, errors },
    );
    return {
      response,
      errors,
      get container() {
        return document.body;
      },
      get baseElement() {
        return document.body;
      },
      asFragment: () => fragmentOf(document.body),
      unmount,
      rerender,
    };
  }
  // The container becomes the node's: React hydrates all of it, and leaving
  // the node empties it. The document is the test's to keep, and so is a
  // container with content: see `loadPage()`.
  if (options.container === document.body || options.container === document.documentElement) {
    throw new Error(
      "vitest-plugin-rsc: the container of a node cannot be the <body> or the <html> of the " +
        "document, which hold the test's own elements. Pass an element in it, or no container.",
    );
  }
  // Leaving the page that is there takes what was added to the document
  // since it loaded, so the container comes after that. An abort meanwhile
  // rejects at once, and makes no container.
  const left = leavePage("another renderServer()");
  await (signal ? unlessAborted(left, signal, () => {}) : left);
  // A base element of the test's own. Not a body: that is the one of the
  // document, whichever it is by then. A node has a body of its own, and the
  // page after it another.
  const base = options.baseElement instanceof HTMLBodyElement ? undefined : options.baseElement;
  const defaultsToContainer = !options.baseElement && options.container;
  if (options.container && !options.container.isConnected) {
    throw new Error(
      "vitest-plugin-rsc: the container of a node has to be in the document. What is added " +
        "to the document while a page is open is removed when that page is left, so add the " +
        "container after it.",
    );
  }
  const container =
    options.container ?? (base ?? document.body).appendChild(document.createElement("div"));
  if (!options.container) containers.add(container);
  const response = await loadPage(
    url,
    { headers },
    { container, opened, headers: sticky, cookie, nodeOnPage, signal, errors },
  );
  return {
    response,
    errors,
    container,
    get baseElement() {
      return base ?? (defaultsToContainer || document.body);
    },
    asFragment: () => fragmentOf(container),
    unmount,
    rerender,
  };
}

function fragmentOf(container: HTMLElement): DocumentFragment {
  const fragment = document.createRange().createContextualFragment(container.innerHTML);
  // Not the scripts that run: they are how Next and React bring the page to
  // the browser, with a Flight payload that differs on every run. A script of
  // data, like JSON-LD, is content.
  for (const script of fragment.querySelectorAll("script")) {
    if (!script.type || /^(text\/javascript|module)$/i.test(script.type)) script.remove();
  }
  return fragment;
}

// The containers `renderServer()` made for a node, which `cleanup()` removes.
const containers = new Set<HTMLElement>();

// The options, or a node to render. A plain object is never a node: React
// has elements, which carry a `$$typeof`, and the rest are not plain objects.
function isOptions(value: unknown): value is RenderServerOptions {
  if (typeof value !== "object" || value === null || "$$typeof" in value) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// What a test opens: a page, or a node in a container, with the `headers` of
// the requests of the browser after it, and the `cookie` header that sets
// cookies for the app. A page load that the app makes itself, a navigation,
// has no `opening`.
type Opening = {
  container?: Element;
  opened: Opened;
  headers: Headers;
  cookie: string | null;
  /** For a node: what `rerender()` waits for. */
  nodeOnPage?: NodeOnPage;
  /** What stops the load: see `RequestOptions.signal`. */
  signal?: AbortSignal;
  /** Where the page, and the pages the app loads from it, report their errors. */
  errors: unknown[];
};

async function loadPage(url: URL, init: RequestInit, opening?: Opening): Promise<Response> {
  // Where the page reports its errors: to the `renderServer()` that opens
  // it, or for a page the app loads itself, to where the page it replaces
  // reported them: the app loads one only from a page (see the listener of
  // `navigate`). Before leaving, which forgets that page.
  const errors = opening?.errors ?? page?.errors ?? [];
  const leaving = leavePage(opening ? "another renderServer()" : "a page load of the app");
  const load = (currentLoad = new AbortController());
  const loading = (async () => {
    await leaving;
    load.signal.throwIfAborted();

    // Once the node that was in it is gone.
    if (opening?.container?.hasChildNodes()) {
      throw new Error(
        "vitest-plugin-rsc: the container of a node has to be empty. " +
          "The node is hydrated in it, and leaving the node empties it.",
      );
    }
    const opened = (registry.opened = opening?.opened);
    // The store of the test that loads the page, also after the `await`s of
    // `openPage()`. A page the app loads itself keeps the headers of what the
    // test opened.
    const from = store;
    if (opening) {
      from.headers = opening.headers;
      if (opening.cookie !== null) from.seed(opening.cookie);
    }
    try {
      return await openPage(url, init, load.signal, from, errors, opening);
    } catch (error) {
      // A load that failed has no requests left, unless the test has moved on
      // to a page or a node of its own. Only `leavePage()` stops a load. The
      // server may still render the request of a stopped one, so leaving
      // forgets what it opened once that request is done.
      if (opened && registry.opened === opened && !load.signal.aborted) {
        registry.opened = undefined;
      }
      throw error;
    }
  })();
  if (!opening?.signal) return loading;
  // Until the load has settled, the abort leaves its page as another
  // `renderServer()` would, also one that is still loading. Not a page that
  // came after it. A page that cannot be left is reported.
  return unlessAborted(loading, opening.signal, () => {
    if (currentLoad === load) leavePage("the signal of renderServer()").catch(reportError);
  });
}

async function openPage(
  url: URL,
  init: RequestInit,
  signal: AbortSignal,
  from: PageStore,
  errors: unknown[],
  opening: Opening | undefined,
): Promise<Response> {
  // The test has moved on: to another page, or to the next test.
  const superseded = () => signal.throwIfAborted();

  // A page load gets the modules of the server and of the browser layer as
  // the dev server has them now.
  await checkFetchedModules();
  superseded();
  // Not the browser's Request, which drops headers of the test's, like
  // `referer` and `origin`.
  const response = await sendRequest(new registry.Request(url, { ...init, signal }), {
    from,
    navigation: true,
  });
  superseded();
  // A route handler can answer with anything. A browser would show it or
  // download it; there is no app in it to start.
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^text\/html\b/i.test(contentType)) {
    await response.body?.cancel();
    const what = `${response.url} responded with ${contentType || "no content type"}`;
    throw new Error(
      opening
        ? `vitest-plugin-rsc: ${what}, which is not a page to open. ` +
            `Use handleRequest() to assert on the response itself.`
        : `vitest-plugin-rsc: the app navigated to a URL that is not a page: ${what}. ` +
            `A browser would show or download it, which a test cannot do.`,
    );
  }
  // The whole document, then the app: what a browser has once the page has
  // loaded.
  const html = await response.text().catch((error: unknown) => {
    // Leaving the page cuts off the document.
    superseded();
    throw error;
  });
  superseded();
  // The response is the node's when it comes from the node's route and is not
  // a document. A node that redirects gets the page it redirects to, and one
  // that fails to render gets Next's error page, which is a whole document.
  // Those load as the pages they are, and the container stays empty. A page
  // that was redirected is the app's, and so are the requests to it.
  let container = opening?.container;
  if (opening && new URL(response.url).pathname !== opening.opened.pathname) {
    registry.opened = undefined;
    container = undefined;
    opening.nodeOnPage?.replaced();
  }
  if (/^\s*<!doctype/i.test(html)) {
    container = undefined;
    // In the layouts of a route a page is a whole document too. There React
    // reports the error that takes the node's place as the page hydrates.
    if (!opening?.opened.node?.layouts) opening?.nodeOnPage?.replaced();
  }
  await loadDocument(html, response.url, container);
  superseded();
  // A page load runs the app's scripts from scratch, so every page gets a
  // module graph of its own for the browser layer.
  const runner = createEnvironmentRunner("react_client");
  // The browser's Flight client reads properties off `__webpack_require__`
  // when it loads, which is before the page can say how it loads a module,
  // and wraps some of them. One that the pages shared would keep every page.
  registry.browserRequire = (id) => registry.loadBrowserModule(id);
  // React's scheduler, Next's router and Next's dev overlay each leave
  // something behind when they load: see leftovers.ts. That is from here
  // until `start()` says that Next's client has loaded.
  // This assumes that only the plugin's, React's and Next's code runs in that
  // window, and no module of the app: the modules of the app wait for Next's
  // client (see `start()` in client.tsx). A listener or channel
  // of the app's that was added in it would be taken from the app when the
  // page is left.
  const leftovers = [recordListeners(window), recordMessageChannels()];
  const loaded = () => leftovers.forEach((leftover) => leftover.stop());
  // The page counts as open from here, so that leaving it stops it, also
  // while its scripts load and while it hydrates.
  let unmount: (() => void) | undefined;
  let left = false;
  let leave = () => {
    left = true;
    loaded();
  };
  const started = (async () => {
    const client = await runner.import<typeof import("./client.tsx")>(
      environmentModule("react_client", "vitest-plugin-rsc/nextjs/client"),
    );
    superseded();
    return client.start(loaded, container, signal, opening?.nodeOnPage, errors);
  })();
  page = {
    started: started.catch(() => {}),
    unmount: () => leave(),
    nodeOnPage: opening?.nodeOnPage,
    errors,
  };
  try {
    ({ unmount } = await started);
  } catch (error) {
    // Starting an app whose page is gone fails in its own ways.
    superseded();
    throw error;
  } finally {
    loaded();
    leave = () => {
      unmount?.();
      leftovers.forEach((leftover) => leftover.remove());
    };
    if (left) leave();
  }
  superseded();
  return response;
}

// One at a time: a page that is being left is left before the next one is.
let leaving: Promise<void> = Promise.resolve();
// How long leaving a page waits for it to stop starting, at most: less than
// the 30 seconds of a hook in Browser Mode, so that this says why it waits.
const startTimeout = 20_000;
// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;

// Leaves the page that is open: `by` is what leaves it, for its node.
function leavePage(by: string): Promise<void> {
  currentLoad?.abort(new DOMException("The page was left before it had loaded.", "AbortError"));
  currentLoad = undefined;
  const left = page;
  page = undefined;
  left?.nodeOnPage?.left(by);
  // Also after a page that could not be left: that one fails its own test.
  const gone = leaving
    .catch(() => {})
    .then(async () => {
      // An app that is still starting would go on to hydrate the next page
      // with the client code of this one. The abort above stops it, and it is
      // gone once `started` has settled: see `start()` in client.tsx. Until
      // then it may still load Next's client, which reads the payload of the
      // document it finds. Only a load that hangs takes long.
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const stopped = await Promise.race([
        left?.started.then(() => true),
        new Promise<false>((resolve) => (timeout = setTimeout(resolve, startTimeout, false))),
      ]);
      clearTimeout(timeout);
      if (stopped === false) {
        console.warn(
          `vitest-plugin-rsc: the page that was left was still loading its client code ` +
            `${startTimeout / 1000}s later. The next page loads anyway.`,
        );
      }
      try {
        left?.unmount();
      } finally {
        try {
          unloadDocument();
        } finally {
          pagesLeft++;
          await ssr?.settleRequests();
          // What the test opened goes with its page: the route of a node,
          // and a pathname without the proxy.
          registry.opened = undefined;
          // A Server Action has no page to post to until the next one starts.
          globalThis.__viteRscCallServer = callServerWithoutPage;
          resetAsyncLocalStorage();
        }
      }
    });
  leaving = gone;
  return gone;
}

export type CleanupOptions = {
  /**
   * The URL of the document once the page is left: the host's own, like one
   * that says what it shows next. Leaving puts back the URL that the
   * document had as the page opened; this one replaces it, in the same entry
   * of the history, as leaving does. Relative to that URL, and of its
   * origin. Defaults to the URL that leaving puts back.
   */
  url?: string;
};

/**
 * Leaves the page that `renderServer()` opened, removes the containers it made
 * and forgets its `headers`, the app's cookies and what the app put in its
 * storage, like a new browser context. The server forgets what it has cached.
 * Runs before and after every test.
 *
 * What was set on the document, `<html>`, `<head>` and the container of a
 * node while the page was open goes with the page; what the host set there
 * while no page was open stays. So a library that marks the document once,
 * on its first use, is prepared before the first page.
 */
export async function cleanup({ url }: CleanupOptions = {}): Promise<void> {
  await leavePage("cleanup()");
  for (const container of containers) container.remove();
  containers.clear();
  store = new PageStore();
  ssr?.resetCaches();
  forgetStorage();
  if (url !== undefined) window.history.replaceState(window.history.state, "", url);
}

// The app can leave its page without its router: `location.assign()`, a
// `<form>` or an `<a>` that React does not handle, Next's own fallback when a
// client-side navigation is not possible. For a browser that is a page load.
// Here it would replace the test with the app, so load the page the
// way `renderServer()` does instead.
type NavigateEvent = Event & {
  navigationType: "push" | "replace" | "reload" | "traverse";
  destination: { url: string; sameDocument: boolean };
  hashChange: boolean;
  formData: FormData | null;
  downloadRequest: string | null;
};
// Vite's client loads the document again after a change that nothing takes
// in place. With a page open that would be a reload of the page, which the
// listener below loads as the app's, at the page's URL: the host's document
// would stay. Left first, the document and its URL are the host's again.
import.meta.hot?.on("vite:beforeFullReload", ({ path }) => {
  if (reloadsDocument(path)) return leavePage("a reload of the page");
});

// Whether Vite's client goes on to load the document again, as it decides
// once the page is left: for a change of an HTML file only if it is the one
// of the host's document, by the URL that leaving puts back. A change of
// another HTML page of the host keeps the page that is open.
function reloadsDocument(path: string | undefined): boolean {
  if (!path?.endsWith(".html") || path === "/index.html") return true;
  const pagePath = decodeURI(new URL(documentUrl()).pathname);
  const payloadPath = (import.meta.env?.BASE_URL ?? "/") + path.slice(1);
  return (
    pagePath === payloadPath || (pagePath.endsWith("/") && `${pagePath}index.html` === payloadPath)
  );
}

(window as { navigation?: EventTarget }).navigation?.addEventListener("navigate", (event) => {
  const { destination, hashChange, formData, downloadRequest } = event as NavigateEvent;
  // A navigation of Next's router on the client, in the layouts of a route,
  // to another pathname takes the place of the node, also of one that has
  // not hydrated yet, which no effect of it would say.
  if (destination.sameDocument) page?.nodeOnPage?.at(new URL(destination.url).pathname);
  if (destination.sameDocument || hashChange || !event.cancelable) return;
  const url = new URL(destination.url);
  // A navigation that loads a document loads what owns its URL, a reload
  // too. The host's URL goes to the browser as it is. While a node is open,
  // a URL of the app's origin with its pathname stands in for the host's:
  // the app's route there is another page. Leaving puts back the host's URL.
  // Any other URL is the app's: hosts leave a page before a reload of their
  // own (Vite with `vite:beforeFullReload`, another host with the cleanup of
  // what it showed).
  if (destination.url === documentUrl()) return;
  if (url.origin === window.location.origin && openedAt(url)?.node) {
    event.preventDefault();
    void leavePage("a navigation to the host's document")
      .catch(() => {})
      .then(() => window.location.reload());
    return;
  }
  if (!page) {
    // No page of the app to load another one of: a component that a test
    // file with `"use client"` rendered has no router. A link or a form
    // would replace the test, and Vitest would lose the tab. Not a
    // download, which stays.
    if (downloadRequest != null) return;
    event.preventDefault();
    reportError(noRouter(url));
    return;
  }
  event.preventDefault();
  if (url.origin !== window.location.origin) {
    reportError(leftTheApp(url));
    return;
  }
  loadPage(url, {
    method: formData ? "POST" : "GET",
    headers: { accept: "text/html" },
    body: formData,
  }).catch((error: unknown) => {
    // The test moved on before the page had loaded.
    if (!(error instanceof DOMException && error.name === "AbortError")) reportError(error);
  });
});
