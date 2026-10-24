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

// One function per `getBy*` of Vitest's locators: the elements under a root
// that it finds, in the order of the document, with the selector Vitest
// writes for it and the locator Vitest prints for it. The engines are
// ported from Playwright at 4554372e456154d7365b6902ef9f3e1e7de76e94, as
// ivya 1.8.2 has them: the role engine of src/roleSelectorEngine.ts, the
// text, label and attribute engines of src/ivya.ts, the selectors of
// src/locatorUtils.ts with the escapes of src/stringUtils.ts, and the
// printing of src/locatorGenerators.ts. Changed: an engine takes a
// locator's arguments, where Playwright's parse a selector string, and the
// role engine looks only at the candidates of a role. A shadow root, which
// Playwright pierces, throws instead. See NOTICE.

import { UnsupportedError, escapeHatch } from "./errors.ts";
import {
  beginAriaCaches,
  endAriaCaches,
  getAriaChecked,
  getAriaDisabled,
  getAriaExpanded,
  getAriaLevel,
  getAriaPressed,
  getAriaRole,
  getAriaRoleCandidates,
  getAriaSelected,
  getElementAccessibleName,
  isElementHiddenForAria,
  kAriaCheckedRoles,
  kAriaExpandedRoles,
  kAriaLevelRoles,
  kAriaPressedRoles,
  kAriaSelectedRoles,
} from "./role-utils.ts";
import {
  createAttributeMatcher,
  createTextMatcher,
  elementMatchesText,
  getElementLabels,
  matchesAccessibleName,
  normalizeWhiteSpace,
  type TextCache,
} from "./text-match.ts";

/** The elements under `root` that a `getBy*` finds, in the order of the document. */
export type Query = (root: Element, cache: TextCache) => Element[];

/** A `getBy*`: its query, the selector Vitest writes for it, and the locator Vitest prints. */
export interface Part {
  query: Query;
  selector: string;
  locator: string;
}

/** The options of `getByRole()`, as Vitest's `LocatorByRoleOptions`. */
export interface ByRoleOptions {
  checked?: boolean;
  disabled?: boolean;
  exact?: boolean;
  expanded?: boolean;
  includeHidden?: boolean;
  level?: number;
  name?: string | RegExp;
  pressed?: boolean;
  selected?: boolean;
}

/** The options of the other `getBy*`, as Vitest's `LocatorOptions`. */
export interface TextOptions {
  exact?: boolean;
}

const roleOptions = new Set([
  "checked",
  "disabled",
  "exact",
  "expanded",
  "includeHidden",
  "level",
  "name",
  "pressed",
  "selected",
]);
const textOptions = new Set(["exact"]);

function checkOptions(method: string, options: object | undefined, known: Set<string>): void {
  for (const key of Object.keys(options ?? {})) {
    if (!known.has(key)) {
      throw new UnsupportedError(
        `${method} has no option "${key}" (Vitest's page ignores it): ${[...known].join(", ")}.`,
      );
    }
  }
}

// Every element under `root`, without it, as Playwright's `_queryCSS(*)`,
// which also walks into open shadow roots: those throw here.
function elementsUnder(root: Element, css: string): Element[] {
  const elements = [...root.querySelectorAll(css)];
  if (css !== "*") checkNoShadowRoots(root);
  else for (const element of elements) if (element.shadowRoot) shadowRootFound(element);
  if (root.shadowRoot) shadowRootFound(root);
  return elements;
}

function checkNoShadowRoots(root: Element): void {
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) shadowRootFound(element);
  }
}

function shadowRootFound(host: Element): never {
  throw new UnsupportedError(
    `<${host.localName}> has a shadow root, which Vitest's locators look into and dom-locators does not: ${escapeHatch}.`,
  );
}

// ---------------------------------------------------------------------------
// Roles: Playwright's `internal:role` engine.

function validateSupportedRole(attr: string, roles: string[], role: string) {
  if (!roles.includes(role)) {
    throw new Error(
      `"${attr}" attribute is only supported for roles: ${roles
        .slice()
        .sort()
        .map((role) => `"${role}"`)
        .join(", ")}`,
    );
  }
}

function validateSupportedValues(name: string, value: unknown, values: unknown[]) {
  if (!values.includes(value)) {
    throw new Error(`"${name}" must be one of ${values.map((v) => JSON.stringify(v)).join(", ")}`);
  }
}

