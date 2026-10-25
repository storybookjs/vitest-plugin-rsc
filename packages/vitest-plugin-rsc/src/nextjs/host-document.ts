import pageHost from "virtual:vitest-plugin-rsc/page-host";

// What a link or a form of a component does outside a browser context of the
// app, where the document is the host's own: one that would load another
// document leaves the host's as it is, and says so. Without its router, as
// for a component that a host renders as React does, Next's `<Link>` leaves
// the navigation to the browser, which would unload the host: Vitest's
// tester, the preview of a framework. A download that the link or the form
// declares is the browser's, and so is a load of the host's own URL, like a
// reload of Vite's client. Inside a context the app has the navigations: see
// document-loads.ts. Nothing listens as this module evaluates.

export type NavigateEvent = Event & {
  navigationType: "push" | "replace" | "reload" | "traverse";
  destination: { url: string; sameDocument: boolean };
  hashChange: boolean;
  formData: FormData | null;
  downloadRequest: string | null;
  sourceElement: Element | null;
};

// Whether a browser context of the app is open, which has the navigations:
// see browser-context.ts.
let inContext = false;

/** Says whether a browser context of the app is open: browser-context.ts does. */
export function appHasNavigations(open: boolean): void {
  inContext = open;
}

/**
 * Keeps the host's document while the host renders components outside a
 * browser context of the app: a link or a form that would load another
 * document is stopped, and `report` hears of it with the URL it would load.
 * By default `reportError()` gets an error that says why. A declared
 * download, like `<a download>`, is the browser's, and while a context is
 * open, the app has the navigations. Until the function it returns is
 * called.
 */
export function keepHostDocument(report: (url: URL) => void = reportLoad): () => void {
  const { navigation } = pageHost;
  const keep = (event: Event) => {
    // In a context the app has the navigations. Another keeper, as for two
    // components at once, may have stopped this one already.
    if (inContext || event.defaultPrevented) return;
    const { destination, hashChange, downloadRequest } = event as NavigateEvent;
    if (destination.sameDocument || hashChange || !event.cancelable) return;
    if (downloadRequest !== null || destination.url === window.location.href) return;
    event.preventDefault();
    report(new URL(destination.url));
  };
  navigation?.addEventListener("navigate", keep);
  return () => navigation?.removeEventListener("navigate", keep);
}

function reportLoad(url: URL): void {
  reportError(
    new Error(
      `vitest-plugin-rsc: a link or a form navigated to ${url.href}, which would load ` +
        `another document in place of the host's. The host renders it outside a browser ` +
        `context of the app, where there is no router of Next's: the host's document stays.`,
    ),
  );
}
