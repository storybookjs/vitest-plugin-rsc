import { queries as tl } from "@testing-library/dom";
import type { ByRoleMatcher, ByRoleOptions, Matcher, MatcherOptions } from "@testing-library/dom";
import { expect as vitestExpect } from "vitest";
import { utils, type Locator } from "vitest/browser";

// The DOM of an in-page test, queried, waited for and driven in the page
// itself, at a fraction of what Vitest's locators (Playwright's selector
// engine in the page) and Testing Library's user-event cost. Test code reads
// as with Testing Library: `screen.getByRole("button", { name })`,
// `screen.getByLabelText(text)`, `screen.getByText(text)`, `click(query)`,
// `fill(query, text)`, and `expect.element(query)` of Vitest waits for one.
//
// - Queries: Testing Library's semantics (`exact` by default, its default
//   normalizer, `hidden: false`), by an engine of its own for the cases this
//   module models; for anything else Testing Library's own query answers.
//   See `fallback` below for when.
// - A query is lazy, like a locator: it looks every time it is asked, and
//   chains (`screen.getByRole("main").getByRole("link")`).
// - Waiting: `findElement()` looks at once, then again after each batch of
//   changes of the DOM (one MutationObserver for the whole wait, one look per
//   microtask checkpoint with changes), and every 50 ms besides.
// - Events: the events a browser dispatches for a click and a fill, without
//   the pointer's way to the element and without selection. See `click()` and
//   `fill()`.
// - Errors: Vitest's, with the query as a locator would print it: "Cannot
//   find element with locator: getByRole('button', { name: 'Save' })" and
//   "strict mode violation: ... resolved to 2 elements:".
//
// Self-contained: it imports only vitest, vitest/browser and Testing
// Library (user-event lazily, for what it leaves to it), nothing of the app,
// so it could move into the plugin as an export.

/** Where Vitest's `expect.element()` tells a locator from an element. */
const locatorSymbol = Symbol.for("$$vitest:locator");

/** Counters of this module, for measurements: queries, waits and fallbacks. */
export const stats = {
  queries: 0,
  waits: 0,
  fallbacks: 0,
  waitQueries: 0,
  fallbackReasons: {} as Record<string, number>,
};

type TextMatch = Matcher;
export type TextOptions = { exact?: boolean; normalizer?: (text: string) => string };
export type RoleOptions = { name?: TextMatch; exact?: boolean } & Omit<ByRoleOptions, "name">;
type Query = (container: ParentNode & Node) => Element[];

// ---------------------------------------------------------------------------
// Text matching, as Testing Library's `matches()` and `fuzzyMatches()`.

const normalize = (text: string) => text.trim().replace(/\s+/g, " ");

function matcherOf(
  matcher: TextMatch,
  { exact = true, normalizer = normalize }: TextOptions = {},
): (text: string | null, element: Element) => boolean {
  if (typeof matcher === "string" || typeof matcher === "number") {
    const wanted = String(matcher);
    if (exact) return (text) => text !== null && normalizer(text) === wanted;
    const lower = wanted.toLowerCase();
    return (text) => text !== null && normalizer(text).toLowerCase().includes(lower);
  }
  if (matcher instanceof RegExp) {
    return (text) => {
      if (text === null) return false;
      matcher.lastIndex = 0;
      return matcher.test(normalizer(text));
    };
  }
  return (text, element) => text !== null && matcher(normalizer(text), element);
}

// ---------------------------------------------------------------------------
// Roles.

// The implicit roles this engine knows: the role, and the elements that have
// it. Any other role is Testing Library's.
const implicitRoles: Record<string, string> = {
  button: "button,input[type=button],input[type=submit],input[type=reset],input[type=image]",
  link: "a[href],area[href]",
  heading: "h1,h2,h3,h4,h5,h6",
  list: "ul,ol,menu",
  listitem: "li",
  main: "main",
  navigation: "nav",
  textbox:
    "input:not([type]),input[type=text],input[type=email],input[type=tel],input[type=url],textarea",
  searchbox: "input[type=search]",
  checkbox: "input[type=checkbox]",
  radio: "input[type=radio]",
  paragraph: "p",
  status: "output",
};

