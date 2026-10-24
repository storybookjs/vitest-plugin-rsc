import { JSXElementConstructor, ReactNode } from "react";

//#region src/nextjs/index.d.ts
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
declare function handleRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
type RunInServerActionOptions = {
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
declare function runInServerAction<T>(action: () => T, options?: RunInServerActionOptions): Promise<Awaited<T>>;
type RequestOptions = {
  /** The URL to open. Defaults to `/`. */url?: string;
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
type RenderServerOptions = RequestOptions & {
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
   * Defaults to `true`, and to `false` in fast mode (`fast.keepApp` of
   * `vitestPluginNext()`), where a page without HTML of the server renders
   * in the app of the page before it in the test file: see
   * `VitestPluginNextOptions.fast`. A test that asserts on the HTML of the
   * server passes `ssr: true`, and gets a page load of its own.
   */
  ssr?: boolean;
};
type RenderServerResult = {
  /** The server's response to the request of the document. */response: Response;
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
  errors: unknown[]; /** Leaves the page. The cookies and the `headers` stay until the test ends. */
  unmount(): Promise<void>;
};
type RenderComponentOptions = RequestOptions & {
  /**
   * Where the node renders. Defaults to a `<div>` appended to `baseElement`,
   * which `cleanup()` removes. A container of the test's is only emptied.
   */
  container?: HTMLElement; /** Defaults to the `container` of the test, or else to `document.body`. */
  baseElement?: HTMLElement; /** Wraps the node on the server. It can be a Server Component. */
  wrapper?: JSXElementConstructor<{
    children: ReactNode;
  }>;
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
type RenderComponentResult = RenderServerResult & {
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
declare function renderServer(options: RenderServerOptions): Promise<RenderServerResult>;
declare function renderServer(ui: ReactNode, options?: RenderComponentOptions): Promise<RenderComponentResult>;
type CleanupOptions = {
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
declare function cleanup({
  url
}?: CleanupOptions): Promise<void>;
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
declare function newBrowserContext(): Promise<void>;
//#endregion
export { CleanupOptions, RenderComponentOptions, RenderComponentResult, RenderServerOptions, RenderServerResult, RunInServerActionOptions, cleanup, handleRequest, newBrowserContext, renderServer, runInServerAction };