function validateRoleOptions(role: string, options: ByRoleOptions): void {
  if (options.checked !== undefined) {
    validateSupportedRole("checked", kAriaCheckedRoles, role);
    validateSupportedValues("checked", options.checked, [true, false, "mixed"]);
  }
  if (options.disabled !== undefined) {
    validateSupportedValues("disabled", options.disabled, [true, false]);
  }
  if (options.selected !== undefined) {
    validateSupportedRole("selected", kAriaSelectedRoles, role);
    validateSupportedValues("selected", options.selected, [true, false]);
  }
  if (options.expanded !== undefined) {
    validateSupportedRole("expanded", kAriaExpandedRoles, role);
    validateSupportedValues("expanded", options.expanded, [true, false]);
  }
  if (options.includeHidden !== undefined) {
    validateSupportedValues("include-hidden", options.includeHidden, [true, false]);
  }
  if (options.level !== undefined) {
    validateSupportedRole("level", kAriaLevelRoles, role);
    if (typeof options.level !== "number" || Number.isNaN(options.level)) {
      throw new Error(`"level" attribute must be compared to a number`);
    }
  }
  if (options.name !== undefined) {
    if (typeof options.name !== "string" && !(options.name instanceof RegExp)) {
      throw new TypeError(`"name" attribute must be a string or a regular expression`);
    }
  }
  if (options.pressed !== undefined) {
    validateSupportedRole("pressed", kAriaPressedRoles, role);
    validateSupportedValues("pressed", options.pressed, [true, false, "mixed"]);
  }
}

