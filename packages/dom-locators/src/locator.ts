// The locator: Vitest's `Locator`, a lazy chain of `getBy*`, filters, `nth`,
// `and` and `or` that looks at the document each time it is asked, strict
// about one element where Vitest is, with the selector and the printed
// locator Vitest has for it, and the locator symbol of `expect.element()`.

import {
  actionable,
  checkActionOptions,
  followLabel,
  type ActionOptions,
  type ForceOptions,
  type Target,
} from "./actionability.ts";
import { defaultTimeout, exactByDefault, isRendered, testIdAttribute } from "./environment.ts";
import {
  UnsupportedError,
  deferred,
  elementNotFound,
  escapeHatch,
  strictModeViolation,
} from "./errors.ts";
import { isInsideScope, sortInDOMOrder } from "./dom-utils.ts";
import { fill, selectOptions, setInputFiles, type SelectValue } from "./form-controls.ts";
import { focusForPress, press, pressSequentially, type Key } from "./keyboard.ts";
import { holdOnly, isModifier, type Modifier } from "./modifiers.ts";
import { click, drag, hover, wheel, type MouseButton, type Position } from "./pointer.ts";
import { beginAriaCaches, endAriaCaches } from "./role-utils.ts";
import {
  byAltText,
  byLabelText,
  byPlaceholder,
  byRole,
  byTestId,
  byText,
  byTitle,
  escapeForTextSelector,
  quote,
  regexToSourceString,
  type ByRoleOptions,
  type Part,
  type TextOptions,
} from "./selectors.ts";
import { createTextMatcher, elementText, type TextCache } from "./text-match.ts";
import { waitUntil } from "./wait.ts";

/** Where Vitest's `expect.element()` tells a locator from an element. */
const locatorSymbol = Symbol.for("$$vitest:locator");

/** The options of `filter()`, as Vitest's `LocatorFilterOptions`. */
export interface FilterOptions {
  hasText?: string | RegExp;
  hasNotText?: string | RegExp;
  has?: DomLocator;
  hasNot?: DomLocator;
}

/** The options of `hover()` and `unhover()`, of Playwright's that the page models. */
export interface HoverOptions extends ForceOptions {
  /** The modifier keys held during the action. */
  modifiers?: Modifier[];
  /** Where in the element, from the top left corner of its padding box. Default: its middle. */
  position?: Position;
  /** Whether to wait for the element and its checks, and not to act. */
  trial?: boolean;
  /** No effect, as in Playwright. */
  noWaitAfter?: boolean;
}

/** The options of `dblClick()` and `tripleClick()`, of Playwright's that the page models. */
export interface DoubleClickOptions extends HoverOptions {
  /** Default: "left". */
  button?: MouseButton;
}

/** The options of `click()`, of Playwright's that the page models. */
export interface ClickOptions extends DoubleClickOptions {
  /** How many presses of the button in a row. Default: 1. */
  clickCount?: number;
}

/** The options of `dropTo()`, of Playwright's `dragTo()` that the page models. */
export interface DropOptions extends ForceOptions {
  /** Where the mouse presses in the element, from the top left corner of its padding box. Default: its middle. */
  sourcePosition?: Position;
  /** Where it lets go in the target. Default: its middle. */
  targetPosition?: Position;
  /** Whether to wait for both elements and their checks, and not to act. */
  trial?: boolean;
  /** No effect, as in Playwright. */
  noWaitAfter?: boolean;
}

const dropKeys = ["timeout", "force", "sourcePosition", "targetPosition", "trial", "noWaitAfter"];

/** The options of `fill()`, `clear()` and `selectOptions()`, of Playwright's that the page models. */
export interface FillOptions extends ForceOptions {
  /** No effect, as in Playwright. */
  noWaitAfter?: boolean;
}

/** The options of `upload()`, of Playwright's that the page models. */
export interface UploadOptions extends ActionOptions {
  /** No effect, as in Playwright. */
  noWaitAfter?: boolean;
}

/** The options of `press()` and `pressSequentially()`, of Playwright's that the page models. */
export interface PressOptions extends ActionOptions {
  /** No effect, as in Playwright. */
  noWaitAfter?: boolean;
}

/** The options of `wheel()`, as Vitest's: by `delta` in pixels, or by 100 pixels in a `direction`. */
export type WheelOptions = { times?: number } & (
  | { delta: { x: number; y?: number } | { x?: number; y: number }; direction?: undefined }
  | { direction: "up" | "down" | "left" | "right"; delta?: undefined }
);