// What has the role by its tag alone, without a condition this engine does
// not check (like `li` outside a list, which Testing Library still calls
// `listitem`, or `header` and `section`, which depend on where they are).
function implicitRole(element: Element): string | null {
  switch (element.localName) {
    case "button":
      return "button";
    case "a":
    case "area":
      return element.hasAttribute("href") ? "link" : null;
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "ul":
    case "ol":
    case "menu":
      return "list";
    case "li":
      return "listitem";
    case "main":
      return "main";
    case "nav":
      return "navigation";
    case "textarea":
      return "textbox";
    case "p":
      return "paragraph";
    case "output":
      return "status";
    case "input": {
      // An input with a `list` is a combobox: Testing Library's.
      if (element.hasAttribute("list")) return "?";
      const type = (element.getAttribute("type") ?? "text").toLowerCase();
      if (type === "text" || type === "email" || type === "tel" || type === "url" || type === "")
        return "textbox";
      if (type === "search") return "searchbox";
      if (type === "button" || type === "submit" || type === "reset" || type === "image")
        return "button";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      return "?";
    }
    default:
      return null;
  }
}

// Roles whose name comes from their content.
const nameFromContent = new Set(["button", "link", "heading", "listitem", "checkbox", "radio"]);
// Content whose accessible name is not its text: an image, a control, CSS's
// `::before`, an element of its own name or a hidden one. Testing Library's.
const notPlainText =
  "img,svg,input,select,textarea,button,iframe,object,canvas,video,audio,slot,[role],[aria-label],[aria-labelledby],[aria-hidden],[hidden],[title],br,table,div,p,li,ul,ol,section,article,h1,h2,h3,h4,h5,h6";

/** Thrown for what this engine does not model: Testing Library's query answers. */
class Fallback extends Error {}
const fallback = (reason: string): never => {
  throw new Fallback(reason);
};

/** The accessible name, for the cases of this engine; else `Fallback`. */
function accessibleName(element: Element, role: string): string {
  if (element.hasAttribute("aria-labelledby")) fallback("aria-labelledby");
  const label = element.getAttribute("aria-label");
  if (label !== null && label.trim() !== "") return normalize(label);
  if (role === "textbox" || role === "searchbox" || role === "checkbox" || role === "radio") {
    const labels = (element as HTMLInputElement).labels;
    if (labels && labels.length > 0) {
      let name = "";
      for (const label of labels) {
        if (label.querySelector(notPlainText)) fallback("label content");
        name += (name ? " " : "") + (label.textContent ?? "");
      }
      return normalize(name);
    }
    // A placeholder, a title or a value is the name: Testing Library's.
    if (element.hasAttribute("placeholder") || element.hasAttribute("title"))
      fallback("placeholder or title");
    if (role === "checkbox" || role === "radio") fallback("unlabelled checkbox");
    return "";
  }
  if (element.localName === "input") {
    // An input button is named by its value.
    const type = element.getAttribute("type");
    if (type === "submit" || type === "reset" || type === "button") {
      const value = element.getAttribute("value");
      if (value !== null && value.trim() !== "") return normalize(value);
    }
    fallback("input name");
  }
  if (nameFromContent.has(role)) {
    if (element.hasAttribute("title")) fallback("title");
    if (element.firstElementChild) {
      // Inline text only: no element of a name of its own, none hidden, none
      // laid out as a block (which the name separates with spaces).
      if (element.querySelector(notPlainText)) fallback("content not plain text");
      for (const child of element.querySelectorAll("*")) {
        if (!child.checkVisibility() || getComputedStyle(child).display !== "inline")
          fallback("content hidden or not inline");
      }
    }
    return normalize(element.textContent ?? "");
  }
  // A landmark or a list without `aria-label` has no name of its content.
  if (element.hasAttribute("title")) fallback("title");
  return "";
}

