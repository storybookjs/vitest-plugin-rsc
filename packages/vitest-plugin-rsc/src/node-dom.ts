// What the page needs of a browser's DOM that a DOM of Node.js, happy-dom's
// or jsdom's, has not, or has of another realm than the worker's: given to
// it by node-host.ts, which imports this file for its effect. What a DOM of
// Node.js does otherwise and cannot be given is in "The Node host" of
// docs/internals/architecture.md.

// A document's constructed stylesheets, which jsdom has none of: a list that
// keeps what it is given, as a document that adopts nothing in a browser.
// The page puts back the list of the host's document after a page
// (nextjs/document.ts).
if (!("adoptedStyleSheets" in Document.prototype)) {
  const adopted = new WeakMap<Document, CSSStyleSheet[]>();
  Object.defineProperty(Document.prototype, "adoptedStyleSheets", {
    configurable: true,
    // One list until another is set, as a browser's.
    get(this: Document) {
      let sheets = adopted.get(this);
      if (!sheets) adopted.set(this, (sheets = []));
      return sheets;
    },
    set(this: Document, sheets: CSSStyleSheet[]) {
      adopted.set(this, [...sheets]);
    },
  });
}

// The boxes of a range, which jsdom's `Range` has not: none, as jsdom's
// elements answer, in a DOM that lays nothing out. React asks for them for
// a fragment's, as Next's router does as it scrolls to a new page.
if (!("getClientRects" in Range.prototype)) {
  Object.defineProperties(Range.prototype, {
    getClientRects: {
      configurable: true,
      writable: true,
      value: () => [],
    },
    getBoundingClientRect: {
      configurable: true,
      writable: true,
      value: () => new DOMRect(),
    },
  });
}

// The media queries of the window, which jsdom has not: a query matches
// nothing, as in a window that lays nothing out, and never changes. A library
// asks as it renders, like next-themes for `prefers-color-scheme`.
const scope = globalThis as unknown as Record<PropertyKey, unknown>;
if (typeof scope.matchMedia !== "function") {
  scope.matchMedia = (query: string): MediaQueryList =>
    Object.assign(new EventTarget(), {
      media: String(query),
      matches: false,
      onchange: null,
      // The listeners of before `addEventListener()`, which libraries still use.
      addListener: () => {},
      removeListener: () => {},
    }) as unknown as MediaQueryList;
}

// A browser's answer to a stylesheet of the page and to its preload, which a
// DOM of Node.js, that loads none (`loadsStylesheets` of node-host.ts), does
// not always give: `load`, as if its bytes came, also for one that the
// server would fail. happy-dom answers a stylesheet itself, also one it
// does not load (with `handleDisabledFileLoadingAsSuccess`, which the plugin
// sets), but never a preload; jsdom answers neither without
// `resources: "usable"`, which the plugin does not set. React commits a tree that it renders on
// the client, as Next does a page without HTML, only once the stylesheets of
// `precedence` in the `<head>` and their preloads have loaded, or after a
// minute. So a link of the `<head>` that the DOM leaves unanswered gets
// `load` once, in a task after it is in the document: of Node's
// `setImmediate` as this module loads, before a test's fake timers replace it.
const { setImmediate: nodeSetImmediate } = process.getBuiltinModule("node:timers");
const answersStylesheets = "happyDOM" in window;
const answered = new WeakSet<Node>();
const unansweredByDom = (node: Node): node is Element => {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const link = node as Element;
  if (link.localName !== "link" || !link.getAttribute("href")) return false;
  const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
  if (rel.includes("stylesheet")) return !answersStylesheets;
  return rel.includes("preload") && link.getAttribute("as")?.toLowerCase() === "style";
};
new MutationObserver((records) => {
  for (const record of records) {
    for (const link of Array.from(record.addedNodes).filter(unansweredByDom)) {
      nodeSetImmediate(() => {
        if (answered.has(link) || !link.isConnected) return;
        answered.add(link);
        link.dispatchEvent(new Event("load"));
      });
    }
  }
}).observe(document.head, { childList: true });
