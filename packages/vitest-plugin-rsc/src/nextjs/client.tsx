import { unstable_rethrow } from "next/navigation";
import { Fragment, StrictMode, useEffect, type ReactNode } from "react";
import { flushSync } from "react-dom";
import ReactDOMClient, { type Root, type RootOptions } from "react-dom/client";
import { createFromReadableStream } from "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser";
import { registerModuleLoader } from "./client-modules.ts";
import {
  AppRouter,
  appBootstrap,
  callServer,
  createInitialRouterState,
  createMutableActionQueue,
  HeadManagerContext,
  invalidateBfCache,
  invalidateEntirePrefetchCache,
  loadAppIndex,
} from "./compat/browser/client.ts";
import { recordListeners, type Leftovers } from "./leftovers.ts";
import type { NodeOnPage } from "./node-on-page.ts";
// The module that the Flight payload of a node names: see rsc.ts.
import { setNodeOnPage } from "vitest-plugin-rsc/nextjs/node-rendered";
import { registry } from "./registry.ts";

// The browser layer. This module is the app's client entry: what Next's
// `main-app.js` chunk is for a deployment. Like that chunk, it runs once per
// page load, in a module graph of its own (see `openPage()` in page.ts), and starts the app
// from the document the server sent.

declare global {
  var __viteRscCallServer: typeof callServer;
  var __NEXT_HYDRATED_CB: (() => void) | undefined;
}

// The page that the root of the app renders now, which hears of what React
// reports on it. A page load has a module graph of its own, and with it a
// root, so this is the page of that load: but for an app that is kept for
// the pages after it (`renderAgain()`), whose root renders each of them in
// turn, and whose options are the ones of its first page.
type CurrentPage = {
  readonly signal: AbortSignal;
  readonly errors: unknown[];
  readonly nodeOnPage: NodeOnPage | undefined;
  /**
   * Set once the page is left: from then on React may report that a root
   * went before it had hydrated, which a browser drops with the page
   * unreported.
   */
  leaving: boolean;
};
let current: CurrentPage | undefined;

// A node hears of all of them: a `notFound()` takes its place too. A page
// that was left, whose load has aborted, reports no more.
function report(error: unknown): void {
  if (!current) return;
  current.nodeOnPage?.errored(error);
  if (!current.signal.aborted && !isNextControlFlow(error)) current.errors.push(error);
}

// The options of the root of the app, which also hear of the errors React
// reports: one that a boundary caught, and one that none did. Next's entry
// passes both, see compat/checks.ts.
function reportingErrors<Options extends RootOptions>(
  options: Options | undefined,
  report: (error: unknown) => void,
): Options | undefined {
  const { onCaughtError, onUncaughtError } = options ?? {};
  if (!options || !onCaughtError || !onUncaughtError) return options;
  return {
    ...options,
    onCaughtError(error, info) {
      report(error);
      onCaughtError(error, info);
    },
    onUncaughtError(error, info) {
      report(error);
      onUncaughtError(error, info);
    },
  };
}

// Whether an error is how Next goes on, not a failure: a `redirect()`, a
// `notFound()` and the like, which Next does not report either. Only the
// error itself, as Next checks it: not one that has such an error as its
// `cause`, which `unstable_rethrow()` throws too.
function isNextControlFlow(error: unknown): boolean {
  try {
    unstable_rethrow(error);
    return false;
  } catch (thrown) {
    return thrown === error;
  }
}

/**
 * Hydrates the document, or with a `container`, the node of a test in it.
 * Resolves once it has, with how to leave the page. Calls `loaded` once Next's
 * client has loaded, before a module of the app has. A page of a node tells
 * `nodeOnPage` what it does with the node: see node-rendered.tsx. The errors
 * that React reports on the root of the app go in `errors`, in order, but
 * for those of Next's control flow.
 *
 * Rejects once `signal` aborts, when the page is left before it has hydrated.
 * What it started is gone by then: the root, and the listeners React added.
 * A root that Next would create after that renders nothing.
 */
