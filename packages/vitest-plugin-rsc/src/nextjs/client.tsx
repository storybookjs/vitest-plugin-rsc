import { appBootstrap } from "next/dist/client/app-bootstrap";
import { callServer } from "next/dist/client/app-call-server";
import ReactDOMClient, { type Root } from "react-dom/client";
import { registerModuleLoader } from "./client-modules.ts";

// The browser layer: the app's client entry, what Next's `main-app.js` chunk
// is for a deployment. It runs once per page load, in a module graph of its own.

declare global {
  var __viteRscCallServer: typeof callServer;
  var __NEXT_HYDRATED_CB: (() => void) | undefined;
}

/** Hydrates the document. Resolves once it has, with how to leave the page. */
export async function start(): Promise<{ unmount(): void }> {
  // Not when this module loads: a page that was left while it loaded must not
  // take over from the page that is there now.
  registerModuleLoader("browser");
  // A Server Action imported by a Client Component calls the server the way
  // Next's router does: a POST to the current page.
  globalThis.__viteRscCallServer = callServer;

  // Next's entry does not hand out the root it creates.
  let root: Root | undefined;
  const { hydrateRoot, createRoot } = ReactDOMClient;
  ReactDOMClient.hydrateRoot = (...args) => (root = hydrateRoot(...args));
  ReactDOMClient.createRoot = (...args) => (root = createRoot(...args));

  // Next's entry starts to read the Flight payload in the document as it
  // loads, so it loads here, once Client Components can be loaded.
  const { hydrate } = await import("next/dist/client/app-index");
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
      // Called by Next's root component from an effect: its own e2e test hook.
      globalThis.__NEXT_HYDRATED_CB = resolve;
      // What Next's `app-next.js` does, minus the webpack chunk loading. No
      // `instrumentation-client` modules yet.
      appBootstrap((assetPrefix: string) => {
        hydrate([] as never, assetPrefix).catch(reject);
      });
    });
  } finally {
    delete (document as { currentScript?: unknown }).currentScript;
    ReactDOMClient.hydrateRoot = hydrateRoot;
    ReactDOMClient.createRoot = createRoot;
  }
  return {
    unmount() {
      root?.unmount();
    },
  };
}
