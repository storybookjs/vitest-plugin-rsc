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

// Ported from Playwright's packages/playwright-core/src/server/injected/domUtils.ts
// at 4554372e456154d7365b6902ef9f3e1e7de76e94, as ivya 1.8.2 has it
// (https://github.com/vitest-dev/ivya/blob/v1.8.2/src/domUtils.ts), the
// code that Vitest 5's locators run, with `sortInDOMOrder()` of its
// src/selectorEvaluator.ts. Changed: WebKit is told by the user agent, where
// ivya has an option of the browser; in a DOM that does not render, a style
// without a visibility is visible; added, which ivya does not have:
// `hasVisibleBox()`. See NOTICE.

import { isRendered } from "./environment.ts";

export function isInsideScope(scope: Node, element: Element | undefined): boolean {
  while (element) {
    if (scope.contains(element)) {
      return true;
    }
    element = enclosingShadowHost(element);
  }
  return false;
}

export function parentElementOrShadowHost(element: Element): Element | undefined {
  if (element.parentElement) {
    return element.parentElement;
  }
  if (!element.parentNode) {
    return;
  }
  if (
    element.parentNode.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */ &&
    (element.parentNode as ShadowRoot).host
  ) {
    return (element.parentNode as ShadowRoot).host;
  }
}

export function enclosingShadowRootOrDocument(element: Element): Document | ShadowRoot | undefined {
  let node: Node = element;
  while (node.parentNode) {
    node = node.parentNode;
  }
  if (
    node.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */ ||
    node.nodeType === 9 /* Node.DOCUMENT_NODE */
  ) {
    return node as Document | ShadowRoot;
  }
}

function enclosingShadowHost(element: Element): Element | undefined {
  while (element.parentElement) {
    element = element.parentElement;
  }
  return parentElementOrShadowHost(element);
}

// Assumption: if scope is provided, element must be inside scope's subtree.
export function closestCrossShadow(element: Element | undefined, css: string): Element | undefined {
  while (element) {
    const closest = element.closest(css);
    if (closest) {
      return closest;
    }
    element = enclosingShadowHost(element);
  }
}

export function getElementComputedStyle(
  element: Element,
  pseudo?: string,
): CSSStyleDeclaration | undefined {
  return element.ownerDocument && element.ownerDocument.defaultView
    ? element.ownerDocument.defaultView.getComputedStyle(element, pseudo)
    : undefined;
}

export function isElementStyleVisibilityVisible(
  element: Element,
  style?: CSSStyleDeclaration,
): boolean {
  style = style ?? getElementComputedStyle(element);
  if (!style) {
    return true;
  }
  // Element.checkVisibility checks for content-visibility and also looks at
  // styles up the flat tree including user-agent ShadowRoots, such as the
  // details element for example.
  // All the browser implement it, but WebKit has a bug which prevents us from using it:
  // https://bugs.webkit.org/show_bug.cgi?id=264733
  if (checksVisibility) {
    if (!element.checkVisibility()) {
      return false;
    }
  } else {
    // Manual workaround for WebKit that does not have checkVisibility.
    const detailsOrSummary = element.closest("details,summary");
    if (
      detailsOrSummary !== element &&
      detailsOrSummary?.nodeName === "DETAILS" &&
      !(detailsOrSummary as HTMLDetailsElement).open
    ) {
      return false;
    }
  }
  // A DOM that does not render, like happy-dom's, may compute no visibility.
  if (
    style.visibility !== "visible" &&
    (style.visibility !== "" || isRendered(element.ownerDocument))
  ) {
    return false;
  }
  return true;
}

export function isElementVisible(element: Element): boolean {
  // Note: this logic should be similar to waitForDisplayedAtStablePosition() to avoid surprises.
  const style = getElementComputedStyle(element);
  if (!style) {
    return true;
  }
  if (style.display === "contents") {
    // display:contents is not rendered itself, but its child nodes are.
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1 /* Node.ELEMENT_NODE */ && isElementVisible(child as Element)) {
        return true;
      }
      if (child.nodeType === 3 /* Node.TEXT_NODE */ && isVisibleTextNode(child as Text)) {
        return true;
      }
    }
    return false;
  }
  if (!isElementStyleVisibilityVisible(element, style)) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function isVisibleTextNode(node: Text) {
  // https://stackoverflow.com/questions/1461059/is-there-an-equivalent-to-getboundingclientrect-for-text-nodes
  const range = node.ownerDocument.createRange();
  range.selectNode(node);
  const rect = range.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function elementSafeTagName(element: Element) {
  // Named inputs, e.g. <input name=tagName>, will be exposed as fields on the parent <form>
  // and override its properties.
  if (element instanceof HTMLFormElement) {
    return "FORM";
  }
  // Elements from the svg namespace do not have uppercase tagName right away.
  return element.tagName.toUpperCase();
}

// WebKit's `checkVisibility()` is wrong about a `<details>`: see
// `isElementStyleVisibilityVisible()`.
const isWebKit =
  typeof navigator !== "undefined" &&
  /AppleWebKit/.test(navigator.userAgent) &&
  !/Chrome|Chromium|Edg/.test(navigator.userAgent);

/** Whether `isElementStyleVisibilityVisible()` asks `checkVisibility()`: in a browser that has it, but WebKit. */
export const checksVisibility =
  typeof Element !== "undefined" &&
  !!(Element.prototype as Partial<Element>).checkVisibility &&
  !isWebKit;

/**
 * Not in Playwright: whether `checkVisibility()` finds `element` rendered,
 * with a box, so neither `display: contents` nor `display: none` on it or
 * above it, and of `visibility: visible`, without its computed style.
 * `false` where it cannot tell, in WebKit and in a DOM without it.
 */
export function hasVisibleBox(element: Element): boolean {
  return checksVisibility && element.checkVisibility(visibleBox);
}

// `checkVisibilityCSS` is the name of `visibilityProperty` before Chrome 121.
const visibleBox = { visibilityProperty: true, checkVisibilityCSS: true };

// From src/selectorEvaluator.ts of ivya 1.8.2, Playwright's at the same commit.
export function sortInDOMOrder(elements: Iterable<Element>): Element[] {
  interface SortEntry {
    children: Element[];
    taken: boolean;
  }

  const elementToEntry = new Map<Element, SortEntry>();
  const roots: Element[] = [];
  const result: Element[] = [];

  function append(element: Element): SortEntry {
    let entry = elementToEntry.get(element);
    if (entry) {
      return entry;
    }
    const parent = parentElementOrShadowHost(element);
    if (parent) {
      const parentEntry = append(parent);
      parentEntry.children.push(element);
    } else {
      roots.push(element);
    }
    entry = { children: [], taken: false };
    elementToEntry.set(element, entry);
    return entry;
  }
  for (const e of elements) {
    append(e).taken = true;
  }

  function visit(element: Element) {
    const entry = elementToEntry.get(element)!;
    if (entry.taken) {
      result.push(element);
    }
    if (entry.children.length > 1) {
      const set = new Set(entry.children);
      entry.children = [];
      let child = element.firstElementChild;
      while (child && entry.children.length < set.size) {
        if (set.has(child)) {
          entry.children.push(child);
        }
        child = child.nextElementSibling;
      }
      child = element.shadowRoot ? element.shadowRoot.firstElementChild : null;
      while (child && entry.children.length < set.size) {
        if (set.has(child)) {
          entry.children.push(child);
        }
        child = child.nextElementSibling;
      }
    }
    entry.children.forEach(visit);
  }
  roots.forEach(visit);

  return result;
}
