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

const runnerUrl = window.location.href;
const elements = (of: Document) => [of.documentElement, of.head, of.body];
const attributesOf = (element: Element) =>
  Array.from(element.attributes, ({ name, value }) => [name, value] as const);

let unload: (() => void) | undefined;

// A stylesheet of Next's build is the same CSS for as long as its path is the
// same: the dev server puts a hash of the CSS in it (styles.ts), as Next's
// build does, and Next's server says that a file under `/_next/static/` does
// not change. So when a page goes, the `<link>` of one that it loaded stays
// in the document, without its CSS, for the next page to take where it is. A
// `<link>` that is added or moved loads again: from the browser's cache, and
// over the network while a test mocks a module, as Playwright turns the cache
// off to intercept requests.
type KeptLink = HTMLLinkElement & { sheet: CSSStyleSheet };
let kept: KeptLink[] = [];
const isKept = (node: Node) => (kept as Node[]).includes(node);
// The rules of a stylesheet when its page had loaded. One the page added
// rules to is not the CSS of its path any more.
const rulesAtLoad = new WeakMap<CSSStyleSheet, number>();

function staysDuringPage(node: Node): boolean {
  return (
    node instanceof HTMLScriptElement ||
    node instanceof HTMLStyleElement ||
    (node instanceof HTMLLinkElement && node.rel === "modulepreload")
  );
}

// Vite puts the CSS a module imports in a `<style>`, once. That is not the
// CSS of the app, which a page links (styles.ts). It is what a test file
// imports itself, and it has to outlive the page it came during: the module
// will not load again.
function isViteStyle(node: Node): boolean {
  return node instanceof HTMLStyleElement && node.hasAttribute("data-vite-dev-id");
}

// A stylesheet holds up the scripts after it, and the page is not loaded
// before it is. One that fails to load holds up nothing.
function stylesheetLoaded(link: HTMLLinkElement): Promise<void> {
  return new Promise((resolve) => {
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener("error", () => resolve(), { once: true });
  });
}

// A stylesheet that Next linked under `/_next/static/`, as its page loaded it.
function keepable(node: Node): node is KeptLink {
  if (!(node instanceof HTMLLinkElement) || node.rel !== "stylesheet") return false;
  if (!node.sheet || rulesAtLoad.get(node.sheet) !== node.sheet.cssRules.length) return false;
  const url = new URL(node.href);
  return (
    node.hasAttribute("data-precedence") &&
    url.origin === window.location.origin &&
    url.pathname.includes("/_next/static/")
  );
}

// The kept `<link>`s that stand for ones in `head`, the head of the next page,
// in its order. These have their CSS again, and the nonce of the page, which
// Next gives every response of a CSP of its own. The others leave the
// document, so React finds no stylesheet of another page in it. None stays
// when a stylesheet of the runner came after them, like the CSS Vite adds for
// a test file, which is before a page's.
function takeKept(head: HTMLHeadElement): Map<Node, KeptLink> {
  const taken = new Map<Node, KeptLink>();
  // What a test took out in the meantime is not there to take.
  kept = kept.filter((link) => link.parentNode === document.head);
  const sheets = Array.from(document.head.querySelectorAll('style, link[rel~="stylesheet"]'));
  const first = kept.length > 0 ? sheets.indexOf(kept[0]!) : -1;
  if (first !== -1 && sheets.slice(first).every(isKept)) {
    const attributes = (link: Element) => attributesOf(link).filter(([name]) => name !== "nonce");
    const same = (a: Element, b: Element) =>
      attributes(a).length === attributes(b).length &&
      attributes(a).every(([name, value]) => b.getAttribute(name) === value);
    let last = -1;
    for (const node of head.childNodes) {
      if (!(node instanceof HTMLLinkElement)) continue;
      const index = kept.findIndex((link, at) => at > last && same(link, node));
      if (index === -1) continue;
      taken.set(node, kept[index]!);
      last = index;
    }
  }
  const taking = new Set(taken.values());
  for (const link of kept) if (!taking.has(link)) link.remove();
  for (const [node, link] of taken) {
    const nonce = (node as HTMLLinkElement).getAttribute("nonce");
    if (nonce === null) link.removeAttribute("nonce");
    else link.setAttribute("nonce", nonce);
    link.sheet.disabled = false;
  }
  kept = [];
  return taken;
}

// Puts the head of a page in the document's, around the kept `<link>`s that
// stand for some of it.
function appendHead(nodes: Node[], taken: Map<Node, KeptLink>): void {
  const anchors = nodes.flatMap((node) => taken.get(node) ?? []);
  for (const node of nodes) {
    if (taken.has(node)) anchors.shift();
    else if (anchors[0]) document.head.insertBefore(node, anchors[0]);
    else document.head.append(node);
  }
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
  // A kept `<link>` is the page's, once it takes it.
  const before = new Set<Node>(
    [...document.head.childNodes, ...runnerBody.childNodes].filter((node) => !isKept(node)),
  );
  const parked: Node[] = [];
  for (const node of container ? [] : document.head.childNodes) {
    if (!staysDuringPage(node) && !isKept(node)) parked.push(node);
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
    kept = Array.from(document.head.childNodes).filter(keepable);
    for (const link of kept) link.sheet.disabled = true;
    for (const parent of [document.head, document.body]) {
      for (const node of Array.from(parent.childNodes)) {
        if (!before.has(node) && !isViteStyle(node) && !isKept(node)) node.remove();
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
  const taken = takeKept(page.head);
  if (!container) {
    elements(page).forEach((element, index) =>
      setAttributes(elements(document)[index]!, attributesOf(element)),
    );
  }
  appendHead(Array.from(page.head.childNodes), taken);
  (container ?? document.body).append(...page.body.childNodes);

  // Where the browser ended up, after any redirects. Before the scripts of
  // the page run: one of them may read `location`.
  window.history.replaceState(null, "", url);

  const loading = stylesheets
    .filter((link) => !link.disabled && !taken.has(link))
    .map(stylesheetLoaded);
  await Promise.race([Promise.all(loading), left]);
  if (unload !== leave) return;
  for (const { sheet } of stylesheets) if (sheet) rulesAtLoad.set(sheet, sheet.cssRules.length);

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

/**
 * Leaves the page: the document is as it was before the page, but for the
 * kept `<link>`s of its stylesheets, without their CSS.
 */
export function unloadDocument(): void {
  // Once, also when it throws: the next page is not to find this one.
  const leave = unload;
  unload = undefined;
  leave?.();
}
