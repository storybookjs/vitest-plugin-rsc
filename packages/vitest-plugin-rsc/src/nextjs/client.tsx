import { unstable_rethrow } from "next/navigation";
import ReactDOMClient, { type Root, type RootOptions } from "react-dom/client";
import { registerModuleLoader } from "./client-modules.ts";
import { appBootstrap, callServer, loadAppIndex } from "./compat/browser/client.ts";
import { recordListeners, type Leftovers } from "./leftovers.ts";
import type { NodeOnPage } from "./node-on-page.ts";
// The module that the Flight payload of a node names: see rsc.ts.
import { setNodeOnPage } from "vitest-plugin-rsc/nextjs/node-rendered";

// The browser layer. This module is the app's client entry: what Next's
// `main-app.js` chunk is for a deployment. Like that chunk, it runs once per
// page load, in a module graph of its own (see `openPage()` in page.ts), and starts the app
// from the document the server sent.

declare global {
  var __viteRscCallServer: typeof callServer;
  var __NEXT_HYDRATED_CB: (() => void) | undefined;
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
 * Resolves once it has, with how to leave the page. A page of a node tells
 * `nodeOnPage` what it does with the node: see node-rendered.tsx. The errors
 * that React reports on the root of the app go in `errors`, in order, but
 * for those of Next's control flow.
 *
 * Rejects once `signal` aborts, when the page is left before it has hydrated.
 * What it started is gone by then: the root, and the listeners React added.
 * A root that Next would create after that renders nothing.
 */
export async function start(
  container: Element | undefined,
  signal: AbortSignal,
  nodeOnPage: NodeOnPage | undefined,
  errors: unknown[],
): Promise<{ unmount(): void }> {
  setNodeOnPage(nodeOnPage);
  // A node hears of all of them: a `notFound()` takes its place too. A page
  // that was left, whose load has aborted, reports no more.
  const report = (error: unknown) => {
    nodeOnPage?.errored(error);
    if (!signal.aborted && !isNextControlFlow(error)) errors.push(error);
  };
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
        ...(isApp ? reportingErrors(options, report) : options),
        onRecoverableError(error, info) {
          if (leaving) return;
          if (options?.onRecoverableError) options.onRecoverableError(error, info);
          else reportError(error);
        },
      }),
    );
  ReactDOMClient.createRoot = (target, options) =>
    keep(target, (to, isApp) => createRoot(to, isApp ? reportingErrors(options, report) : options));

  const leave = () => {
    leaving = true;
    // A page that is left loads no more Client Components, and the loader
    // would keep the ones it loaded.
    forgetLoader();
    root?.unmount();
    for (const added of listeners) added.remove();
  };

  try {
    // Next's entry reads the Flight payload in the document when it loads, so
    // it loads here, once Client Components can be loaded. Also for a page that
    // is left meanwhile: the payload it reads is the one of its own document
    // only until it has loaded.
    const { hydrate } = await loadAppIndex();
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
  return { unmount: leave };
}
