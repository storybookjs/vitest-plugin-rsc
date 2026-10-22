// What React adds when it creates a root: listeners on the container and on
// the document, which it never removes, and a browser drops with the
// document. This document stays, and each of them keeps the page that added
// it, with all of its modules. React DOM adds them through a variable, not
// as a global that the registrations of its runner can stand in for
// (../registrations.ts), so client.tsx records them while it creates a root,
// and only then, to be removed when the page is left. What React DOM keeps
// in properties of the document goes with the page too: see document.ts.

export type Leftovers = {
  /** Stops recording. */
  stop(): void;
  /** Stops recording, and removes what was recorded. */
  remove(): void;
};

/** Records the listeners that are added to `target`, until `stop()`. */
export function recordListeners(target: EventTarget): Leftovers {
  // The method the target has now, not the one of `EventTarget`: on `window`
  // that is Vitest's, which counts the error listeners of the test.
  const own = Object.getOwnPropertyDescriptor(target, "addEventListener");
  const add = target.addEventListener;
  const added: Parameters<EventTarget["addEventListener"]>[] = [];
  let recording = true;
  const record: EventTarget["addEventListener"] = function (
    this: EventTarget | undefined,
    ...args
  ) {
    if (recording) added.push(args);
    // `this` is undefined for a call of the global `addEventListener()`.
    add.apply(this ?? target, args);
  };
  target.addEventListener = record;
  const stop = () => {
    recording = false;
    // Someone else may have wrapped the method since. Then it stays, and
    // only passes the calls on.
    if (target.addEventListener !== record) return;
    if (own) Object.defineProperty(target, "addEventListener", own);
    else delete (target as Partial<EventTarget>).addEventListener;
  };
  return {
    stop,
    remove() {
      stop();
      for (const args of added.splice(0)) target.removeEventListener(...args);
    },
  };
}
