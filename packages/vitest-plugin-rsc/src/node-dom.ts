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
