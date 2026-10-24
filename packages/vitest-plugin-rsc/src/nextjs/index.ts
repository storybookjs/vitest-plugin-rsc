import "./globals.ts";
import { createElement, type JSXElementConstructor, type ReactNode } from "react";
import { sendRequest, unlessAborted } from "./app-requests.ts";
import { closeContext, openContext } from "./browser-context.ts";
import { unlinkStylesheets } from "./client-graph.ts";
import { resetDisk } from "./disk.ts";
import "./document-loads.ts";
import { speedFeature } from "./speed-features.ts";
import { NodeOnPage } from "./node-on-page.ts";
import { leavePage, loadPage } from "./page.ts";
import { registry, type Opened } from "./registry.ts";
import { loadedSsrLayer, rscLayer, ssrLayer } from "./server-layers.ts";

// The entry of the server's API. A host that imports it sends requests to
// the app, so both layers of Next's server start to load as it evaluates,
// before the first request asks for them, and the rsc layer, the document's
// own graph, is there once it has. What a request waits for, and what not:
// see app-requests.ts.
void ssrLayer();
await rscLayer();

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
  return sendRequest(request, {
    from: openContext().store,
    credentials: request.credentials !== "omit",
  });
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
  const from = openContext().store;
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
      // the route renders nothing, also after a `redirect()`, see `appFetch()` in
      // app-requests.ts.
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
  /**
   * Whether the server renders the HTML of the page, which the browser then
   * hydrates. With `false` the browser renders the app from the Flight
   * payload alone, with `createRoot()`, as Next does for an error page: a
   * test no longer sees the HTML of the server, or a mismatch between it and
   * the browser.
   *
   * Defaults to `true`, and to `false` with the speed feature `keepApp` of
   * `vitestPluginNext()`, on in fast mode, where a page without HTML of the
   * server renders in the app of the page before it in the test file: see
   * `SpeedOptions.keepApp`. A test that asserts on the HTML of the server
   * passes `ssr: true`, and gets a page load of its own.
   */
  ssr?: boolean;
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
  // The browser context of the page: the one that is open, or a new one.
  const { store } = openContext();
  const errors: unknown[] = [];
  const url = new URL(options.url ?? "/", window.location.origin);
  const headers = new Headers(options.headers);
  // A `cookie` header sets cookies in the store with the document, and every
  // request sends the cookies of the store: see `loadPage()` in page.ts.
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
    // `keepApp` renders a page without HTML in the app of the page before.
    const ssr = first.ssr ?? !speedFeature("keepApp");
    const opened = { pathname, proxy: first.proxy ?? true, ssr };
    return {
      response: await loadPage(url, { headers }, store, {
        opened,
        headers: sticky,
        cookie,
        signal,
        errors,
        inKeptApp: speedFeature("keepApp") && !ssr,
      }),
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
    const response = await loadPage(url, { headers }, store, {
      opened,
      headers: sticky,
      cookie,
      nodeOnPage,
      signal,
      errors,
    });
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
  // container with content: see `loadPage()` in page.ts.
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
  const response = await loadPage(url, { headers }, store, {
    container,
    opened,
    headers: sticky,
    cookie,
    nodeOnPage,
    signal,
    errors,
  });
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
 * and closes the browser context of the app: its `headers`, the app's
 * cookies and what the app put in its storage go, and the document has the
 * browser's own APIs again. What still runs of the page, like a timer, uses
 * those. The server forgets what it has cached, and what was written to its
 * disk, the `fs` of the server code and the tests.
 * Unlinks the stylesheets of the files of the host: the host links a file's
 * again as it uses it, with `linkStylesheetsOf()`. Runs before and after
 * every test, after which the plugin's setup file links those of the setup
 * files and the test file again.
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
  unlinkStylesheets();
  closeContext();
  await loadedSsrLayer()?.resetCaches();
  resetDisk();
  if (url !== undefined) window.history.replaceState(window.history.state, "", url);
}

/**
 * Leaves the page, as `cleanup()` does, and opens a new browser context of
 * the app: until `cleanup()`, the document has the app's cookies, storage,
 * requests and navigations, empty, as a page of the app has them. Outside
 * one it has the browser's own. `renderServer()`, `handleRequest()` and
 * `runInServerAction()` open one when none is open, so call this before
 * what seeds the page before it opens, like an item of `localStorage`. The
 * plugin's setup file calls it before every test of a file without
 * `"use client"`.
 */
export async function newBrowserContext(): Promise<void> {
  await cleanup();
  openContext();
}