/**
 * Whether Testing Library's `hidden: false` excludes the element: the
 * `hidden` attribute or `aria-hidden="true"` on it or an ancestor, or CSS
 * that hides it (`display: none` on it or an ancestor, `visibility: hidden`),
 * which `checkVisibility()` answers natively.
 */
function isInaccessible(element: Element): boolean {
  if (element.closest("[hidden],[aria-hidden=true]")) return true;
  return !element.checkVisibility({ visibilityProperty: true });
}

function fastByRole(container: ParentNode & Node, role: string, options: RoleOptions): Element[] {
  const { name, exact, hidden = false, ...rest } = options;
  // A state or a property to match (`pressed`, `level`, ...): Testing Library's.
  if (Object.keys(rest).length > 0) fallback("role state option");
  const implicit = implicitRoles[role];
  if (implicit === undefined) fallback("role not modelled");
  const matches = name === undefined ? undefined : matcherOf(name, { exact });
  const found: Element[] = [];
  for (const element of container.querySelectorAll(`${implicit},[role]`)) {
    const explicit = element.getAttribute("role");
    let own: string | null;
    if (explicit !== null) {
      own = explicit.trim().split(/\s+/)[0] ?? "";
      // `none` and `presentation` on a focusable element, and roles of
      // their own, are Testing Library's.
      if (own === "none" || own === "presentation" || own === "generic")
        fallback("role none/presentation/generic");
    } else {
      own = implicitRole(element);
      if (own === "?") fallback("implicit role not modelled");
    }
    if (own !== role) continue;
    if (matches && !matches(accessibleName(element, role), element)) continue;
    if (!hidden && isInaccessible(element)) continue;
    found.push(element);
  }
  return found;
}

function fastByLabelText(
  container: ParentNode & Node,
  text: TextMatch,
  options: TextOptions & { selector?: string },
): Element[] {
  const { selector = "*", ...matchOptions } = options;
  // An `aria-labelledby`: Testing Library's.
  if (container.querySelector("[aria-labelledby]")) fallback("aria-labelledby in container");
  const matches = matcherOf(text, matchOptions);
  const found = new Set<Element>();
  for (const label of container.querySelectorAll("label")) {
    // Testing Library reads a label's text without the text of its controls.
    if (label.querySelector("input,select,textarea,button,output,meter,progress"))
      fallback("label with controls");
    if (!matches(label.textContent, label)) continue;
    const control = (label as HTMLLabelElement).control;
    if (control && control.matches(selector)) found.add(control);
    // A label for nothing: Testing Library's error that says so.
    else if (!control) fallback("label without control");
  }
  for (const element of container.querySelectorAll("[aria-label]")) {
    if (matches(element.getAttribute("aria-label"), element) && element.matches(selector)) {
      found.add(element);
    }
  }
  // In the order of the document, as Testing Library's.
  return [...found].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
}

const SHOW_TEXT = 4;
function fastByText(
  container: ParentNode & Node,
  text: TextMatch,
  options: TextOptions & { selector?: string; ignore?: string | false },
): Element[] {
  const { selector = "*", ignore = "script, style", ...matchOptions } = options;
  const matches = matcherOf(text, matchOptions);
  // Testing Library's text of an element is the text of its own text nodes.
  // An element without one matches only a matcher that takes "": its query.
  if (matches("", container as Element)) fallback("matcher of empty text");
  const found: Element[] = [];
  const seen = new Set<Element>();
  const walker = document.createTreeWalker(container, SHOW_TEXT);
  let previous: Element | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || parent === previous || parent === container) continue;
    previous = parent;
    if (seen.has(parent)) continue;
    seen.add(parent);
    if (ignore && parent.matches(ignore)) continue;
    if (selector !== "*" && !parent.matches(selector)) continue;
    let own = "";
    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) own += child.textContent;
    }
    if (matches(own, parent)) found.push(parent);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Engines: this module's, with Testing Library's query as its fallback, and
