// Types `import.meta.hot` and `import.meta.env` below, as Vite gives them a
// module, without the rest of `vite/client`.
/// <reference types="vite/types/importMeta.d.ts" />
import { leftTheApp } from "./app-requests.ts";
import { documentUrl } from "./document.ts";
import { enctypeOf, formBody } from "./form-submission.ts";
import { noRouter, type NavigateEvent } from "./host-document.ts";
import { currentPage, leavePage, navigate } from "./page.ts";
import type { PageStore } from "./page-store.ts";
import { openedAt } from "./registry.ts";

// What would load the document again while the test runs in it: a
// navigation that Next's router leaves to the browser, which loads the app's
// next page or is stopped, and the reloads Vite's client announces, before
// which the page is left. Evaluating this module listens for the reloads. A
// browser context of the app hears the navigations while it is open: see
// browser-context.ts.

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

/**
 * What a navigation does in a browser context of the app, whose store is
 * `from`. The app can leave its page without its router:
 * `location.assign()`, a `<form>` or an `<a>` that React does not handle,
 * Next's own fallback when a client-side navigation is not possible. For a
 * browser that is a page load. Here it would replace the test with the app,
 * so `navigate()` loads the page the way `renderServer()` does instead, or
 * downloads what a browser would.
 */
export function followNavigation(event: Event, from: PageStore): void {
  const { destination, hashChange, formData, downloadRequest, navigationType, sourceElement } =
    event as NavigateEvent;
  // A navigation of Next's router on the client, in the layouts of a route,
  // to another pathname takes the place of the node, also of one that has
  // not hydrated yet, which no effect of it would say.
  if (destination.sameDocument) currentPage()?.nodeOnPage?.at(new URL(destination.url).pathname);
  if (destination.sameDocument || hashChange || !event.cancelable) return;
  const url = new URL(destination.url);
  // A download of what the document has itself, like the Blob URL of
  // `download()`, is the browser's.
  if (downloadRequest !== null && (url.protocol === "blob:" || url.protocol === "data:")) return;
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
  // Without a page of the app there is no router: a link or a form would
  // replace the test, and Vitest would lose the tab. `navigate()` says so
  // unless the answer is a download.
  event.preventDefault();
  if (url.origin !== window.location.origin) {
    reportError(currentPage() ? leftTheApp(url) : noRouter(url));
    return;
  }
  navigate(
    url,
    {
      method: formData ? "POST" : "GET",
      headers: { accept: "text/html" },
      body: formData && formBody(formData, enctypeOf(sourceElement)),
    },
    downloadRequest,
    from,
    navigationType === "push",
  ).catch((error: unknown) => {
    // The test, or a navigation after this one, moved on before it was done.
    if (!(error instanceof DOMException && error.name === "AbortError")) reportError(error);
  });
}
