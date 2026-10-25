// The errors of the package: for a locator that finds nothing or more than
// one element, with first lines as Vitest's own, and for what the package
// does not model.

/**
 * Thrown for a locator, an option or a method the package does not model,
 * where Vitest's `page` would answer: never another answer instead. The
 * message names the reason and the way out through `vitest/browser`.
 */
export class UnsupportedError extends Error {
  override name = "UnsupportedError";
}

/** The way out, for a method or a locator the package does not model. */
export const escapeHatch =
  "use vitest/browser's own: `page.elementLocator(await locator.findElement())`";

/** A deferred method: it exists on the type, as on Vitest's `Locator`, and throws. */
export function deferred(method: string): never {
  throw new UnsupportedError(`${method} is not in dom-locators yet: ${escapeHatch}.`);
}

/** "Cannot find element with locator: …", as Vitest's `utils.getElementError()`, with the DOM. */
export function elementNotFound(locator: string, container: Element): Error {
  const error = new Error(
    `Cannot find element with locator: ${locator}\n\n${prettyDOM(container)}`,
  );
  // Vitest's name, so that the first line a reporter prints is Vitest's.
  error.name = "VitestBrowserElementError";
  return error;
}

/** "strict mode violation: … resolved to N elements:", as Vitest's, with the first 10. */
export function strictModeViolation(locator: string, elements: Element[]): Error {
  const lines = elements
    .slice(0, 10)
    .map((element, i) => `\n    ${i + 1}) ${previewNode(element)}`);
  if (elements.length > 10) lines.push("\n    ...");
  return new Error(
    `strict mode violation: ${locator} resolved to ${elements.length} elements:${lines.join("")}\n`,
  );
}

/** An action whose element is not ready in time: what it waited for, and what it saw last. */
export function notActionable(action: string, locator: string, reason: string): Error {
  return new Error(`${action} timed out: ${locator} ${reason}.`);
}

const booleanAttributes = new Set(["checked", "selected", "disabled", "readonly", "multiple"]);
const autoClosingTags = new Set([
  "AREA",
  "BASE",
  "BR",
  "COL",
  "EMBED",
  "HR",
  "IMG",
  "INPUT",
  "LINK",
  "META",
  "PARAM",
  "SOURCE",
  "TRACK",
  "WBR",
]);

const oneLine = (s: string) => s.replace(/\n/g, "↵").replace(/\t/g, "⇆");
const trim = (s: string, cap: number) => {
  const chars = Array.from(s);
  return chars.length > cap ? `${chars.slice(0, cap - 1).join("")}…` : s;
};

/** An element in one line, as Playwright's `previewNode()`: its attributes and short text. */
export function previewNode(element: Element): string {
  const attrs: string[] = [];
  for (const { name, value } of element.attributes) {
    if (name === "style") continue;
    attrs.push(!value && booleanAttributes.has(name) ? ` ${name}` : ` ${name}="${value}"`);
  }
  attrs.sort((a, b) => a.length - b.length);
  const attrText = trim(attrs.join(""), 500);
  const tag = element.nodeName.toLowerCase();
  if (autoClosingTags.has(element.nodeName)) return oneLine(`<${tag}${attrText}/>`);
  const children = element.childNodes;
  const onlyText =
    children.length <= 5 && [...children].every((child) => child.nodeType === Node.TEXT_NODE);
  const text = onlyText ? element.textContent || "" : children.length ? "…" : "";
  return oneLine(`<${tag}${attrText}>${trim(text, 50)}</${tag}>`);
}

// As Vitest's `prettyDOM()`: at most this many characters of the DOM.
const maxLength = 7000;

/** The DOM under `root`, indented, without scripts and styles, for an error. */
export function prettyDOM(root: Element): string {
  const lines: string[] = [];
  let length = 0;
  const push = (line: string) => {
    lines.push(line);
    length += line.length + 1;
  };
  const visit = (node: Node, depth: number) => {
    if (length > maxLength) return;
    const indent = "  ".repeat(depth);
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue?.trim();
      if (text) push(`${indent}${text}`);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const tag = element.nodeName.toLowerCase();
    if (tag === "script" || tag === "style") return;
    const attrs = [...element.attributes].map(({ name, value }) => ` ${name}="${value}"`).join("");
    if (autoClosingTags.has(element.nodeName)) {
      push(`${indent}<${tag}${attrs} />`);
      return;
    }
    if (!element.firstChild) {
      push(`${indent}<${tag}${attrs} />`);
      return;
    }
    push(`${indent}<${tag}${attrs}>`);
    for (const child of element.childNodes) visit(child, depth + 1);
    push(`${indent}</${tag}>`);
  };
  visit(root, 0);
  const text = lines.join("\n");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