// Testing Library's alone, to measure what the engine saves.

export type Engine = "fast" | "testing-library";
export let engine: Engine = "fast";
export function useEngine(next: Engine): void {
  engine = next;
}

function run(fast: () => Element[], testingLibrary: () => Element[]): Element[] {
  stats.queries++;
  if (engine === "fast") {
    try {
      return fast();
    } catch (error) {
      if (!(error instanceof Fallback)) throw error;
      stats.fallbacks++;
      stats.fallbackReasons[error.message] = (stats.fallbackReasons[error.message] ?? 0) + 1;
    }
  }
  return testingLibrary();
}

const byRole =
  (role: ByRoleMatcher, options: RoleOptions = {}): Query =>
  (container) =>
    run(
      () => fastByRole(container, role as string, options),
      () => {
        const { name, exact = true, ...rest } = options;
        const tlName =
          name !== undefined && !exact && typeof name !== "function" && !(name instanceof RegExp)
            ? (text: string) => normalize(text).toLowerCase().includes(String(name).toLowerCase())
            : typeof name === "number"
              ? String(name)
              : name;
        return tl.queryAllByRole(container as HTMLElement, role, { ...rest, name: tlName });
      },
    );

const byLabelText =
  (text: TextMatch, options: TextOptions & { selector?: string } = {}): Query =>
  (container) =>
    run(
      () => fastByLabelText(container, text, options),
      () => tl.queryAllByLabelText(container as HTMLElement, text, options as MatcherOptions),
    );

const byText =
  (
    text: TextMatch,
    options: TextOptions & { selector?: string; ignore?: string | false } = {},
  ): Query =>
  (container) =>
    run(
      () => {
        const found = fastByText(container, text, options);
        // Testing Library's matches the container itself too.
        const { selector = "*", ignore = "script, style" } = options;
        const self = container as Element;
        if (self.nodeType === 1 && self.matches(selector) && !(ignore && self.matches(ignore))) {
          let own = "";
          for (let child = self.firstChild; child; child = child.nextSibling) {
            if (child.nodeType === 3) own += child.textContent;
          }
          if (own && matcherOf(text, options)(own, self) && !found.includes(self)) {
            found.unshift(self);
          }
        }
        return found;
      },
      () => tl.queryAllByText(container as HTMLElement, text, options as MatcherOptions),
    );

// ---------------------------------------------------------------------------
// Lazy queries.

// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;
// A change of what an element is that is no change of the DOM, like a
// stylesheet that loads, is seen this late.
const pollInterval = 50;

/**
 * What `look` returns once it returns something: it looks at once, then
 * again after each batch of changes of the DOM, and every 50 ms besides.
 * One MutationObserver for the whole wait; the records of one microtask
 * checkpoint, however many callbacks of observers they make, are one look.
 * Rejects with what `look` throws, and with `timedOut()` after `timeout`.
 */
function waitUntil<T>(
  look: () => { value: T } | undefined,
  timeout: number,
  timedOut: () => unknown,
): Promise<T> {
  let now: { value: T } | undefined;
  try {
    now = look();
  } catch (error) {
    return Promise.reject(error);
  }
  if (now) return Promise.resolve(now.value);
  stats.waits++;
  return new Promise<T>((resolve, reject) => {
    let scheduled = false;
    const done = () => {
      observer.disconnect();
      clearTimeout(poll);
      clearTimeout(deadline);
    };
    const again = () => {
      scheduled = false;
      stats.waitQueries++;
      try {
        const found = look();
        if (!found) return;
        done();
        resolve(found.value);
      } catch (error) {
        done();
        reject(error);
      }
    };
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(again);
    });
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    let poll = setTimeout(function repeat() {
      again();
      poll = setTimeout(repeat, pollInterval);
    }, pollInterval);
    const deadline = setTimeout(() => {
      done();
      reject(timedOut());
    }, timeout);
  });
}