const wheelDirections = {
  up: { x: 0, y: -100 },
  down: { x: 0, y: 100 },
  left: { x: -100, y: 0 },
  right: { x: 100, y: 0 },
};

const hoverKeys = ["timeout", "force", "modifiers", "position", "trial", "noWaitAfter"];
const doubleClickKeys = [...hoverKeys, "button"];
const clickKeys = [...doubleClickKeys, "clickCount"];
const fillKeys = ["timeout", "force", "noWaitAfter"];

/** The values of a mouse action's options, which Playwright checks too. */
function checkMouseOptions(action: string, options: ClickOptions): void {
  const invalid = (option: string) =>
    new TypeError(
      `${action} has an invalid ${option}: ${JSON.stringify(options[option as never])}.`,
    );
  if (options.button !== undefined && !["left", "middle", "right"].includes(options.button)) {
    throw invalid("button");
  }
  const count = options.clickCount;
  if (count !== undefined && !(Number.isInteger(count) && count > 0)) throw invalid("clickCount");
  if (options.modifiers !== undefined && !options.modifiers.every((key) => isModifier(key))) {
    throw invalid("modifiers");
  }
  const position = options.position;
  if (position !== undefined && !(Number.isFinite(position.x) && Number.isFinite(position.y))) {
    throw invalid("position");
  }
}

/** Runs `act` with `modifiers` held, as Playwright's action with them; with the keys as they were for none. */
function withModifiers(modifiers: Modifier[] | undefined, act: () => void): void {
  if (!modifiers) return act();
  const restore = holdOnly(modifiers);
  try {
    act();
  } finally {
    restore();
  }
}

/** The options of `findElement()`, as Vitest's `SelectorOptions`. */
export interface FindOptions {
  /** How long to wait, in milliseconds. Default: until just before the test times out. */
  timeout?: number;
  /** Whether more than one element is an error. Default: true. */
  strict?: boolean;
}

/** What `serialize()` gives, as Vitest's `SerializedLocator`. */
export interface SerializedLocator {
  selector: string;
  locator: string;
}

type Step =
  | { kind: "part"; part: Part }
  | { kind: "nth"; index: number }
  | { kind: "has-text" | "has-not-text"; text: string | RegExp }
  | { kind: "has" | "has-not" | "and" | "or"; other: DomLocator }
  | { kind: "element"; element: Element };

const filterOptions = new Set(["hasText", "hasNotText", "has", "hasNot"]);
// `expect.element()` passes its own options on to `findElement()`.
const findOptions = new Set(["timeout", "strict", "interval", "message"]);

/** Vitest's CSS path of an element, which its `elementLocator()` sends to the provider. */
function cssPathOf(element: Element): string {
  const parts: string[] = [];
  // The parent, or the host of a shadow root, as Vitest's.
  const parentOf = (node: Node) =>
    node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
  for (let node = element, parent = parentOf(node); parent; ) {
    const tag = node.localName;
    if (node.id) parts.push(`#${CSS.escape(node.id)}`);
    else if (!node.nextElementSibling && !node.previousElementSibling) parts.push(tag);
    else {
      const siblings = [...(parent as ParentNode).children];
      const sameTag = siblings.filter((sibling) => sibling.localName === tag).length;
      parts.push(sameTag > 1 ? `${tag}:nth-child(${siblings.indexOf(node) + 1})` : tag);
    }
    if (!(parent instanceof Element)) break;
    node = parent;
    parent = parentOf(node);
  }
  return parts.reverse().join(" > ");
}

const asRegexOrQuote = (text: string | RegExp) =>
  text instanceof RegExp ? regexToSourceString(text) : quote(text);

function ownLocator(other: unknown, method: string): DomLocator {
  if (other instanceof DomLocator) return other;
  throw new UnsupportedError(
    `${method} takes a locator of dom-locators, not of vitest/browser: they look at the page differently. ${escapeHatch}.`,
  );
}

/**
 * Vitest's `Locator`, answered in the page: queries, waits and actions run in
 * the document itself, with Vitest's semantics. Assignable to `Locator` of
 * `vitest/browser`, so `expect.element(locator)` takes it.
 */
export class DomLocator {
  /** The selector Vitest writes for this locator: `internal:role=button[name="Save"i]`. */
  readonly selector: string;
  readonly #parent: DomLocator | null;
  readonly #step: Step;
  #printed: string | undefined;