export async function start(
  loaded: () => void,
  container: Element | undefined,
  signal: AbortSignal,
  nodeOnPage: NodeOnPage | undefined,
  errors: unknown[],
  keep = false,
): Promise<StartedApp> {
  setNodeOnPage(nodeOnPage);
  const page: CurrentPage = { signal, errors, nodeOnPage, leaving: false };
  current = page;
  // Not when this module loads: a page that was left while it loaded must not
  // take over from the page that is there now. The modules of the app wait
  // for Next's client: the Flight client asks for them as soon as it loads.
  let nextLoaded!: () => void;
  const forgetLoader = registerModuleLoader(
    "browser",
    new Promise((resolve) => (nextLoaded = resolve)),
  );
  // A Server Action imported by a Client Component calls the server the way
  // Next's router does: a POST to the current page.
  globalThis.__viteRscCallServer = callServer;

  // Next's entry does not hand out the root it creates. Its root is the one of
  // the document, the `appElement` of `app-index.js`: a Client Component can
  // create roots of its own. For a node, that root is the container: Next's
  // app, its router included, runs in there and leaves the rest of the
  // document to the test.
  let root: Root | undefined;
  // React adds its listeners when it creates a root, and never removes them:
  // to the container, and for any container some to the document.
  const listeners: Leftovers[] = [];
  const { hydrateRoot, createRoot } = ReactDOMClient;
  // The root of the document is Next's own. For a node it is on the container
  // instead: `to` is where the root goes, and `isApp` says whether it is that
  // root.
  const keepRoot = <Target,>(
    target: Target,
    create: (to: Target, isApp: boolean) => Root,
  ): Root => {
    // Next creates its root late, after the payload of the page has come: a
    // page that is left by then is gone, and the document is the next one's.
    // It gets a root that renders nothing. Not an error: React would report
    // what this throws, as Next creates its root in a transition.
    if (signal.aborted) return { render() {}, unmount() {} };
    const isApp = (target as unknown) === document;
    const to = isApp && container ? (container as Target) : target;
    // The container of a node can be the test's, which outlives the node.
    const targets: EventTarget[] = isApp && container ? [document, container] : [document];
    const added = targets.map((of) => recordListeners(of));
    listeners.push(...added);
    try {
      const created = create(to, isApp);
      if (isApp) root = created;
      return created;
    } finally {
      for (const recorded of added) recorded.stop();
    }
  };
  ReactDOMClient.hydrateRoot = (target, children, options) =>
    keepRoot(target, (to, isApp) =>
      hydrateRoot(to, children, {
        ...(isApp ? reportingErrors(options, report) : options),
        onRecoverableError(error, info) {
          if (current?.leaving) return;
          if (options?.onRecoverableError) options.onRecoverableError(error, info);
          else reportError(error);
        },
      }),
    );
  ReactDOMClient.createRoot = (target, options) =>
    keepRoot(target, (to, isApp) =>
      createRoot(to, isApp ? reportingErrors(options, report) : options),
    );

  const leave = () => {
    page.leaving = true;
    // A page that is left loads no more Client Components, and the loader
    // would keep the ones it loaded.
    forgetLoader();
    root?.unmount();
    for (const added of listeners) added.remove();
  };

  // The payload of this page, which Next's entry reads and empties.
  const firstSegments = [...documentSegments()];
  try {
    // Next's entry reads the Flight payload in the document when it loads, so
    // it loads here, once Client Components can be loaded. Also for a page that
    // is left meanwhile: the payload it reads is the one of its own document
    // only until it has loaded.
    const { hydrate } = await loadAppIndex();
    loaded();
    nextLoaded();
    signal.throwIfAborted();
    // Next reads its asset prefix off the URL of the script that is running,
    // which for a deployment is the bootstrap script in the server's HTML.
    const bootstrapScript = document.querySelector("script[src*='/_next/']");
    if (!bootstrapScript) {
      throw new Error("vitest-plugin-rsc: the response is not a page of the Next.js app");
    }
    // A value, not a getter: V8 keeps a getter in the shape of the document
    // after it is deleted, and its closure would keep this page.
    Object.defineProperty(document, "currentScript", {
      configurable: true,
      value: bootstrapScript,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        // A page that is left stops waiting for its hydration, which may not
        // come: the document it hydrates is about to go.
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        // Called by Next's root component from an effect: its own e2e test hook.
        globalThis.__NEXT_HYDRATED_CB = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        // What Next's `app-next.js` does, minus the webpack chunk loading. No
        // `instrumentation-client` modules yet. Next 16.4 passes the asset
        // prefix, and its `hydrate()` takes it; from 16.5 neither does, and
        // the prefix it is passed is undefined.
        appBootstrap((assetPrefix?: string) => {
          (hydrate as (instrumentationModules: never, assetPrefix?: string) => Promise<void>)(
            [] as never,
            assetPrefix,
          ).catch(reject);
        });
      });
    } finally {
      delete (document as { currentScript?: unknown }).currentScript;
      // Its closure reaches the root, which would outlive the page.
      delete globalThis.__NEXT_HYDRATED_CB;
    }
  } catch (error) {
    // A page that did not start leaves nothing running in the next one.
    leave();
    throw error;
  } finally {
    // A page that was left keeps the ones that give it a root that renders
    // nothing: Next may still get to create one. This React DOM is the page's
    // own, see `openPage()` in page.ts.
    if (!signal.aborted) {
      ReactDOMClient.hydrateRoot = hydrateRoot;
      ReactDOMClient.createRoot = createRoot;
    }
  }
  // A contract with Next's entry. Without the root the app runs on, and the
  // page cannot be left.
  if (!root) {
    throw new Error(
      "vitest-plugin-rsc: Next.js did not create a React root on the document, " +
        "which the plugin needs to leave the page.",
    );
  }
  if (!keep) return { unmount: leave, leaveApp: leave };
  // A kept app outlives its first page: leaving that page empties the root,
  // and leaving the app is what removes it.
  // The payload of the first page, for the global error: decoded once, as
  // a page without one asks for it, and again after a decode that failed.
  let globalError: Promise<unknown> | undefined;
  app = {
    root,
    renders: 0,
    globalError: () =>
      // A promise of its own: what the Flight client returns is a thenable.
      (globalError ??= Promise.resolve(
        createFromReadableStream(documentPayload(firstSegments), { callServer }),
      ).then(
        (payload) => (payload as { G: unknown }).G,
        (error: unknown) => {
          globalError = undefined;
          throw error;
        },
      )),
  };
  return {
    unmount: () => leavePage(page, forgetLoader),
    leaveApp() {
      app = undefined;
      leave();
    },
  };
}