/**
 * Runs `callback` until it does not throw, as Testing Library's `waitFor()`:
 * again after each batch of changes of the DOM and every 50 ms. Rejects with
 * its last error after `timeout`.
 */
export function waitFor<T>(callback: () => T, { timeout = 5_000 } = {}): Promise<T> {
  let last: unknown;
  return waitUntil(
    () => {
      try {
        return { value: callback() };
      } catch (error) {
        last = error;
        return undefined;
      }
    },
    timeout,
    () => last,
  );
}

type Runner = { runner?: { _deadline?: { derive(): number } } };
const vitestDeadline = () =>
  (
    globalThis as { __vitest_browser_runner__?: Runner }
  ).__vitest_browser_runner__?.runner?._deadline?.derive();

export class Found {
  readonly [locatorSymbol] = true;
  constructor(
    private readonly parent: Found | null,
    private readonly find: Query,
    private readonly description: string,
  ) {}

  /** Every element of the query, in the order of the document. */
  elements(): Element[] {
    if (!this.parent) return this.find(document.body);
    const parents = this.parent.elements();
    if (parents.length === 1) return this.find(parents[0]!);
    const found = new Set<Element>();
    for (const parent of parents) for (const element of this.find(parent)) found.add(element);
    return [...found];
  }

  /** The element, or `null`; an error for more than one. */
  query(): Element | null {
    const elements = this.elements();
    if (elements.length > 1) throw this.error(elements.length);
    return elements[0] ?? null;
  }

  /** The element: an error for none and for more than one. */
  element(): Element {
    const element = this.query();
    if (!element) throw this.error(0);
    return element;
  }

  /**
   * The element once the page has it: at once if it has it, else after the
   * first batch of changes of the DOM that brings it. Rejects for more than
   * one (with `strict`) and after `timeout`.
   */
  findElement({
    strict = true,
    // Without a timeout of the caller's, Vitest's: until just before the
    // test times out, so the test fails with the query in its error.
    timeout = vitestDeadline() ?? 60_000,
  }: { strict?: boolean; timeout?: number } = {}): Promise<Element> {
    return waitUntil(
      () => {
        const elements = this.elements();
        if (elements.length === 1 || (elements.length > 1 && !strict))
          return { value: elements[0]! };
        if (elements.length > 1) throw this.error(elements.length);
        return undefined;
      },
      timeout,
      () => this.error(0),
    );
  }

  getByRole(role: ByRoleMatcher, options?: RoleOptions): Found {
    return new Found(this, byRole(role, options), describe("getByRole", role, options));
  }
  getByLabelText(text: TextMatch, options?: TextOptions & { selector?: string }): Found {
    return new Found(this, byLabelText(text, options), describe("getByLabelText", text, options));
  }
  getByText(
    text: TextMatch,
    options?: TextOptions & { selector?: string; ignore?: string | false },
  ): Found {
    return new Found(this, byText(text, options), describe("getByText", text, options));
  }

  toString(): string {
    return this.parent ? `${this.parent.toString()}.${this.description}` : this.description;
  }

  /** As Vitest's locators: `asLocator()` describes the query in its errors. */
  asLocator(): string {
    return this.toString();
  }

  /**
   * Vitest's errors: "Cannot find element with locator: <query>" with the
   * DOM (a `VitestBrowserElementError`, by `utils.getElementError()`), and
   * "strict mode violation: <query> resolved to <n> elements:" with the
   * first 10 of them.
   */
  private error(count: number): Error {
    if (count === 0) return utils.getElementError(this as unknown as Locator, document.body);
    const elements = this.elements();
    const lines = elements
      .slice(0, 10)
      .map((element, i) => `\n    ${i + 1}) ${preview(element)}`)
      .join("");
    return new Error(
      `strict mode violation: ${this.toString()} resolved to ${elements.length} elements:${lines}${elements.length > 10 ? "\n     ..." : ""}\n`,
    );
  }
}

