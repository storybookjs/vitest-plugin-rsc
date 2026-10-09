// A page load, without loading a page: the test runs in this
// document and has to stay in it. So the document the server sends is moved
// into this one. What the test runner needs stays, its scripts and styles. The
// rest of what is in the document steps aside for as long as the page is
// there: a second `<title>` would hide the page's, and text in `<body>` is not
// what React expects to hydrate.
//
// A page gets a `<body>` of its own, as it does in a browser, and so does a
// node. What it leaves on its body goes with it: React adds its listeners to
// the body when a portal renders there, and they would keep the page.

import builtLayers from "virtual:vitest-plugin-rsc/layers";

const runnerUrl = window.location.href;
const elements = (of: Document) => [of.documentElement, of.head, of.body];
const attributesOf = (element: Element) =>
  Array.from(element.attributes, ({ name, value }) => [name, value] as const);

let unload: (() => void) | undefined;

// In a static build, the CSS a file of the host imports is a stylesheet that
// Vite links when the module loads: in the HTML of the host, or from a script,
// both with a `crossorigin` attribute. Not a stylesheet of the app, which
// Next links and React renders, with a precedence (styles.ts).
function isBuiltStyle(node: Node): boolean {
  return (
    builtLayers !== undefined &&
    node instanceof HTMLLinkElement &&
    node.rel === "stylesheet" &&
    node.hasAttribute("crossorigin") &&
    !node.hasAttribute("data-precedence")
  );
}

function staysDuringPage(node: Node): boolean {
  return (
    node instanceof HTMLScriptElement ||
    node instanceof HTMLStyleElement ||
    (node instanceof HTMLLinkElement && node.rel === "modulepreload") ||
    isBuiltStyle(node)
  );
}

// Vite puts the CSS a module imports in a `<style>`, once, or links it in a
// static build. That is not the CSS of the app, which a page links
// (styles.ts). It is what a test file or another file of the host imports
// itself, and it has to outlive the page it came during: the module will not
// load again.
function isViteStyle(node: Node): boolean {
  return (
    (node instanceof HTMLStyleElement && node.hasAttribute("data-vite-dev-id")) ||
    isBuiltStyle(node)
  );
}

// A stylesheet holds up the scripts after it, and the page is not loaded
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
 * Replaces the page in this document with the one the server sent as `html`,
 * and runs its inline scripts in document order, once its stylesheets have
 * loaded. Resolves then, and without running them for a page that was left
 * in the meantime.
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
  unloadDocument();

  // What was here before the page. Everything else is the page's to lose.
  const runnerBody = document.body;
  const runnerAttributes = elements(document).map(attributesOf);
  const runnerScripts = new Set(document.querySelectorAll("script"));
  const before = new Set<Node>([...document.head.childNodes, ...runnerBody.childNodes]);
  const parked: Node[] = [];
  for (const node of container ? [] : document.head.childNodes) {
    if (!staysDuringPage(node)) parked.push(node);
  }
  for (const node of parked) document.head.removeChild(node);
  // The body of the page. What the runner needs moves into it, and back.
  // For a node that is all there is: the document stays the test's.
  const pageBody = document.createElement("body");
  const staying = Array.from(runnerBody.childNodes).filter(
    (node) => container || staysDuringPage(node),
  );
  setAttributes(pageBody, attributesOf(runnerBody));
  document.documentElement.replaceChild(pageBody, runnerBody);
  pageBody.append(...staying);

  // A stylesheet of a page that is gone does not load.
  let leaveNow!: () => void;
  const left = new Promise<void>((resolve) => (leaveNow = resolve));
  const leave = () => {
    leaveNow();
    container?.replaceChildren();
    for (const parent of [document.head, document.body]) {
      for (const node of Array.from(parent.childNodes)) {
        if (!before.has(node) && !isViteStyle(node)) node.remove();
      }
    }
    document.head.append(...parked);
    // In the order they are in: what stayed, and the CSS Vite added.
    runnerBody.append(...pageBody.childNodes);
    pageBody.replaceWith(runnerBody);
    elements(document).forEach((element, index) =>
      setAttributes(element, runnerAttributes[index]!),
    );
    // Where Next's scripts leave the Flight payload and the scripts to run
    // before the app starts.
    delete (self as { __next_f?: unknown }).__next_f;
    delete (self as { __next_s?: unknown }).__next_s;
    if (window.location.href !== runnerUrl) window.history.replaceState(null, "", runnerUrl);
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
  // preload the one that starts the app, and in this document a preload is a
  // request, for a file that is not there.
  const sources = new Set(
    Array.from(page.querySelectorAll<HTMLScriptElement>("script[src]"), (script) => script.src),
  );
  for (const link of page.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="script"]')) {
    if (sources.has(link.href)) link.remove();
  }
  // The stylesheets of the page that the server serves itself, which the
  // page waits for. One of another server may never answer. One that the
  // browser does not ask for has no `load` and no `error`.
  const stylesheets = Array.from(
    page.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'),
  ).filter(
    (link) =>
      !link.relList.contains("alternate") &&
      link.getAttribute("href") &&
      (!link.type || link.type === "text/css") &&
      URL.canParse(link.getAttribute("href")!, url) &&
      new URL(link.getAttribute("href")!, url).origin === window.location.origin,
  );
  if (container) {
    document.head.append(...page.head.childNodes);
    container.append(...page.body.childNodes);
  } else {
    elements(page).forEach((element, index) =>
      setAttributes(elements(document)[index]!, attributesOf(element)),
    );
    document.head.append(...page.head.childNodes);
    document.body.append(...page.body.childNodes);
  }

  // Where the browser ended up, after any redirects. Before the scripts of
  // the page run: one of them may read `location`.
  window.history.replaceState(null, "", url);

  const loading = stylesheets.filter((link) => !link.disabled).map(stylesheetLoaded);
  await Promise.race([Promise.all(loading), left]);
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

/** Leaves the page: the document is as it was before the page. */
export function unloadDocument(): void {
  // Once, also when it throws: the next page is not to find this one.
  const leave = unload;
  unload = undefined;
  leave?.();
}
