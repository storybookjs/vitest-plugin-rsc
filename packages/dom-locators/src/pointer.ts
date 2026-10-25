// The mouse: where it is, which button it holds, and the events of its
// moves, presses and wheel, as Chrome dispatches them for Playwright's
// `click()`, `dblclick()`, `hover()`, `dragAndDrop()` and `mouse.wheel()`,
// at the middle of the element or at a position in it, on what is there.

import { isInsideScope, parentElementOrShadowHost } from "./dom-utils.ts";
import { eventView, isRendered } from "./environment.ts";
import { UnsupportedError, escapeHatch, previewNode } from "./errors.ts";
import { focusOnPress } from "./focus.ts";
import { modifierState } from "./modifiers.ts";

/** A button of the mouse. */
export type MouseButton = "left" | "middle" | "right";

/** A point in an element, from the top left corner of its padding box, as Playwright's `position`. */
export interface Position {
  x: number;
  y: number;
}

// A button's `button`, and its bit of `buttons`.
const buttons: Record<MouseButton, [button: number, bit: number]> = {
  left: [0, 1],
  middle: [1, 4],
  right: [2, 2],
};

// The element the mouse is on, and the ones it is in, for the events of its
// next move: what it leaves and what it enters.
let pointerPath: (Element | Document)[] = [];

// The button held down: what it was pressed on, for the target of its
// click, and whether the mouse's own events follow the pointer's, which a
// cancelled `pointerdown` cancels.
let held: { button: MouseButton; target: Element; mouseEvents: boolean } | undefined;

// The window's view of a point and what is at it.
interface Point {
  x: number;
  y: number;
  target: Element;
}

/**
 * Where the mouse goes for `element`: the middle of its box, or `position`
 * in it, scrolled into view if it is out of it, and what is on top
 * there if that is the element or in it, as Playwright's click lands on a
 * `<span>` in a button. Anything else on top, an overlay, gets no events:
 * the element does, where Playwright waits for the overlay to go. In a DOM
 * that does not render, there is no box: the element itself, at 0, 0.
 */
function pointFor(element: Element, position?: Position): Point {
  if (!isRendered(element.ownerDocument)) return { x: 0, y: 0, target: element };
  const rect = scrollIntoView(element);
  const x = position ? rect.left + element.clientLeft + position.x : rect.left + rect.width / 2;
  const y = position ? rect.top + element.clientTop + position.y : rect.top + rect.height / 2;
  // An element with no element in it is what the hit test would give, or
  // what is on top of it, which gets no events: the element itself.
  if (!element.firstElementChild && !element.shadowRoot) return { x, y, target: element };
  let hit = element.ownerDocument.elementFromPoint?.(x, y);
  // The document gives the host for what is in a shadow root: its own element.
  while (hit?.shadowRoot) {
    const inner = hit.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === hit) break;
    hit = inner;
  }
  return { x, y, target: hit && isInsideScope(element, hit) ? hit : element };
}

/**
 * Scrolls `element` into view, as Playwright before an action: in the
 * window and in every box that scrolls it, to the middle, if it is not
 * there yet. Chrome's own `scrollIntoViewIfNeeded()`; where there is none,
 * by the window alone. Returns its box then.
 */
function scrollIntoView(element: Element): DOMRect {
  const ifNeeded = (element as { scrollIntoViewIfNeeded?: (center: boolean) => void })
    .scrollIntoViewIfNeeded;
  if (ifNeeded) {
    ifNeeded.call(element, true);
    return element.getBoundingClientRect();
  }
  const rect = element.getBoundingClientRect();
  const view = element.ownerDocument.defaultView;
  if (
    !view ||
    (rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= view.innerHeight &&
      rect.right <= view.innerWidth)
  ) {
    return rect;
  }
  element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  return element.getBoundingClientRect();
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
  const base = { clientX: x, clientY: y, view, composed: true, ...modifierState() };
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
        ? {
            ...base,
            button: -1,
            buttons: heldButtons(),
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }
        : { ...base, button: 0, buttons: heldButtons() };
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
      buttons: heldButtons(),
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }),
  );
  target.dispatchEvent(new MouseEvent("mousemove", { ...move, button: 0, buttons: heldButtons() }));
}

const heldButtons = () => (held ? buttons[held.button][1] : 0);

/** What every event of a press and a release has: the point, its window, and the modifiers. */
function pressInit({ x, y, target }: Point) {
  return {
    clientX: x,
    clientY: y,
    view: eventView(target.ownerDocument),
    bubbles: true,
    cancelable: true,
    composed: true,
    ...modifierState(),
  };
}

/**
 * A press of `button` at `point`, the `detail`th in a row: `pointerdown`,
 * `mousedown`, the focus, and the `contextmenu` of the right button, as
 * Chrome on Linux and macOS.
 */
function pressAt(point: Point, button: MouseButton, detail: number): void {
  const { target } = point;
  const base = pressInit(point);
  const pointer = { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true };
  const [number, bit] = buttons[button];
  const down = target.dispatchEvent(
    pointerEventOf("pointerdown", { ...pointer, button: number, buttons: bit, pressure: 0.5 }),
  );
  held = { button, target, mouseEvents: down };
  // A `pointerdown` that is cancelled cancels the mouse's own events, not the click.
  if (
    down &&
    target.dispatchEvent(
      new MouseEvent("mousedown", { ...base, button: number, buttons: bit, detail }),
    )
  ) {
    focusOnPress(target);
  }
  if (button === "right") {
    target.dispatchEvent(
      pointerEventOf("contextmenu", { ...pointer, button: number, buttons: bit }),
    );
  }
}