function preview(element: Element): string {
  const open = element.outerHTML.slice(0, element.outerHTML.indexOf(">") + 1);
  const text = normalize(element.textContent ?? "").slice(0, 50);
  return `${open}${text}</${element.localName}>`;
}

// A query as Vitest writes a locator: getByRole('button', { name: 'Save' }).
const literal = (value: unknown): string =>
  value instanceof RegExp
    ? String(value)
    : typeof value === "string"
      ? `'${value.replace(/'/g, "\\'")}'`
      : typeof value === "function"
        ? "[function]"
        : String(value);
function describe(query: string, value: unknown, options?: object): string {
  const args = [literal(value)];
  const entries = Object.entries(options ?? {}).filter(([, v]) => v !== undefined);
  if (entries.length > 0)
    args.push(`{ ${entries.map(([k, v]) => `${k}: ${literal(v)}`).join(", ")} }`);
  return `${query}(${args.join(", ")})`;
}

/** The queries of the document's body, as Testing Library's `screen`. */
export const screen = {
  getByRole: (role: ByRoleMatcher, options?: RoleOptions) =>
    new Found(null, byRole(role, options), describe("getByRole", role, options)),
  getByLabelText: (text: TextMatch, options?: TextOptions & { selector?: string }) =>
    new Found(null, byLabelText(text, options), describe("getByLabelText", text, options)),
  getByText: (
    text: TextMatch,
    options?: TextOptions & { selector?: string; ignore?: string | false },
  ) => new Found(null, byText(text, options), describe("getByText", text, options)),
};

// ---------------------------------------------------------------------------
// Events.

type Target = Found | Element;
const elementOf = (target: Target): Promise<Element> =>
  target instanceof Found ? target.findElement() : Promise.resolve(target);

// What a real click focuses: the closest focusable element, else nothing.
const focusable =
  "input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled),a[href],area[href],iframe,summary,[tabindex],[contenteditable]:not([contenteditable=false])";

function isDisabled(element: Element): boolean {
  return element.matches(":disabled");
}

// Where the pointer is: the events of its way in and out of an element are
// left out, but a test that needs them can ask for `hover()`.
let pointerAt: Element | null = null;

const mouseInit = (button: number, buttons: number, detail: number): PointerEventInit => ({
  bubbles: true,
  cancelable: true,
  composed: true,
  view: window,
  button,
  buttons,
  detail,
  pointerId: 1,
  pointerType: "mouse",
  isPrimary: true,
});

/**
 * Clicks the element, as a mouse's left button does in Chrome:
 * `pointerdown`, `mousedown`, the focus moving to the closest focusable
 * element (or away, with `blur` of the one before), `pointerup`, `mouseup`
 * and `click`, with `button`, `buttons` and `detail` as Chrome's, bubbling and
 * composed. The `click` is the browser's to act on: it submits a form, follows
 * a link, toggles a checkbox and clicks a label's control. A disabled element
 * gets the pointer events only, as in Chrome.
 *
 * Not dispatched, where user-event and Playwright do: the pointer's way to
 * the element (`pointerover`, `pointerenter`, `mouseover`, `mouseenter`,
 * `pointermove`, `mousemove`, and the `*out`/`*leave` of the element it
 * leaves); no selection of text by the press; no check of `pointer-events:
 * none` and no hit test (Playwright clicks what is on top at the point).
 */
