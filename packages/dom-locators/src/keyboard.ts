// The keyboard: `press(key)` as Playwright's `locator.press()`, the events of
// a key in Chrome and what the key does, which a script's events do not get
// from the browser: Enter activates and submits, Space activates, Tab moves
// the focus, and the keys of text edit a text control.

import { isVisible } from "./actionability.ts";
import { UnsupportedError, escapeHatch } from "./errors.ts";
import { focus, focusNext } from "./focus.ts";
import { deleteBackward, deleteForward, insertText, isTextControl } from "./form-controls.ts";

/** A key of `press()`: a named key, or one printable character. */
export type Key =
  | "Enter"
  | "Escape"
  | "Tab"
  | "Backspace"
  | "Delete"
  | "Space"
  | " "
  // One printable character, like "a" or "7".
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
};

function definitionOf(key: string): KeyDefinition {
  const named = namedKeys[key];
  if (named) return named;
  if (Array.from(key).length !== 1 || /\p{C}/u.test(key)) {
    throw new UnsupportedError(
      `press("${key}") is not in dom-locators: it presses Enter, Escape, Tab, Backspace, Delete, Space and one printable character. ${escapeHatch}, or userEvent.keyboard().`,
    );
  }
  const charCode = key.codePointAt(0)!;
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
    new PointerEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
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
  element.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      inputType: "insertLineBreak",
      data: null,
    }),
  );
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
 * Presses `key` on `element`, which has the focus: `keydown`, `keypress` for a
 * key of a character and Enter, what the key does, then `keyup` on what has
 * the focus by then. Space clicks a button after `keyup`, as Chrome does.
 */
export function press(element: HTMLElement, key: Key): void {
  const definition = definitionOf(key);
  const init: KeyboardEventInit = {
    key: definition.key,
    code: definition.code,
    keyCode: definition.keyCode,
    which: definition.keyCode,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
  };
  const editable = (element as HTMLElement).isContentEditable && !isTextControl(element);
  if (editable && definition.key !== "Escape" && definition.key !== "Tab") {
    throw new UnsupportedError(
      `press("${key}") in a contenteditable element is not in dom-locators yet: ${escapeHatch}.`,
    );
  }
  let act = element.dispatchEvent(new KeyboardEvent("keydown", init));
  if (act && definition.charCode !== undefined) {
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
    const text = isTextControl(element) && !element.readOnly && !element.disabled;
    switch (definition.key) {
      case "Enter":
        onEnter(element);
        break;
      case "Tab":
        focusNext(element, isVisible);
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
        if (text) insertText(element, "insertText", definition.key);
        else if (definition.key === " ") {
          clickAfterKeyup =
            element instanceof HTMLButtonElement ||
            element.localName === "summary" ||
            (element instanceof HTMLInputElement && clickOnSpace.has(element.type));
        }
    }
  }
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  target.dispatchEvent(new KeyboardEvent("keyup", init));
  if (clickAfterKeyup) keyClick(element);
}

/** Focuses `element` for `press()`, as Playwright does: the caret at the start of a text control the focus comes to. */
export function focusForPress(element: HTMLElement): void {
  if (document.activeElement === element) return;
  focus(element);
  if (isTextControl(element) && element.selectionStart !== null) element.setSelectionRange(0, 0);
}
