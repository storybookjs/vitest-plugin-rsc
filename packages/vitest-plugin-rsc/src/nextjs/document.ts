import { graphStylesheetAttribute } from "./styles-shared.ts";

// A page load, without loading a page: the test runs in this
// document and has to stay in it. So the document the server sends is moved
// into this one. What the test runner needs stays, its scripts and styles. The
// rest of what is in the document steps aside for as long as the page is
// there: a second `<title>` would hide the page's, and text in `<body>` is not
// what React expects to hydrate.
//
// A browser shows none of a page before the stylesheets in its `<head>` have
// loaded, and the page that was there until then. So the `<head>` of the page
// comes first, where its stylesheets load, and the rest once they have:
// until then the document shows what was there.
//
// A page gets a `<body>` of its own, as it does in a browser, and so does a
// node. What it leaves on its body goes with it: React adds its listeners to
// the body when a portal renders there, and they would keep the page.
//
// React DOM keeps what it knows of a node in properties of the node, named
// for the copy of React DOM that sets them: the page's, which loads with it.
// On the document those stay, and with them the page: the stylesheets React
// hoisted, and the listeners it added to them. So what was set on the
// document, on `<html>` and `<head>`, and on the container of a node while
// the page was open goes with the page, whatever its name, as the nodes that
// came with it do. Not what was there before it: the host may run a React of
// its own.
//
// A page load starts the files of its route before the server has rendered
// it, with a preload of each (`preloadPage()`). Those links are the page's
// too, and go with it, also when its load stops before it is there.

const elements = (of: Document) => [of.documentElement, of.head, of.body];
const attributesOf = (element: Element) =>
  Array.from(element.attributes, ({ name, value }) => [name, value] as const);

let unload: (() => void) | undefined;
// The preloads of the page that loads next, until it is there.
let preloads: HTMLLinkElement[] = [];
// The URL that leaving the page puts back, while a page is open.
let runnerHref: string | undefined;

/**
 * The URL of the document without the page that is open: the runner's, which
 * the page shows as its own while it is open.
 */
export function documentUrl(): string {
  return runnerHref ?? window.location.href;
}

function staysDuringPage(node: Node): boolean {
  return (
    node instanceof HTMLScriptElement ||
    node instanceof HTMLStyleElement ||
    (node instanceof HTMLLinkElement && node.rel === "modulepreload") ||
    isGraphStylesheet(node)
  );
}

// Vite puts the CSS a module imports in a `<style>`, once. That is not the
// CSS of the app, which a page links (styles.ts). It is what a test file
// imports itself, and it has to outlive the page it came during: the module
// will not load again.
function isViteStyle(node: Node): boolean {
  return node instanceof HTMLStyleElement && node.hasAttribute("data-vite-dev-id");
}

// The stylesheets that the tab's graph linked for a file of the host with
// `"use client"` (client-graph.ts) are the tab's, as the graph is: they stay
// for the pages, and outlive the page they came during, as Vite's `<style>`
// does. A host loads a client file before it leaves the page that is there.
function isGraphStylesheet(node: Node): boolean {
  return node instanceof HTMLLinkElement && node.hasAttribute(graphStylesheetAttribute);
}

// The stylesheets in `parent` that the server serves itself, which the page
// waits for. One of another server may never answer. One that the browser
// does not ask for has no `load` and no `error`.
function stylesheetsOf(parent: ParentNode, url: string): HTMLLinkElement[] {
  return Array.from(
    parent.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'),
  ).filter(
    (link) =>
      !link.relList.contains("alternate") &&
      link.getAttribute("href") &&
      (!link.type || link.type === "text/css") &&
      URL.canParse(link.getAttribute("href")!, url) &&
      new URL(link.getAttribute("href")!, url).origin === window.location.origin,
  );
}

// A stylesheet holds up what comes after it, and the page is not loaded
// before it is. One that fails to load holds up nothing.
function stylesheetLoaded(link: HTMLLinkElement): Promise<void> {
  return new Promise((resolve) => {
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => resolve(), { once: true });
  });
}

function setAttributes(element: Element, attributes: Iterable<readonly [string, string]>): void {
  for (const { name } of Array.from(element.attributes)) element.removeAttribute(name);
  for (const [name, value] of attributes) element.setAttribute(name, value);
}

/**
 * Starts the files of the route of the page that loads next, as the server
 * renders it: `stylesheets` as Next links them, in the CORS mode of
 * `crossOrigin`, and `modules`. By their URLs. They go with that page.
 */
