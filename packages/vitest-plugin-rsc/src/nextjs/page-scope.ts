// What the code of Next.js, and of the React that it ships, registers with
// the browser while a page is open: timers, animation frames and idle
// callbacks, message ports, performance observers, and listeners on `window`
// and `document`. A browser drops them with the page. Here the document
// stays, and each of them would keep the page, or run its work in the next
// one: the `PerformanceObserver` of `next/image` in development, the timers
// of React DOM's commits, the port of React's scheduler, the listeners of
// Next's router. So the files of `next/dist` reach these through a scope,
// which page-scope-define.ts names in them as Vite pre-bundles them, and
// which every runner of the browser layer passes to the modules it
// evaluates (`evaluatorIn()` in utils.ts). A page's runner passes the
// page's own, which leaving the page closes. Every other runner passes
// `hostScope`, the browser's own. The code of the app, and of its other
// packages, uses the browser's own too: what it leaves is its own, as in
// any test setup.

import {
  global,
  type Cancel,
  type ClearTimer,
  type RequestFrame,
  type RequestIdle,
  type Scope,
  type SetTimer,
} from "../runner-scope.ts";

type Listener = {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject | null;
  capture: boolean;
  remove: () => void;
};

const captureOf = (options: boolean | EventListenerOptions | undefined) =>
  typeof options === "boolean" ? options : !!options?.capture;

// Undefined where the browser has none, as `typeof` would find it.
const ifThere = <Type>(name: string, scoped: Type): Type | undefined =>
  global(name) === undefined ? undefined : scoped;

// Pending ones, by their id, with what cancels each: the function of the
// timers that made it, which may be fake.
type Pending = Map<number, (id: number) => void>;

/**
 * What the files of Next.js register while a page is open, which `close()`
 * takes back, as a browser does with a page it leaves. What they ask for
 * once it is closed, like a timer of an effect's cleanup, it does not make.
 */
export class PageScope implements Scope {
  #closed = false;
  // Timeouts and intervals: as in a browser, either clear function clears
  // either.
  readonly #timers: Pending = new Map();
  readonly #frames: Pending = new Map();
  readonly #idleCallbacks: Pending = new Map();
  readonly #ports = new Set<MessagePort>();
  readonly #observers = new Set<PerformanceObserver>();
  readonly #listeners = new Set<Listener>();
  // The classes of this scope, for the class of the browser they extend.
  #channel: { of: typeof MessageChannel; scoped: typeof MessageChannel } | undefined;
  #observer: { of: typeof PerformanceObserver; scoped: typeof PerformanceObserver } | undefined;

  /** Whether the page has been left. */
  get closed(): boolean {
    return this.#closed;
  }

