// What the code of Next.js, and of the React that it ships, registers with
// the browser while a page is open: timers, animation frames and idle
// callbacks, message ports, performance observers, and listeners on `window`
// and `document`. A browser drops them with the page. Here the document
// stays, and each of them would keep the page, or run its work in the next
// one: the `PerformanceObserver` of `next/image` in development, the timers
// of React DOM's commits, the port of React's scheduler, the listeners of
// Next's router. So the files of `next/dist` reach these through the
// registrations of their module runner, which nextjs/page-registrations.ts
// names in them as Vite pre-bundles them, and which the runner puts on the
// `import.meta` of every module it evaluates (utils.ts). Closing the runner,
// as leaving a page does, releases every one of them, with the browser's
// own API for it: `clearTimeout()`, `removeEventListener()`, `close()` of a
// port, `disconnect()` of an observer. The code of the app, and of its other
// packages, keeps the browser's own: what it leaves is its own, as in any
// test setup.

/** The key of the registrations on a module's `import.meta`. */
export const registrationsKey = "__vitest_plugin_rsc_registrations__";

/**
 * The globals that the files of Next.js reach through the registrations.
 * `addEventListener()` as a global is the one of `window`.
 */
export const registrationNames = [
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "MessageChannel",
  "PerformanceObserver",
  "addEventListener",
  "removeEventListener",
] as const;

/** `addEventListener()` and `removeEventListener()` of `document`. */
export const documentRegistrationNames = {
  addEventListener: "documentAddEventListener",
  removeEventListener: "documentRemoveEventListener",
} as const;

// A timer, a frame or an idle callback, as a module calls it, and what
// cancels it.
type Request = (callback: unknown, ...args: unknown[]) => number;
type Cancel = (id: number | undefined) => void;
type Callback = (this: unknown, ...args: unknown[]) => void;
// Pending ones, by their id, with what cancels each: the function of the
// moment the module read the request, which may be fake.
type Pending = Map<number, Cancel>;

type Listener = {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject | null;
  capture: boolean;
  remove: () => void;
};

const captureOf = (options: boolean | EventListenerOptions | undefined) =>
  typeof options === "boolean" ? options : !!options?.capture;

const globals = globalThis as Record<string, unknown>;

// A global as it is when the module reads it, as it would read the global
// itself: React DOM and its scheduler keep the `setTimeout` that is there
// as they load, and a test may fake the timers before or after.
const global = <Type>(name: string): Type | undefined => globals[name] as Type | undefined;

// A write is of the global, as a module's write of a global is, like a
// polyfill's.
const writeGlobal = (name: string, value: unknown): void => {
  globals[name] = value;
};

/**
 * What the modules of a runner register with the browser, and `release()`
 * takes back, as a browser does with a page it leaves. What they ask for
 * once it is released, like a timer of an effect's cleanup, it does not make.
 */
export class Registrations {
  #closed = false;
  // Timeouts and intervals: as in a browser, either clear function clears
  // either.
  readonly #timers: Pending = new Map();
  readonly #frames: Pending = new Map();
  readonly #idleCallbacks: Pending = new Map();
  readonly #ports = new Set<MessagePort>();
  readonly #observers = new Set<PerformanceObserver>();
  readonly #listeners = new Set<Listener>();
  // The functions and classes of these registrations, by name, for the
  // globals each stands in for: the same one each time, as the global is, so
  // that a module that compares what it read twice finds them equal.
  readonly #scoped = new Map<string, { of: unknown[]; scoped: unknown }>();

  /** Whether `release()` has run. */
  get closed(): boolean {
    return this.#closed;
  }

