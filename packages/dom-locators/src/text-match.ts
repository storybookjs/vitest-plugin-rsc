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
// parse them from a selector string. See NOTICE.

import { getAriaLabelledByElements } from "./role-utils.ts";

export function normalizeWhiteSpace(text: string): string {
  return text
    .replace(/[​­]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export interface ElementText {
  full: string;
  normalized: string;
  immediate: string[];
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
    return { matcher: (elementText) => elementText.normalized === normalized, kind: "strict" };
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
  let value = cache.get(root);
  if (value === undefined) {
    value = { full: "", normalized: "", immediate: [] };
    if (!shouldSkipForTextMatching(root)) {
      let currentImmediate = "";
      if (root instanceof HTMLInputElement && (root.type === "submit" || root.type === "button")) {
        value = {
          full: root.value,
          normalized: normalizeWhiteSpace(root.value),
          immediate: [root.value],
        };
      } else {
        for (let child = root.firstChild; child; child = child.nextSibling) {
          if (child.nodeType === Node.TEXT_NODE) {
            value.full += child.nodeValue || "";
            currentImmediate += child.nodeValue || "";
          } else {
            if (currentImmediate) value.immediate.push(currentImmediate);
            currentImmediate = "";
            if (child.nodeType === Node.ELEMENT_NODE) {
              value.full += elementText(cache, child as Element).full;
            }
          }
        }
        if (currentImmediate) value.immediate.push(currentImmediate);
        if ((root as Element).shadowRoot) {
          value.full += elementText(cache, (root as Element).shadowRoot!).full;
        }
        if (value.full) value.normalized = normalizeWhiteSpace(value.full);
      }
    }
    cache.set(root, value);
  }
  return value;
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
    return [
      { full: ariaLabel, normalized: normalizeWhiteSpace(ariaLabel), immediate: [ariaLabel] },
    ];
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