  // Asks the global `request` for a callback, and keeps it in `pending`
  // until it runs, with the global `cancel` of that moment. `once`: a
  // timeout, a frame or an idle callback, which is done once it has run.
  #request(
    pending: Pending,
    request: string,
    cancel: string,
    callback: unknown,
    rest: unknown[],
    once: boolean,
  ): number {
    if (this.#closed) return 0;
    const cancelOf = global<(id: number) => void>(cancel)!;
    const requestOf = global<(callback: unknown, ...rest: unknown[]) => number>(request)!;
    const id = requestOf(
      once && typeof callback === "function"
        ? (...args: unknown[]) => {
            pending.delete(id);
            (callback as (...args: unknown[]) => void)(...args);
          }
        : callback,
      ...rest,
    );
    pending.set(id, cancelOf);
    return id;
  }

  // One that this scope did not make is the browser's to cancel.
  #cancel(pending: Pending, cancel: string, id: number | undefined): void {
    if (id === undefined) return;
    const cancelOf = pending.get(id) ?? global<(id: number) => void>(cancel)!;
    pending.delete(id);
    cancelOf(id);
  }

  readonly #setTimeout: SetTimer = (handler, timeout, ...args) =>
    this.#request(this.#timers, "setTimeout", "clearTimeout", handler, [timeout, ...args], true);
  readonly #setInterval: SetTimer = (handler, timeout, ...args) =>
    this.#request(this.#timers, "setInterval", "clearInterval", handler, [timeout, ...args], false);
  readonly #clearTimer: ClearTimer = (id) => this.#cancel(this.#timers, "clearTimeout", id);
  readonly #requestAnimationFrame: RequestFrame = (callback) =>
    this.#request(
      this.#frames,
      "requestAnimationFrame",
      "cancelAnimationFrame",
      callback,
      [],
      true,
    );
  readonly #cancelAnimationFrame: Cancel = (id) =>
    this.#cancel(this.#frames, "cancelAnimationFrame", id);
  readonly #requestIdleCallback: RequestIdle = (callback, options) =>
    this.#request(
      this.#idleCallbacks,
      "requestIdleCallback",
      "cancelIdleCallback",
      callback,
      [options],
      true,
    );
  readonly #cancelIdleCallback: Cancel = (id) =>
    this.#cancel(this.#idleCallbacks, "cancelIdleCallback", id);

  get setTimeout(): SetTimer | undefined {
    return ifThere("setTimeout", this.#setTimeout);
  }
  get clearTimeout(): ClearTimer | undefined {
    return ifThere("clearTimeout", this.#clearTimer);
  }
  get setInterval(): SetTimer | undefined {
    return ifThere("setInterval", this.#setInterval);
  }
  get clearInterval(): ClearTimer | undefined {
    return ifThere("clearInterval", this.#clearTimer);
  }
  get requestAnimationFrame(): RequestFrame | undefined {
    return ifThere("requestAnimationFrame", this.#requestAnimationFrame);
  }
  get cancelAnimationFrame(): Cancel | undefined {
    return ifThere("cancelAnimationFrame", this.#cancelAnimationFrame);
  }
  get requestIdleCallback(): RequestIdle | undefined {
    return ifThere("requestIdleCallback", this.#requestIdleCallback);
  }
  get cancelIdleCallback(): Cancel | undefined {
    return ifThere("cancelIdleCallback", this.#cancelIdleCallback);
  }

  // A class of the page's own that extends the browser's of now, as a
  // `MessageChannel` of the page is one of the browser: React's scheduler
  // makes one as it loads, and keeps its port open.
  get MessageChannel(): typeof MessageChannel | undefined {
    const Browser = global<typeof MessageChannel>("MessageChannel");
    if (!Browser) return undefined;
    if (this.#channel?.of !== Browser) {
      const keep = (channel: MessageChannel) => this.#keepPorts(channel);
      const scoped = class MessageChannel extends Browser {
        constructor() {
          super();
          keep(this);
        }
      };
      this.#channel = { of: Browser, scoped };
    }
    return this.#channel.scoped;
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
    if (!Browser) return undefined;
    if (this.#observer?.of !== Browser) {
      const observers = this.#observers;
      const closed = () => this.#closed;
      const scoped = class PerformanceObserver extends Browser {
        override observe(options?: PerformanceObserverInit): void {
          if (closed()) return;
          observers.add(this);
          super.observe(options);
        }
        override disconnect(): void {
          observers.delete(this);
          super.disconnect();
        }
      };
      this.#observer = { of: Browser, scoped };
    }
    return this.#observer.scoped;
  }

  readonly windowAddEventListener: EventTarget["addEventListener"] = (...args) =>
    this.#listen(window, args);
  readonly windowRemoveEventListener: EventTarget["removeEventListener"] = (...args) =>
    this.#unlisten(window, args);
  readonly documentAddEventListener: EventTarget["addEventListener"] = (...args) =>
    this.#listen(document, args);
  readonly documentRemoveEventListener: EventTarget["removeEventListener"] = (...args) =>
    this.#unlisten(document, args);

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
   * Leaves the page: clears its timers, frames and idle callbacks, closes
   * its ports, disconnects its observers and removes its listeners. Every
   * one of them, also after one that throws, which it rethrows.
   */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    const pending = (of: Pending) =>
      Array.from(
        of,
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
    for (const of of [this.#timers, this.#frames, this.#idleCallbacks]) of.clear();
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
