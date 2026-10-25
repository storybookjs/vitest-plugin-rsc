// The page of the app that is open in this document, from the request of
// its document until it is left: a page load makes it part by part, and
// leaving it takes those back, the last part first, one page at a time.
import { routing } from "virtual:vitest-plugin-rsc/next-manifest";
import { resetAsyncLocalStorage } from "../async-local-storage.ts";
import {
  checkFetchedModules,
  createEnvironmentRunner,
  environmentModule,
  forgetHeardVersions,
  versionOfModules,
} from "../utils.ts";
import {
  leftTheApp,
  setOpenPage,
  setRouterOutlivesPage,
  sendRequest,
  unlessAborted,
} from "./app-requests.ts";
import { callServerWithoutPage } from "./client-graph.ts";
import {
  keepProperties,
  loadDocument,
  unloadDocument,
  unloadKeptApp,
  type HistoryEntry,
} from "./document.ts";
import { download, downloadName } from "./downloads.ts";
import { speedFeature } from "./speed-features.ts";
import { noRouter } from "./host-document.ts";
import { recordListeners, recordMessageChannels } from "./leftovers.ts";
import type { NodeOnPage } from "./node-on-page.ts";
import type { PageStore } from "./page-store.ts";
import { loadsNothing, registry, type Opened } from "./registry.ts";
import { loadedSsrLayer } from "./server-layers.ts";

// How long leaving a page waits for it to stop starting, at most: less than
// the 30 seconds of a hook in Browser Mode, so that this says why it waits.
const startTimeout = 20_000;
// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;

/**
 * A page of the app, from the first line of its load until it is left, with
 * the node of `renderServer()` on it, and where it reports its errors. Its
 * load makes it part by part, and each part that would outlive the page says
 * how it is released. Leaving stops the load at once, and releases the
 * parts, the last first.
 */
export class Page {
  readonly #load = new AbortController();
  /** Aborts as the page is left: what the load does takes it. */
  readonly signal = this.#load.signal;
  readonly #releases: (() => void)[] = [];
  #started: Promise<void> | undefined;
  #stopped = () => {};
  #left: Promise<void> | undefined;

  constructor(
    readonly errors: unknown[],
    readonly nodeOnPage?: NodeOnPage,
    /** Whether the page renders in the app kept from the page before: see `kept`. */
    readonly inKeptApp = false,
  ) {}

  /** Whether the page is open: from when its client starts until it is left. */
  get open(): boolean {
    return this.#started !== undefined && !this.signal.aborted;
  }

  /**
   * Runs `release` as the page is left: before what the load made before
   * it. As `defer()` of a `DisposableStack`.
   */
  defer(release: () => void): void {
    this.#releases.push(release);
  }

  /**
   * Opens the page: its client starts. Leaving waits for `started` to
   * settle, at most `startTimeout`, before it releases what the page holds.
   * `stopped` runs once the start is over for the page: once `started` has
   * settled, or once leaving stops waiting for it.
   */
  starts(started: Promise<unknown>, stopped: () => void): void {
    this.#started = started.then(stopped, stopped);
    this.#stopped = stopped;
  }