/** How to leave the page that `start()` or `renderAgain()` opened, and its app. */
export type StartedApp = {
  /** Leaves the page. For a kept app, its root stays, with nothing in it. */
  unmount(): void;
  /** Leaves the app: its root goes, and the listeners React added for it. */
  leaveApp(): void;
};

// The app that `start()` kept for the pages after its first: its root,
// and how many trees it has rendered, each with a key of its own.
// `globalError` is the global error of the app, its `global-error.js` and
// its CSS, which the payload of a document has and the one of Flight alone
// does not: the same for every page of the app.
let app: { root: Root; renders: number; globalError: () => Promise<unknown> } | undefined;

// Leaves a page of a kept app: its tree goes, at once, as with a page load
// that unmounts the root, and the root stays for the next page.
function leavePage(page: CurrentPage, forgetLoader: () => void): void {
  page.leaving = true;
  forgetLoader();
  flushSync(() => app?.root.render(null));
}

// The Flight payload of the document, which Next's scripts in it left in
// `self.__next_f`, as Next's entry reads it (`nextServerDataCallback()` of
// app-index.js): a page that `renderAgain()` renders is in the document in
// full before it starts, so the stream ends there.
type PayloadSegments = [number, string?][];
const documentSegments = (): PayloadSegments =>
  (self as unknown as { __next_f?: PayloadSegments }).__next_f ?? [];
