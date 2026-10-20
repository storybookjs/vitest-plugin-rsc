// What React and Next leave behind when they load and start: listeners on
// `window` and `document`, and the message channels of their schedulers. They
// have no way to take them back: a browser drops them with the document. This
// document stays, and each of them keeps the page that added it, with all of
// its modules. So they are recorded while the plugin loads and starts Next's
// client, and only then, to be removed when the page is left. What React DOM
// keeps in properties of the document goes with the page too: see document.ts.

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

/**
 * Records the message channels that are opened, until `stop()`. `remove()`
 * closes each of them once no message is on its way on it.
 */
export function recordMessageChannels(): Leftovers {
  const Native = globalThis.MessageChannel;
  const opened: { close(): void }[] = [];
  let recording = true;
  const Recorded = class MessageChannel extends Native {
    constructor() {
      super();
      if (recording) opened.push(closingOnceQuiet(this));
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
      for (const channel of opened.splice(0)) channel.close();
    },
  };
}

// A port with a message handler lives until it is closed. A channel is closed
// once what was posted on it has been delivered: a scheduler that posts to
// itself to run its queue then runs what it had queued, which finds the page
// gone. Closed at once, the scheduler would keep that queue, and in it the page.
function closingOnceQuiet(channel: MessageChannel): { close(): void } {
  let onItsWay = 0;
  let closing = false;
  const close = () => {
    channel.port1.close();
    channel.port2.close();
  };
  for (const port of [channel.port1, channel.port2]) {
    const post = port.postMessage;
    port.postMessage = function (this: MessagePort, ...args: unknown[]) {
      post.apply(this, args as Parameters<typeof post>);
      onItsWay++;
    };
    port.addEventListener("message", () => {
      onItsWay--;
      if (closing && onItsWay === 0) close();
    });
  }
  return {
    close() {
      closing = true;
      if (onItsWay === 0) close();
    },
  };
}