  #cached<Type>(name: string, of: unknown[], make: () => Type): Type {
    const kept = this.#scoped.get(name);
    if (kept && kept.of.length === of.length && kept.of.every((one, index) => one === of[index])) {
      return kept.scoped as Type;
    }
    const scoped = make();
    this.#scoped.set(name, { of, scoped });
    return scoped;
  }

  // The global `request` and `cancel` of the moment the module reads it:
  // what it asks for is kept in `pending` until it runs, with what cancels
  // it. `once`: a timeout, a frame or an idle callback, which is done once it
  // has run. Each calls the global without a receiver: the module calls it
  // on this object, and a browser throws for a timer that is called on
  // anything but the window. The callback gets the receiver that the browser
  // calls it with. One that fires after the release, which happens when a
  // test stubs the request and not its cancel, cancels itself.
  #requester(
    pending: Pending,
    request: string,
    cancel: string,
    once: boolean,
  ): Request | undefined {
    const requestOf = global<Request>(request);
    if (requestOf === undefined) return undefined;
    const cancelOf = global<Cancel>(cancel) ?? (() => {});
    return this.#cached(request, [requestOf, cancelOf], () => (callback, ...rest) => {
      if (this.#closed) return 0;
      if (typeof callback !== "function") {
        // A string, which a browser evaluates: as it is.
        const id = requestOf(callback, ...rest);
        pending.set(id, cancelOf);
        return id;
      }
      let id: number | undefined;
      // A stub of a test may run it right away, before it has an id.
      let ran = false;
      const closed = () => this.#closed;
      id = requestOf(
        function (this: unknown, ...args: unknown[]) {
          ran = true;
          if (once && id !== undefined) pending.delete(id);
          if (closed()) {
            if (!once && id !== undefined) cancelOf(id);
            return;
          }
          (callback as Callback).apply(this, args);
        },
        ...rest,
      );
      if (!(once && ran)) pending.set(id, cancelOf);
      return id;
    });
  }

  // One that these registrations did not make is the browser's to cancel.
  #canceller(pending: Pending, cancel: string): Cancel | undefined {
    const cancelOf = global<Cancel>(cancel);
    if (cancelOf === undefined) return undefined;
    return this.#cached(cancel, [cancelOf], () => (id) => {
      if (id === undefined) return;
      const own = pending.get(id);
      pending.delete(id);
      (own ?? cancelOf)(id);
    });
  }

  get setTimeout(): Request | undefined {
    return this.#requester(this.#timers, "setTimeout", "clearTimeout", true);
  }
  set setTimeout(value: Request | undefined) {
    writeGlobal("setTimeout", value);
  }
  get clearTimeout(): Cancel | undefined {
    return this.#canceller(this.#timers, "clearTimeout");
  }
  set clearTimeout(value: Cancel | undefined) {
    writeGlobal("clearTimeout", value);
  }
  get setInterval(): Request | undefined {
    return this.#requester(this.#timers, "setInterval", "clearInterval", false);
  }
  set setInterval(value: Request | undefined) {
    writeGlobal("setInterval", value);
  }
  get clearInterval(): Cancel | undefined {
    return this.#canceller(this.#timers, "clearInterval");
  }
  set clearInterval(value: Cancel | undefined) {
    writeGlobal("clearInterval", value);
  }
  get requestAnimationFrame(): Request | undefined {
    return this.#requester(this.#frames, "requestAnimationFrame", "cancelAnimationFrame", true);
  }
  set requestAnimationFrame(value: Request | undefined) {
    writeGlobal("requestAnimationFrame", value);
  }
  get cancelAnimationFrame(): Cancel | undefined {
    return this.#canceller(this.#frames, "cancelAnimationFrame");
  }
  set cancelAnimationFrame(value: Cancel | undefined) {
    writeGlobal("cancelAnimationFrame", value);
  }
  get requestIdleCallback(): Request | undefined {
    return this.#requester(this.#idleCallbacks, "requestIdleCallback", "cancelIdleCallback", true);
  }
  set requestIdleCallback(value: Request | undefined) {
    writeGlobal("requestIdleCallback", value);
  }
  get cancelIdleCallback(): Cancel | undefined {
    return this.#canceller(this.#idleCallbacks, "cancelIdleCallback");
  }
  set cancelIdleCallback(value: Cancel | undefined) {
    writeGlobal("cancelIdleCallback", value);
  }

  // A class of these registrations that extends the browser's of the moment:
  // a `MessageChannel` of the page is one of the browser. React's scheduler
  // makes one as it loads, and keeps its port open.
  get MessageChannel(): typeof MessageChannel | undefined {
    const Browser = global<typeof MessageChannel>("MessageChannel");
    if (Browser === undefined) return undefined;
    const keep = (channel: MessageChannel) => this.#keepPorts(channel);
    return this.#cached(
      "MessageChannel",
      [Browser],
      () =>
        class MessageChannel extends Browser {
          constructor() {
            super();
            keep(this);
          }
        },
    );
  }
  set MessageChannel(value: typeof MessageChannel | undefined) {
    writeGlobal("MessageChannel", value);
  }

  #keepPorts(channel: MessageChannel): void {
    if (this.#closed) {
      channel.port1.close();
      channel.port2.close();
      return;
    }
    this.#ports.add(channel.port1);
    this.#ports.add(channel.port2);
  }

  // `next/image` observes the largest contentful paint in development, and
  // never stops: the observer would keep the page's React.
  get PerformanceObserver(): typeof PerformanceObserver | undefined {
    const Browser = global<typeof PerformanceObserver>("PerformanceObserver");
    if (Browser === undefined) return undefined;
    const observers = this.#observers;
    const closed = () => this.#closed;
    return this.#cached(
      "PerformanceObserver",
      [Browser],
      () =>
        class PerformanceObserver extends Browser {
          override observe(options?: PerformanceObserverInit): void {
            if (closed()) return;
            observers.add(this);
            super.observe(options);
          }
          override disconnect(): void {
            observers.delete(this);
            super.disconnect();
          }
        },
    );
  }
  set PerformanceObserver(value: typeof PerformanceObserver | undefined) {
    writeGlobal("PerformanceObserver", value);
  }

  // The listeners of `window` and of `document`. A write is of the target's
  // method, as a module's write of `window.addEventListener` is.
  readonly #addEventListener: EventTarget["addEventListener"] = (...args) =>
    this.#listen(window, args);
  readonly #removeEventListener: EventTarget["removeEventListener"] = (...args) =>
    this.#unlisten(window, args);
  readonly #documentAddEventListener: EventTarget["addEventListener"] = (...args) =>
    this.#listen(document, args);
  readonly #documentRemoveEventListener: EventTarget["removeEventListener"] = (...args) =>
    this.#unlisten(document, args);

  get addEventListener(): EventTarget["addEventListener"] {
    return this.#addEventListener;
  }
  set addEventListener(value: EventTarget["addEventListener"]) {
    window.addEventListener = value;
  }
  get removeEventListener(): EventTarget["removeEventListener"] {
    return this.#removeEventListener;
  }
  set removeEventListener(value: EventTarget["removeEventListener"]) {
    window.removeEventListener = value;
  }
  get documentAddEventListener(): EventTarget["addEventListener"] {
    return this.#documentAddEventListener;
  }
  set documentAddEventListener(value: EventTarget["addEventListener"]) {
    document.addEventListener = value;
  }
  get documentRemoveEventListener(): EventTarget["removeEventListener"] {
    return this.#documentRemoveEventListener;
  }
  set documentRemoveEventListener(value: EventTarget["removeEventListener"]) {
    document.removeEventListener = value;
  }

  #listen(target: EventTarget, args: Parameters<EventTarget["addEventListener"]>): void {
    if (this.#closed) return;
    const [type, listener, options] = args;
    // The method that the target has now: on `window` that is Vitest's,
    // which counts the listeners of `error`.
    target.addEventListener(...args);
    this.#listeners.add({
      target,
      type,
      listener,
      capture: captureOf(options),
      remove: () => target.removeEventListener(type, listener, options),
    });
  }

  #unlisten(target: EventTarget, args: Parameters<EventTarget["removeEventListener"]>): void {
    const [type, listener, options] = args;
    const capture = captureOf(options);
    for (const kept of this.#listeners) {
      if (
        kept.target === target &&
        kept.type === type &&
        kept.listener === listener &&
        kept.capture === capture
      ) {
        this.#listeners.delete(kept);
      }
    }
    target.removeEventListener(...args);
  }

  /**
   * Takes back every one of them: clears the timers, frames and idle
   * callbacks, closes the ports, disconnects the observers and removes the
   * listeners. Also after one that throws, which it rethrows. Once.
   */
  release(): void {
    if (this.#closed) return;
    this.#closed = true;
    const pending = (kept: Pending) =>
      Array.from(
        kept,
        ([id, cancel]) =>
          () =>
            cancel(id),
      );
    const releases: (() => void)[] = [
      ...pending(this.#timers),
      ...pending(this.#frames),
      ...pending(this.#idleCallbacks),
      ...Array.from(this.#ports, (port) => () => port.close()),
      ...Array.from(this.#observers, (observer) => () => observer.disconnect()),
      ...Array.from(this.#listeners, ({ remove }) => remove),
    ];
    for (const kept of [this.#timers, this.#frames, this.#idleCallbacks]) kept.clear();
    this.#ports.clear();
    this.#observers.clear();
    this.#listeners.clear();
    let failed: { error: unknown } | undefined;
    for (const release of releases) {
      try {
        release();
      } catch (error) {
        failed ??= { error };
      }
    }
    if (failed) throw failed.error;
  }
}
