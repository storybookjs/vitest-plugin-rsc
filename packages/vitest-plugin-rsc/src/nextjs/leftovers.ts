// What React and Next leave behind when they load and start: listeners on
// `window` and `document`, and the message channels of their schedulers. They
// have no way to take them back: a browser drops them with the document. This
// document stays, and each of them keeps the page that added it, with all of
// its modules. So they are recorded while the plugin loads and starts Next's
// client, and only then, to be removed when the page is left.

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

/** Records the message channels that are opened, until `stop()`. */
export function recordMessageChannels(): Leftovers {
  const Native = globalThis.MessageChannel;
  const opened: MessageChannel[] = [];
  let recording = true;
  const Recorded = class MessageChannel extends Native {
    constructor() {
      super();
      if (recording) opened.push(this);
    }
  };
  globalThis.MessageChannel = Recorded;
  const stop = () => {
    recording = false;
    if (globalThis.MessageChannel === Recorded) globalThis.MessageChannel = Native;
  };
  return {
    stop,
    remove() {
      stop();
      // A port with a message handler lives until it is closed.
      for (const channel of opened.splice(0)) {
        channel.port1.close();
        channel.port2.close();
      }
    },
  };
}