export function preloadPage({
  stylesheets,
  crossOrigin,
  modules,
}: {
  stylesheets: string[];
  crossOrigin: string | undefined;
  modules: string[];
}): void {
  const links = [
    ...stylesheets.map((href) => ({ href, rel: "preload", as: "style", crossOrigin })),
    // In the mode of a module that a module script imports, as Vite preloads one.
    ...modules.map((href) => ({ href, rel: "modulepreload", as: "", crossOrigin: "" })),
  ];
  for (const { href, rel, as, crossOrigin } of links) {
    if (preloads.some((link) => link.href === href)) continue;
    const link = document.createElement("link");
    link.rel = rel;
    if (as) link.as = as;
    if (crossOrigin !== undefined) link.crossOrigin = crossOrigin;
    link.href = href;
    document.head.append(link);
    preloads.push(link);
  }
}

/**
 * Replaces the page in this document with the one the server sent as `html`:
 * its `<head>` first, the rest once the stylesheets of the `<head>` have
 * loaded, and runs its inline scripts in document order once the stylesheets
 * of the rest have too. Resolves then, and without running them for a page
 * that was left in the meantime.
 *
 * The page is there in full before the app starts, so the document has loaded
 * by the time Next's client looks: it reads the Flight payload that Next's
 * inline scripts left in `self.__next_f`, and hydrates.
 *
 * With a `container`, the page is the one of a node, which renders no
 * `<html>` or `<body>`, and what is in the document stays the test's. What
 * the HTML parser puts in `<body>` goes in the container: the node, with the
 * scripts it renders, and after it the scripts of Next and React.
 */
export async function loadDocument(html: string, url: string, container?: Element): Promise<void> {
  leaveDocument();
  // The preloads of its route are this page's.
  const ownPreloads = new Set(preloads);
  preloads = [];

  // What was here before the page. Everything else is the page's to lose.
  // The URL too: a host may move it between pages, to say what it shows next.
  const runnerUrl = window.location.href;
  runnerHref = runnerUrl;
  const runnerBody = document.body;
  const runnerAttributes = elements(document).map(attributesOf);
  // Where the page's React DOM sets its properties.
  const reactTargets: object[] = [document, document.documentElement, document.head];
  if (container) reactTargets.push(container);
  const runnerProperties = reactTargets.map((target) => new Set(Reflect.ownKeys(target)));
  const runnerScripts = new Set(document.querySelectorAll("script"));
  const before = new Set<Node>(
    [...document.head.childNodes, ...runnerBody.childNodes].filter(
      (node) => !ownPreloads.has(node as HTMLLinkElement),
    ),
  );
  const parked: Node[] = [];
  // The body of the page, in the document once the page shows. What the
  // runner needs moves into it, and back. For a node that is all there is:
  // the document stays the test's.
  const pageBody = document.createElement("body");

  // A stylesheet of a page that is gone does not load.
  let leaveNow!: () => void;
  const left = new Promise<void>((resolve) => (leaveNow = resolve));
  const leave = () => {
    try {
      leaveNow();
      container?.replaceChildren();
      for (const parent of [document.head, pageBody]) {
        for (const node of Array.from(parent.childNodes)) {
          if (
            !before.has(node) &&
            !isViteStyle(node) &&
            !isGraphStylesheet(node) &&
            // Of the page that loads next, while this one is left for it.
            !preloads.includes(node as HTMLLinkElement)
          ) {
            node.remove();
          }
        }
      }
    } finally {
      // The URL first: a relative URL of what comes back, the href of a
      // stylesheet, resolves against it once the node is in the document
      // again. Also when removing the page throws, or `replaceState()`
      // does: a page that is left holds the URL no longer, and
      // `documentUrl()` is the document's own.
      runnerHref = undefined;
      if (window.location.href !== runnerUrl) window.history.replaceState(null, "", runnerUrl);
    }
    document.head.append(...parked);
    // In the order they are in: what stayed, and the CSS Vite added.
    runnerBody.append(...pageBody.childNodes);
    // A body that never showed has no parent: the host's stays.
    pageBody.replaceWith(runnerBody);
    elements(document).forEach((element, index) =>
      setAttributes(element, runnerAttributes[index]!),
    );
    // One that is not configurable cannot be deleted, and stays.
    reactTargets.forEach((target, index) => {
      for (const key of Reflect.ownKeys(target)) {
        if (!runnerProperties[index]!.has(key)) Reflect.deleteProperty(target, key);
      }
    });
    // Where Next's scripts leave the Flight payload and the scripts to run
    // before the app starts.
    delete (self as { __next_f?: unknown }).__next_f;
    delete (self as { __next_s?: unknown }).__next_s;
  };
  unload = leave;

  // A parsed document has no scripting, so its scripts do not run, also not
  // once they are moved.
  const page = new DOMParser().parseFromString(html, "text/html");
  // For a `redirect()` in a response that had started, Next sends a
  // `<meta http-equiv="refresh">` for a browser without JavaScript, one for
  // every redirect of the render. Its router finds the tag by its id and
  // loads the page it redirects to. A browser drops the refresh with the
  // page. This document stays, so the refresh would come due a second later,
  // in whatever page is there by then. The tag stays for the router, without
  // what makes it a refresh.
  for (const redirect of page.querySelectorAll('[id="__next-page-redirect"]')) {
    redirect.removeAttribute("http-equiv");
  }
  // A script with a `src` does not run here: see below. React has the browser
  // preload the one that starts the app, and in a static build a preload is a
  // request for a file that is not there.
  const sources = new Set(
    Array.from(page.querySelectorAll<HTMLScriptElement>("script[src]"), (script) => script.src),
  );
  for (const link of page.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="script"]')) {
    if (sources.has(link.href)) link.remove();
  }
  const stylesheetsOfHead = stylesheetsOf(page.head, url);
  const stylesheetsOfBody = stylesheetsOf(page.body, url);
  const loaded = (stylesheets: HTMLLinkElement[]) =>
    Promise.race([
      Promise.all(stylesheets.filter((link) => !link.disabled).map(stylesheetLoaded)),
      left,
    ]);
  // Where the browser ended up, after any redirects. Before the page is in
  // the document, which requests what its relative URLs resolve to against
  // it, and before its scripts run: one of them may read `location`.
  window.history.replaceState(null, "", url);

  document.head.append(...page.head.childNodes);
  await loaded(stylesheetsOfHead);
  if (unload !== leave) return;

  // The page shows, in place of what was there, in one go. What the host
  // put in its body while the page waited is the host's too.
  for (const node of runnerBody.childNodes) before.add(node);
  for (const node of container ? [] : document.head.childNodes) {
    if (before.has(node) && !staysDuringPage(node)) parked.push(node);
  }
  for (const node of parked) document.head.removeChild(node);
  const staying = Array.from(runnerBody.childNodes).filter(
    (node) => container || staysDuringPage(node),
  );
  setAttributes(pageBody, attributesOf(runnerBody));
  document.documentElement.replaceChild(pageBody, runnerBody);
  pageBody.append(...staying);
  if (container) {
    container.append(...page.body.childNodes);
  } else {
    elements(page).forEach((element, index) =>
      setAttributes(elements(document)[index]!, attributesOf(element)),
    );
    pageBody.append(...page.body.childNodes);
  }
  await loaded(stylesheetsOfBody);
  if (unload !== leave) return;

  // The inline scripts: React's, which move content that was waiting for
  // data into place, and Next's, which carry the Flight payload. The scripts
  // with a `src` are the app's chunks, which `renderServer()` stands in for.
  for (const script of document.querySelectorAll("script")) {
    if (runnerScripts.has(script) || script.src) continue;
    if (!script.type || script.type === "text/javascript" || script.type === "module") {
      // A script that throws is reported, and the page goes on, as in a browser.
      try {
        (0, eval)(script.textContent ?? "");
      } catch (error) {
        reportError(error);
      }
    }
  }
}