export async function click(target: Target): Promise<void> {
  const element = await elementOf(target);
  pointerAt = element;
  const disabled = isDisabled(element);
  const down = element.dispatchEvent(new PointerEvent("pointerdown", mouseInit(0, 1, 0)));
  if (!disabled && down && element.dispatchEvent(new MouseEvent("mousedown", mouseInit(0, 1, 1)))) {
    moveFocus(element);
  }
  element.dispatchEvent(new PointerEvent("pointerup", mouseInit(0, 0, 0)));
  if (disabled) return;
  if (down) element.dispatchEvent(new MouseEvent("mouseup", mouseInit(0, 0, 1)));
  element.dispatchEvent(new PointerEvent("click", mouseInit(0, 0, 1)));
}

function moveFocus(element: Element): void {
  const target = element.closest(focusable) as HTMLElement | null;
  const active = document.activeElement as HTMLElement | null;
  if (target !== active) commitChange(active);
  if (target) {
    if (target !== active) target.focus();
  } else if (active && active !== document.body) {
    active.blur();
  }
}

/** The events of the pointer's way onto the element, for a test that needs them. */
export async function hover(target: Target): Promise<void> {
  const element = await elementOf(target);
  const init = mouseInit(0, 0, 0);
  if (pointerAt && pointerAt !== element) {
    pointerAt.dispatchEvent(new PointerEvent("pointerout", init));
    pointerAt.dispatchEvent(new MouseEvent("mouseout", init));
  }
  if (pointerAt !== element) {
    element.dispatchEvent(new PointerEvent("pointerover", init));
    element.dispatchEvent(new MouseEvent("mouseover", init));
  }
  element.dispatchEvent(new PointerEvent("pointermove", init));
  element.dispatchEvent(new MouseEvent("mousemove", init));
  pointerAt = element;
}

const valueSetters = new Map<object, (this: Element, value: string) => void>();
function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = Object.getPrototypeOf(element) as object;
  let setter = valueSetters.get(proto);
  if (!setter) {
    setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
    valueSetters.set(proto, setter);
  }
  // The prototype's setter, past React's tracker on the element, so React
  // sees the value change, as from typing.
  setter.call(element, value);
}

const textInputs = new Set(["", "text", "search", "email", "tel", "url", "password", "number"]);
// The value of each element when the focus came to it: a `change` follows on
// `blur` if it changed, as the browser fires for a user's edit.
const valueAtFocus = new WeakMap<Element, string>();

/**
 * Replaces the value of a text input or a textarea, as Playwright's
 * `fill()` does: the focus moves to it (with `blur` of the element before,
 * and a `change` there if its value changed since its focus), then the value
 * is set, past React's tracker, and one `input` event (an `InputEvent` of
 * `insertText`, or `deleteContentBackward` for "") tells the page. A
 * `maxlength` cuts the text, as typing does. As the browser does for an
 * edit by the user, `change` fires once the element loses the focus.
 *
 * Not dispatched, where user-event's clear + paste does: `select`,
 * `beforeinput`, `paste`, and the `input` of the clear (user-event: two
 * `input` events; Playwright: `beforeinput` + `input`, or none for an
 * unchanged value). Another element (`contenteditable`, `select`, a
 * checkbox) is user-event's.
 */
export async function fill(target: Target, text: string): Promise<void> {
  const element = await elementOf(target);
  const isText =
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && textInputs.has(element.type));
  if (!isText || element.readOnly || element.disabled) return userEventFill(element, text);
  if (document.activeElement !== element) {
    commitChange(document.activeElement);
    element.focus();
  }
  if (!valueAtFocus.has(element)) {
    valueAtFocus.set(element, element.value);
    element.addEventListener("blur", onBlur, { once: true });
  }
  const value = element.maxLength >= 0 ? text.slice(0, element.maxLength) : text;
  setValue(element, value);
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: value ? "insertText" : "deleteContentBackward",
      data: value || null,
    }),
  );
}

function onBlur(event: Event): void {
  commitChange(event.target as Element);
}

