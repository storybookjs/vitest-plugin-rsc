// The page of the app that is open in this document, from the request of
// its document until it is left: a page load makes it part by part, and
// leaving it takes those back, the last part first, one page at a time.
import { resetAsyncLocalStorage } from "../async-local-storage.ts";
import { checkFetchedModules, createEnvironmentRunner, environmentModule } from "../utils.ts";
import { setOpenPage, pageStore, sendRequest, unlessAborted } from "./app-requests.ts";
import { callServerWithoutPage } from "./client-graph.ts";
import { loadDocument, unloadDocument } from "./document.ts";
import { recordListeners, recordMessageChannels } from "./leftovers.ts";
import type { NodeOnPage } from "./node-on-page.ts";
import type { PageStore } from "./page-store.ts";
import { registry, type Opened } from "./registry.ts";
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
  // Until the page is released: then a part is released as it is made.
  #releases: (() => void)[] | undefined = [];
  #started: Promise<void> | undefined;
  #stopped = () => {};
  #left: Promise<void> | undefined;

  constructor(
    readonly errors: unknown[],
    readonly nodeOnPage?: NodeOnPage,
  ) {}

  /** Whether the page is open: from when its client starts until it is left. */
  get open(): boolean {
    return this.#started !== undefined && !this.signal.aborted;
  }

  /**
   * Releases `release` as the page is left: before what the load made
   * before it.
   */
  holds(release: () => void): void {
    if (this.#releases) this.#releases.push(release);
    else release();
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
   * first error of a release, after every release has run. Once: leaving it
   * again gets the same promise.
   */
  leave(by: string): Promise<void> {
    return (this.#left ??= this.#leave(by));
  }

  async #leave(by: string): Promise<void> {
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
    const releases = this.#releases ?? [];
    this.#releases = undefined;
    let failed: { error: unknown } | undefined;
    for (const release of releases.reverse()) {
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
};

export async function loadPage(url: URL, init: RequestInit, opening?: Opening): Promise<Response> {
  // Where the page reports its errors: to the `renderServer()` that opens
  // it, or for a page the app loads itself, to where the page it replaces
  // reported them: the app loads one only from a page (see the listener of
  // `navigate` in document-loads.ts). Before leaving, which forgets that page.
  const errors = opening?.errors ?? currentPage()?.errors ?? [];
  const leaving = leavePage(opening ? "another renderServer()" : "a page load of the app");
  // The page from here: the test moves on from it by leaving it, also while
  // it loads.
  const page = (current = new Page(errors, opening?.nodeOnPage));
  const loading = (async () => {
    await leaving;
    page.signal.throwIfAborted();

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
    const from = pageStore();
    if (opening) {
      from.headers = opening.headers;
      if (opening.cookie !== null) from.seed(opening.cookie);
    }
    try {
      return await openPage(page, url, init, from, opening);
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
  init: RequestInit,
  from: PageStore,
  opening: Opening | undefined,
): Promise<Response> {
  const { signal } = page;
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
  // module graph of its own for the browser layer. A page that is left keeps
  // no module graph: what of it stays, like an error whose stack has the
  // frames that loaded a module, cannot reach its modules through the runner.
  const runner = createEnvironmentRunner("react_client");
  page.holds(() => void runner.close());
  const browserRequire = browserRequireOfPage();
  registry.browserRequire = browserRequire;
  // What the page's Flight client wrapped of it keeps the page. Once it is
  // left, it loads nothing more, as its closed runner.
  page.holds(() => {
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
  page.holds(() => leftovers.forEach((leftover) => leftover.remove()));
  const loaded = () => leftovers.forEach((leftover) => leftover.stop());
  const started = (async () => {
    const client = await runner.import<typeof import("./client.tsx")>(
      environmentModule("react_client", "vitest-plugin-rsc/nextjs/client"),
    );
    superseded();
    const { unmount } = await client.start(
      loaded,
      container,
      signal,
      opening?.nodeOnPage,
      page.errors,
    );
    page.holds(unmount);
  })();
  // The page counts as open from here, so that leaving it stops it, also
  // while its scripts load and while it hydrates.
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

// The browser's Flight client reads properties off `__webpack_require__`
// when it loads, which is before the page can say how it loads a module,
// and wraps some of them. One that the pages shared would keep every page,
// so each page gets one of its own. Made here, and not in `openPage()`,
// whose closures hold the page's runner.
const browserRequireOfPage = () => (id: string) => registry.loadBrowserModule(id);
const loadsNothing = () => new Promise<never>(() => {});

// One at a time: a page that is being left is left before the next one is.
// Also with no page: what a page load leaves in the document, the server
// and the globals is the document's between pages, not one page's.
let leaving: Promise<void> = Promise.resolve();

// Leaves the page of the latest load: `by` is what leaves it, for its node.
export function leavePage(by: string): Promise<void> {
  const left = current;
  current = undefined;
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
          await loadedSsrLayer()?.settleRequests();
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
