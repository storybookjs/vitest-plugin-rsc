import "./globals.ts";
import { createElement, type JSXElementConstructor, type ReactNode } from "react";
import { resetAsyncLocalStorage } from "../async-local-storage.ts";
import { createEnvironmentRunner, importEnvironment } from "../utils.ts";
import { loadDocument, unloadDocument } from "./document.ts";
import { recordListeners, recordMessageChannels } from "./leftovers.ts";
import { registry, type Opened } from "./registry.ts";

// The server's platform (globals.ts) has to be there before a module of Next's
// server loads, so the layers load from here on, in order: rsc, then ssr.
await import("./rsc.ts");
const ssr = await importEnvironment<typeof import("./ssr.ts")>(
  "next_ssr",
  "vitest-plugin-rsc/nextjs/ssr",
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

// What a browser adds to a request for the app's origin.
function browserHeaders(headers: Headers, url: URL, method: string): Headers {
  headers.set("host", url.host);
  if (!headers.has("user-agent")) headers.set("user-agent", navigator.userAgent);
  if (method !== "GET" && method !== "HEAD") headers.set("origin", url.origin);
  if (!headers.has("cookie") && document.cookie) headers.set("cookie", document.cookie);
  return headers;
}

// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;

// What was in the tab's storage before the app ran, which is the test
// runner's to keep.
const storages = [localStorage, sessionStorage].map(
  (storage) => [storage, new Set(Object.keys(storage))] as const,
);

// The cookies the server has set, to forget them when the test ends.
const cookiesToClear = new Set<string>();

function clearCookies(): void {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]!.trim();
    if (name) cookiesToClear.add(`${name}=; path=/`);
  }
  for (const cookie of cookiesToClear) {
    document.cookie = `${cookie}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
  cookiesToClear.clear();
}

// A page of another origin is not the app's: a browser would leave the app for
// it, and this tab has the test to keep.
function leftTheApp(url: URL): Error {
  return new Error(
    `vitest-plugin-rsc: the app navigated to another origin: ${url.href}. ` +
      `A browser would leave the app for it, which this tab cannot do.`,
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
   * For a request the server makes to itself while it handles another. It
   * carries the headers it was given, cookies included, does not go through
   * the browser's cookie jar, and does not wait for the request it is part of.
   */
  server?: boolean;
  /** A page load, which leaves the app when it is redirected to another origin. */
  navigation?: boolean;
  /** Who answers a request that the server has nothing for: see `HandleOptions.unrouted`. */
  network?: () => Promise<Response>;
};

// The network between a client and the Next.js server in this tab. For the
// browser it does what a browser does for a same-origin request: send the
// cookies, store the ones that come back. For either it follows redirects.
async function sendRequest(
  request: Request,
  { server = false, navigation = false, network }: Sending = {},
): Promise<Response> {
  let url = new URL(request.url);
  let method = request.method;
  const sent = new Headers(request.headers);
  // Read once: a 307 or 308 sends the body again.
  let body = request.body ? new Uint8Array(await request.arrayBuffer()) : null;
  let redirected = false;
  // As many as a browser follows.
  let redirects = 0;

  for (;;) {
    const headers = server ? new Headers(sent) : browserHeaders(new Headers(sent), url, method);
    const response = await unlessAborted(
      ssr.handleRequest(
        { url: url.href, method, headers, body, signal: request.signal },
        { nested: server, unrouted: network ? "pass" : "not-found" },
      ),
      request.signal,
    );
    if (!response) {
      // After a redirect it is another request than the one that was passed in.
      return redirected
        ? nativeFetch(url, { method, headers: sent, body, signal: request.signal })
        : network!();
    }
    for (const cookie of server ? [] : response.headers.getSetCookie()) {
      // A script cannot store an HttpOnly cookie, and `document.cookie` is the
      // cookie jar of this tab, so store it as a regular one.
      document.cookie = cookie.replace(/;\s*httponly/i, "");
      const [pair, ...attributes] = cookie.split(";");
      const scope = attributes.filter((attribute) => /^\s*(path|domain)=/i.test(attribute));
      cookiesToClear.add([`${pair!.split("=")[0]}=`, ...scope].join(";"));
    }

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
      // 307 and 308 repeat the request; the others turn it into a GET, and
      // the headers of a body go with the body.
      if (response.status !== 307 && response.status !== 308) {
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
        return nativeFetch(url, { method, headers: sent, body });
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
 * The request carries the tab's cookies, unless it has a `cookie` header.
 * One to the pathname of what `renderServer()` opened is that page's, as a
 * `fetch` of the page is: it gets the route of the node, and skips the proxy
 * if the page does.
 */
export function handleRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Not the browser's Request, which drops a `cookie` header.
  return sendRequest(new registry.Request(input, init));
}

// A `fetch` that sends a same-origin request to the app when it is the app's,
// and everything else to the network.
const appFetch =
  (server: boolean): typeof fetch =>
  async (input, init) => {
    // A server has no page to resolve a path against: Node's `fetch` rejects it.
    if (server && !(input instanceof Request) && !URL.canParse(String(input))) {
      throw new TypeError(`Failed to parse URL from ${String(input)}`, {
        cause: new TypeError("Invalid URL"),
      });
    }
    const sent = sameOriginRequest(input, init);
    if (!sent) return nativeFetch(input, init);
    const headers = server
      ? sent.headers
      : browserHeaders(new Headers(sent.headers), sent.url, sent.method);
    if (!sent.marked && !(await ssr.takesRequest({ url: sent.url.href, headers }))) {
      return nativeFetch(input, init);
    }
    // The request, for the network: a body can be read once.
    const spare = input instanceof Request && input.body ? input.clone() : input;
    // The server's Request keeps a `cookie` header, which a browser's drops.
    const request = server ? new registry.Request(input, init) : new Request(input, init);
    return sendRequest(request, {
      server,
      network: sent.marked ? undefined : () => nativeFetch(spare, init),
    });
  };

// The browser's `fetch`: what Next's client router and Client Components call.
globalThis.fetch = appFetch(false);
// The server's `fetch`. A request to the app itself is one the server makes
// while it handles another: Next renders the page a Server Action redirects
// to that way. It is chosen as the browser's is, and goes through the proxy
// too. Its redirects are followed, as the `fetch` of a server follows them.
registry.fetch = appFetch(true);
// Where the server reaches itself, which `next start` sets too. Next reads it
// when it needs it, from the `process` of the tab.
process.env.__NEXT_PRIVATE_ORIGIN = window.location.origin;

let page: { started: Promise<unknown>; unmount(): void } | undefined;
// Tells a page load that the tab has moved on: to another page, or to the
// next test.
let currentLoad: AbortController | undefined;

// What both forms of `renderServer()` send. They differ in what is around it.
type RequestOptions = {
  /** The URL to open. Defaults to `/`. */
  url?: string;
  /** Headers for the request of the document, next to the ones a browser sends. */
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
  /** Leaves the page. The tab keeps its cookies until the test ends. */
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
 * Opens a route of the Next.js app in this tab, as a browser does: it requests
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
    return { response: await loadPage(url, { headers }, { opened }), unmount: leavePage };
  }

  const { wrapper, proxy = false } = options;
  const ui = wrapper ? createElement(wrapper, null, first) : first;
  if (options.layouts) {
    if (options.container || options.baseElement) {
      throw new Error(
        "vitest-plugin-rsc: with `layouts` a node renders in the document of its route, whose " +
          "root layout has the <html> and the <body>. There is no `container` or `baseElement` " +
          "to pass.",
      );
    }
    const opened = { pathname, proxy, node: { ui, layouts: true } };
    const response = await loadPage(url, { headers }, { opened });
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
    { container, opened: { pathname, proxy, node: { ui, layouts: false } } },
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
  // the tab, with a Flight payload that differs on every run. A script of
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

// What a test opens: a page, or a node in a container. A page load that the
// app makes itself, a navigation, has no `opening`.
type Opening = { container?: Element; opened: Opened };

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
  try {
    return await openPage(url, init, load.signal, opening);
  } catch (error) {
    // What did not get to open has no requests of its own. Unless the tab has
    // moved on, to a page or a node of its own.
    if (opened && registry.opened === opened) registry.opened = undefined;
    throw error;
  }
}

async function openPage(
  url: URL,
  init: RequestInit,
  signal: AbortSignal,
  opening: Opening | undefined,
): Promise<Response> {
  // The tab has moved on: to another page, or to the next test.
  const superseded = () => signal.throwIfAborted();

  // Not the browser's Request, which drops a `cookie` header.
  const response = await sendRequest(new registry.Request(url, { ...init, signal }), {
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
            `A browser would show or download it, which this tab cannot do.`,
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
  loadDocument(html, response.url, container);
  // A page load runs the app's scripts from scratch, so every page gets a
  // module graph of its own for the browser layer.
  const runner = createEnvironmentRunner("react_client");
  // The browser's Flight client reads properties off `__webpack_require__`
  // when it loads, which is before the page can say how it loads a module,
  // and wraps some of them. One that the pages shared would keep every page.
  registry.browserRequire = (id) => registry.loadBrowserModule(id);
  // React's scheduler, Next's router and Next's dev overlay each leave
  // something on the tab when they load: see leftovers.ts. That is from here
  // until `start()` says that Next's client has loaded. No module of the app
  // loads in that time.
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
      "vitest-plugin-rsc/nextjs/client",
    );
    superseded();
    return client.start(loaded, container);
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

function leavePage(): Promise<void> {
  currentLoad?.abort(new DOMException("The page was left before it had loaded.", "AbortError"));
  currentLoad = undefined;
  const left = page;
  page = undefined;
  // Also after a page that could not be left: that one fails its own test.
  const gone = leaving
    .catch(() => {})
    .then(async () => {
      // An app that is still starting cannot be stopped, and would go on to
      // hydrate the next page with the client code of this one. It is about
      // done: the document it starts from is already there.
      let timeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        left?.started,
        new Promise((resolve) => (timeout = setTimeout(resolve, 5000))),
      ]);
      // A timer that is still set keeps the page until it fires.
      clearTimeout(timeout);
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
 * and forgets the tab's cookies and what the app put in its storage, like a
 * new browser context. The server forgets what it has cached. Runs before and
 * after every test.
 */
export async function cleanup(): Promise<void> {
  await leavePage();
  for (const container of containers) container.remove();
  containers.clear();
  ssr.resetCaches();
  clearCookies();
  for (const [storage, keys] of storages) {
    for (const key of Object.keys(storage)) if (!keys.has(key)) storage.removeItem(key);
  }
}

// The app can leave its page without its router: `location.assign()`, a
// `<form>` or an `<a>` that React does not handle, Next's own fallback when a
// client-side navigation is not possible. For a browser that is a page load.
// For this tab it would replace the test with the app, so load the page the
// way `renderServer()` does instead.
type NavigateEvent = Event & {
  destination: { url: string; sameDocument: boolean };
  hashChange: boolean;
  formData: FormData | null;
};
(window as { navigation?: EventTarget }).navigation?.addEventListener("navigate", (event) => {
  const { destination, hashChange, formData } = event as NavigateEvent;
  if (!page || destination.sameDocument || hashChange || !event.cancelable) return;
  const url = new URL(destination.url);
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
