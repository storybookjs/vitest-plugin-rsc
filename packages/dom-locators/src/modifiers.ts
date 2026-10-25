// The modifier keys that are held down, as Playwright's keyboard holds them
// for an action's `modifiers` and for a press of "Shift+Tab": their `keydown`
// and `keyup`, and the state that every event of the mouse and the keyboard
// carries.

import { eventView } from "./environment.ts";
import { activeElement } from "./focus.ts";

/** A modifier key of Playwright's: `ControlOrMeta` is Meta on macOS, Control elsewhere. */
export type Modifier = "Alt" | "Control" | "ControlOrMeta" | "Meta" | "Shift";
type HeldModifier = Exclude<Modifier, "ControlOrMeta">;

// In Playwright's order, which is the order of their events.
const modifierKeys: Record<HeldModifier, { code: string; keyCode: number }> = {
  Alt: { code: "AltLeft", keyCode: 18 },
  Control: { code: "ControlLeft", keyCode: 17 },
  Meta: { code: "MetaLeft", keyCode: 91 },
  Shift: { code: "ShiftLeft", keyCode: 16 },
};

const held = new Set<HeldModifier>();

/** Whether the keyboard is a Mac's, as Playwright's tells it: its editing keys are others. */
export const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

/** Whether `key` names a modifier. */
export function isModifier(key: string): key is Modifier {
  return key === "ControlOrMeta" || Object.hasOwn(modifierKeys, key);
}

/** The key a modifier names: `ControlOrMeta` is Meta on macOS, Control elsewhere. */
function keyOf(modifier: Modifier): HeldModifier {
  if (modifier === "ControlOrMeta") return isMac ? "Meta" : "Control";
  return modifier;
}

/** The modifier state of an event: its `altKey`, `ctrlKey`, `metaKey` and `shiftKey`. */
export function modifierState(): EventModifierInit {
  return stateOf(held);
}

/** The modifier state with `modifiers` held, and no other. */
export function stateOf(modifiers: Iterable<Modifier>): EventModifierInit {
  const keys = new Set([...modifiers].map(keyOf));
  return {
    altKey: keys.has("Alt"),
    ctrlKey: keys.has("Control"),
    metaKey: keys.has("Meta"),
    shiftKey: keys.has("Shift"),
  };
}

/** Whether `state` is of `modifier` alone. */
export function isStateOf(state: EventModifierInit, modifier: Modifier): boolean {
  const only = stateOf([modifier]);
  return (
    !!state.altKey === only.altKey &&
    !!state.ctrlKey === only.ctrlKey &&
    !!state.metaKey === only.metaKey &&
    !!state.shiftKey === only.shiftKey
  );
}

/** The `keydown` or `keyup` of a modifier, on the element with the focus. */
function dispatchKey(type: "keydown" | "keyup", modifier: HeldModifier): void {
  const target = activeElement() ?? document.body;
  target.dispatchEvent(
    new KeyboardEvent(type, {
      key: modifier,
      code: modifierKeys[modifier].code,
      keyCode: modifierKeys[modifier].keyCode,
      which: modifierKeys[modifier].keyCode,
      location: KeyboardEvent.DOM_KEY_LOCATION_LEFT,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: eventView(target.ownerDocument),
      ...modifierState(),
    }),
  );
}

/** Holds `modifier` down: its `keydown`, which has itself in its state. */
export function holdDown(modifier: Modifier): void {
  const key = keyOf(modifier);
  held.add(key);
  dispatchKey("keydown", key);
}

/** Lets `modifier` go: its `keyup`, which has it no more in its state. */
export function letGo(modifier: Modifier): void {
  const key = keyOf(modifier);
  if (!held.delete(key)) return;
  dispatchKey("keyup", key);
}

/**
 * Holds exactly `modifiers` for an action, as Playwright's
 * `ensureModifiers()`: down what is not held, up what is held and not
 * named. Returns what puts the ones held before back.
 */
export function holdOnly(modifiers: readonly Modifier[]): () => void {
  const before = [...held];
  holdExactly(new Set(modifiers.map(keyOf)));
  return () => holdExactly(new Set(before));
}

function holdExactly(wanted: Set<HeldModifier>): void {
  for (const key of Object.keys(modifierKeys) as HeldModifier[]) {
    if (wanted.has(key) && !held.has(key)) holdDown(key);
    else if (!wanted.has(key) && held.has(key)) letGo(key);
  }
}