  /** @internal */
  constructor(parent: DomLocator | null, step: Step) {
    Object.defineProperty(this, locatorSymbol, { value: locatorSymbol });
    this.#parent = parent;
    this.#step = step;
    const own = DomLocator.#selectorOf(step);
    this.selector = parent ? `${parent.selector} >> ${own}` : own;
  }

  static #selectorOf(step: Step): string {
    switch (step.kind) {
      case "part":
        return step.part.selector;
      case "nth":
        return `nth=${step.index}`;
      case "has-text":
      case "has-not-text":
        return `internal:${step.kind}=${escapeForTextSelector(step.text, false)}`;
      case "has":
      case "has-not":
      case "and":
      case "or":
        return `internal:${step.kind}=${JSON.stringify(step.other.selector)}`;
      case "element":
        return cssPathOf(step.element);
    }
  }

  #locator(step: Step): DomLocator {
    return new DomLocator(this, step);
  }

  // The elements under `root`, in Playwright's order: a part's elements for
  // each element of the parent, in turn.
  #resolve(root: Element, cache: TextCache): Element[] {
    const roots = this.#parent ? this.#parent.#resolve(root, cache) : [root];
    const step = this.#step;
    switch (step.kind) {
      case "part": {
        if (roots.length === 1) return step.part.query(roots[0]!, cache);
        const found = new Set<Element>();
        for (const parent of roots)
          for (const element of step.part.query(parent, cache)) found.add(element);
        return [...found];
      }
      case "nth": {
        const index = step.index === -1 ? roots.length - 1 : step.index;
        return roots.slice(index, index + 1);
      }
      case "has-text":
      case "has-not-text": {
        const has = step.kind === "has-text";
        return roots.filter(
          (element) =>
            createTextMatcher(step.text, false).matcher(elementText(cache, element)) === has,
        );
      }
      case "has":
      case "has-not": {
        const has = step.kind === "has";
        return roots.filter((element) => step.other.#resolve(element, cache).length > 0 === has);
      }
      case "and": {
        const others = new Set(step.other.#resolve(root, cache));
        return roots.filter((element) => others.has(element));
      }
      case "or":
        return sortInDOMOrder(new Set([...roots, ...step.other.#resolve(root, cache)]));
      case "element":
        return step.element !== root && isInsideScope(root, step.element) ? [step.element] : [];
    }
  }

  /** Every element of the locator now, in the order Vitest gives them: none is no error. */
  elements(): (HTMLElement | SVGElement)[] {
    beginAriaCaches();
    try {
      return this.#resolve(document.documentElement, new Map()) as (HTMLElement | SVGElement)[];
    } finally {
      endAriaCaches();
    }
  }

  /** The element, or `null` for none: more than one is a strict mode violation. */
  query(): HTMLElement | SVGElement | null {
    const elements = this.elements();
    if (elements.length > 1) throw strictModeViolation(this.asLocator(), elements);
    return elements[0] ?? null;
  }

  /** The element: none or more than one is an error. */
  element(): HTMLElement | SVGElement {
    const element = this.query();
    if (!element) throw elementNotFound(this.asLocator(), this.#container());
    return element;
  }

  /**
   * The element once the document has it: at once if it has it, else on the
   * first look after a change of the DOM that brings it. Rejects for more
   * than one, with `strict`, and after `timeout`.
   */
  findElement(options: FindOptions = {}): Promise<HTMLElement | SVGElement> {
    for (const key of Object.keys(options)) {
      if (!findOptions.has(key)) {
        throw new TypeError(`findElement() has no option "${key}": it takes timeout and strict.`);
      }
    }
    const strict = options.strict ?? true;
    return waitUntil(
      () => {
        const elements = this.elements();
        if (elements.length === 0) return undefined;
        if (elements.length > 1 && strict) throw strictModeViolation(this.asLocator(), elements);
        return { value: elements[0]! };
      },
      options.timeout ?? defaultTimeout(),
      () => elementNotFound(this.asLocator(), this.#container()),
    );
  }

  /** How many elements the locator has now. */
  get length(): number {
    return this.elements().length;
  }

  /** A locator of each element now. */
  all(): DomLocator[] {
    return this.elements().map((element) => elementLocator(element));
  }

  nth(index: number): DomLocator {
    return this.#locator({ kind: "nth", index });
  }
  first(): DomLocator {
    return this.nth(0);
  }
  last(): DomLocator {
    return this.nth(-1);
  }

  /** The elements that are this locator's and `locator`'s. */
  and(locator: DomLocator): DomLocator {
    return this.#locator({ kind: "and", other: ownLocator(locator, "and()") });
  }
  /** The elements of this locator and of `locator`, in the order of the document. */
  or(locator: DomLocator): DomLocator {
    return this.#locator({ kind: "or", other: ownLocator(locator, "or()") });
  }

  /** The elements with a text, without one, with an element of a locator, or without one. */
  filter(options: FilterOptions): DomLocator {
    for (const key of Object.keys(options ?? {})) {
      if (!filterOptions.has(key)) {
        throw new TypeError(
          `filter() has no option "${key}": it takes ${[...filterOptions].join(", ")}.`,
        );
      }
    }
    const steps: Step[] = [];
    // As Vitest: an empty text is no filter.
    if (options?.hasText) steps.push({ kind: "has-text", text: options.hasText });
    if (options?.hasNotText) steps.push({ kind: "has-not-text", text: options.hasNotText });
    if (options?.has)
      steps.push({ kind: "has", other: ownLocator(options.has, "filter({ has })") });
    if (options?.hasNot) {
      steps.push({ kind: "has-not", other: ownLocator(options.hasNot, "filter({ hasNot })") });
    }
    if (steps.length === 0) {
      throw new Error(`Locator.filter expects at least one filter. None provided.`);
    }
    return steps.reduce<DomLocator>((locator, step) => locator.#locator(step), this);
  }

  getByRole(role: string, options?: ByRoleOptions): DomLocator {
    return this.#locator({ kind: "part", part: byRole(role, options, exactByDefault()) });
  }
  getByText(text: string | RegExp, options?: TextOptions): DomLocator {
    return this.#locator({ kind: "part", part: byText(text, options, exactByDefault()) });
  }
  getByLabelText(text: string | RegExp, options?: TextOptions): DomLocator {
    return this.#locator({ kind: "part", part: byLabelText(text, options, exactByDefault()) });
  }
  getByPlaceholder(text: string | RegExp, options?: TextOptions): DomLocator {
    return this.#locator({ kind: "part", part: byPlaceholder(text, options, exactByDefault()) });
  }
  getByAltText(text: string | RegExp, options?: TextOptions): DomLocator {
    return this.#locator({ kind: "part", part: byAltText(text, options, exactByDefault()) });
  }
  getByTitle(text: string | RegExp, options?: TextOptions): DomLocator {
    return this.#locator({ kind: "part", part: byTitle(text, options, exactByDefault()) });
  }
  getByTestId(testId: string | RegExp): DomLocator {
    return this.#locator({ kind: "part", part: byTestId(testIdAttribute(), testId) });
  }

  /** The locator as Vitest prints it in its errors: `getByRole('button', { name: 'Save' })`. */
  asLocator(): string {
    return (this.#printed ??= this.#print());
  }

  #print(): string {
    const step = this.#step;
    let own: string;
    switch (step.kind) {
      case "part":
        own = step.part.locator;
        break;
      case "nth":
        own = step.index === 0 ? "first()" : step.index === -1 ? "last()" : `nth(${step.index})`;
        break;
      case "has-text":
        own = `filter({ hasText: ${asRegexOrQuote(step.text)} })`;
        break;
      case "has-not-text":
        own = `filter({ hasNotText: ${asRegexOrQuote(step.text)} })`;
        break;
      case "has":
        own = `filter({ has: ${step.other.asLocator()} })`;
        break;
      case "has-not":
        own = `filter({ hasNot: ${step.other.asLocator()} })`;
        break;
      case "and":
      case "or":
        own = `${step.kind}(${step.other.asLocator()})`;
        break;
      case "element":
        own = `locator(${quote(this.selector)})`;
        break;
    }
    return this.#parent ? `${this.#parent.asLocator()}.${own}` : own;
  }

  toString(): string {
    return this.selector;
  }
  serialize(): SerializedLocator {
    return { selector: this.selector, locator: this.asLocator() };
  }
  toJSON(): SerializedLocator {
    return this.serialize();
  }

  // The element whose DOM "cannot find" shows: of `elementLocator()`, else the body.
  #container(): Element {
    const root = this.#root();
    return root.#step.kind === "element" ? root.#step.element : document.body;
  }

  #root(): DomLocator {
    return this.#parent ? this.#parent.#root() : this;
  }

  #target(): Target {
    return {
      elements: () => this.elements(),
      asLocator: () => this.asLocator(),
      container: () => this.#container(),
    };
  }

  /**
   * Clicks the element once it is visible and enabled, as Playwright's
   * `click()`: with `button`, `clickCount`, `modifiers`, `position`,
   * `force` and `trial`.
   */
  click(options: ClickOptions = {}): Promise<void> {
    return this.#click("click()", clickKeys, options, options.clickCount ?? 1);
  }

  /** Double-clicks the element once it is visible and enabled. */
  dblClick(options: DoubleClickOptions = {}): Promise<void> {
    return this.#click("dblClick()", doubleClickKeys, options, 2);
  }

  /** Triple-clicks the element once it is visible and enabled, as Vitest's: a click of three. */
  tripleClick(options: DoubleClickOptions = {}): Promise<void> {
    return this.#click("tripleClick()", doubleClickKeys, options, 3);
  }

  async #click(
    action: string,
    keys: readonly string[],
    options: ClickOptions,
    clickCount: number,
  ): Promise<void> {
    checkActionOptions(action, options, keys);
    checkMouseOptions(action, options);
    const element = await actionable(this.#target(), action, ["visible", "enabled"], options);
    if (options.trial) return;
    const { button, position } = options;
    withModifiers(options.modifiers, () => click(element, { button, clickCount, position }));
  }

  /** Moves the mouse onto the element once it is visible. */
  async hover(options: HoverOptions = {}): Promise<void> {
    checkActionOptions("hover()", options, hoverKeys);
    checkMouseOptions("hover()", options);
    const element = await actionable(this.#target(), "hover()", ["visible"], options);
    if (options.trial) return;
    withModifiers(options.modifiers, () => hover(element, options.position));
  }

  /** Moves the mouse onto the body, as Vitest's `unhover()`. */
  async unhover(options: HoverOptions = {}): Promise<void> {
    checkActionOptions("unhover()", options, hoverKeys);
    checkMouseOptions("unhover()", options);
    await actionable(this.#target(), "unhover()", [], options);
    if (options.trial) return;
    withModifiers(options.modifiers, () => hover(document.body, options.position));
  }

  /** Replaces the text of an input or a textarea once it is visible, enabled and editable. */
  async fill(text: string, options?: FillOptions): Promise<void> {
    checkActionOptions("fill()", options, fillKeys);
    const checks = ["visible", "enabled", "editable"] as const;
    fill(await actionable(this.#target(), "fill()", [...checks], options, followLabel), text);
  }

  /** Empties an input or a textarea: `fill("")`. */
  async clear(options?: FillOptions): Promise<void> {
    checkActionOptions("clear()", options, fillKeys);
    const checks = ["visible", "enabled", "editable"] as const;
    fill(await actionable(this.#target(), "clear()", [...checks], options, followLabel), "");
  }

  /**
   * Sets the files of a file input, or of the one a label is of, as
   * Vitest's `upload()` of `File`s, without the checks of its state: a file
   * input is often hidden. A path throws: the page cannot read a file.
   */
  async upload(files: File | File[] | string | string[], options?: UploadOptions): Promise<void> {
    checkActionOptions("upload()", options, ["timeout", "noWaitAfter"]);
    const list = Array.isArray(files) ? files : [files];
    if (list.some((file) => typeof file === "string")) {
      throw new UnsupportedError(
        `upload() of a path is not in dom-locators, as the page cannot read a file: give it a File, or ${escapeHatch}.`,
      );
    }
    const element = await actionable(this.#target(), "upload()", [], options, followLabel);
    setInputFiles(element, list as File[]);
  }

  /**
   * Turns the wheel of the mouse over the element once it is visible, as
   * Vitest's `wheel()`, then waits a frame, for the `scroll` it causes.
   */
  async wheel(options: WheelOptions): Promise<void> {
    checkActionOptions("wheel()", options, ["delta", "direction", "times"]);
    const delta = options.delta ?? wheelDirections[options.direction!];
    const times = options.times ?? 1;
    if (!delta || (options.delta && options.direction)) {
      throw new TypeError("wheel() takes either a delta or a direction.");
    }
    if (!(Number.isInteger(times) && times >= 0)) {
      throw new TypeError(`wheel() has an invalid times: ${times}.`);
    }
    const element = await actionable(this.#target(), "wheel()", ["visible"], {});
    wheel(element, { x: delta.x ?? 0, y: delta.y ?? 0 }, times);
    if (isRendered(element.ownerDocument)) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  /** Selects the options of a `<select>` by value, label, element or locator, every other one not. */
  async selectOptions(
    values: string | string[] | HTMLElement | HTMLElement[] | DomLocator | DomLocator[],
    options?: FillOptions,
  ): Promise<void> {
    checkActionOptions("selectOptions()", options, fillKeys);
    const list = (Array.isArray(values) ? values : [values]) as (string | Element | DomLocator)[];
    const element = await actionable(
      this.#target(),
      "selectOptions()",
      ["visible", "enabled"],
      options,
      followLabel,
    );
    const select = await waitUntil(
      () => {
        const resolved: SelectValue[] = [];
        for (const value of list) {
          if (!(value instanceof DomLocator)) resolved.push(value);
          else {
            const option = value.query();
            if (!option) return undefined;
            resolved.push(option);
          }
        }
        const apply = selectOptions(element, resolved);
        return apply ? { value: apply } : undefined;
      },
      options?.timeout ?? defaultTimeout(),
      () =>
        new Error(
          `selectOptions() timed out: ${this.asLocator()} has no enabled option of ${list.map(String).join(", ")}.`,
        ),
    );
    select();
  }

  /**
   * Presses a key on the element, which gets the focus first, as
   * Playwright's `locator.press()`: Enter, Escape, Tab, Backspace, Delete,
   * Space, the arrows, Home, End, a modifier or one printable character,
   * after the modifiers held for it, like "Shift+Tab". Not in Vitest's
   * `Locator`, which presses keys with `userEvent.keyboard()`.
   */
  async press(key: Key, options?: PressOptions): Promise<void> {
    checkActionOptions("press()", options, ["timeout", "noWaitAfter"]);
    const element = (await actionable(this.#target(), "press()", [], options)) as HTMLElement;
    focusForPress(element);
    press(element, key);
  }

  /**
   * Types `text` into the element, which gets the focus first, a press of a
   * key for each character, as Playwright's `locator.pressSequentially()`.
   * Not in Vitest's `Locator`, which types with `userEvent.type()`.
   */
  async pressSequentially(text: string, options?: PressOptions): Promise<void> {
    checkActionOptions("pressSequentially()", options, ["timeout", "noWaitAfter"]);
    const element = (await actionable(
      this.#target(),
      "pressSequentially()",
      [],
      options,
    )) as HTMLElement;
    focusForPress(element);
    pressSequentially(element, text);
  }

  /**
   * Drags the element onto `target` once both are visible, as Playwright's
   * `dragTo()`: the mouse presses on it, moves onto the target and lets go
   * there. For what the page drags with the events of the mouse; an
   * element the browser drags itself, `draggable`, throws.
   */
  async dropTo(target: DomLocator, options: DropOptions = {}): Promise<void> {
    checkActionOptions("dropTo()", options, dropKeys);
    if (!(target instanceof DomLocator)) {
      throw new UnsupportedError(
        `dropTo() takes a locator of dom-locators, not ${String(target)}: ${escapeHatch}.`,
      );
    }
    for (const option of ["sourcePosition", "targetPosition"] as const) {
      const position = options[option];
      if (position !== undefined && !(Number.isFinite(position.x) && Number.isFinite(position.y))) {
        throw new TypeError(`dropTo() has an invalid ${option}: ${JSON.stringify(position)}.`);
      }
    }
    const source = await actionable(this.#target(), "dropTo()", ["visible"], options);
    const element = await actionable(target.#target(), "dropTo()", ["visible"], options);
    if (options.trial) return;
    drag(source, element, options);
  }
  screenshot(_options?: unknown): Promise<never> {
    return deferred("screenshot()");
  }
  mark(_name: string, _options?: unknown): Promise<void> {
    return deferred("mark()");
  }
}

/** A locator of one element, as Vitest's `page.elementLocator()`: also the root of `getBy*` in it. */
export function elementLocator(element: Element): DomLocator {
  if (!(element instanceof Element)) {
    throw new TypeError(`elementLocator() takes an element, not ${String(element)}.`);
  }
  return new DomLocator(null, { kind: "element", element });
}

/** A locator of a `getBy*` from the document's root element, as `page.getBy*`. */
export function locatorOf(part: Part): DomLocator {
  return new DomLocator(null, { kind: "part", part });
}
