import "./globals.ts";
import { createElement, type JSXElementConstructor, type ReactNode } from "react";
import { resetAsyncLocalStorage } from "../async-local-storage.ts";
import { checkFetchedModules, createEnvironmentRunner, environmentModule } from "../utils.ts";
import { loadDocument, unloadDocument } from "./document.ts";
import { recordListeners, recordMessageChannels } from "./leftovers.ts";
import { PageStore } from "./page-store.ts";
import { registry, type Opened } from "./registry.ts";

// The server's platform (globals.ts) has to be there before a module of Next's
// server loads, so the layers load from here on, in order: rsc, then ssr.
await import("./rsc.ts");
// One module graph for the tab: the server stays, where a page is loaded anew.
const ssr = await createEnvironmentRunner("next_ssr").import<typeof import("./ssr.ts")>(
  environmentModule("next_ssr", "vitest-plugin-rsc/nextjs/ssr"),
);

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

// What was in the browser's storage before the app ran, which is the test
// runner's to keep.
const storages = [localStorage, sessionStorage].map(
  (storage) => [storage, new Set(Object.keys(storage))] as const,
);

// What Vitest's UI stores on this origin as its settings change, also
// while the tests run: its panels, and its dark mode through VueUse.
const isVitestKey = (key: string) => key.startsWith("vitest-") || key === "vueuse-color-scheme";

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

// As with `fetch`, a request rejects as soon as its signal aborts. The server
// may still answer, or fail: a render that goes on without its request fails
// in its own ways. Nobody reads that answer.
function unlessAborted<T extends Response | undefined>(
  answer: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      reject(signal.reason);
      answer.then((response) => response?.body?.cancel()).catch(() => {});
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
      ssr.handleRequest(
        { url: url.href, method, headers, body, signal: request.signal },
        {
          nested: !from,
          unrouted: network ? "pass" : "not-found",
          opened: redirected ? undefined : opened,
        },
      ),
      request.signal,
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
    if (!sent.marked && !(await ssr.takesRequest({ url: sent.url.href, headers }))) {
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

// The browser's `fetch`: what Next's client router and Client Components call.
globalThis.fetch = appFetch(false);
// A script of the page reads and writes the app's cookies with
// `document.cookie`, as in a browser, where it is a view of the cookie jar.
// The jar here is the store, and the browser's own is the tab's: the cookies
// other documents of the origin set, like Vitest's UI, Storybook's manager
// or another app on `localhost`. The app neither reads nor writes those.
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

let page: { started: Promise<unknown>; unmount(): void } | undefined;
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
  /** Leaves the page. The cookies and the `headers` stay until the test ends. */
  unmount(): Promise<void>;
};

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
   * The files of the host that render the node, for their CSS: the node has
   * the stylesheets that these files import, as a page has those of its
   * route. Absolute paths, or paths from the project root without a leading
   * slash, like `stories/button.stories.tsx`. Under Vitest it defaults to the
   * setup files and the test file; another host, like Storybook, passes its
   * own, like the preview file and the story's file. With a dev server only:
   * a static build does not link the CSS of these files yet.
   */
  files?: string[];
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
      response: await loadPage(url, { headers }, { opened, headers: sticky, cookie }),
      unmount: leavePage,
    };
  }

  const { wrapper, proxy = false } = options;
  const ui = wrapper ? createElement(wrapper, null, first) : first;
  // The files of the host that render the node, for their stylesheets.
  const files = options.files ?? registry.nodeFiles?.() ?? [];
  if (options.layouts) {
    if (options.container || options.baseElement) {
      throw new Error(
        "vitest-plugin-rsc: with `layouts` a node renders in the document of its route, whose " +
          "root layout has the <html> and the <body>. There is no `container` or `baseElement` " +
          "to pass.",
      );
    }
    const opened = { pathname, proxy, node: { ui, layouts: true, files } };
    const response = await loadPage(url, { headers }, { opened, headers: sticky, cookie });
    return {
      response,
      get container() {
        return document.body;
      },
      get baseElement() {
        return document.body;
      },
      asFragment: () => fragmentOf(document.body),
      unmount: leavePage,
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
  // since it loaded, so the container comes after that.
  await leavePage();
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
    {
      container,
      opened: { pathname, proxy, node: { ui, layouts: false, files } },
      headers: sticky,
      cookie,
    },
  );
  return {
    response,
    container,
    get baseElement() {
      return base ?? (defaultsToContainer || document.body);
    },
    asFragment: () => fragmentOf(container),
    unmount: leavePage,
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
type Opening = { container?: Element; opened: Opened; headers: Headers; cookie: string | null };

async function loadPage(url: URL, init: RequestInit, opening?: Opening): Promise<Response> {
  const leaving = leavePage();
  const load = (currentLoad = new AbortController());
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
    return await openPage(url, init, load.signal, from, opening);
  } catch (error) {
    // What did not get to open has no requests of its own. Unless the test has
    // moved on, to a page or a node of its own.
    if (opened && registry.opened === opened) registry.opened = undefined;
    throw error;
  }
}

async function openPage(
  url: URL,
  init: RequestInit,
  signal: AbortSignal,
  from: PageStore,
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
  }
  if (/^\s*<!doctype/i.test(html)) container = undefined;
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
    return client.start(loaded, container, signal);
  })();
  page = { started: started.catch(() => {}), unmount: () => leave() };
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

function leavePage(): Promise<void> {
  currentLoad?.abort(new DOMException("The page was left before it had loaded.", "AbortError"));
  currentLoad = undefined;
  const left = page;
  page = undefined;
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
          await ssr.settleRequests();
          // What the test opened goes with its page: the route of a node,
          // and a pathname without the proxy.
          registry.opened = undefined;
          resetAsyncLocalStorage();
        }
      }
    });
  leaving = gone;
  return gone;
}

/**
 * Leaves the page that `renderServer()` opened, removes the containers it made
 * and forgets its `headers`, the app's cookies and what the app put in its
 * storage, like a new browser context. The server forgets what it has cached.
 * Runs before and after every test.
 */
export async function cleanup(): Promise<void> {
  await leavePage();
  for (const container of containers) container.remove();
  containers.clear();
  store = new PageStore();
  ssr.resetCaches();
  for (const [storage, keys] of storages) {
    for (const key of Object.keys(storage)) {
      if (!keys.has(key) && !isVitestKey(key)) storage.removeItem(key);
    }
  }
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
(window as { navigation?: EventTarget }).navigation?.addEventListener("navigate", (event) => {
  const { navigationType, destination, hashChange, formData, downloadRequest } =
    event as NavigateEvent;
  if (destination.sameDocument || hashChange || !event.cancelable) return;
  const url = new URL(destination.url);
  if (!page) {
    // No page of the app to load another one of: a component that a test
    // file with `"use client"` rendered has no router. A link or a form
    // would replace the test, and Vitest would lose the tab. Not a reload,
    // like Vite's after a change, and not a download, which stays.
    if (navigationType === "reload" || downloadRequest != null) return;
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
