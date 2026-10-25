// The keyboard: `press(key)` as Playwright's `locator.press()`, with the
// modifiers held for it, and `pressSequentially(text)` as its keys one by
// one; the events of a key in Chrome and what the key does, which a
// script's events do not get from the browser: Enter activates and submits,
// Space activates, Tab moves the focus, the keys of text edit a text
// control and the arrows, Home and End move its caret.

import { isVisible } from "./actionability.ts";
import { eventView } from "./environment.ts";
import { UnsupportedError, escapeHatch } from "./errors.ts";
import { activeElement, commitChange, focus, focusNext } from "./focus.ts";
import {
  backwardDeletion,
  editText,
  forwardDeletion,
  inputEvent,
  insertion,
  isContentEditable,
  isTextControl,
  keepsEdit,
  setSelection,
  type Edit,
  type TextControl,
} from "./form-controls.ts";
import { holdDown, isModifier, isStateOf, letGo, stateOf, type Modifier } from "./modifiers.ts";
import { pointerEventOf } from "./pointer.ts";

/** A key of `press()`: a named key, or one printable character, after the modifiers held for it, like "Shift+Tab". */
export type Key =
  | "Enter"
  | "Escape"
  | "Tab"
  | "Backspace"
  | "Delete"
  | "Space"
  | " "
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown"
  | "Home"
  | "End"
  | Modifier
  // One printable character, like "a" or "7", or a combination, like "Shift+Tab" or "ControlOrMeta+a".
  | (string & {});

interface KeyDefinition {
  key: string;
  code: string;
  keyCode: number;
  // The `charCode` of its `keypress`, for a key that has one.
  charCode?: number;
}

const namedKeys: Record<string, KeyDefinition> = {
  Enter: { key: "Enter", code: "Enter", keyCode: 13, charCode: 13 },
  Escape: { key: "Escape", code: "Escape", keyCode: 27 },
  Tab: { key: "Tab", code: "Tab", keyCode: 9 },
  Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  Delete: { key: "Delete", code: "Delete", keyCode: 46 },
  Space: { key: " ", code: "Space", keyCode: 32, charCode: 32 },
  " ": { key: " ", code: "Space", keyCode: 32, charCode: 32 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  Home: { key: "Home", code: "Home", keyCode: 36 },
  End: { key: "End", code: "End", keyCode: 35 },
};

const pressable =
  "Enter, Escape, Tab, Backspace, Delete, Space, the arrows, Home, End, a modifier and one printable character, after modifiers";

function definitionOf(key: string, pressed: string): KeyDefinition {
  const named = namedKeys[key];
  if (named) return named;
  if (Array.from(key).length !== 1 || /\p{C}/u.test(key)) {
    throw new UnsupportedError(
      `press("${pressed}") is not in dom-locators: it presses ${pressable}. ${escapeHatch}, or userEvent.keyboard().`,
    );
  }
  const charCode = key.codePointAt(0)!;
  // A letter is itself with Shift held too, as Playwright's keyboard has it.
  if (/^[a-z]$/i.test(key)) {
    return {
      key,
      code: `Key${key.toUpperCase()}`,
      keyCode: key.toUpperCase().charCodeAt(0),
      charCode,
    };
  }
  if (/^[0-9]$/.test(key)) return { key, code: `Digit${key}`, keyCode: charCode, charCode };
  // The code of a key of punctuation depends on the layout of the keyboard.
  return { key, code: "", keyCode: 0, charCode };
}

const clickOnEnter = new Set(["button", "color", "file", "image", "reset", "submit"]);
const clickOnSpace = new Set([
  "button",
  "checkbox",
  "radio",
  "reset",
  "submit",
  "image",
  "file",
  "color",
]);
// The inputs that block implicit submission: a form with one of them and no
// default button submits on Enter.
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

/** A `click` of a key: no pointer, as Chrome's for Enter and Space. */
function keyClick(element: Element): void {
  element.dispatchEvent(
    pointerEventOf("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: eventView(element.ownerDocument),
      pointerId: -1,
      pointerType: "",
    }),
  );
}

