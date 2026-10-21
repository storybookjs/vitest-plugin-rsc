// `node:timers/promises` for a browser: the timers of ../timers.ts, which the
// build has in this file too, as promises, with a `signal`. unenv's resolve at once, and Next's own e2e
// fixture awaits `setTimeout(50)` to show a loading state.

import {
  clearImmediate,
  clearTimeout,
  setImmediate as immediate,
  setTimeout as timeout,
} from "../timers.ts";

export * from "unenv/node/timers/promises";

type Options = { signal?: AbortSignal };

const aborted = (signal: AbortSignal) =>
  Object.assign(new Error("The operation was aborted"), {
    name: "AbortError",
    code: "ABORT_ERR",
    cause: signal.reason,
  });

const after = <T>(
  start: (done: () => void) => unknown,
  clear: (id: unknown) => void,
  value: T,
  options?: Options,
) =>
  new Promise<T>((resolve, reject) => {
    const signal = options?.signal;
    if (signal?.aborted) return reject(aborted(signal));
    const abort = () => {
      clear(id);
      reject(aborted(signal!));
    };
    const id = start(() => {
      signal?.removeEventListener("abort", abort);
      resolve(value);
    });
    signal?.addEventListener("abort", abort, { once: true });
  });

export const setTimeout = <T = undefined>(delay?: number, value?: T, options?: Options) =>
  after(
    (done) => timeout(done, delay),
    (id) => clearTimeout(id as never),
    value as T,
    options,
  );
export const setImmediate = <T = undefined>(value?: T, options?: Options) =>
  after((done) => immediate(done), clearImmediate, value as T, options);

// Ticks while the consumer works, as Node's does: a tick it has not taken
// yet comes at once.
export async function* setInterval<T = undefined>(
  delay?: number,
  value?: T,
  options?: Options,
): AsyncGenerator<T> {
  const signal = options?.signal;
  if (signal?.aborted) throw aborted(signal);
  let pending = 0;
  let wake: (() => void) | undefined;
  const tick = () => {
    pending++;
    wake?.();
  };
  const id = globalThis.setInterval(tick, delay);
  signal?.addEventListener("abort", tick, { once: true });
  try {
    for (;;) {
      while (pending === 0 && !signal?.aborted) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }
      if (signal?.aborted) throw aborted(signal);
      pending--;
      yield value as T;
    }
  } finally {
    globalThis.clearInterval(id);
    signal?.removeEventListener("abort", tick);
  }
}

export const scheduler = {
  wait: (delay?: number, options?: Options) => setTimeout(delay, undefined, options),
  yield: () => setImmediate(),
};
export default { setTimeout, setImmediate, setInterval, scheduler };
