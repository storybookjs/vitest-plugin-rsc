import "./globals.ts";
import {
  createElement,
  type JSXElementConstructor,
  type ReactElement,
  type ReactNode,
} from "react";
import { resetAsyncLocalStorage } from "../async-local-storage.ts";
import { environmentModule, importEnvironment } from "../utils.ts";
import { assertForNextPage, leaveGraph, takeGraph } from "./client-graph.ts";
import { clientNodeReference } from "./client-ids.ts";
import { loadDocument, unloadDocument } from "./document.ts";
import { recordListeners, recordMessageChannels } from "./leftovers.ts";
import { registry, setClientNode, type ClientNode, type Opened } from "./registry.ts";

// The server's platform (globals.ts) has to be there before a module of Next's
// server loads, so the layers load from here on, in order: rsc, then ssr.
const rsc = await import("./rsc.ts");
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

// The `headers` of `renderServer()`, which go with every request the browser
// sends to the app from then on: until the test opens something else, or ends.
let pageHeaders: Headers | undefined;

// What a browser adds to a request for the app's origin.
function browserHeaders(headers: Headers, url: URL, method: string): Headers {
  headers.set("host", url.host);
  pageHeaders?.forEach((value, name) => {
    if (!headers.has(name)) headers.set(name, value);
  });
  if (!headers.has("user-agent")) headers.set("user-agent", navigator.userAgent);
  if (method !== "GET" && method !== "HEAD" && !headers.has("origin")) {
    headers.set("origin", url.origin);
  }
  if (!headers.has("cookie") && document.cookie) headers.set("cookie", document.cookie);
  return headers;
}

// What a test leaves behind is the app's to forget: a test runs as a new
// browser context. Another host runs the app next to state of its own, on the
// same origin, like the manager of Storybook. There only what a page of the
// app added is the app's.
const isVitest = "__vitest_worker__" in globalThis;

// What was in the browser's storage before the app ran, and what another
// document of the origin stores in it, like Vitest's UI or Storybook's
// manager: the host's to keep.
const storages = [localStorage, sessionStorage].map((storage) => ({
  storage,
  kept: new Set(Object.keys(storage)),
  /** What was added while a page of the app was open. */
  added: new Set<string>(),
}));
window.addEventListener("storage", ({ key, storageArea }) => {
  const changed = storages.find(({ storage }) => storage === storageArea);
  if (changed && key !== null) changed.kept.add(key);
});

// What Vitest's UI stores on this origin as its settings change, also
// while the tests run: its panels, and its dark mode through VueUse.
const isVitestKey = (key: string) => key.startsWith("vitest-") || key === "vueuse-color-scheme";

// The cookies the server has set, to forget them when the test ends.
const cookiesToClear = new Set<string>();
const cookieNames = () =>
  document.cookie.split(";").flatMap((cookie) => cookie.split("=")[0]!.trim() || []);

// What the browser had when a page of the app opened, to tell what it added
// once the page is left.
let atOpen: { cookies: Set<string>; keys: Set<string>[] } | undefined;

function openedPage(): void {
  atOpen ??= {
    cookies: new Set(cookieNames()),
    keys: storages.map(({ storage }) => new Set(Object.keys(storage))),
  };
}

function leftPage(): void {
  if (!atOpen) return;
  const { cookies, keys } = atOpen;
  atOpen = undefined;
  for (const name of cookieNames()) if (!cookies.has(name)) cookiesToClear.add(`${name}=; path=/`);
  storages.forEach(({ storage, added }, index) => {
    for (const key of Object.keys(storage)) if (!keys[index]!.has(key)) added.add(key);
  });
}