// What Enter does to the focused element, after its `keypress`.
function onEnter(element: HTMLElement): void {
  if (
    element instanceof HTMLButtonElement ||
    (element instanceof HTMLAnchorElement && element.hasAttribute("href")) ||
    (element instanceof HTMLInputElement && clickOnEnter.has(element.type))
  ) {
    keyClick(element);
    return;
  }
  if (element instanceof HTMLTextAreaElement) {
    editText(element, insertion("\n", "insertLineBreak"));
    return;
  }
  if (!(element instanceof HTMLInputElement) || !isTextControl(element)) return;
  element.dispatchEvent(inputEvent("insertLineBreak", null, true));
  // Enter commits an edit of a text input, as its blur does.
  commitChange(element);
  const form = element.form;
  if (!form) return;
  // The default button: the form's first submit button, in tree order.
  const submit = [...form.elements].find(
    (control) =>
      (control instanceof HTMLButtonElement && control.type === "submit") ||
      (control instanceof HTMLInputElement &&
        (control.type === "submit" || control.type === "image")),
  );
  if (submit) {
    if (!(submit as HTMLButtonElement).disabled) keyClick(submit);
    return;
  }
  const blocking = [...form.elements].filter(
    (control) => control instanceof HTMLInputElement && submitOnEnter.has(control.type),
  );
  if (blocking.length === 1) form.requestSubmit();
}

/**
 * Playwright's `split()` of a combination: "+" between keys, and a "+" of
 * its own is the key "+", as in "Shift++".
 */
function split(combination: string): string[] {
  const keys: string[] = [];
  let building = "";
  for (const char of combination) {
    if (char === "+" && building) {
      keys.push(building);
      building = "";
    } else {
      building += char;
    }
  }
  keys.push(building);
  return keys;
}

/**
 * Presses `combination` on `element` as Playwright's `locator.press()`: the
 * focus first, then the modifiers before its last key held down, in order,
 * the key pressed, and the modifiers let go, the last first. What the
 * package does not model throws before any event, but for a typed text
 * that the control would not keep, which is told once the focus has put
 * the caret.
 */
export function press(element: HTMLElement, combination: Key): void {
  const keys = split(combination);
  const key = keys.pop()!;
  const modifiers = keys.map((modifier) => {
    if (!isModifier(modifier)) {
      throw new UnsupportedError(
        `press("${combination}") is not in dom-locators: it presses ${pressable}. ${escapeHatch}, or userEvent.keyboard().`,
      );
    }
    return modifier;
  });
  const planned = () =>
    isModifier(key) ? undefined : planOf(element, key, combination, modifiers);
  planned();
  focusForPress(element);
  const plan = planned();
  for (const modifier of modifiers) holdDown(modifier);
  try {
    if (plan) pressKey(element, plan);
    else {
      holdDown(key as Modifier);
      letGo(key as Modifier);
    }
  } finally {
    for (const modifier of modifiers.reverse()) letGo(modifier);
  }
}

/** What a key does to the element it is pressed on, worked out before its events. */
interface KeyPlan {
  definition: KeyDefinition;
  held: EventModifierInit;
  /** Whether Control, Meta or Alt is held: the key is a shortcut. */
  shortcut: boolean;
  /** The text control the key is pressed on, whose caret it moves. */
  control: TextControl | undefined;
  /** The edit of its text the key makes, which a read-only control refuses. */
  edit: Edit | undefined;
}

/**
 * The plan of `key` with `modifiers` held, or what the package does not
 * model, thrown: a key in a `contenteditable` element; the arrows of a
 * select, a radio, a range or a date; ArrowUp and ArrowDown in a text
 * control; a key with Control, Meta or Alt in a text control but
 * ControlOrMeta+a, and with Tab, Enter or Space anywhere; the keys of the
 * clipboard; a typed text that a number, an email or a URL input would not
 * keep.
 */
