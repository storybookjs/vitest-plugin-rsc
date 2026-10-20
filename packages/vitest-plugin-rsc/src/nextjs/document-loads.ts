// Types `import.meta.hot` and `import.meta.env` below, as Vite gives them a
// module, without the rest of `vite/client`.
/// <reference types="vite/types/importMeta.d.ts" />
import { leftTheApp } from "./app-requests.ts";
import { documentUrl } from "./document.ts";
import { currentPage, leavePage, loadPage } from "./page.ts";
import { openedAt } from "./registry.ts";

// What would load the document again while the test runs in it: a
// navigation that Next's router leaves to the browser, which loads the app's
// next page or is stopped, and the reloads Vite's client announces, before
// which the page is left. Evaluating this module listens for them.

// A navigation without a page of the app, which has the router: see the
// listener of `navigate` below.
function noRouter(url: URL): Error {
  return new Error(
    `vitest-plugin-rsc: a link or a form navigated to ${url.href}, and there is no page of the ` +
      `app to navigate in: no page of renderServer() is open, and a test file with "use client" ` +
      `has none. Test navigation in a page of renderServer(), in a test file without "use client".`,
  );
}

// Vite's client loads the document again after a change that nothing takes
// in place. With a page open that would be a reload of the page, which the
// listener below loads as the app's, at the page's URL: the host's document
// would stay. Left first, the document and its URL are the host's again.
import.meta.hot?.on("vite:beforeFullReload", ({ path }) => {
  if (reloadsDocument(path)) return leavePage("a reload of the page");
});
// It also loads the document again once a dev server that it lost the
// connection to answers again, as after a restart. Taken as the app's, that
// reload would keep the host's document, with a connection to a server that
// is gone. So the page is left as the connection goes, and the host shows
// without it until the server answers.
import.meta.hot?.on("vite:ws:disconnect", () => leavePage("a lost connection to the dev server"));

// Whether Vite's client goes on to load the document again, as it decides
// once the page is left: for a change of an HTML file only if it is the one
// of the host's document, by the URL that leaving puts back. A change of
// another HTML page of the host keeps the page that is open.
function reloadsDocument(path: string | undefined): boolean {
  if (!path?.endsWith(".html") || path === "/index.html") return true;
  const pagePath = decodeURI(new URL(documentUrl()).pathname);
  const payloadPath = (import.meta.env?.BASE_URL ?? "/") + path.slice(1);
  return (
    pagePath === payloadPath || (pagePath.endsWith("/") && `${pagePath}index.html` === payloadPath)
  );
}

// The app can leave its page without its router: `location.assign()`, a
// `<form>` or an `<a>` that React does not handle, Next's own fallback when a
// client-side navigation is not possible. For a browser that is a page load.
// Here it would replace the test with the app, so load the page the
// way `renderServer()` does instead.
type NavigateEvent = Event & {
  navigationType: "push" | "replace" | "reload" | "traverse";
  destination: { url: string; sameDocument: boolean };
  hashChange: boolean;
  formData: FormData | null;
  downloadRequest: string | null;
};
(window as { navigation?: EventTarget }).navigation?.addEventListener("navigate", (event) => {
  const { destination, hashChange, formData, downloadRequest } = event as NavigateEvent;
  // A navigation of Next's router on the client, in the layouts of a route,
  // to another pathname takes the place of the node, also of one that has
  // not hydrated yet, which no effect of it would say.
  if (destination.sameDocument) currentPage()?.nodeOnPage?.at(new URL(destination.url).pathname);
  if (destination.sameDocument || hashChange || !event.cancelable) return;
  const url = new URL(destination.url);
  // A navigation that loads a document loads what owns its URL, a reload
  // too. The host's URL goes to the browser as it is. While a node is open,
  // a URL of the app's origin with its pathname stands in for the host's:
  // the app's route there is another page. Leaving puts back the host's URL.
  // Any other URL is the app's: a page is left before a reload of the host's
  // (the ones Vite's client announces, above; another host's with the
  // cleanup of what it showed).
  if (destination.url === documentUrl()) return;
  if (url.origin === window.location.origin && openedAt(url)?.node) {
    event.preventDefault();
    void leavePage("a navigation to the host's document")
      .catch(() => {})
      .then(() => window.location.reload());
    return;
  }
  if (!currentPage()) {
    // No page of the app to load another one of: a component that a test
    // file with `"use client"` rendered has no router. A link or a form
    // would replace the test, and Vitest would lose the tab. Not a
    // download, which stays.
    if (downloadRequest != null) return;
    event.preventDefault();
    reportError(noRouter(url));
    return;
  }
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
