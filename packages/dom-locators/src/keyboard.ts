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
  deleteBackward,
  deleteForward,
  inputEvent,
  insertText,
  isContentEditable,
  isTextControl,
} from "./form-controls.ts";
import {
  holdDown,
  isModifier,
  isOnlyHeld,
  letGo,
  modifierState,
  type Modifier,
} from "./modifiers.ts";
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
    insertText(element, "insertLineBreak", "\n");
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
 * Presses `combination` on `element`, which has the focus, as Playwright's
 * `keyboard.press()`: the modifiers before its last key held down, in
 * order, the key pressed, and the modifiers let go, the last first.
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
  for (const modifier of modifiers) holdDown(modifier);
  try {
    if (isModifier(key)) {
      holdDown(key);
      letGo(key);
    } else {
      pressKey(element, key, combination);
    }
  } finally {
    for (const modifier of modifiers.reverse()) letGo(modifier);
  }
}

/**
 * Presses `key` on `element`: `keydown`, `keypress` for a key of a
 * character and Enter, what the key does, then `keyup` on what has the
 * focus by then. Space clicks a button after `keyup`, as Chrome does. With
 * Control, Meta or Alt held, a character types nothing: ControlOrMeta+a
 * selects the text of a text control, and another shortcut in it throws.
 */
function pressKey(element: HTMLElement, key: string, combination: string): void {
  const definition = definitionOf(key, combination);
  const held = modifierState();
  const shortcut = held.ctrlKey || held.metaKey || held.altKey;
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
  const text = isTextControl(element) && !element.readOnly && !element.disabled;
  const editable = isContentEditable(element) && !isTextControl(element);
  const unsupported = (why: string) =>
    new UnsupportedError(
      `press("${combination}") ${why} is not in dom-locators yet: ${escapeHatch}, or userEvent.keyboard().`,
    );
  if (editable && definition.key !== "Escape" && definition.key !== "Tab") {
    throw unsupported("in a contenteditable element");
  }
  const caretKey = caretKeys.has(definition.key);
  if (caretKey && !text && isSteppedByArrows(element))
    throw unsupported(`on a ${element.localName}`);
  if (caretKey && text && /^Arrow(Up|Down)$/.test(definition.key)) {
    throw unsupported("in a text control");
  }
  const selectAll = definition.code === "KeyA" && isOnlyHeld("ControlOrMeta");
  if (shortcut && text && definition.charCode !== undefined && definition.key !== "Enter") {
    if (!selectAll) throw unsupported("in a text control");
  }
  let act = element.dispatchEvent(new KeyboardEvent("keydown", init));
  // A link acts on Enter's `keydown`, and then has no `keypress`, as Chrome.
  const link = element instanceof HTMLAnchorElement && element.hasAttribute("href");
  if (act && link && definition.key === "Enter") {
    keyClick(element);
    act = false;
  }
  // A shortcut has no `keypress`, but for Enter.
  if (act && definition.charCode !== undefined && (!shortcut || definition.key === "Enter")) {
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
    switch (definition.key) {
      case "Enter":
        onEnter(element);
        break;
      case "Tab":
        focusNext(element, isVisible, !!held.shiftKey);
        break;
      case "Escape":
        break;
      case "Backspace":
        if (text) deleteBackward(element);
        break;
      case "Delete":
        if (text) deleteForward(element);
        break;
      default:
        if (caretKey) {
          if (text) moveCaret(element, definition.key, !!held.shiftKey);
        } else if (selectAll) {
          if (text) element.select();
        } else if (shortcut) {
          // A shortcut outside a text control: the page's own handlers alone.
        } else if (text) {
          insertText(element, "insertText", definition.key);
        } else if (definition.key === " ") {
          clickAfterKeyup =
            element instanceof HTMLButtonElement ||
            element.localName === "summary" ||
            (element instanceof HTMLInputElement && clickOnSpace.has(element.type));
        }
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
 * The caret of a text control after an arrow, Home or End: by a character,
 * or to the start or the end of the line, collapsing the selection, or
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
      to = !extend && start !== end ? start : Math.max(focus - 1, 0);
      break;
    case "ArrowRight":
      to = !extend && start !== end ? end : Math.min(focus + 1, value.length);
      break;
    case "Home":
      to = element instanceof HTMLTextAreaElement ? value.lastIndexOf("\n", focus - 1) + 1 : 0;
      break;
    default: {
      const lineEnd = value.indexOf("\n", focus);
      to = element instanceof HTMLTextAreaElement && lineEnd >= 0 ? lineEnd : value.length;
    }
  }
  if (!extend) element.setSelectionRange(to, to);
  else
    element.setSelectionRange(
      Math.min(anchor, to),
      Math.max(anchor, to),
      to < anchor ? "backward" : "forward",
    );
}

/**
 * Playwright's `pressSequentially(text)`: a press of each character's key,
 * Enter for a line break, and for a character the keyboard has no key for,
 * like "é", its text alone in a text control, as `keyboard.insertText()`.
 */
export function pressSequentially(element: HTMLElement, text: string): void {
  for (const char of text) {
    const target = (activeElement() as HTMLElement | null) ?? element;
    if (char === "\n" || char === "\r") press(target, "Enter");
    else if (/^[\x20-\x7e]$/.test(char)) press(target, char);
    else if (isTextControl(target)) insertText(target, "insertText", char);
  }
}

/** Focuses `element` for `press()`, as Playwright does: the caret at the start of a text control the focus comes to. */
export function focusForPress(element: HTMLElement): void {
  if (activeElement() === element) return;
  focus(element);
  if (isTextControl(element) && element.selectionStart !== null) element.setSelectionRange(0, 0);
}