  /**
   * Leaves the page: `by` is what leaves it, for its node. Stops its load at
   * once. Resolves once what the page holds is released, or rejects with the
   * first error of a release, after every release has run. A page still
   * starting after `startTimeout` is released once it has stopped, and
   * `reportError()` gets that error: leaving resolves without it. Once:
   * leaving it again gets the same promise.
   */
  leave(by: string): Promise<void> {
    return (this.#left ??= this.#leave(by));
  }

  async #leave(by: string): Promise<void> {
    // A browser says that it leaves a page before it stops its requests. The
    // app of a page of the kept app stays to hear it, and its router reports
    // no failure of a request of the page after that: see `failsAsLeft()` in
    // app-requests.ts. The next page says that it is shown: see
    // `startInKeptApp()`.
    if (this.inKeptApp && this.open) dispatchPageTransition("pagehide");
    this.#load.abort(new DOMException("The page was left before it had loaded.", "AbortError"));
    this.nodeOnPage?.left(by);
    // An app that is still starting would go on to hydrate the next page
    // with the client code of this one. The abort above stops it, and it is
    // gone once `started` has settled: see `start()` in client.tsx. Until
    // then it may still load Next's client, which reads the payload of the
    // document it finds. Only a load that hangs takes long: the next page
    // loads anyway, and this one is released once it has stopped.
    const released = (this.#started ?? Promise.resolve()).then(() => this.#release());
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const stopped = await Promise.race([
      released.then(
        () => true,
        () => true,
      ),
      new Promise<false>((resolve) => (timeout = setTimeout(resolve, startTimeout, false))),
    ]);
    clearTimeout(timeout);
    if (stopped) return released;
    console.warn(
      `vitest-plugin-rsc: the page that was left was still loading its client code ` +
        `${startTimeout / 1000}s later. The next page loads anyway.`,
    );
    this.#stopped();
    released.catch(reportError);
  }

  // Every release runs, the last first, also after one that throws.
  #release(): void {
    let failed: { error: unknown } | undefined;
    for (const release of this.#releases.splice(0).reverse()) {
      try {
        release();
      } catch (error) {
        failed ??= { error };
      }
    }
    if (failed) throw failed.error;
  }
}

// The page of the latest load, from its first line until it is left.
let current: Page | undefined;

type Client = typeof import("./client.tsx");

// The kept app of `keepApp`: the one the first page of a test file started,
// which renders the pages after it in its root, from the Flight payload in
// their document, without a module graph, a root or Next's entry of their
// own: see `renderAgain()` in client.tsx. A page that the app loads itself
// from one of them, like after a `<form>` without JavaScript, renders in it
// too. It is left with the first page that does not, like one of
// `renderServer({ url, ssr: true })`, with the first page after a change of
// the modules of the browser layer, or as the test file ends: see
// `leaveKeptApp()`. `modules` is the version of those it started with.
let kept: { client: Client; modules: number; leave(): void } | undefined;

/**
 * Leaves the kept app, if any: its root, its module graph, what its modules
 * left behind as they loaded, and what its code added to the `<head>` go.
 * Once its page is left: see `leavePage()`, and `leaveKeptAppWithPage()`.
 */
function leaveKeptApp(): void {
  const app = kept;
  kept = undefined;
  setRouterOutlivesPage(false);
  try {
    app?.leave();
  } finally {
    unloadKeptApp();
  }
}

/**
 * Leaves the page of the kept app that is open, as `leavePage()` does with
 * `by`, and then the kept app: a test file ends with them. The app goes also
 * after a page that could not be left, and the first error rejects.
 */
export async function leaveKeptAppWithPage(by: string): Promise<void> {
  let failed: { error: unknown } | undefined;
  try {
    if (current?.inKeptApp) await leavePage(by);
  } catch (error) {
    failed = { error };
  }
  try {
    leaveKeptApp();
  } catch (error) {
    failed ??= { error };
  }
  if (failed) throw failed.error;
}

// Releases in the order of a page's: the last first, also after one that throws.
function releaseAll(releases: (() => void)[]): void {
  let failed: { error: unknown } | undefined;
  for (const release of releases.splice(0).reverse()) {
    try {
      release();
    } catch (error) {
      failed ??= { error };
    }
  }
  if (failed) throw failed.error;
}

/** The page that is open: see `Page.open`. */
export function currentPage(): Page | undefined {
  return current?.open ? current : undefined;
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
  /** What stops the load: see `RequestOptions.signal` in index.ts. */
  signal?: AbortSignal;
  /** Where the page, and the pages the app loads from it, report their errors. */
  errors: unknown[];
  /**
   * Renders the page in the app of the page before, if it is kept, and else
   * keeps the app it starts for the pages after it: see `kept`. A page of
   * `keepApp` without HTML of the server.
   */
  inKeptApp?: boolean;
};

// The document of a page, which a navigation has before it loads the page:
// see `navigate()`. `after` is the entry of the history that the page load
// adds its own after, for a navigation that adds one.
// `payload` is the Flight payload of a page that loaded without a document:
// see `requestFlight()`.
type PageDocument = {
  response: Response;
  html: string;
  after?: HistoryEntry;
  payload?: Uint8Array;
};

