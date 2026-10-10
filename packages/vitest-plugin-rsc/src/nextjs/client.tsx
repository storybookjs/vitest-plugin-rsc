import { appBootstrap } from "next/dist/client/app-bootstrap";
import { callServer } from "next/dist/client/app-call-server";
import { publicAppRouterInstance } from "next/dist/client/components/app-router-instance";
import ReactDOMClient, { type Root, type RootOptions } from "react-dom/client";
import { registerModuleLoader } from "./client-modules.ts";
import { recordListeners, type Leftovers } from "./leftovers.ts";

// The browser layer. This module is the app's client entry: what Next's
// `main-app.js` chunk is for a deployment. Like that chunk, it runs once per
// page load, in a module graph of its own (see `renderServer()`), and starts the app
// from the document the server sent.

declare global {
  var __viteRscCallServer: typeof callServer;
  var __NEXT_HYDRATED_CB: (() => void) | undefined;
}

// React tells the root of the app of an error that a boundary caught, and of
// one that none did, with these options. Next's entry passes both.
function reportingErrors<Options extends RootOptions>(
  options: Options | undefined,
  onError: () => void,
): Options | undefined {
  const { onCaughtError, onUncaughtError } = options ?? {};
  if (!options || !onCaughtError || !onUncaughtError) return options;
  return {
    ...options,
    onCaughtError(error, info) {
      onError();
      onCaughtError(error, info);
    },
    onUncaughtError(error, info) {
      onError();
      onUncaughtError(error, info);
    },
  };
}

/** A page of the app that has started. */
export type StartedPage = {
  /** Leaves the page. */
  unmount(): void;
  /** Has Next's router render the page again, as `router.refresh()` does. */
  refresh(): void;
};

/**
 * Hydrates the document, or with a `container`, the node of a test in it.
 * Resolves once it has, with how to leave the page. Calls `loaded` once Next's
 * client has loaded, before a module of the app has, and `onError` when React
 * reports an error of the app, which a boundary may have caught.
 *
 * Rejects once `signal` aborts, when the page is left before it has hydrated.
 * What it started is gone by then: the root, and the listeners React added.
 * A root that Next would create after that renders nothing.
 */
export async function start(
  loaded: () => void,
  container: Element | undefined,
  signal: AbortSignal,
  onError: () => void,
): Promise<StartedPage> {
  // Not when this module loads: a page that was left while it loaded must not
  // take over from the page that is there now. The modules of the app wait
  // for Next's client: the Flight client asks for them as soon as it loads.
  let nextLoaded!: () => void;
  registerModuleLoader("browser", new Promise((resolve) => (nextLoaded = resolve)));
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
  // instead: `to` is where the root goes. It reports the errors of the app.
  const keep = <Target,>(target: Target, create: (to: Target, isApp: boolean) => Root): Root => {
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
  // Set once the page is left: from then on React may report that a root went
  // before it had hydrated, which a browser drops with the page unreported.
  let leaving = false;
  ReactDOMClient.hydrateRoot = (target, children, options) =>
    keep(target, (to, isApp) =>
      hydrateRoot(to, children, {
        ...(isApp ? reportingErrors(options, onError) : options),
        onRecoverableError(error, info) {
          if (leaving) return;
          if (options?.onRecoverableError) options.onRecoverableError(error, info);
          else reportError(error);
        },
      }),
    );
  ReactDOMClient.createRoot = (target, options) =>
    keep(target, (to, isApp) =>
      createRoot(to, isApp ? reportingErrors(options, onError) : options),
    );

  const leave = () => {
    leaving = true;
    root?.unmount();
    for (const added of listeners) added.remove();
  };

  try {
    // Next's entry reads the Flight payload in the document when it loads, so
    // it loads here, once Client Components can be loaded. Also for a page that
    // is left meanwhile: the payload it reads is the one of its own document
    // only until it has loaded.
    const { hydrate } = await import("next/dist/client/app-index");
    loaded();
    nextLoaded();
    signal.throwIfAborted();
    // Next reads its asset prefix off the URL of the script that is running,
    // which for a deployment is the bootstrap script in the server's HTML.
    const bootstrapScript = document.querySelector("script[src*='/_next/']");
    if (!bootstrapScript) {
      throw new Error("vitest-plugin-rsc: the response is not a page of the Next.js app");
    }
    Object.defineProperty(document, "currentScript", {
      configurable: true,
      get: () => bootstrapScript,
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
        // `instrumentation-client` modules yet.
        appBootstrap((assetPrefix: string) => {
          hydrate([] as never, assetPrefix).catch(reject);
        });
      });
    } finally {
      delete (document as { currentScript?: unknown }).currentScript;
    }
  } catch (error) {
    // A page that did not start leaves nothing running in the next one.
    leave();
    throw error;
  } finally {
    // A page that was left keeps the ones that give it a root that renders
    // nothing: Next may still get to create one. This React DOM is the page's
    // own, see `renderServer()`.
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
  return {
    unmount: leave,
    // The router of this page: the module graph is the page's own.
    refresh: () => publicAppRouterInstance.refresh(),
  };
}
