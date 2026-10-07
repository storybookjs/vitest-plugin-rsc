// A page load, for a tab that cannot load a page: the test runs in this
// document and has to stay in it. So the document the server sends is moved
// into this one. What the test runner needs stays, its scripts and styles. The
// rest of what is in the document steps aside for as long as the page is
// there: a second `<title>` would hide the page's, and text in `<body>` is not
// what React expects to hydrate.

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

/**
 * Replaces the page in this document with the one the server sent as `html`,
 * and runs its inline scripts in document order.
 *
 * The page is there in full before the app starts, so the document has loaded
 * by the time Next's client looks: it reads the Flight payload that Next's
 * inline scripts left in `self.__next_f`, and hydrates.
 */
export function loadDocument(html: string): void {
  unloadDocument();

  // What was here before the page. Everything else is the page's to lose.
  const before = new Set<Node>([...document.head.childNodes, ...document.body.childNodes]);
  const parked: { node: Node; parent: Node }[] = [];
  for (const node of before) {
    if (staysDuringPage(node) || !node.parentNode) continue;
    parked.push({ node, parent: node.parentNode });
    node.parentNode.removeChild(node);
  }

  unload = () => {
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

  // A parsed document has no scripting, so its scripts do not run, also not
  // once they are moved.
  const page = new DOMParser().parseFromString(html, "text/html");
  elements(page).forEach((element, index) =>
    setAttributes(elements(document)[index]!, attributesOf(element)),
  );
  document.head.append(...page.head.childNodes);
  document.body.append(...page.body.childNodes);

  // The inline scripts: React's, which move content that was waiting for
  // data into place, and Next's, which carry the Flight payload. The scripts
  // with a `src` are the app's chunks, which `renderServer()` stands in for.
  for (const script of document.querySelectorAll("script")) {
    if (before.has(script) || script.src) continue;
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
  unload?.();
  unload = undefined;
}
