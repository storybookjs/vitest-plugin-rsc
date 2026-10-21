// The timers of a module of the browser layer. Its code uses them as
// globals, which the plugin compiles to the ones on the module's
// `import.meta` (nextjs/page-timers.ts), where its module runner puts them
// (utils.ts). A browser drops the timers of a page with the page, so they
// call nothing once the runner is closed, like a page's that was left. Each
// calls the global without a receiver: the module calls it on the object of
// its timers, and a browser throws for a timer that is called on anything
// but the window.

/** The key of the timers on a module's `import.meta`. */
export const timersKey = "__vitest_plugin_rsc_timers__";

/** The globals that start a timer. */
export const timerNames = [
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "requestIdleCallback",
] as const;

type TimerName = (typeof timerNames)[number];
type Callback = (this: unknown, ...args: unknown[]) => void;
type Timer = (callback: unknown, ...args: unknown[]) => number;

export type Timers = Record<TimerName, unknown>;

const globals = globalThis as unknown as Record<TimerName, Timer | undefined>;

/**
 * The timers of a runner: each the global as the module reads it, as it
 * reads a global, also the fake one of a test, and nothing where the browser
 * has none. They call nothing once `isClosed()`, and an interval that would
 * fire then is cleared.
 */
export function runnerTimers(isClosed: () => boolean): Timers {
  const timers = {} as Timers;
  for (const name of timerNames) {
    // One for each global, so that a module that compares what it read twice
    // gets the same function, as for a global. A write is of the global, as
    // a module's write of a global is, like a polyfill's.
    const wrapped = new WeakMap<Timer, Timer>();
    Object.defineProperty(timers, name, {
      enumerable: true,
      get: () => {
        const timer = globals[name];
        if (!timer) return undefined;
        let ofModule = wrapped.get(timer);
        if (!ofModule) {
          ofModule =
            name === "setInterval" ? droppingInterval(timer, isClosed) : dropping(timer, isClosed);
          wrapped.set(timer, ofModule);
        }
        return ofModule;
      },
      set: (value: Timer | undefined) => {
        globals[name] = value;
      },
    });
  }
  return timers;
}

// A callback of the module, with the receiver that the timer calls it with,
// until the runner is closed.
const ofRunner = (callback: Callback, isClosed: () => boolean): Callback =>
  function (...args) {
    if (!isClosed()) callback.apply(this, args);
  };

// Not a string for a callback, which a browser evaluates: as it is.
const dropping =
  (timer: Timer, isClosed: () => boolean): Timer =>
  (callback, ...args) =>
    timer(
      typeof callback === "function" ? ofRunner(callback as Callback, isClosed) : callback,
      ...args,
    );

// Also cleared once the runner is closed.
const droppingInterval =
  (timer: Timer, isClosed: () => boolean): Timer =>
  (callback, ...args) => {
    if (typeof callback !== "function") return timer(callback, ...args);
    const call = ofRunner(callback as Callback, isClosed);
    const id = timer(
      function (this: unknown, ...callbackArgs: unknown[]) {
        if (isClosed()) globalThis.clearInterval(id);
        call.apply(this, callbackArgs);
      },
      ...args,
    );
    return id;
  };
