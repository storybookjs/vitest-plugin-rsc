/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Text matching as Vitest's locators match: the text of an element, its
// labels, and the matchers of a string or a RegExp. Ported from Playwright at
// 4554372e456154d7365b6902ef9f3e1e7de76e94, as ivya 1.8.2 has it:
// `normalizeWhiteSpace()` of src/stringUtils.ts, `matchesAttributePart()`,
// `elementText()`, `elementMatchesText()` and `getElementLabels()` of
// src/selectorUtils.ts, and `createTextMatcher()` of src/ivya.ts. Changed:
// the matchers take the text and `exact` of a locator, where Playwright's
// parse them from a selector string; the text of an element is its count
// of solid characters, of the added `solidLength()`, which an exact matcher
// compares first, and its strings when a matcher asks. See NOTICE.

import { getAriaLabelledByElements } from "./role-utils.ts";

export function normalizeWhiteSpace(text: string): string {
  return text
    .replace(/[​­]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * The text of an element or of an attribute: the count of the characters
 * normalizing keeps that are no white space, which an exact matcher
 * compares first, and the text, all of it and normalized, which an
 * element works out the first time a matcher asks, as most elements of a
 * query are ruled out by the count. Not in Playwright, whose text has its
 * strings, and the runs of an element's own text nodes, which no matcher of
 * the package reads, at once.
 */
export class ElementText {
  readonly solidLength: number;
  #full: string | (() => string);
  #normalized: string | undefined;

  constructor(solidLength: number, full: string | (() => string)) {
    this.solidLength = solidLength;
    this.#full = full;
  }

  get full(): string {
    if (typeof this.#full === "function") this.#full = this.#full();
    return this.#full;
  }

  get normalized(): string {
    this.#normalized ??= this.full ? normalizeWhiteSpace(this.full) : "";
    return this.#normalized;
  }
}

/** The text of a string alone, as of an attribute. */
export const textOf = (text: string) => new ElementText(solidLength(text), text);

const noText = new ElementText(0, "");

/**
 * How many characters of `text` normalizing keeps that are no white space:
 * the same for two texts that normalize alike, as normalizing changes white
 * space alone. Not in Playwright.
 */
export function solidLength(text: string): number {
  let length = 0;
  for (let i = 0; i < text.length; i++) {
    if (!isSpaceOrDropped(text.charCodeAt(i))) length++;
  }
  return length;
}

// The characters of `\s` and of the zero-width space and the soft hyphen,
// which `normalizeWhiteSpace()` drops.
function isSpaceOrDropped(code: number): boolean {
  if (code > 0x20 && code < 0x7f) return false;
  return (
    (code >= 0x09 && code <= 0x0d) ||
    code === 0x20 ||
    code === 0xa0 ||
    code === 0xad ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200b) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}
export type TextMatcher = (text: ElementText) => boolean;
/** The text of each element, for one query: the DOM does not change in it. */
export type TextCache = Map<Element | ShadowRoot, ElementText>;

/**
 * The matcher of `getByText()`, `getByLabelText()` and `filter({ hasText })`:
 * a RegExp tests the full text; a string matches the normalized text, whole
 * and case-sensitive with `exact`, else as a case-insensitive substring.
 * A RegExp is new for every call, as Playwright parses one from the
 * selector for every query, so that a `g` flag's `lastIndex` starts at 0.
 */
export function createTextMatcher(
  text: string | RegExp,
  exact: boolean,
): { matcher: TextMatcher; kind: "regex" | "strict" | "lax" } {
  if (text instanceof RegExp) {
    const re = new RegExp(text.source, text.flags);
    return { matcher: (elementText) => re.test(elementText.full), kind: "regex" };
  }
  const normalized = normalizeWhiteSpace(text);
  if (exact) {
    // A text of another count of solid characters normalizes to another text.
    const length = solidLength(normalized);
    return {
      matcher: (elementText) =>
        elementText.solidLength === length && elementText.normalized === normalized,
      kind: "strict",
    };
  }
  const lower = normalized.toLowerCase();
  return {
    matcher: (elementText) => elementText.normalized.toLowerCase().includes(lower),
    kind: "lax",
  };
}

/**
 * The matcher of an attribute's value, for `getByAltText()`,
 * `getByPlaceholder()`, `getByTitle()` and `getByTestId()`: not normalized;
 * whole with `exact`, else a case-insensitive substring.
 */
export function createAttributeMatcher(
  value: string | RegExp,
  exact: boolean,
): (attribute: string) => boolean {
  if (value instanceof RegExp) return (attribute) => !!attribute.match(value);
  if (exact) return (attribute) => attribute === value;
  const lower = value.toLowerCase();
  return (attribute) => attribute.toLowerCase().includes(lower);
}

/**
 * Whether an accessible name matches the `name` of `getByRole()`: Playwright's
 * `matchesAttributePart()` for the operator `getByRole()` has, `=` with
 * `exact`, else `*=`, case-insensitive by `toUpperCase()`.
 */
export function matchesAccessibleName(
  accessibleName: string,
  name: string | RegExp,
  exact: boolean,
): boolean {
  if (name instanceof RegExp) return !!accessibleName.match(name);
  if (exact) return accessibleName === name;
  return accessibleName.toUpperCase().includes(name.toUpperCase());
}

export function shouldSkipForTextMatching(element: Element | ShadowRoot) {
  const document = element.ownerDocument;
  return (
    element.nodeName === "SCRIPT" ||
    element.nodeName === "NOSCRIPT" ||
    element.nodeName === "STYLE" ||
    (document.head && document.head.contains(element))
  );
}

export function elementText(cache: TextCache, root: Element | ShadowRoot): ElementText {
  return cache.get(root) ?? textOfNode(cache, root, shouldSkipForTextMatching(root));
}

/**
 * The text of `root`, which `skip` leaves out, and of what is in it, into
 * the cache. A child of what is not left out is in the head only if it is
 * the head, so its name and that tell whether it is left out, without a
 * walk up the tree for each.
 */
function textOfNode(cache: TextCache, root: Element | ShadowRoot, skip: boolean): ElementText {
  let value = noText;
  if (!skip) {
    if (root instanceof HTMLInputElement && (root.type === "submit" || root.type === "button")) {
      value = textOf(root.value);
    } else {
      let length = 0;
      for (let child = root.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
          length += solidLength(child.nodeValue || "");
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          length += childText(cache, child as Element).solidLength;
        }
      }
      const shadow = (root as Element).shadowRoot;
      if (shadow) length += (cache.get(shadow) ?? textOfNode(cache, shadow, false)).solidLength;
      value = new ElementText(length, () => fullText(cache, root));
    }
  }
  cache.set(root, value);
  return value;
}

function childText(cache: TextCache, child: Element): ElementText {
  const skip =
    child.nodeName === "SCRIPT" ||
    child.nodeName === "NOSCRIPT" ||
    child.nodeName === "STYLE" ||
    child === child.ownerDocument.head;
  return cache.get(child) ?? textOfNode(cache, child, skip);
}

/** The text of `root`, of its text nodes and of the texts in the cache of what is in it. */
function fullText(cache: TextCache, root: Element | ShadowRoot): string {
  let full = "";
  for (let child = root.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === Node.TEXT_NODE) full += child.nodeValue || "";
    else if (child.nodeType === Node.ELEMENT_NODE) full += cache.get(child as Element)!.full;
  }
  const shadow = (root as Element).shadowRoot;
  if (shadow) full += cache.get(shadow)!.full;
  return full;
}

export function elementMatchesText(
  cache: TextCache,
  element: Element,
  matcher: TextMatcher,
): "none" | "self" | "selfAndChildren" {
  if (shouldSkipForTextMatching(element)) return "none";
  if (!matcher(elementText(cache, element))) return "none";
  for (let child = element.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === Node.ELEMENT_NODE && matcher(elementText(cache, child as Element))) {
      return "selfAndChildren";
    }
  }
  if (element.shadowRoot && matcher(elementText(cache, element.shadowRoot))) {
    return "selfAndChildren";
  }
  return "self";
}

export function getElementLabels(textCache: TextCache, element: Element): ElementText[] {
  const labels = getAriaLabelledByElements(element);
  if (labels) return labels.map((label) => elementText(textCache, label));
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel !== null && !!ariaLabel.trim()) {
    return [textOf(ariaLabel)];
  }

  // https://html.spec.whatwg.org/multipage/forms.html#category-label
  const isNonHiddenInput =
    element.nodeName === "INPUT" && (element as HTMLInputElement).type !== "hidden";
  if (
    ["BUTTON", "METER", "OUTPUT", "PROGRESS", "SELECT", "TEXTAREA"].includes(element.nodeName) ||
    isNonHiddenInput
  ) {
    const labels = (element as HTMLInputElement).labels;
    if (labels) return [...labels].map((label) => elementText(textCache, label));
  }
  return [];
}
