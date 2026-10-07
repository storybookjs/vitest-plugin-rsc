import { cache as nextCache } from "next/dist/server/use-cache/use-cache-wrapper";
import { SequentialAsyncLocalStorage } from "../async-local-storage.ts";

// SPIKE (research/use-cache-spike). Not a feature build.
//
// Stands in for `private-next-rsc-cache-wrapper`, which Next's compiler makes
// a `"use cache"` function call: `cache(kind, id, boundArgsLength, fn, args)`.
// The cache is Next's. What this adds is the scope of the function.
//
// Next enters the store of a cache scope and then awaits before it calls the
// function. rsc.ts brings the call back into that scope. From there the
// function has to stay in it, which is what the variants below differ in.

type AnyFunction = (...args: any[]) => any;

export const variant: string =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SPIKE_CTX ?? "stack";

/** The cached function, kept in the scope it is called in. */
function keepScope(fn: AnyFunction): AnyFunction {
  // "none": Next's function as it is. "start": in scope until its first await.
  // "coroutine": compiled to resume in scope itself, see `coroutine()`.
  if (variant !== "stack" && variant !== "settled") return fn;
  // The snapshot is taken at the call, which is in the scope. Running the
  // function through it is what the shim attributes later code to.
  const scoped = (...args: unknown[]) => SequentialAsyncLocalStorage.snapshot()(fn, ...args);
  return Object.defineProperty(scoped, "name", { value: fn.name });
}

export function cache(
  kind: string,
  id: string,
  boundArgsLength: number,
  fn: AnyFunction,
  args: unknown[],
): Promise<unknown> {
  return (nextCache as AnyFunction)(kind, id, boundArgsLength, keepScope(fn), args);
}

/**
 * Runs a cached function that the plugin compiled to a generator, with a
 * `yield` for each of its own `await`s. Every step runs in the scope the
 * function was called in.
 */
export function coroutine(generator: () => Generator<unknown, unknown, unknown>): Promise<unknown> {
  const inScope = SequentialAsyncLocalStorage.snapshot();
  return new Promise((resolve, reject) => {
    const iterator = generator();
    const step = (method: "next" | "throw", value?: unknown): void => {
      let result: IteratorResult<unknown, unknown>;
      try {
        result = inScope(() => iterator[method](value));
      } catch (error) {
        reject(error);
        return;
      }
      if (result.done) resolve(result.value);
      else
        Promise.resolve(result.value).then(
          (resolved) => step("next", resolved),
          (error) => step("throw", error),
        );
    };
    step("next");
  });
}