function planOf(
  element: HTMLElement,
  key: string,
  combination: string,
  modifiers: Modifier[],
): KeyPlan {
  const definition = definitionOf(key, combination);
  const held = stateOf(modifiers);
  const shortcut = !!(held.ctrlKey || held.metaKey || held.altKey);
  const control = isTextControl(element) ? element : undefined;
  const text = control && !control.readOnly && !control.disabled ? control : undefined;
  const unsupported = (why: string) =>
    new UnsupportedError(
      `press("${combination}") ${why} is not in dom-locators yet: ${escapeHatch}, or userEvent.keyboard().`,
    );
  const named = definition.key;
  if (isContentEditable(element) && !control && named !== "Escape" && named !== "Tab") {
    throw unsupported("in a contenteditable element");
  }
  const caretKey = caretKeys.has(named);
  if (caretKey && !control && isSteppedByArrows(element)) {
    throw unsupported(`on a ${element.localName}`);
  }
  if (control && /^Arrow(Up|Down)$/.test(named)) throw unsupported("in a text control");
  const selectAll = definition.code === "KeyA" && isStateOf(held, "ControlOrMeta");
  if (shortcut) {
    if (control && !selectAll && named !== "Escape") throw unsupported("in a text control");
    if (named === "Tab" || named === "Enter" || named === " ") throw unsupported("as a shortcut");
    if (/^Key[CVX]$/.test(definition.code)) throw unsupported("of the clipboard");
  }
  let edit: Edit | undefined;
  if (control && !control.disabled && !shortcut) {
    if (named === "Backspace") edit = backwardDeletion;
    else if (named === "Delete") edit = forwardDeletion;
    else if (definition.charCode !== undefined && named !== "Enter") edit = insertion(named);
    if (edit && text && !keepsEdit(text, edit)) {
      throw unsupported(`in an input of type ${text.type}, which would not keep it as typed,`);
    }
  }
  return { definition, held, shortcut, control, edit };
}

/**
 * Presses a key by its plan: `keydown`, `keypress` for a key of a
 * character and Enter, what the key does, then `keyup` on what has the
 * focus by then. Space clicks a button after `keyup`, as Chrome does. A
 * shortcut types nothing: ControlOrMeta+a selects the text of a text
 * control, and another is the page's own handlers' alone.
 */
function pressKey(
  element: HTMLElement,
  { definition, held, shortcut, control, edit }: KeyPlan,
): void {
  const init: KeyboardEventInit = {
    key: definition.key,
    code: definition.code,
    keyCode: definition.keyCode,
    which: definition.keyCode,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: eventView(element.ownerDocument),
    ...held,
  };
  let act = element.dispatchEvent(new KeyboardEvent("keydown", init));
  // A link acts on Enter's `keydown`, and then has no `keypress`, as Chrome.
  const link = element instanceof HTMLAnchorElement && element.hasAttribute("href");
  if (act && link && definition.key === "Enter") {
    keyClick(element);
    act = false;
  }
  if (act && definition.charCode !== undefined && !shortcut) {
    act = element.dispatchEvent(
      new KeyboardEvent("keypress", {
        ...init,
        keyCode: definition.charCode,
        which: definition.charCode,
        charCode: definition.charCode,
      }),
    );
  }
  let clickAfterKeyup = false;
  if (act) {
    if (edit && control) editText(control, edit);
    else if (definition.key === "Enter") onEnter(element);
    else if (definition.key === "Tab") focusNext(element, isVisible, !!held.shiftKey);
    else if (caretKeys.has(definition.key)) {
      if (control) moveCaret(control, definition.key, !!held.shiftKey);
    } else if (shortcut) {
      // Select all, of a text control, read-only too.
      if (definition.code === "KeyA" && control) control.select();
    } else if (definition.key === " ") {
      clickAfterKeyup =
        element instanceof HTMLButtonElement ||
        element.localName === "summary" ||
        (element instanceof HTMLInputElement && clickOnSpace.has(element.type));
    }
  }
  const target = (activeElement() as HTMLElement | null) ?? document.body;
  target.dispatchEvent(new KeyboardEvent("keyup", init));
  if (clickAfterKeyup) keyClick(element);
}

const caretKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

// The inputs whose value the arrows change.
const steppedByArrows = new Set([
  "radio",
  "range",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
]);

/** Whether the arrows change the value of `element`, a radio's or a select's, which the package does not model. */
function isSteppedByArrows(element: Element): boolean {
  return (
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLInputElement && steppedByArrows.has(element.type))
  );
}

/**
 * The caret of a text control after an arrow, Home or End: by a character
 * as it is seen, a letter with its accents or an emoji, or to the start or
 * the end of the line, by its line breaks, collapsing the selection, or
 * moving its end that moves for Shift. A control without a selection, like
 * an email input, keeps its caret to itself.
 */
function moveCaret(
  element: HTMLInputElement | HTMLTextAreaElement,
  key: string,
  extend: boolean,
): void {
  const start = element.selectionStart;
  const end = element.selectionEnd;
  if (start === null || end === null) return;
  const value = element.value;
  const backward = element.selectionDirection === "backward";
  const focus = backward ? start : end;
  const anchor = backward ? end : start;
  let to: number;
  switch (key) {
    case "ArrowLeft":
      to = !extend && start !== end ? start : characterBoundary(value, focus, -1);
      break;
    case "ArrowRight":
      to = !extend && start !== end ? end : characterBoundary(value, focus, 1);
      break;
    case "Home":
      to =
        element instanceof HTMLTextAreaElement && focus > 0
          ? value.lastIndexOf("\n", focus - 1) + 1
          : 0;
      break;
    default: {
      const lineEnd = value.indexOf("\n", focus);
      to = element instanceof HTMLTextAreaElement && lineEnd >= 0 ? lineEnd : value.length;
    }
  }
  if (!extend) setSelection(element, to, to);
  else
    setSelection(
      element,
      Math.min(anchor, to),
      Math.max(anchor, to),
      to < anchor ? "backward" : "forward",
    );
}

const graphemes =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : undefined;

/** The boundary of the character as it is seen before (`-1`) or after (`1`) `index` in `value`. */
function characterBoundary(value: string, index: number, direction: -1 | 1): number {
  if (direction < 0 ? index <= 0 : index >= value.length) return index;
  if (!graphemes) return index + direction;
  let boundary = direction < 0 ? 0 : value.length;
  for (const { index: at } of graphemes.segment(value)) {
    if (direction < 0 ? at < index : at > index) {
      if (direction < 0) boundary = at;
      else return at;
    }
  }
  return boundary;
}

/**
 * Playwright's `pressSequentially(text)`: a press of each character's key,
 * Enter for a line break, and for a character the keyboard has no key for,
 * like "é", its text alone, as `keyboard.insertText()`: into a text control,
 * nowhere else, and a `contenteditable` element throws.
 */
export function pressSequentially(element: HTMLElement, text: string): void {
  focusForPress(element);
  for (const char of text) {
    const target = (activeElement() as HTMLElement | null) ?? element;
    if (char === "\n" || char === "\r") press(target, "Enter");
    else if (/^[\x20-\x7e]$/.test(char)) press(target, char);
    else if (isTextControl(target)) {
      const edit = insertion(char);
      if (target.disabled) continue;
      if (!target.readOnly && !keepsEdit(target, edit)) {
        throw new UnsupportedError(
          `pressSequentially() of "${char}" in an input of type ${target.type}, which would not keep it as typed, is not in dom-locators yet: ${escapeHatch}.`,
        );
      }
      editText(target, edit);
    } else if (isContentEditable(target)) {
      throw new UnsupportedError(
        `pressSequentially() in a contenteditable element is not in dom-locators yet: ${escapeHatch}.`,
      );
    }
  }
}

/** Focuses `element` for `press()`, as Playwright does: the caret at the start of an input the focus comes to. */
function focusForPress(element: HTMLElement): void {
  if (activeElement() === element) return;
  focus(element);
  if (element instanceof HTMLInputElement && isTextControl(element)) setSelection(element, 0, 0);
}