function clearCookies(): void {
  if (isVitest) {
    for (const name of cookieNames()) cookiesToClear.add(`${name}=; path=/`);
  }
  for (const cookie of cookiesToClear) {
    document.cookie = `${cookie}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
  cookiesToClear.clear();
}

function clearStorage(): void {
  for (const { storage, kept, added } of storages) {
    const keys = isVitest ? Object.keys(storage) : [...added];
    for (const key of keys) if (!kept.has(key) && !isVitestKey(key)) storage.removeItem(key);
    added.clear();
  }
}

// A page of another origin is not the app's: a browser would leave the app for
// it, and this document has the test to keep.
function leftTheApp(url: URL): Error {
  return new Error(
    `vitest-plugin-rsc: the app navigated to another origin: ${url.href}. ` +
      `A browser would leave the app for it, which a test cannot do.`,
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
  /** What the request opens, not after a redirect: see `HandleOptions.opened`. */
  opened?: Opened;
};

// The network between a client and the Next.js server in the browser. For the
// browser it does what a browser does for a same-origin request: send the
// cookies, store the ones that come back. For either it follows redirects.
async function sendRequest(
  request: Request,
  { server = false, navigation = false, network, opened }: Sending = {},
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
        {
          nested: server,
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
    for (const cookie of server ? [] : response.headers.getSetCookie()) {
      // A script cannot store an HttpOnly cookie, and `document.cookie` is the
      // cookie jar here, so store it as a regular one.
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
 * The request carries the browser's cookies, unless it has a `cookie` header,
 * and the `headers` of what `renderServer()` opened, under its own.
 * One to the pathname of what `renderServer()` opened is that page's, as a
 * `fetch` of the page is: it gets the route of the node, and skips the proxy
 * if the page does.
 */
export function handleRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Not the browser's Request, which drops a `cookie` header.
  return sendRequest(new registry.Request(input, init));
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
   * `content-type` and `next-action`.
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
 * After a `redirect()` Next renders the page it redirects to, on the server.
 * A page that is open stays open. The request carries the browser's cookies,
 * the `headers` of what `renderServer()` opened and the ones passed here, and
 * the browser keeps the cookies the action sets. For code that a Server
 * Action calls; test a form of a page through the page.
 *
 * The function runs in the request, so it cannot send a request to the app
 * itself, which would wait for this one: call the app's code instead.
 */
export async function runInServerAction<T>(
  action: () => T,
  options: RunInServerActionOptions = {},
): Promise<Awaited<T>> {
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
      opened: {
        pathname: url.pathname,
        proxy: options.proxy ?? false,
        node: { ui: null, layouts: false },
      },
    });
    // What Next renders after the action, which no page is there to show.
    await response.body?.cancel();
    if (!ran.outcome) {
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
    // The page whose router sends it: Next's router marks its requests. A
    // page that is being left still sends some, like the refresh it had
    // started. A router is there only once its page is, so without a page
    // (`null`) it is the router of one that was left.
    const from = sent.marked && !server ? (page ?? null) : undefined;
    const response = sendRequest(request, {
      server,
      network: sent.marked ? undefined : () => nativeFetch(spare, init),
    });
    if (from === undefined) return response;
    // A page that was left hears no more of its requests, as in a browser,
    // where it is gone. The server stops the ones it had not answered yet
    // (`settleRequests()` in ssr.ts), and the router of that page, which is
    // still there, would report that as an error, while the next page runs.
    return response.catch((error: unknown) => {
      const stopped = error instanceof DOMException && error.name === "AbortError";
      if (stopped && (from === null || page !== from)) return new Promise<never>(() => {});
      throw error;
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
// when it needs it, from the global `process`.
process.env.__NEXT_PRIVATE_ORIGIN = window.location.origin;

// A page that loads, from when its document is there.
type Page = {
  started: Promise<unknown>;
  unmount(): void;
  /** Once it has started: has Next's router render the page again. */
  refresh?(): void;
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
   * sets itself. A `cookie` and an `accept` header are for the document alone:
   * after it the browser's cookies are sent, and what each request accepts.
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
   * without a page load, so the state of the Client Components in it stays.
   * A node of the server renders again on the server, in a request of Next's
   * router like `router.refresh()`, with the `headers` of `renderServer()`.
   * A node of the browser layer renders again where it is. The `url`, the
   * headers and the other options stay: for others, call `renderServer()`.
   * Resolves once the page has committed the new node, or something else in
   * its place, like an error page.
   *
   * Rejects when the page no longer has the node: it was left, or something
   * took the node's place, like an error page or a route it navigated to.
   */
  rerender(ui: ReactNode): Promise<void>;
};

// A node of the browser layer, where `renderServer()` takes a node: see
// `ClientNode` in registry.ts. It has a `$$typeof`, as an element has.
const clientNodeType = Symbol.for("vitest-plugin-rsc.client-node");
type ClientNodeElement = { $$typeof: typeof clientNodeType; node: ClientNode };

const asElement = (node: ClientNode) =>
  ({ $$typeof: clientNodeType, node }) satisfies ClientNodeElement as unknown as ReactElement;

function clientNodeOf(ui: unknown): ClientNode | undefined {
  const element = ui as Partial<ClientNodeElement> | null | undefined;
  return element?.$$typeof === clientNodeType ? element.node : undefined;
}

/**
 * For a host: a node for `renderServer()` that is an export of a module of the
 * browser layer, with these props. The page renders it in the browser and not
 * on the server, so the props are passed as they are: a function stays that
 * function. `module` is what the browser layer imports the module by: the
 * path of a file from the root, like `/app/components/button.tsx`. A package
 * specifier works too, with a dev server: a static build has the files with
 * `"use client"` of the host, and the modules a Flight payload can refer to.
 */
export function clientNode(
  module: string,
  name: string,
  props: Record<string, unknown> = {},
): ReactElement {
  return asElement({ module: module.startsWith("/") ? module : `/@id/${module}`, name, props });
}

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
  // The cookies of the requests after the document are the browser's, and
  // each of them says itself what it accepts.
  const sticky = new Headers(headers);
  sticky.delete("cookie");
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
      response: await loadPage(url, { headers }, { opened, headers: sticky }),
      unmount: leavePage,
    };
  }

  // A node of the browser layer is not the server's to render: the server
  // renders the one Client Component that renders it, client-node.tsx.
  const clientNode = clientNodeOf(first);
  const node = clientNode ? createElement(rsc.ClientNode as JSXElementConstructor<object>) : first;
  const rendered = clientNode && shows(clientNode);
  const { wrapper, proxy = false } = options;
  const wrap = (inner: ReactNode) => (wrapper ? createElement(wrapper, null, inner) : inner);
  // What the route of the node renders. A node of the server is counted, for
  // `rerender()`.
  const nodeOf = (layouts: boolean) => ({
    ui: wrap(node),
    layouts,
    version: clientNode ? undefined : 0,
  });
  if (options.layouts) {
    if (options.container || options.baseElement) {
      throw new Error(
        "vitest-plugin-rsc: with `layouts` a node renders in the document of its route, whose " +
          "root layout has the <html> and the <body>. There is no `container` or `baseElement` " +
          "to pass.",
      );
    }
    const opening: NodeOpening = {
      opened: { pathname, proxy, node: nodeOf(true) },
      headers: sticky,
      clientNode,
      wrap,
      version: 0,
    };
    const response = await loadPage(url, { headers }, opening);
    await shown(rendered, opening);
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
      rerender: (next) => rerenderNode(opening, next),
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
  const opening: NodeOpening = {
    container,
    opened: { pathname, proxy, node: nodeOf(false) },
    headers: sticky,
    clientNode,
    wrap,
    version: 0,
  };
  const response = await loadPage(url, { headers }, opening);
  await shown(rendered, opening);
  return {
    response,
    container,
    get baseElement() {
      return base ?? (defaultsToContainer || document.body);
    },
    asFragment: () => fragmentOf(container),
    unmount: leavePage,
    rerender: (next) => rerenderNode(opening, next),
  };
}

// Waits for the page to commit a node that `rerender()` gave it, or for it
// to have something else in its place.
type Rerender = { version: number; resolve(): void; reject(error: unknown): void };
const rerenders = new Set<Rerender>();

// The page has committed the node at this version, or a later one: or,
// without one, something else in the node's place.
function settleRerenders(version = Infinity): void {
  for (const rerender of rerenders) {
    if (rerender.version > version) continue;
    rerenders.delete(rerender);
    rerender.resolve();
  }
}

// What the page that is open does with its node. It can still be to come,
// once a Suspense boundary of the route, like its `loading.tsx`, has
// hydrated. It can be gone, with something else in its place: an error or a
// not-found page, or another route that the app navigated to.
let nodeOnPage: "coming" | "shown" | "replaced" = "coming";
let nodesShown = 0;

// Nothing on the page shows the node: it has left it, or React reported an
// error of the page, which a boundary may show in place of a node that is
// still to come. Strict Mode takes an effect down and up again at once, and
// a boundary inside the node leaves the node there.
function unlessShown(): void {
  queueMicrotask(() => {
    if (nodesShown > 0) return;
    nodeOnPage = "replaced";
    settleRerenders();
  });
}

registry.nodeReporter = () => {
  const reported = page;
  if (!reported) return;
  return {
    shown(shown) {
      if (page !== reported) return;
      nodesShown += shown ? 1 : -1;
      if (shown) nodeOnPage = "shown";
      else unlessShown();
    },
    rendered(version) {
      if (page === reported) settleRerenders(version);
    },
  };
};

async function rerenderNode(opening: NodeOpening, ui: ReactNode): Promise<void> {
  const clientNode = clientNodeOf(ui);
  if (!clientNode !== !opening.clientNode) {
    throw new Error(
      opening.clientNode
        ? "vitest-plugin-rsc: rerender() takes a node of the browser layer, as the node it " +
            "renders again is one. Make it with `clientNode()`, or render it with renderServer()."
        : "vitest-plugin-rsc: rerender() takes a node of the server, as the node it renders " +
            "again is one. Render a node of the browser layer with renderServer().",
    );
  }
  const { page: opened } = opening;
  if (!opened || opened !== page) {
    throw new Error(
      "vitest-plugin-rsc: rerender() renders the node again on its page, which was left: by " +
        "unmount() or cleanup(), by another renderServer(), or by a navigation that loaded " +
        "another page. Render the node with renderServer() instead.",
    );
  }
  if (registry.opened !== opening.opened || nodeOnPage === "replaced") {
    throw new Error(
      "vitest-plugin-rsc: rerender() renders the node again in its place, and the page has " +
        "something else there: an error or a not-found page, or a route that the node " +
        "redirected or navigated to. Render the node with renderServer() instead.",
    );
  }
  const version = ++opening.version;
  let waiting!: Rerender;
  const committed = new Promise<void>((resolve, reject) => {
    waiting = { version, resolve, reject };
  });
  rerenders.add(waiting);
  if (clientNode) {
    // It renders again where it is, in the browser: the server is not asked.
    const next: ClientNode = { ...clientNode, rendered: () => settleRerenders(version) };
    opening.clientNode = next;
    setClientNode(next);
  } else {
    // The server reads both when it renders the node's route, which Next's
    // router asks for again.
    const node = opening.opened.node!;
    const before = { ui: node.ui, version: node.version };
    node.ui = opening.wrap(ui);
    node.version = version;
    try {
      opened.refresh!();
    } catch (error) {
      rerenders.delete(waiting);
      Object.assign(node, before);
      throw error;
    }
  }
  await committed;
}

// Resolves once the page has rendered a node of the browser layer.
function shows(node: ClientNode): Promise<void> {
  return new Promise((resolve) => (node.rendered = resolve));
}

// How long a page that has hydrated takes to render the node of the browser
// layer, at most. A Suspense boundary of the route, like its `loading.tsx`,
// hydrates after the page does.
const clientNodeTimeout = 10_000;

// The page has hydrated. The node of the browser layer renders after that,
// when the server rendered client-node.tsx: not when it answered with another
// page, like the one a wrapper redirects to, or the error page.
async function shown(rendered: Promise<void> | undefined, opening: Opening): Promise<void> {
  if (!rendered || !opening.showsClientNode) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      rendered,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                `vitest-plugin-rsc: the page at ${opening.opened.pathname} has hydrated, and ` +
                  `has not rendered the node of the browser layer after ` +
                  `${clientNodeTimeout / 1000} seconds. Something around it, like a Suspense ` +
                  `boundary of the route, does not finish rendering.`,
              ),
            ),
          clientNodeTimeout,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * `renderServer()` for a file with `"use client"`, which gets this one under
 * that name. Such a file is code of the browser layer, as it is in Next, so
 * its node is rendered in the browser and not on the server: a prop can be a
 * function, and a component of the file itself can have state. The node is
 * still the page of a route of its own, inside Next's app: the router and its
 * hooks are Next's, at `url`.
 *
 * `wrapper` is a component of the browser layer too, and wraps the node there.
 * With only options it opens a page of the app, as `renderServer()` does.
 */
export function renderClient(options: RenderServerOptions): Promise<RenderServerResult>;
export function renderClient(
  ui: ReactNode,
  options?: RenderComponentOptions,
): Promise<RenderComponentResult>;
export async function renderClient(
  ...args: [RenderServerOptions] | [ReactNode, RenderComponentOptions?]
): Promise<RenderServerResult | RenderComponentResult> {
  const [first, second] = args;
  if (isOptions(first)) return renderServer(first);
  const { wrapper, ...options } = second ?? {};
  assertForNextPage(first);
  // A node of `clientNode()` is one of the browser layer already.
  const inBrowser = (ui: ReactNode) => {
    const node = clientNodeOf(ui);
    return asElement(node ? { ...node, wrapper } : { ui, wrapper });
  };
  const result = await renderServer(inBrowser(first), options);
  // A node to render again is made with the components of the page that is
  // open, which is the page it renders on.
  const { rerender } = result;
  result.rerender = (ui) => rerender(inBrowser(ui));
  return result;
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

// What a test opens: a page, or a node in a container. A page load that the
// app makes itself, a navigation, has no `opening`.
type Opening = {
  container?: Element;
  opened: Opened;
  /** The `headers` of `renderServer()`, for every request of the page: see `pageHeaders`. */
  headers: Headers;
  /** The node of the browser layer that the node of `opened` renders. */
  clientNode?: ClientNode;
  /** Set once the page has loaded: whether the server rendered that node. */
  showsClientNode?: boolean;
  /** The page it opened, once its document is there. */
  page?: Page;
};

// A node, which `rerender()` renders again.
type NodeOpening = Opening & {
  /** Its `wrapper` around another node. */
  wrap(ui: ReactNode): ReactNode;
  /** How many times it has been rendered again. */
  version: number;
};

async function loadPage(url: URL, init: RequestInit, opening?: Opening): Promise<Response> {
  const leaving = leavePage();
  const load = (currentLoad = new AbortController());
  await leaving;
  load.signal.throwIfAborted();
  openedPage();

  // Once the node that was in it is gone.
  if (opening?.container?.hasChildNodes()) {
    throw new Error(
      "vitest-plugin-rsc: the container of a node has to be empty. " +
        "The node is hydrated in it, and leaving the node empties it.",
    );
  }
  const opened = (registry.opened = opening?.opened);
  setClientNode(opening?.clientNode);
  // A page the app loads itself keeps the headers of what the test opened.
  if (opening) pageHeaders = opening.headers;
  try {
    return await openPage(url, init, load.signal, opening);
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
  opening: Opening | undefined,
): Promise<Response> {
  // The test has moved on: to another page, or to the next test.
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
  // The node of the browser layer is on the page when the server rendered
  // its Client Component, which the Flight payload in the HTML names.
  // The same module has what the server renders around a node of the server,
  // so that the page can say when it has that node: see `rerender()`.
  const showsNode =
    opening !== undefined &&
    registry.opened === opening.opened &&
    html.includes(clientNodeReference);
  if (opening?.clientNode) opening.showsClientNode = showsNode;
  nodeOnPage = showsNode ? "coming" : "replaced";
  nodesShown = 0;
  await loadDocument(html, response.url, container);
  superseded();
  // A page load runs the app's scripts from scratch, so every page gets a
  // module graph of its own for the browser layer. With a client file loaded
  // that is the graph the file imports from: see client-graph.ts.
  const graph = takeGraph();
  const { runner } = graph;
  // React's scheduler, Next's router and Next's dev overlay each leave
  // something behind when they load: see leftovers.ts. That is from here
  // until `start()` says that Next's client has loaded.
  // This assumes that only the plugin's, React's and Next's code runs in that
  // window, and no module of the app: the modules of the app wait for Next's
  // client (see `start()` in client.tsx). A listener or channel
  // of the app's that was added in it would be taken from the app when the
  // page is left. A graph that a client file imports from has loaded some of
  // those modules before, and has what they left behind.
  const recorded = [recordListeners(window), recordMessageChannels()];
  const loaded = () => recorded.forEach((leftover) => leftover.stop());
  // The page counts as open from here, so that leaving it stops it, also
  // while its scripts load and while it hydrates.
  let unmount: (() => void) | undefined;
  let left = false;
  let leave = () => {
    left = true;
    loaded();
  };
  const opened: Page = { started: Promise.resolve(), unmount: () => leave() };
  const started = (async () => {
    const client = await runner.import<typeof import("./client.tsx")>(
      environmentModule("react_client", "vitest-plugin-rsc/nextjs/client"),
    );
    superseded();
    return client.start(loaded, container, signal, () => {
      if (page === opened) unlessShown();
    });
  })();
  opened.started = started.catch(() => {});
  page = opened;
  if (opening) opening.page = opened;
  try {
    ({ unmount, refresh: opened.refresh } = await started);
  } catch (error) {
    // Starting an app whose page is gone fails in its own ways.
    superseded();
    throw error;
  } finally {
    loaded();
    leave = () => {
      unmount?.();
      // Also what a client file loaded in the graph while the page was open.
      for (const leftover of [...graph.leftovers, ...recorded]) leftover.remove();
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
const queueMicrotask = globalThis.queueMicrotask;

function leavePage(): Promise<void> {
  currentLoad?.abort(new DOMException("The page was left before it had loaded.", "AbortError"));
  currentLoad = undefined;
  for (const rerender of rerenders) {
    rerender.reject(
      new DOMException("The page was left before the node had rendered again.", "AbortError"),
    );
  }
  rerenders.clear();
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
          try {
            await ssr.settleRequests();
          } finally {
            // What the test opened goes with its page: the route of a node,
            // and a pathname without the proxy. Nobody waits for its node
            // anymore.
            registry.opened = undefined;
            registry.clientNode?.rendered?.();
            setClientNode(undefined);
            resetAsyncLocalStorage();
            leftPage();
            // What a client file imports is of the next page from here on.
            await leaveGraph();
          }
        }
      }
    });
  leaving = gone;
  return gone;
}

/**
 * Leaves the page that `renderServer()` opened, removes the containers it made
 * and forgets its `headers`, the browser's cookies and what the app put in its
 * storage, like a new browser context. The server forgets what it has cached. Runs before and
 * after every test.
 *
 * Outside Vitest it forgets only what the app added: the cookies its server
 * set, and the cookies and the keys of the storage that were added while a
 * page of the app was open. The rest is the host's, like Storybook's.
 */
export async function cleanup(): Promise<void> {
  await leavePage();
  for (const container of containers) container.remove();
  containers.clear();
  pageHeaders = undefined;
  ssr.resetCaches();
  clearCookies();
  clearStorage();
}

// The app can leave its page without its router: `location.assign()`, a
// `<form>` or an `<a>` that React does not handle, Next's own fallback when a
// client-side navigation is not possible. For a browser that is a page load.
// Here it would replace the test with the app, so load the page the
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