function commitChange(element: Element | null): void {
  if (!element || !valueAtFocus.has(element)) return;
  const before = valueAtFocus.get(element);
  valueAtFocus.delete(element);
  element.removeEventListener("blur", onBlur);
  if ((element as HTMLInputElement).value !== before) {
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/**
 * Presses a key on the element, which gets the focus. Enter as in Chrome:
 * `keydown`, `keypress`, then the key's action, `keyup`. Its action: a
 * button or a link is clicked (a `click` of `detail` 0); in a text input of a
 * form, the form's default button is clicked, or a form without one and with
 * a single text input is submitted. Any other key, and Enter in a textarea or
 * an editable element, is user-event's `keyboard()`.
 */
export async function press(target: Target, key: string): Promise<void> {
  const element = (await elementOf(target)) as HTMLElement;
  if (key !== "Enter" || element instanceof HTMLTextAreaElement || element.isContentEditable) {
    element.focus();
    return (await userEvent()).keyboard(`{${key}}`);
  }
  if (document.activeElement !== element) {
    commitChange(document.activeElement);
    element.focus();
  }
  const init: KeyboardEventInit = {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
  };
  if (
    element.dispatchEvent(new KeyboardEvent("keydown", init)) &&
    element.dispatchEvent(new KeyboardEvent("keypress", { ...init, charCode: 13 }))
  ) {
    activateOnEnter(element);
  }
  element.dispatchEvent(new KeyboardEvent("keyup", init));
}

const clickOnEnter = new Set(["button", "color", "file", "image", "reset", "submit"]);
const submitOnEnter = new Set([
  "email",
  "month",
  "password",
  "search",
  "tel",
  "text",
  "url",
  "week",
  "number",
  "date",
  "time",
  "datetime-local",
]);
function activateOnEnter(element: HTMLElement): void {
  const click = (target: Element) =>
    target.dispatchEvent(
      new PointerEvent("click", { ...mouseInit(0, 0, 0), pointerId: -1, pointerType: "" }),
    );
  if (
    element instanceof HTMLButtonElement ||
    (element instanceof HTMLAnchorElement && element.hasAttribute("href")) ||
    (element instanceof HTMLInputElement && clickOnEnter.has(element.type))
  ) {
    click(element);
    return;
  }
  if (!(element instanceof HTMLInputElement) || !element.form) return;
  const form = element.form;
  // The default button: the form's first submit button, in tree order.
  const submit = [...form.elements].find(
    (control) =>
      (control instanceof HTMLButtonElement && control.type === "submit") ||
      (control instanceof HTMLInputElement &&
        (control.type === "submit" || control.type === "image")),
  );
  if (submit) {
    if (!(submit as HTMLButtonElement).disabled) click(submit);
    return;
  }
  const blocking = [...form.elements].filter(
    (control) => control instanceof HTMLInputElement && submitOnEnter.has(control.type),
  );
  if (blocking.length === 1) form.requestSubmit();
}

/** user-event, for what this module leaves to it: one instance, without delays. */
let userEventInstance: Promise<import("@testing-library/user-event").UserEvent> | undefined;
export function userEvent() {
  return (userEventInstance ??= import("@testing-library/user-event").then(({ userEvent }) =>
    userEvent.setup({ delay: null }),
  ));
}

async function userEventFill(element: Element, text: string): Promise<void> {
  const user = await userEvent();
  await user.clear(element);
  if (text) await user.paste(text);
}

// ---------------------------------------------------------------------------
// Assertions.

type ElementExpect = typeof vitestExpect.element;
/**
 * Vitest's `expect`, whose `expect.element()` takes a query of this module
 * too: it waits with the query's `findElement()`, and asserts with Vitest's
 * matchers of the DOM.
 */
export const expect = vitestExpect as typeof vitestExpect & {
  element(target: Found, options?: Parameters<ElementExpect>[1]): ReturnType<ElementExpect>;
};
