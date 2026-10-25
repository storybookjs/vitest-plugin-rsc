// The mouse: where it is, and the events of its moves and its presses, as
// Chrome dispatches them for Playwright's `click()`, `dblclick()` and
// `hover()`, at the middle of the element, on what is there.

import { isInsideScope, parentElementOrShadowHost } from "./dom-utils.ts";
import { eventView, isRendered } from "./environment.ts";
import { focusOnPress } from "./focus.ts";

// The element the mouse is on, and the ones it is in, for the events of its
// next move: what it leaves and what it enters.
let pointerPath: (Element | Document)[] = [];

// The window's view of a point and what is at it.
interface Point {
  x: number;
  y: number;
  target: Element;
}

/**
 * Where the mouse goes for `element`: the middle of its box, scrolled into
 * the window if it is out of it, and what is on top there if that is the
 * element or in it, as Playwright's click lands on a `<span>` in a button.
 * Anything else on top, an overlay, gets no events: the element does, where
 * Playwright waits for the overlay to go. In a DOM that does not render,
 * there is no box: the element itself, at 0, 0.
 */
function pointFor(element: Element): Point {
  if (!isRendered(element.ownerDocument)) return { x: 0, y: 0, target: element };
  let rect = element.getBoundingClientRect();
  const view = element.ownerDocument.defaultView;
  if (
    view &&
    (rect.top < 0 ||
      rect.left < 0 ||
      rect.bottom > view.innerHeight ||
      rect.right > view.innerWidth)
  ) {
    element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    rect = element.getBoundingClientRect();
  }
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  let hit = element.ownerDocument.elementFromPoint?.(x, y);
  // The document gives the host for what is in a shadow root: its own element.
  while (hit?.shadowRoot) {
    const inner = hit.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === hit) break;
    hit = inner;
  }
  return { x, y, target: hit && isInsideScope(element, hit) ? hit : element };
}

/** A `PointerEvent`, or a `MouseEvent` in a DOM without one. */
export const pointerEventOf = (type: string, init: PointerEventInit) =>
  typeof PointerEvent === "function" ? new PointerEvent(type, init) : new MouseEvent(type, init);

// The element and what it is in, through the hosts of shadow roots.
function pathOf(element: Element): (Element | Document)[] {
  const path: (Element | Document)[] = [];
  for (let node: Element | undefined = element; node; node = parentElementOrShadowHost(node)) {
    path.push(node);
  }
  path.push(element.ownerDocument);
  return path;
}

/**
 * Moves the mouse onto `point.target`: the `*out` and `*leave` of what it
 * leaves, innermost first, the `*over` and `*enter` of what it enters,
 * outermost first, the pointer's events before the mouse's, then a move.
 */
function moveTo({ x, y, target }: Point): void {
  // What is left of the last path in the document: a removed element gets no events.
  const from = pointerPath.filter((node) => node.isConnected);
  const to = pathOf(target);
  pointerPath = to;
  const view = eventView(target.ownerDocument);
  const base = { clientX: x, clientY: y, view, composed: true };
  if (from[0] !== target) {
    const fromSet = new Set(from);
    const left = from.filter((node) => !to.includes(node));
    const entered = to.filter((node) => !fromSet.has(node)).reverse();
    const last = from[0] instanceof Element ? from[0] : null;
    for (const [isPointer, make] of [
      [true, pointerEventOf],
      [false, (type: string, init: MouseEventInit) => new MouseEvent(type, init)],
    ] as const) {
      const prefix = isPointer ? "pointer" : "mouse";
      const init = isPointer
        ? { ...base, button: -1, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }
        : { ...base, button: 0, buttons: 0 };
      const bubbling = { ...init, bubbles: true, cancelable: true };
      const entering = { ...init, bubbles: false, cancelable: false, composed: false };
      if (last) last.dispatchEvent(make(`${prefix}out`, { ...bubbling, relatedTarget: target }));
      for (const node of left) {
        node.dispatchEvent(make(`${prefix}leave`, { ...entering, relatedTarget: target }));
      }
      target.dispatchEvent(make(`${prefix}over`, { ...bubbling, relatedTarget: last }));
      for (const node of entered) {
        node.dispatchEvent(make(`${prefix}enter`, { ...entering, relatedTarget: last }));
      }
    }
  }
  const move = { ...base, bubbles: true, cancelable: true };
  target.dispatchEvent(
    pointerEventOf("pointermove", {
      ...move,
      button: -1,
      buttons: 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }),
  );
  target.dispatchEvent(new MouseEvent("mousemove", { ...move, button: 0, buttons: 0 }));
}

/** A press and a release of the left button at `point`, the `detail`th in a row. */
function pressAndRelease({ x, y, target }: Point, detail: number): void {
  const view = eventView(target.ownerDocument);
  const base = { clientX: x, clientY: y, view, bubbles: true, cancelable: true, composed: true };
  const pointer = { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true };
  const down = target.dispatchEvent(
    pointerEventOf("pointerdown", { ...pointer, button: 0, buttons: 1, pressure: 0.5 }),
  );
  // A `pointerdown` that is cancelled cancels the mouse's own events, not the click.
  if (
    down &&
    target.dispatchEvent(new MouseEvent("mousedown", { ...base, button: 0, buttons: 1, detail }))
  ) {
    focusOnPress(target);
  }
  target.dispatchEvent(pointerEventOf("pointerup", { ...pointer, button: 0, buttons: 0 }));
  if (down)
    target.dispatchEvent(new MouseEvent("mouseup", { ...base, button: 0, buttons: 0, detail }));
  target.dispatchEvent(pointerEventOf("click", { ...pointer, button: 0, buttons: 0, detail }));
}

/** Playwright's `click()`: the mouse moves onto the element, presses and releases. */
export function click(element: Element): void {
  const point = pointFor(element);
  moveTo(point);
  pressAndRelease(point, 1);
}

/** Playwright's `dblclick()`: two clicks, then `dblclick`. */
export function dblClick(element: Element): void {
  const point = pointFor(element);
  moveTo(point);
  pressAndRelease(point, 1);
  pressAndRelease(point, 2);
  const { x, y, target } = point;
  target.dispatchEvent(
    new MouseEvent("dblclick", {
      clientX: x,
      clientY: y,
      view: eventView(target.ownerDocument),
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      buttons: 0,
      detail: 2,
    }),
  );
}

/** Playwright's `hover()`: the mouse moves onto the element. */
export function hover(element: Element): void {
  moveTo(pointFor(element));
}