// React's scripts in the document do not put streamed content in place right
// away. `$RC` queues it, and `$RV` moves what is queued after a frame, or
// 300 ms after the last time, which here was in the page before. A browser
// has done that by the time the app starts, long after the HTML arrived. Here
// the app starts right away, and would render what is not in place yet a
// second time. So what `$RC` queues is moved at once. Not content that React
// moves with a view transition, which the browser runs when it can.
type ReactScripts = {
  $RB?: unknown[];
  $RC?: (...args: unknown[]) => void;
  $RV?: (queued: unknown[]) => void;
};
let queueStreamedContent: ReactScripts["$RC"];
Object.defineProperty(self, "$RC", {
  configurable: true,
  set: (queue: ReactScripts["$RC"]) => (queueStreamedContent = queue),
  get: () =>
    queueStreamedContent &&
    ((...args: unknown[]) => {
      queueStreamedContent!(...args);
      const { $RB: queued, $RV: reveal } = self as ReactScripts;
      // An error in it is reported, and the page goes on, as in a browser.
      try {
        if (queued?.length && reveal) reveal(queued);
      } catch (error) {
        reportError(error);
      }
    }),
});

// Leaves the page that is there, if any.
function leaveDocument(): void {
  // Once, also when it throws: the next page is not to find this one.
  const leave = unload;
  unload = undefined;
  leave?.();
}

/**
 * Leaves the page, and the one that was loading: the document is as it was
 * before the page.
 */
export function unloadDocument(): void {
  try {
    leaveDocument();
  } finally {
    for (const link of preloads) link.remove();
    preloads = [];
  }
}