function documentPayload(segments = documentSegments()): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const [kind, data = ""] of segments) {
        if (kind === 1) controller.enqueue(encoder.encode(data));
        else if (kind === 3)
          controller.enqueue(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
      }
      controller.close();
    },
  });
}

// A payload that is there in full, as a stream.
function streamOfBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

// Says when the tree of a page has committed and run its effects, as Next's
// `Root` does with `__NEXT_HYDRATED_CB`: its effect runs after the ones of
// the app below it.
function Committed({ onCommit, children }: { onCommit: () => void; children: ReactNode }) {
  useEffect(onCommit, [onCommit]);
  return children;
}

/**
 * Renders the page in the document into the root of the app that `start()`
 * kept, in place of the page before it: what Next's entry does as the page
 * loads, without the entry, from the Flight payload in the document. The
 * modules of the app stay, and so does its root, so this is no page load:
 * its Flight payload is decoded, the router gets a state of its own from it,
 * and a tree with a key of its own mounts.
 * Resolves as `start()` does, once it has rendered.
 *
 * What the modules of the app keep stays from the page before: Next's caches
 * of its router are emptied, but the state of a module of the app, or of a
 * package, is still there.
 */
export async function renderAgain(
  signal: AbortSignal,
  errors: unknown[],
  flight?: Uint8Array,
): Promise<StartedApp> {
  const kept = app;
  if (!kept) throw new Error("vitest-plugin-rsc: there is no kept app to render the page in.");
  setNodeOnPage(undefined);
  const page: CurrentPage = { signal, errors, nodeOnPage: undefined, leaving: false };
  current = page;
  // Next's client has loaded long ago, so the Client Components load at once.
  const forgetLoader = registerModuleLoader("browser");
  globalThis.__viteRscCallServer = callServer;
  // What the router of the page before prefetched, and the segments it kept
  // for back and forward, were rendered with that page's cookies and data.
  invalidateEntirePrefetchCache(null, null as never);
  invalidateBfCache();
  try {
    const payload = (await createFromReadableStream(
      flight ? streamOfBytes(flight) : documentPayload(),
      { callServer },
    )) as { G?: unknown; c?: string[] };
    // The payload of a request of Flight alone has no global error.
    const globalErrorState = payload.G ?? (await kept.globalError());
    signal.throwIfAborted();
    // Next creates the queue of its router once per page load, and checks
    // that it does: the plugin's patch lets it replace it here (plugin.ts).
    registry.replacingRouter = true;
    let actionQueue: ReturnType<typeof createMutableActionQueue>;
    try {
      actionQueue = createMutableActionQueue(
        createInitialRouterState({
          navigatedAt: Date.now(),
          // The canonical URL, which a payload of Flight alone does not
          // have: the router takes the one of `location`.
          initialRSCPayload: payload.c
            ? payload
            : { ...payload, c: (location.pathname + location.search).split("/") },
          initialFlightStreamForCache: null,
          location: window.location,
        } as never),
      );
    } finally {
      registry.replacingRouter = false;
    }
    const Strict = process.env.__NEXT_STRICT_MODE_APP ? StrictMode : Fragment;
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      const committed = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      kept.root.render(
        <Strict>
          <HeadManagerContext.Provider value={{ appDir: true }}>
            <Committed onCommit={committed}>
              <AppRouter
                key={++kept.renders}
                actionQueue={actionQueue}
                globalErrorState={globalErrorState as never}
              />
            </Committed>
          </HeadManagerContext.Provider>
        </Strict>,
      );
    });
  } catch (error) {
    leavePage(page, forgetLoader);
    throw error;
  }
  return {
    unmount: () => leavePage(page, forgetLoader),
    leaveApp() {
      app = undefined;
    },
  };
}
