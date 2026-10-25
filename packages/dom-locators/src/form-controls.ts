// The values of form controls: `fill()`, `clear()`, `selectOptions()` and
// `upload()` as Playwright's, and the edits of text that a key makes, each
// with the events Chrome dispatches for it and with the value set past
// React's tracker.

import { eventView } from "./environment.ts";
import { UnsupportedError, escapeHatch } from "./errors.ts";
import { editing, focus } from "./focus.ts";

export type TextControl = HTMLInputElement | HTMLTextAreaElement;

const valueSetters = new Map<object, (this: Element, value: string) => void>();

/**
 * Sets the value by the setter of the element's prototype, past React's
 * tracker on the element: React sees the value change, as from typing.
 */
function setValue(element: TextControl | HTMLSelectElement, value: string): void {
  const proto = Object.getPrototypeOf(element) as object;
  let setter = valueSetters.get(proto);
  if (!setter) {
    setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
    valueSetters.set(proto, setter);
  }
  setter.call(element, value);
}

// As Playwright's `fill()`: the inputs it types into, and the ones whose
// value it sets.
const typeInto = new Set(["", "email", "number", "password", "search", "tel", "text", "url"]);
const setInto = new Set(["color", "date", "time", "datetime-local", "month", "range", "week"]);

/** Whether the text of an element is edited in place: `isContentEditable`, by the attribute in jsdom, which has not that. */
export function isContentEditable(element: Element): boolean {
  const own = (element as HTMLElement).isContentEditable;
  if (own !== undefined) return own;
  const editable = element.closest("[contenteditable]");
  return !!editable && editable.getAttribute("contenteditable")?.toLowerCase() !== "false";
}

/**
 * Selects `start` to `end` of a text control, unless that is its selection
 * already: a DOM of Node.js fires `select` for any `setSelectionRange()`,
 * where Chrome fires none for a caret.
 */
export function setSelection(
  element: TextControl,
  start: number,
  end: number,
  direction?: "forward" | "backward",
): void {
  if (element.selectionStart === null) return;
  if (
    element.selectionStart === start &&
    element.selectionEnd === end &&
    (direction === undefined || element.selectionDirection === direction)
  ) {
    return;
  }
  element.setSelectionRange(start, end, direction);
}

/** Whether a control takes text, which a key edits. */
export function isTextControl(element: Element): element is TextControl {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement && typeInto.has(element.type))
  );
}

/** A `beforeinput` (`cancelable`) or an `input`, an `Event` in a DOM without `InputEvent`. */
export const inputEvent = (inputType: string, data: string | null, cancelable: boolean) =>
  typeof InputEvent === "function"
    ? new InputEvent(cancelable ? "beforeinput" : "input", {
        bubbles: true,
        composed: true,
        cancelable,
        inputType,
        data,
      })
    : new Event(cancelable ? "beforeinput" : "input", {
        bubbles: true,
        composed: true,
        cancelable,
      });

/**
 * An edit of a text control: the text of `range(value, selectionStart,
 * selectionEnd)` replaced by `data`, with its `inputType`.
 */
export interface Edit {
  inputType: string;
  data: string | null;
  range(value: string, start: number, end: number): [number, number];
}

/** A typed text, over the selection. */
export const insertion = (text: string, inputType = "insertText"): Edit => ({
  inputType,
  data: text,
  range: (_value, start, end) => [start, end],
});

/** The selection, or what `range` takes when there is none. */
const selectionOr =
  (range: (start: number) => [number, number]) =>
  (_value: string, start: number, end: number): [number, number] =>
    start !== end ? [start, end] : range(start);

/** Backspace: the selection, else the character before the caret. */
export const backwardDeletion: Edit = {
  inputType: "deleteContentBackward",
  data: null,
  range: selectionOr((start) => [Math.max(start - 1, 0), start]),
};

/** Delete: the selection, else the character after the caret. */
export const forwardDeletion: Edit = {
  inputType: "deleteContentForward",
  data: null,
  range: selectionOr((start) => [start, start + 1]),
};

/** The value after `edit`, where it starts and what it inserts: `maxlength` cuts that, as typing does. */
function apply(
  element: TextControl,
  edit: Edit,
  selection?: [number, number],
): { value: string; from: number; inserted: string } {
  const before = element.value;
  const [start, end] = selection ?? [
    element.selectionStart ?? before.length,
    element.selectionEnd ?? before.length,
  ];
  const [from, to] = edit.range(before, start, end);
  let inserted = edit.data ?? "";
  if (element.maxLength >= 0) {
    inserted = inserted.slice(0, Math.max(0, element.maxLength - (before.length - (to - from))));
  }
  return { value: before.slice(0, from) + inserted + before.slice(to), from, inserted };
}

// The inputs whose value drops, as it is set, what is no value of their
// type: a part of a number, the white space around an email or a URL.
const sanitized = new Set(["number", "email", "url"]);

/**
 * Whether the control keeps the value of `edit`. An input of a number, an
 * email or a URL drops what is no value of its type as the value is set,
 * where Chrome keeps the text a key types, like "-" of "-1", as the page
 * cannot.
 */
