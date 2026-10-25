// Where the focus is: moving it as a browser does for a press of the mouse
// and for Tab, and the `change` that an edit owes once its control loses the
// focus.

import { closestCrossShadow } from "./dom-utils.ts";

// What the browser focuses for a press of the mouse on an element in it.
const focusable =
  "input:not([type=hidden]),select,textarea,button,a[href],area[href],iframe,summary,[tabindex],[contenteditable]:not([contenteditable=false]),audio[controls],video[controls]";

// The value of each control when its first edit came: `change` follows on
// `blur` if the value is another, as the browser fires for a user's edit.
const valueAtEdit = new WeakMap<Element, string>();

/** Notes that `element` is edited now, for its `change` on blur. */
export function editing(element: HTMLInputElement | HTMLTextAreaElement): void {
  if (valueAtEdit.has(element)) return;
  valueAtEdit.set(element, element.value);
  element.addEventListener("blur", onBlur, { once: true });
}

function onBlur(event: Event): void {
  commitChange(event.target as Element);
}

/** The `change` of an edited control, before its `blur`, as the browser orders them. */
export function commitChange(element: Element | null): void {
  if (!element || !valueAtEdit.has(element)) return;
  const before = valueAtEdit.get(element);
  valueAtEdit.delete(element);
  element.removeEventListener("blur", onBlur);
  if ((element as HTMLInputElement).value !== before) {
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/** The element with the focus, in a shadow root too, where the document's is its host. */
export function activeElement(): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

/** Focuses `element`, with the `change` of the control the focus leaves first. */
export function focus(element: HTMLElement | SVGElement): void {
  const active = activeElement();
  if (active === element) return;
  commitChange(active);
  element.focus({ preventScroll: true });
}

/** What a press of the mouse on `element` does to the focus: the focusable element it is in, else none. */
export function focusOnPress(element: Element): void {
  const target = (closestCrossShadow(element, focusable) as HTMLElement | undefined) ?? null;
  if (target && !(target as HTMLButtonElement).disabled) {
    focus(target);
    return;
  }
  const active = activeElement() as HTMLElement | null;
  if (active && active !== document.body) {
    commitChange(active);
    active.blur();
  }
}

// What Tab moves the focus to, in the order of the document after the ones
// of a positive `tabindex`.
const tabbable =
  "input:not([type=hidden]),select,textarea,button,a[href],area[href],iframe,summary,[tabindex],[contenteditable]:not([contenteditable=false])";

/** What Tab does to the focus: the next element in the tab order, else none. */
export function focusNext(from: Element, isVisible: (element: Element) => boolean): void {
  const candidates = [...document.querySelectorAll<HTMLElement>(tabbable)].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !(element as HTMLButtonElement).disabled &&
      !element.closest("[inert]") &&
      isVisible(element),
  );
  const positive = candidates
    .filter((element) => element.tabIndex > 0)
    .sort((a, b) => a.tabIndex - b.tabIndex);
  const order = [...positive, ...candidates.filter((element) => element.tabIndex === 0)];
  const index = order.indexOf(from as HTMLElement);
  const next =
    index >= 0
      ? order[index + 1]
      : order.find(
          (element) => from.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
  if (next) {
    focus(next);
    return;
  }
  commitChange(from);
  (from as HTMLElement).blur();
}