export function byRole(role: string, options: ByRoleOptions = {}, exactDefault: boolean): Part {
  checkOptions("getByRole()", options, roleOptions);
  const exact = options.exact ?? exactDefault;
  const props: string[][] = [];
  const attrs: string[] = [];
  if (options.checked !== undefined) props.push(["checked", String(options.checked)]);
  if (options.disabled !== undefined) props.push(["disabled", String(options.disabled)]);
  if (options.selected !== undefined) props.push(["selected", String(options.selected)]);
  if (options.expanded !== undefined) props.push(["expanded", String(options.expanded)]);
  if (options.includeHidden !== undefined) {
    props.push(["include-hidden", String(options.includeHidden)]);
  }
  if (options.level !== undefined) props.push(["level", String(options.level)]);
  if (options.name !== undefined) {
    props.push(["name", escapeForAttributeSelector(options.name, exact)]);
    if (options.name instanceof RegExp) {
      attrs.push(`name: ${regexToSourceString(options.name)}`);
    } else {
      attrs.push(`name: ${quote(options.name)}`);
      if (exact !== exactDefault) attrs.push(`exact: ${exact}`);
    }
  }
  if (options.pressed !== undefined) props.push(["pressed", String(options.pressed)]);
  for (const [name, value] of props) {
    if (name === "name") continue;
    const printed =
      value === "true" || value === "false" || name === "level" ? value : quote(value!);
    attrs.push(`${name === "include-hidden" ? "includeHidden" : name}: ${printed}`);
  }
  const lowerRole = role.toLowerCase();
  const name = typeof options.name === "string" ? normalizeWhiteSpace(options.name) : options.name;
  return {
    selector: `internal:role=${role}${props.map(([n, v]) => `[${n}=${v}]`).join("")}`,
    locator: `getByRole(${quote(role)}${attrs.length ? `, { ${attrs.join(", ")} }` : ""})`,
    query(root) {
      if (!lowerRole) throw new Error(`Role must not be empty`);
      validateRoleOptions(lowerRole, options);
      beginAriaCaches();
      try {
        const result: Element[] = [];
        for (const element of elementsUnder(root, getAriaRoleCandidates(lowerRole))) {
          if (getAriaRole(element) !== lowerRole) continue;
          if (options.selected !== undefined && getAriaSelected(element) !== options.selected) {
            continue;
          }
          if (options.checked !== undefined && getAriaChecked(element) !== options.checked) {
            continue;
          }
          if (options.pressed !== undefined && getAriaPressed(element) !== options.pressed) {
            continue;
          }
          if (options.expanded !== undefined && getAriaExpanded(element) !== options.expanded) {
            continue;
          }
          if (options.level !== undefined && getAriaLevel(element) !== options.level) continue;
          if (options.disabled !== undefined && getAriaDisabled(element) !== options.disabled) {
            continue;
          }
          if (!options.includeHidden && isElementHiddenForAria(element)) continue;
          if (name !== undefined) {
            // Always normalize whitespace in the accessible name.
            const accessibleName = normalizeWhiteSpace(
              getElementAccessibleName(element, !!options.includeHidden),
            );
            if (!matchesAccessibleName(accessibleName, name, exact)) continue;
          }
          result.push(element);
        }
        return result;
      } finally {
        endAriaCaches();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Text: Playwright's `internal:text`, `internal:label` and `internal:attr`.

export function byText(
  text: string | RegExp,
  options: TextOptions = {},
  exactDefault: boolean,
): Part {
  checkOptions("getByText()", options, textOptions);
  const exact = options.exact ?? exactDefault;
  return {
    selector: `internal:text=${escapeForTextSelector(text, exact)}`,
    locator: callWithExact("getByText", text, exact, exactDefault),
    query(root, cache) {
      const { matcher, kind } = createTextMatcher(text, exact);
      const result: Element[] = [];
      let lastDidNotMatchSelf: Element | null = null;
      const appendElement = (element: Element) => {
        if (kind === "lax" && lastDidNotMatchSelf && lastDidNotMatchSelf.contains(element)) return;
        const matches = elementMatchesText(cache, element, matcher);
        if (matches === "none") lastDidNotMatchSelf = element;
        // `internal:text` takes the smallest element: one whose children do not match too.
        if (matches === "self") result.push(element);
      };
      appendElement(root);
      for (const element of elementsUnder(root, "*")) appendElement(element);
      return result;
    },
  };
}

export function byLabelText(
  text: string | RegExp,
  options: TextOptions = {},
  exactDefault: boolean,
): Part {
  checkOptions("getByLabelText()", options, textOptions);
  const exact = options.exact ?? exactDefault;
  return {
    selector: `internal:label=${escapeForTextSelector(text, exact)}`,
    // Playwright's name, which Vitest prints.
    locator: callWithExact("getByLabel", text, exact, exactDefault),
    query(root, cache) {
      const { matcher } = createTextMatcher(text, exact);
      return elementsUnder(root, "*").filter((element) =>
        getElementLabels(cache, element).some((label) => matcher(label)),
      );
    },
  };
}

function byAttribute(
  method: "getByAltText" | "getByPlaceholder" | "getByTitle",
  attribute: string,
  text: string | RegExp,
  options: TextOptions = {},
  exactDefault: boolean,
): Part {
  checkOptions(`${method}()`, options, textOptions);
  const exact = options.exact ?? exactDefault;
  return {
    selector: `internal:attr=[${attribute}=${escapeForAttributeSelector(text, exact)}]`,
    locator: callWithExact(method, text, exact, exactDefault),
    query(root) {
      const matches = createAttributeMatcher(text, exact);
      return elementsUnder(root, `[${attribute}]`).filter((element) =>
        matches(element.getAttribute(attribute)!),
      );
    },
  };
}

export const byAltText = (
  text: string | RegExp,
  options: TextOptions | undefined,
  exact: boolean,
) => byAttribute("getByAltText", "alt", text, options, exact);
export const byPlaceholder = (
  text: string | RegExp,
  options: TextOptions | undefined,
  exact: boolean,
) => byAttribute("getByPlaceholder", "placeholder", text, options, exact);
export const byTitle = (text: string | RegExp, options: TextOptions | undefined, exact: boolean) =>
  byAttribute("getByTitle", "title", text, options, exact);

export function byTestId(attribute: string, testId: string | RegExp): Part {
  return {
    selector: `internal:testid=[${attribute}=${escapeForAttributeSelector(testId, true)}]`,
    locator: `getByTestId(${testId instanceof RegExp ? regexToSourceString(testId) : quote(testId)})`,
    query(root) {
      const matches = createAttributeMatcher(testId, true);
      return elementsUnder(root, `[${attribute}]`).filter((element) =>
        matches(element.getAttribute(attribute)!),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Selectors and locators, as Vitest writes and prints them.

function escapeRegexForSelector(re: RegExp): string {
  // Unicode mode does not allow "identity character escapes", so we do not escape and
  // hope that it does not contain quotes and/or >> signs.
  if (re.unicode || re.unicodeSets) return String(re);
  // Even number of backslashes followed by the quote -> insert a backslash.
  return String(re)
    .replace(/(^|[^\\])(\\\\)*(["'`])/g, "$1$2\\$3")
    .replace(/>>/g, "\\>\\>");
}

/** A text of a selector: `"text"i`, `"text"s`, or a RegExp. */
export function escapeForTextSelector(text: string | RegExp, exact: boolean): string {
  if (typeof text !== "string") return escapeRegexForSelector(text);
  return `${JSON.stringify(text)}${exact ? "s" : "i"}`;
}

function escapeForAttributeSelector(value: string | RegExp, exact: boolean): string {
  if (typeof value !== "string") return escapeRegexForSelector(value);
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"${exact ? "s" : "i"}`;
}

function normalizeEscapedRegexQuotes(source: string) {
  // This function reverses the effect of escapeRegexForSelector above.
  // Odd number of backslashes followed by the quote -> remove unneeded backslash.
  return source.replace(/(^|[^\\])(\\\\)*\\(['"`])/g, "$1$2$3");
}

export const regexToSourceString = (re: RegExp) => normalizeEscapedRegexQuotes(String(re));

/** A string as Vitest's printed locators quote it: `'text'`. */
export function quote(text: string): string {
  const stringified = JSON.stringify(text);
  const escapedText = stringified.substring(1, stringified.length - 1).replace(/\\"/g, '"');
  return `'${escapedText.replace(/'/g, "\\'")}'`;
}

function callWithExact(
  method: string,
  body: string | RegExp,
  exact: boolean,
  exactDefault: boolean,
): string {
  if (body instanceof RegExp) return `${method}(${regexToSourceString(body)})`;
  return exact !== exactDefault
    ? `${method}(${quote(body)}, { exact: ${exact} })`
    : `${method}(${quote(body)})`;
}