export function keepsEdit(element: TextControl, edit: Edit): boolean {
  if (!(element instanceof HTMLInputElement) || !sanitized.has(element.type)) return true;
  const { value } = apply(element, edit);
  const probe = element.ownerDocument.createElement("input");
  probe.type = element.type;
  probe.value = value;
  return probe.value === value;
}

/**
 * `edit` of a text control: `beforeinput`, which may cancel it, then the
 * new value, the caret after what it inserted, and `input` if the value
 * changed; of a read-only control, `beforeinput` alone, as Chrome's.
 * `selection` is for a control without a selection of its own to read,
 * like an email input.
 */
export function editText(element: TextControl, edit: Edit, selection?: [number, number]): void {
  if (!element.dispatchEvent(inputEvent(edit.inputType, edit.data, true))) return;
  if (element.readOnly) return;
  const before = element.value;
  const { value, from, inserted } = apply(element, edit, selection);
  if (value === before) return;
  editing(element);
  setValue(element, value);
  const caret = from + inserted.length;
  setSelection(element, caret, caret);
  element.dispatchEvent(inputEvent(edit.inputType, edit.data === null ? null : inserted, false));
}

const deleteKey: KeyboardEventInit = { key: "Delete", code: "Delete", keyCode: 46, which: 46 };

/**
 * Playwright's `fill()`: focuses the control, selects its text, and types the
 * new text over it, as one `insertText` (`beforeinput` and `input`, no keys);
 * for "" it presses Delete. Inputs of a date, a time, a color or a range get
 * the value, `input` and `change`. `change` follows on blur for typed text.
 */
export function fill(element: Element, text: string): void {
  if (element instanceof HTMLInputElement && !typeInto.has(element.type)) {
    const type = element.type;
    if (!setInto.has(type)) throw new Error(`Input of type "${type}" cannot be filled`);
    const value = text.trim();
    focus(element);
    setValue(element, value);
    if (element.value !== value) throw new Error("Malformed value");
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (!isTextControl(element)) {
    if (isContentEditable(element)) {
      throw new UnsupportedError(
        `fill() of a contenteditable element is not in dom-locators yet: ${escapeHatch}.`,
      );
    }
    throw new Error("Element is not an <input>, <textarea> or [contenteditable] element");
  }
  if (element instanceof HTMLInputElement && element.type === "number") {
    text = text.trim();
    if (Number.isNaN(Number(text))) throw new Error("Cannot type text into input[type=number]");
  }
  focus(element);
  // Of nothing, a DOM of Node.js fires `select`, and Chrome none.
  if (element.value) element.select();
  // All of the text is selected, where the control may not say so.
  const all: [number, number] = [0, element.value.length];
  if (text) {
    editText(element, insertion(text), all);
    return;
  }
  const view = eventView(element.ownerDocument);
  const init = { ...deleteKey, bubbles: true, cancelable: true, composed: true, view };
  if (element.dispatchEvent(new KeyboardEvent("keydown", init))) {
    editText(element, forwardDeletion, all);
  }
  element.dispatchEvent(new KeyboardEvent("keyup", init));
}

/** An option's `label`, as the HTML standard has it, which happy-dom's leaves at the attribute: the attribute, else the text. */
function labelOf(option: HTMLOptionElement): string {
  return option.getAttribute("label") ?? option.text;
}

/** A value of `selectOptions()`: an option's value or label, or the option. */
export type SelectValue = string | Element;

/**
 * Playwright's `selectOption()`: the options of the values selected, every
 * other one not, then `input` and `change`, without the focus. `undefined`
 * while an option is not there yet, or is disabled.
 */
export function selectOptions(element: Element, values: SelectValue[]): (() => void) | undefined {
  if (!(element instanceof HTMLSelectElement)) throw new Error("Element is not a <select> element");
  const options = [...element.options];
  const selected: HTMLOptionElement[] = [];
  for (const value of values) {
    const option = options.find((option) =>
      typeof value === "string"
        ? option.value === value || labelOf(option) === value
        : option === value,
    );
    if (!option || option.disabled) return undefined;
    selected.push(option);
  }
  if (!element.multiple && selected.length > 1) {
    throw new Error("Error: Non-multiple <select> element cannot have multiple selected options");
  }
  return () => {
    for (const option of options) option.selected = selected.includes(option);
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };
}

/**
 * Playwright's `setInputFiles()` of files of the page: the files of a file
 * input, then `input` and `change`. A DOM without `DataTransfer`, jsdom's,
 * has no way to set them.
 */
export function setInputFiles(element: Element, files: File[]): void {
  if (element.nodeName !== "INPUT") throw new Error("Not an <input> element");
  const input = element as HTMLInputElement;
  if ((input.getAttribute("type") || "").toLowerCase() !== "file") {
    throw new Error("Not an input[type=file] element");
  }
  if (files.length > 1 && !input.multiple) {
    throw new Error("Non-multiple file input can only accept single file");
  }
  if (typeof DataTransfer !== "function") {
    throw new UnsupportedError(
      `upload() in a DOM without DataTransfer is not in dom-locators: ${escapeHatch}.`,
    );
  }
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
