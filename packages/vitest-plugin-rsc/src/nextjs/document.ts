import { endOfCompleteScripts } from "./html-stream.ts";

// A page load, for a tab that has to stay in the document of the test: the
// document the server sends is moved into this one as it arrives. The scripts
// and styles of the test runner stay. The rest steps aside while the page is
// there: a second `<title>` would hide the page's.

const runnerUrl = window.location.href;
const elements = (of: Document) => [of.documentElement, of.head, of.body];
const attributesOf = (element: Element) =>
  Array.from(element.attributes, ({ name, value }) => [name, value] as const);
const runnerAttributes = elements(document).map(attributesOf);

let unload: (() => void) | undefined;

function staysDuringPage(node: Node): boolean {
  return (
    node instanceof HTMLScriptElement ||
    node instanceof HTMLStyleElement ||
    (node instanceof HTMLLinkElement && node.rel === "modulepreload")
  );
}

// Vite puts the CSS a module imports in a `<style>`, once. It is the app's,
// but it has to outlive the page: the module will not load again.
function isViteStyle(node: Node): boolean {
  return node instanceof HTMLStyleElement && node.hasAttribute("data-vite-dev-id");
}

function setAttributes(element: Element, attributes: Iterable<readonly [string, string]>): void {
  for (const { name } of Array.from(element.attributes)) element.removeAttribute(name);
  for (const [name, value] of attributes) element.setAttribute(name, value);
}

export type PageLoad = {
  /** The document has what it takes to start the app: its bootstrap script. */
  interactive: Promise<void>;
};

/**
 * Replaces the page in this document with the one the server streams as
 * `html`, part by part as in a browser, and runs its inline scripts.
 */
export function loadDocument(html: ReadableStream<Uint8Array> | null): PageLoad {
  unloadDocument();

  // What was here before the page. Everything else is the page's to lose.
  const before = new Set<Node>([...document.head.childNodes, ...document.body.childNodes]);
  const parked: { node: Node; parent: Node }[] = [];
  for (const node of before) {
    if (staysDuringPage(node) || !node.parentNode) continue;
    parked.push({ node, parent: node.parentNode });
    node.parentNode.removeChild(node);
  }

  // A parser to write to. Its document has no scripting, so its scripts do
  // not run, also not once they are moved.
  const page = document.implementation.createHTMLDocument();
  const copied = new Set<Element>();
  const ran = new WeakSet<HTMLScriptElement>();
  const interactive = Promise.withResolvers<void>();
  const reader = html?.getReader();
  let unloaded = false;

  function moveIntoDocument(): void {
    // The parser may not be past `<html>` or `<head>` yet.
    if (!page.head) return;
    elements(page).forEach((element, index) => {
      // Nor past `<body>`, which it has made up if it is still in `<head>`.
      if (!element || copied.has(element) || (index === 2 && !element.hasChildNodes())) return;
      copied.add(element);
      setAttributes(elements(document)[index]!, attributesOf(element));
    });
    // The parser keeps writing into an element it has not closed, also after
    // the element has moved.
    document.head.append(...page.head.childNodes);
    if (page.body) document.body.append(...page.body.childNodes);

    // The inline scripts move streamed content into place and carry the
    // Flight payload. Run them in document order, as the parser would have.
    // The scripts with a `src` are the app's chunks, which `renderServer()`
    // stands in for.
    for (const script of document.querySelectorAll("script")) {
      if (before.has(script) || ran.has(script)) continue;
      ran.add(script);
      if (script.src) interactive.resolve();
      else if (!script.type || script.type === "text/javascript" || script.type === "module") {
        (0, eval)(script.textContent ?? "");
      }
    }
  }

  // Next's client entry reads the Flight payload until the document has
  // loaded, which it asks the document.
  Object.defineProperty(document, "readyState", { configurable: true, get: () => "loading" });

  unload = () => {
    unloaded = true;
    void reader?.cancel().catch(() => {});
    delete (document as { readyState?: unknown }).readyState;

    for (const parent of [document.head, document.body]) {
      for (const node of Array.from(parent.childNodes)) {
        if (!before.has(node) && !isViteStyle(node)) node.remove();
      }
    }
    for (const { node, parent } of parked) parent.appendChild(node);
    elements(document).forEach((element, index) =>
      setAttributes(element, runnerAttributes[index]!),
    );
    // Where Next's scripts leave the Flight payload and the scripts to run
    // before the app starts.
    delete (self as { __next_f?: unknown }).__next_f;
    delete (self as { __next_s?: unknown }).__next_s;
    if (window.location.href !== runnerUrl) window.history.replaceState(null, "", runnerUrl);
  };

  void (async () => {
    const decoder = new TextDecoder();
    let pending = "";
    try {
      while (reader) {
        const { done, value } = await reader.read();
        if (done || unloaded) break;
        pending += decoder.decode(value, { stream: true });
        const end = endOfCompleteScripts(pending);
        page.write(pending.slice(0, end));
        pending = pending.slice(end);
        moveIntoDocument();
      }
    } catch {
      // The server stopped in the middle of the document. It has reported
      // why; the browser has the part that arrived.
    }
    if (unloaded) return;
    try {
      page.write(pending + decoder.decode());
      page.close();
      moveIntoDocument();
    } finally {
      interactive.resolve();
      delete (document as { readyState?: unknown }).readyState;
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
    }
  })().catch(reportError);

  return { interactive: interactive.promise };
}

/** Leaves the page: the document is as it was before the page. */
export function unloadDocument(): void {
  unload?.();
  unload = undefined;
}