export async function loadPage(
  url: URL,
  request: RequestInit | PageDocument,
  from: PageStore,
  opening?: Opening,
): Promise<Response> {
  // Where the page reports its errors: to the `renderServer()` that opens
  // it, or for a page the app loads itself, to where the page it replaces
  // reported them: the app loads one only from a page (see the listener of
  // `navigate` in document-loads.ts). Before leaving, which forgets that page.
  const errors = opening?.errors ?? currentPage()?.errors ?? [];
  // A page that the app loads from a page of the kept app renders in it too.
  const inKeptApp = opening ? opening.inKeptApp === true : currentPage()?.inKeptApp === true;
  const leaving = leavePage(opening ? "another renderServer()" : "a page load of the app");
  // The page from here: the test moves on from it by leaving it, also while
  // it loads.
  const page = (current = new Page(errors, opening?.nodeOnPage, inKeptApp));
  const loading = (async () => {
    await leaving;
    page.signal.throwIfAborted();
    // A page load asks the dev server for the versions of its modules, as a
    // browser asks for a page: a change that reached the server through
    // another connection, like a request of the test, is ordered before
    // it. Within the page, the page reads what the server told it since.
    forgetHeardVersions();
    // A page that is not one of the kept app starts an app of its own, and so
    // does one when there is none, like after a first page whose app did not
    // start, or when the dev server has changed modules of the browser layer
    // since the app started: what that app added to the `<head>` goes first.
    // The app would run the modules it has next to the new ones, like a
    // second React.
    const changed = inKeptApp && kept && kept.modules !== (await versionOfModules("react_client"));
    page.signal.throwIfAborted();
    if (!inKeptApp || !kept || changed) leaveKeptApp();

    // Once the node that was in it is gone.
    if (opening?.container?.hasChildNodes()) {
      throw new Error(
        "vitest-plugin-rsc: the container of a node has to be empty. " +
          "The node is hydrated in it, and leaving the node empties it.",
      );
    }
    const opened = (registry.opened = opening?.opened);
    // `from` is the store of the browser context that loads the page, also
    // after the `await`s of `openPage()`. A page the app loads itself keeps
    // the headers of what the test opened.
    if (opening) {
      from.headers = opening.headers;
      if (opening.cookie !== null) from.seed(opening.cookie);
    }
    try {
      return await openPage(page, url, request, from, opening);
    } catch (error) {
      // A load that failed has no requests left, unless the test has moved on
      // to a page or a node of its own. Only `leavePage()` stops a load. The
      // server may still render the request of a stopped one, so leaving
      // forgets what it opened once that request is done.
      if (opened && registry.opened === opened && !page.signal.aborted) {
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
    if (current === page) leavePage("the signal of renderServer()").catch(reportError);
  });
}

async function openPage(
  page: Page,
  url: URL,
  request: RequestInit | PageDocument,
  from: PageStore,
  opening: Opening | undefined,
): Promise<Response> {
  const { signal } = page;
  // The test has moved on: to another page, or to the next test.
  const superseded = () => signal.throwIfAborted();
  const requestDocument = async (init: RequestInit) => {
    try {
      const response = await sendPageLoad(url, init, { from, navigation: "test" }, signal);
      superseded();
      return await readDocument(
        response,
        (what) =>
          `${what}, which is not a page to open. ` +
          `Use handleRequest() to assert on the response itself.`,
      );
    } catch (error) {
      // Leaving the page cuts off the document.
      superseded();
      throw error;
    }
  };

  // A page of the kept app that the test opens, with the speed feature
  // `flightLoads`: the request of its Flight payload alone, which Next's
  // server renders without HTML. See `requestFlight()`.
  const flight =
    page.inKeptApp && kept !== undefined && !("html" in request) && speedFeature("flightLoads")
      ? await requestFlight(
          url,
          request,
          (target, init) => sendPageLoad(target, init, { from, navigation: "test" }, signal),
          kept.client,
          signal,
        )
      : undefined;
  superseded();
  // The test's request, or the document that a navigation has: see `navigate()`.
  const { response, html, after, payload } =
    flight ?? ("html" in request ? request : await requestDocument(request));
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
  await loadDocument(html, response.url, container, after, page.inKeptApp);
  superseded();
  const { inKeptApp } = page;
  // A page of the kept app renders in it, from the Flight payload of its
  // document: the empty one of `ssr: false`.
  if (inKeptApp && kept) {
    await startInKeptApp(page, kept.client, payload);
    superseded();
    return response;
  }
  // What the app holds, which goes with the page, or with a kept app once
  // that is left.
  const appReleases: (() => void)[] = [];
  const deferForApp = (release: () => void) =>
    inKeptApp ? appReleases.push(release) : page.defer(release);
  // A page load runs the app's scripts from scratch, so every page gets a
  // module graph of its own for the browser layer. A page that is left keeps
  // no module graph: what of it stays, like an error whose stack has the
  // frames that loaded a module, cannot reach its modules through the runner.
  // The version of the modules that it starts with, or an older one: see
  // `kept`. Its runner takes the modules of a check after it.
  const modules = inKeptApp ? await versionOfModules("react_client") : 0;
  if (inKeptApp) await checkFetchedModules();
  superseded();
  const runner = createEnvironmentRunner("react_client");
  deferForApp(() => void runner.close());
  // The browser's Flight client reads properties off `__webpack_require__`
  // when it loads, which is before the page can say how it loads a module,
  // and wraps some of them. One that the pages shared would keep every page.
  const browserRequire = (id: string) => registry.loadBrowserModule?.(id) ?? loadsNothing();
  registry.browserRequire = browserRequire;
  // What the page's Flight client wrapped of it keeps the page. Once it is
  // left, it loads nothing more, as its closed runner.
  deferForApp(() => {
    if (registry.browserRequire === browserRequire) registry.browserRequire = loadsNothing;
  });
  // React's scheduler, Next's router and Next's dev overlay each leave
  // something behind when they load: see leftovers.ts. That is from here
  // until `start()` says that Next's client has loaded.
  // This assumes that only the plugin's, React's and Next's code runs in that
  // window, and no module of the app: the modules of the app wait for Next's
  // client (see `start()` in client.tsx). A listener or channel
  // of the app's that was added in it would be taken from the app when the
  // page is left.
  const leftovers = [recordListeners(window), recordMessageChannels()];
  for (const leftover of leftovers) deferForApp(() => leftover.remove());
  const loaded = () => leftovers.forEach((leftover) => leftover.stop());
  const started = (async () => {
    try {
      const client = await runner.import<Client>(
        environmentModule("react_client", "vitest-plugin-rsc/nextjs/client"),
      );
      superseded();
      const { unmount, leaveApp } = await client.start(
        loaded,
        container,
        signal,
        opening?.nodeOnPage,
        page.errors,
        inKeptApp,
      );
      page.defer(unmount);
      if (!inKeptApp) return;
      appReleases.push(leaveApp);
      // React DOM marks the document as the container of the root, and as
      // one it listens on. The root stays, and so do they: see document.ts.
      const marks = Reflect.ownKeys(document).filter(
        (key) =>
          typeof key === "string" &&
          (key.startsWith("__reactContainer$") || key.startsWith("_reactListening")),
      );
      keepProperties(document, marks);
      // A kept app before this one, if any. What it added to the `<head>` is
      // gone already: see `loadPage()`.
      leaveKeptApp();
      kept = {
        client,
        modules,
        leave() {
          keepProperties(document);
          try {
            releaseAll(appReleases);
          } finally {
            for (const key of marks) Reflect.deleteProperty(document, key);
          }
        },
      };
      setRouterOutlivesPage(true);
    } catch (error) {
      // An app that did not start is not kept: it goes with its page.
      releaseAll(appReleases);
      throw error;
    }
  })();
  // The page is open from here: `currentPage()` has it, for the navigations
  // of its app (document-loads.ts), and leaving waits for its start.
  page.starts(started, loaded);
  setOpenPage(signal);
  try {
    await started;
  } catch (error) {
    // Starting an app whose page is gone fails in its own ways.
    superseded();
    throw error;
  }
  superseded();
  return response;
}

// What a browser fires on the window as it leaves a page and shows the next,
// for a page that is not kept for back and forward.
function dispatchPageTransition(type: "pagehide" | "pageshow"): void {
  window.dispatchEvent(new PageTransitionEvent(type, { persisted: false }));
}

// Renders the page in the kept app, from the Flight payload in its document:
// see `renderAgain()` in client.tsx.
async function startInKeptApp(page: Page, client: Client, payload?: Uint8Array): Promise<void> {
  const { signal } = page;
  dispatchPageTransition("pageshow");
  const started = client
    .renderAgain(signal, page.errors, payload)
    .then(({ unmount }) => page.defer(unmount));
  page.starts(started, () => {});
  setOpenPage(signal);
  try {
    await started;
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  }
}

// The request of a page load, with the modules of the server and of the
// browser layer as the dev server has them now.
async function sendPageLoad(
  url: URL,
  init: RequestInit,
  sending: Pick<Parameters<typeof sendRequest>[1], "from" | "navigation" | "network" | "opened">,
  signal: AbortSignal,
): Promise<Response> {
  await checkFetchedModules();
  signal.throwIfAborted();
  // Not the browser's Request, which drops headers of the test's, like
  // `referer` and `origin`.
  return sendRequest(new registry.Request(url, { ...init, signal }), sending);
}

// The document of a page of the kept app that loads by its Flight payload:
// what Next's renderer renders for a page without HTML (compat/patches.ts),
// without its scripts, which carry the payload that came on its own.
const flightDocument = '<!DOCTYPE html><html id="__next_error__"><head></head><body></body></html>';

// The speed feature `flightLoads`: a page of the kept app, which renders from
// its Flight payload alone, loads with the request Next's router sends for one,
// `RSC: 1`, without the tree of a router, so Next renders the whole tree, from
// the root layout. Next's server renders no HTML for it, so there is no
// document to stream, parse and run, and no payload in it to read back. The
// proxy gets the request as for a document: Next takes the headers of Flight
// off a request to the middleware. The payload is there in full before the app
// renders it, as the payload of a document is. A response that is not Flight,
// like a route handler's, or an error page of HTML, is read as a document is.
// A page whose payload redirects loads as its target: see `followFlight()`.
async function requestFlight(
  url: URL,
  init: RequestInit,
  send: (url: URL, init: RequestInit) => Promise<Response>,
  client: Client,
  signal: AbortSignal,
): Promise<PageDocument> {
  const headers = new Headers(init.headers);
  headers.set("rsc", "1");
  const flight = { ...init, headers };
  try {
    const loaded = await followFlight(
      await send(url, flight),
      (target) => send(target, flight),
      flight,
      client,
    );
    signal.throwIfAborted();
    if ("payload" in loaded) return loaded;
    return await readDocument(
      loaded.response,
      (what) =>
        `${what}, which is not a page to open. ` +
        `Use handleRequest() to assert on the response itself.`,
    );
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  }
}

const isFlight = (response: Response) =>
  /^text\/x-component\b/i.test(response.headers.get("content-type") ?? "");

// The page of a response of Flight, read in full, or a response that is not
// Flight. The server handles the request of a page once, as for a document:
// a `notFound()` or an error renders from the payload, with its boundary, as
// Next's router renders it, and the status is the one of the response of
// Flight, 200, as with the document of `ssr: false`, which renders no HTML
// that could fail. A page whose payload redirects, Suspense or not, loads as
// its target, as a browser follows the 307 of a document: with a request of
// Flight of the target, which is sent `init` again, as a 307 sends it. The
// page that redirected does not render.
async function followFlight(
  response: Response,
  send: (url: URL) => Promise<Response>,
  init: RequestInit,
  client: Client,
): Promise<PageDocument | { response: Response }> {
  let redirected = response.redirected;
  for (let redirects = 0; isFlight(response); ) {
    const payload = new Uint8Array(await response.arrayBuffer());
    const location = redirectOf(payload, client);
    if (location === undefined) {
      if (redirected) response = redirectedResponse(response, payload);
      return { response, html: flightDocument, payload };
    }
    const target = new URL(location, response.url);
    if (target.origin !== window.location.origin) throw leftTheApp(target);
    if (++redirects > 20) {
      throw new Error(
        `vitest-plugin-rsc: too many redirects for ${response.url}. ` +
          `The last one was to ${target.href}.`,
      );
    }
    // What `fetch` does with a body it cannot send again. A page load of a
    // `GET` has none.
    if (init.body instanceof ReadableStream) {
      throw new TypeError("fetch failed", {
        cause: new Error(
          `vitest-plugin-rsc: ${response.url} redirected to ${target.href}, and the body of ` +
            `its request is a stream, which cannot be sent again.`,
        ),
      });
    }
    redirected = true;
    response = await send(target);
  }
  return { response: redirected ? redirectedResponse(response, response.body) : response };
}

// The response of the page that a page load ended at, after a redirect of a
// payload, as `fetch` has it after a redirect: `sendRequest()` gives each of
// its responses its own `url` and `redirected`, which stay as they are.
function redirectedResponse(response: Response, body: BodyInit | null): Response {
  if (response.redirected) return response;
  const { status, statusText, headers, url } = response;
  return Object.defineProperties(new registry.Response(body, { status, statusText, headers }), {
    url: { value: url },
    redirected: { value: true },
  });
}

// The errors of a Flight payload, the first `redirect()` of which is where the
// page goes, wherever it is in the tree, as Next's router follows it (its
// RedirectBoundary). React sends an error as a row of its own,
// `<id>:E{"digest":...}`, on a line of its own, and Next reads the digest
// (`redirectURL()` of client.tsx). Text of the page in a row of text, which
// is not escaped, can look like a row too: its digest has to be a redirect.
const errorRows = /(?:^|\n)[0-9a-f]+:E(\{.*)/g;
/**
 * Where the page of a Flight payload redirects to, if it does: see
 * `followFlight()`. A path of the app's has the app's `basePath` before it,
 * which `redirect()` takes without it, as Next's server puts it in the
 * `Location` of the 307 of a document.
 */
export function redirectOf(
  payload: Uint8Array,
  client: Pick<Client, "redirectURL">,
): string | undefined {
  for (const [, row] of new TextDecoder().decode(payload).matchAll(errorRows)) {
    let digest: unknown;
    try {
      digest = (JSON.parse(row!) as { digest?: unknown }).digest;
    } catch {
      continue;
    }
    const url = typeof digest === "string" ? client.redirectURL(digest) : undefined;
    if (url !== undefined) return url.startsWith("/") ? routing.basePath + url : url;
  }
  return undefined;
}

// The whole document, then the app: what a browser has once the page has
// loaded. A route handler can answer with anything, and there is no app in
// that to start: `notAPage` says so, of `what` it answered.
async function readDocument(
  response: Response,
  notAPage: (what: string) => string,
): Promise<PageDocument> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^text\/html\b/i.test(contentType)) {
    await response.body?.cancel();
    const what = `${response.url} responded with ${contentType || "no content type"}`;
    throw new Error(`vitest-plugin-rsc: ${notAPage(what)}`);
  }
  return { response, html: await response.text() };
}

// The page load that a navigation of the app would replace: a later one
// stops it, as in a browser.
let navigating = new AbortController();
// What stops a navigation without a page: the test moving on, which leaves
// the page that is not there too.
let withoutPage = new AbortController();

/**
 * A navigation of the app without its router, as a browser makes it: a
 * `<form>`, an `<a>` that React does not handle, `location.assign()`. The
 * page that is open stays until the answer is there, and for good when the
 * answer is a download (downloads.ts). Else the answer is the next page,
 * which needs a page of the app to navigate in. `downloadRequest` is the
 * navigation's, and `from` the store of the browser context it is in. With
 * `push` the next page gets an entry of the history of its own, as after a
 * link or a form in a browser. Else it takes the entry of the page, as
 * after a reload or `location.replace()`.
 */
export async function navigate(
  url: URL,
  init: RequestInit,
  downloadRequest: string | null,
  from: PageStore,
  push: boolean,
): Promise<void> {
  const page = currentPage();
  const signals = [page?.signal ?? withoutPage.signal];
  // An `<a download>` loads no page: it neither stops another navigation
  // nor is stopped by one.
  if (downloadRequest === null) {
    navigating.abort(
      new DOMException("Another navigation took the place of this one.", "AbortError"),
    );
    navigating = new AbortController();
    signals.push(navigating.signal);
  }
  const signal = AbortSignal.any(signals);
  // A page of the kept app loads the next one of it by its Flight payload, with
  // the speed feature `flightLoads`: see `requestFlight()`. A `GET` only: a
  // `<form>` that posts loads a document.
  const byFlight =
    downloadRequest === null &&
    page?.inKeptApp === true &&
    kept !== undefined &&
    speedFeature("flightLoads") &&
    (init.method ?? "GET").toUpperCase() === "GET";
  const client = kept?.client;
  const send = (target: URL, flight: boolean) => {
    const headers = new Headers(init.headers);
    if (flight) headers.set("rsc", "1");
    return sendPageLoad(
      target,
      { ...init, headers },
      {
        from,
        navigation: "app",
        // A page that the app loads from a page of the kept app renders in
        // it from its Flight payload, as a page of `renderServer()` does:
        // without HTML of the server, which React would only take down.
        opened: page?.inKeptApp
          ? { pathname: target.pathname, proxy: true, ssr: false }
          : undefined,
        // A file of `public/`, which the network has: a download needs no page.
        network:
          downloadRequest === null ? undefined : () => registry.network(url, { ...init, signal }),
      },
      signal,
    );
  };
  let loaded: PageDocument | undefined;
  try {
    let response = await send(url, byFlight);
    signal.throwIfAborted();
    if (byFlight && client) {
      const followed = await followFlight(response, (target) => send(target, true), init, client);
      signal.throwIfAborted();
      if ("payload" in followed) loaded = followed;
      else response = followed.response;
    }
    if (!loaded) {
      const name = downloadName(response, downloadRequest);
      if (name !== undefined) return await download(response, name, signal);
      if (!page) {
        await response.body?.cancel();
        throw noRouter(url);
      }
      loaded = await readDocument(
        response,
        (what) =>
          `the app navigated to a URL that is not a page: ${what}. A browser would show it in ` +
          `place of the app, which a test cannot do. A route handler that answers with a file ` +
          `to save says so with Content-Disposition: attachment, or a link with download.`,
      );
      signal.throwIfAborted();
    }
  } catch (error) {
    // Leaving the page cuts off the answer.
    signal.throwIfAborted();
    throw error;
  }
  await loadPage(url, { ...loaded, after: entryOf(push) }, from);
}

// The entry of the page that is left, as its app leaves it: leaving the
// page puts the URL of the document in it. None for a page load that takes
// the entry of the page.
const entryOf = (push: boolean): HistoryEntry | undefined =>
  push ? { url: window.location.href, state: window.history.state } : undefined;

// One at a time: a page that is being left is left before the next one is.
// Also with no page: what a page load leaves in the document, the server
// and the globals is the document's between pages, not one page's.
let leaving: Promise<void> = Promise.resolve();

// Leaves the page of the latest load: `by` is what leaves it, for its node.
export function leavePage(by: string): Promise<void> {
  const left = current;
  current = undefined;
  withoutPage.abort(new DOMException("The test moved on before it was done.", "AbortError"));
  withoutPage = new AbortController();
  const pageLeft = left?.leave(by);
  // Also after a page that could not be left: that one fails its own test.
  const gone = leaving
    .catch(() => {})
    .then(async () => {
      try {
        await pageLeft;
      } finally {
        try {
          unloadDocument();
        } finally {
          try {
            await loadedSsrLayer()?.settleRequests();
          } finally {
            // What the test opened goes with its page: the route of a node,
            // and a pathname without the proxy.
            registry.opened = undefined;
            // No page hears a request of Next's until the next one starts.
            setOpenPage(undefined);
            // A Server Action has no page to post to until the next one starts.
            globalThis.__viteRscCallServer = callServerWithoutPage;
            resetAsyncLocalStorage();
          }
        }
      }
    });
  leaving = gone;
  return gone;
}