/**
 * The release of the button held at `point`: `pointerup`, `mouseup`, and
 * a `click` of the left button, an `auxclick` of another, on what it was
 * pressed and released on, or on what is around both.
 */
function releaseAt(point: Point, detail: number): void {
  if (!held) return;
  const { button, target: pressedOn, mouseEvents } = held;
  held = undefined;
  const { target } = point;
  const base = pressInit(point);
  const pointer = { ...base, pointerId: 1, pointerType: "mouse", isPrimary: true };
  const [number] = buttons[button];
  target.dispatchEvent(pointerEventOf("pointerup", { ...pointer, button: number, buttons: 0 }));
  if (mouseEvents) {
    target.dispatchEvent(
      new MouseEvent("mouseup", { ...base, button: number, buttons: 0, detail }),
    );
  }
  const clicked = commonAncestor(pressedOn, target);
  if (!clicked) return;
  const click = button === "left" ? "click" : "auxclick";
  clicked.dispatchEvent(pointerEventOf(click, { ...pointer, button: number, buttons: 0, detail }));
}

/** The innermost element that has both in it, through the hosts of shadow roots. */
function commonAncestor(a: Element, b: Element): Element | undefined {
  if (a === b) return a;
  const around = new Set(pathOf(a));
  return pathOf(b).find((node): node is Element => node instanceof Element && around.has(node));
}

/** What a click of Playwright's takes, of what the page models. */
export interface ClickOptions {
  button?: MouseButton;
  clickCount?: number;
  position?: Position;
}

/**
 * Playwright's `click()`: the mouse moves onto the element, presses and
 * releases, `clickCount` times, with a `dblclick` of the left button after
 * the second.
 */
export function click(element: Element, options: ClickOptions = {}): void {
  const { button = "left", clickCount = 1, position } = options;
  const point = pointFor(element, position);
  moveTo(point);
  for (let detail = 1; detail <= clickCount; detail++) {
    pressAt(point, button, detail);
    releaseAt(point, detail);
    if (detail === 2 && button === "left") dblclick(point);
  }
}

function dblclick({ x, y, target }: Point): void {
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
      ...modifierState(),
    }),
  );
}

/** Playwright's `hover()`: the mouse moves onto the element, at `position` in it. */
export function hover(element: Element, position?: Position): void {
  moveTo(pointFor(element, position));
}

/**
 * Vitest's `wheel()`: the mouse moves onto the element, then the wheel
 * turns `times` by `delta`, each a `wheel` on what is under the mouse and,
 * unless it is cancelled, a scroll of what scrolls there, at once, where
 * Chrome's may glide.
 */
export function wheel(element: Element, delta: { x: number; y: number }, times: number): void {
  const point = pointFor(element);
  moveTo(point);
  const { x, y, target } = point;
  for (let turn = 0; turn < times; turn++) {
    const event = new WheelEvent("wheel", {
      clientX: x,
      clientY: y,
      deltaX: delta.x,
      deltaY: delta.y,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      view: eventView(target.ownerDocument),
      bubbles: true,
      cancelable: true,
      composed: true,
      ...modifierState(),
    });
    // A DOM that does not render scrolls nothing.
    if (target.dispatchEvent(event) && isRendered(target.ownerDocument)) {
      scrollerOf(target, delta).scrollBy({ left: delta.x, top: delta.y, behavior: "instant" });
    }
  }
}

/** What a turn of the wheel by `delta` scrolls: the innermost element that can scroll so, else the document. */
function scrollerOf(target: Element, delta: { x: number; y: number }): Element {
  for (let node: Element | undefined = target; node; node = parentElementOrShadowHost(node)) {
    const style = getComputedStyle(node);
    const can = (overflow: string, offset: number, size: number, client: number, by: number) =>
      (overflow === "auto" || overflow === "scroll") &&
      (by > 0 ? offset + client < size : by < 0 && offset > 0);
    if (
      can(style.overflowY, node.scrollTop, node.scrollHeight, node.clientHeight, delta.y) ||
      can(style.overflowX, node.scrollLeft, node.scrollWidth, node.clientWidth, delta.x)
    ) {
      return node;
    }
  }
  return target.ownerDocument.scrollingElement ?? target.ownerDocument.documentElement;
}

/** What a drag of Playwright's takes, of what the page models. */
export interface DragOptions {
  sourcePosition?: Position;
  targetPosition?: Position;
}

/**
 * Playwright's `dragAndDrop()` of an element that the page drags with the
 * events of the mouse: it moves onto `source`, presses the left button,
 * moves onto `target` and lets go there. An element that the browser drags
 * itself, `draggable` as a link or an image is, throws: Chrome's drag and
 * drop of HTML is not in the package.
 */
export function drag(source: Element, target: Element, options: DragOptions = {}): void {
  const from = pointFor(source, options.sourcePosition);
  for (let node: Element | undefined = from.target; node; node = parentElementOrShadowHost(node)) {
    if ((node as HTMLElement).draggable === true) {
      throw new UnsupportedError(
        `dropTo() of an element the browser drags, ${previewNode(node)}, is not in dom-locators yet: ${escapeHatch}.`,
      );
    }
  }
  moveTo(from);
  pressAt(from, "left", 1);
  const to = pointFor(target, options.targetPosition);
  moveTo(to);
  releaseAt(to, 1);
}
