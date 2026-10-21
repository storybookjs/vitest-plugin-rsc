// The timers of a module of the browser layer. Its code reads them as
// globals, which the plugin compiles to read them off the module's
// `import.meta` (nextjs/page-timers.ts), where its module runner puts them
// (utils.ts). A browser drops the timers of a page with the page, so the
// runner of a page gives timers that call nothing once the page is left.
// Every other runner gives the globals. Each calls the global without a
// receiver: the module calls it on the object of its timers, and a browser
// throws for a timer that is called on anything but the window.

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
type Callback = (...args: unknown[]) => void;
type Timer = (callback: unknown, ...args: unknown[]) => number;

export type Timers = Record<TimerName, unknown>;

const globals = globalThis as unknown as Record<TimerName, Timer | undefined>;

/**
 * The globals, each read as the module reads it, as it reads a global: also
 * the fake one of a test, and nothing where the browser has none.
 */
export const globalTimers: Timers = timersOf(
  (timer) =>
    (...args) =>
      timer(...args),
);

/**
 * The timers of a page: those of `globalTimers`, which call nothing once
 * `isLeft()` says the page is left. An interval that would fire then is
 * cleared.
 */
export function pageTimers(isLeft: () => boolean): Timers {
  return timersOf((timer, name) =>
    name === "setInterval" ? droppingInterval(timer, isLeft) : dropping(timer, isLeft),
  );
}

// One for each global, so that a module that compares what it read twice
// gets the same function, as for a global. A write is of the global, as a
// module's write of a global is, like a polyfill's.
function timersOf(wrap: (timer: Timer, name: TimerName) => Timer): Timers {
  const timers = {} as Timers;
  const wrapped = new WeakMap<Timer, Timer>();
  for (const name of timerNames) {
    Object.defineProperty(timers, name, {
      enumerable: true,
      get: () => {
        const timer = globals[name];
        if (!timer) return undefined;
        let ofModule = wrapped.get(timer);
        if (!ofModule) {
          ofModule = wrap(timer, name);
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

// Not a string for a callback, which a browser evaluates: as it is.
const dropping =
  (timer: Timer, isLeft: () => boolean): Timer =>
  (callback, ...args) =>
    timer(
      typeof callback === "function"
        ? (...callbackArgs: unknown[]) => {
            if (!isLeft()) (callback as Callback)(...callbackArgs);
          }
        : callback,
      ...args,
    );

const droppingInterval =
  (timer: Timer, isLeft: () => boolean): Timer =>
  (callback, ...args) => {
    if (typeof callback !== "function") return timer(callback, ...args);
    const id = timer(
      (...callbackArgs: unknown[]) => {
        if (isLeft()) globalThis.clearInterval(id);
        else (callback as Callback)(...callbackArgs);
      },
      ...args,
    );
    return id;
  };
