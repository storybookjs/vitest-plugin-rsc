// What an action waits for before it acts, as Playwright's: one element, and
// that it is visible, enabled and, for typing, editable. A check that fails
// is looked at again, as the DOM changes, until the action's timeout.

import { defaultTimeout, isRendered } from "./environment.ts";
import { elementNotFound, notActionable, strictModeViolation } from "./errors.ts";
import {
  getElementComputedStyle,
  hasVisibleBox,
  isElementVisible,
  parentElementOrShadowHost,
} from "./dom-utils.ts";
import { isContentEditable } from "./form-controls.ts";
import { getAriaDisabled, getAriaRole } from "./role-utils.ts";
import { waitUntil } from "./wait.ts";

/** What an action acts on: a locator of the package, by what it finds and how it prints. */
export interface Target {
  elements(): Element[];
  asLocator(): string;
  /** Where "cannot find" shows the DOM of. */
  container(): Element;
}

export type Check = "visible" | "enabled" | "editable";

/** The options every action takes. */
export interface ActionOptions {
  /** How long to wait for the element, in milliseconds. Default: until just before the test times out. */
  timeout?: number;
}

/** The options of an action that Playwright's takes with `force`. */
export interface ForceOptions extends ActionOptions {
  /** Whether to act on the element once it is there, without the checks of its state. */
  force?: boolean;
}

/** An action's options, of which the package models `keys`: anything else throws. */
export function checkActionOptions(
  action: string,
  options: object | undefined,
  keys: readonly string[] = ["timeout"],
): void {
  for (const key of Object.keys(options ?? {})) {
    if (!keys.includes(key)) {
      throw new TypeError(
        `${action} has no option "${key}" in dom-locators, which takes ${keys.join(", ")}: use vitest/browser's locator for it.`,
      );
    }
  }
}

/**
 * The element of `target` once it passes `checks`, or once it is there for
 * `force`, retargeted by `retarget`. Rejects at once for more than one
 * element, and after the timeout with "cannot find" or with the check that
 * failed last.
 */
export function actionable(
  target: Target,
  action: string,
  checks: Check[],
  options: ForceOptions = {},
  retarget: (element: Element) => Element = (element) => element,
): Promise<Element> {
  let reason: string | undefined;
  return waitUntil(
    () => {
      const elements = target.elements();
      if (elements.length > 1) throw strictModeViolation(target.asLocator(), elements);
      if (elements.length === 0) {
        reason = undefined;
        return undefined;
      }
      const element = retarget(elements[0]!);
      reason = options.force ? undefined : failedCheck(element, checks);
      return reason === undefined ? { value: element } : undefined;
    },
    options.timeout ?? defaultTimeout(),
    () =>
      reason === undefined
        ? elementNotFound(target.asLocator(), target.container())
        : notActionable(action, target.asLocator(), reason),
  );
}

function failedCheck(element: Element, checks: Check[]): string | undefined {
  if (!element.isConnected) return "is not attached to the document";
  if (checks.includes("visible") && !isVisible(element)) return "is not visible";
  if ((checks.includes("enabled") || checks.includes("editable")) && getAriaDisabled(element)) {
    return "is disabled";
  }
  if (checks.includes("editable") && isReadonly(element)) return "is not editable";
  return undefined;
}

/**
 * Whether an element is visible, as Playwright's: a box of some size, and no
 * `visibility: hidden`. In a DOM that does not render, jsdom's or
 * happy-dom's, by its style alone: no `display: none` on it or above it,
 * through the hosts of shadow roots, and no `visibility: hidden`.
 */
export function isVisible(element: Element): boolean {
  if (isRendered(element.ownerDocument)) {
    // Playwright's answer, without the computed style where a visible box tells it.
    if (!hasVisibleBox(element)) return isElementVisible(element);
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  const style = getElementComputedStyle(element);
  if (style && style.visibility !== "" && style.visibility !== "visible") return false;
  for (let node: Element | undefined = element; node; node = parentElementOrShadowHost(node)) {
    if (getElementComputedStyle(node)?.display === "none") return false;
  }
  return true;
}

const kAriaReadonlyRoles = [
  "checkbox",
  "combobox",
  "grid",
  "gridcell",
  "listbox",
  "radiogroup",
  "slider",
  "spinbutton",
  "textbox",
  "columnheader",
  "rowheader",
  "searchbox",
  "switch",
  "treegrid",
];

// As Playwright's `getReadonly()`.
function isReadonly(element: Element): boolean {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(element.nodeName)) {
    return element.hasAttribute("readonly");
  }
  if (kAriaReadonlyRoles.includes(getAriaRole(element) || "")) {
    return element.getAttribute("aria-readonly") === "true";
  }
  return false;
}

/**
 * A form control's element for an element that is none: the control of the
 * label it is in, as Playwright's `fill()` and `selectOption()` find it.
 */
export function followLabel(element: Element): Element {
  if (!element.matches("input, textarea, select") && !isContentEditable(element)) {
    const label = element.closest("label");
    if (label?.control) return label.control;
  }
  return element;
}
