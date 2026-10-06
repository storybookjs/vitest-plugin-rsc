type RunCallback<R, TArgs extends unknown[]> = (...args: TArgs) => R;
type StoreValues = Map<SequentialAsyncLocalStorage<unknown>, unknown>;
type AsyncContextFrame = {
  stores: StoreValues;
  parent: AsyncContextFrame | undefined;
  active: boolean;
  generation: number;
};

// This is a small WinterCG-style AsyncLocalStorage shim for browser tests.
// It intentionally does not patch Promise, timers, events, or React's scheduler.
// Context is preserved while a `run()`/snapshot callback is executing and until
// the promise returned by that callback settles.
//
// The current frame is module-global, so tests that rely on this shim must run
// sequentially within a browser worker. Do not use `test.concurrent` for cases
// that share this async context surface.
//
// The frame chain keeps overlapping returned promises from restoring stale
// context if they settle out of order.
// Cleanup invalidates older async finalizers so a previous test cannot
// restore a stale frame after the stores have been reset.
let resetGeneration = 0;
// See enterAmbientScope().
let ambientStores: StoreValues | undefined;
// Marks a storage that was left with `exit()`, which is not the same as one
// that was never entered: only the latter falls back to the ambient store.
const exited = Symbol("exited");
let rootFrame: AsyncContextFrame = createFrame(undefined, new Map());
let currentFrame: AsyncContextFrame = rootFrame;

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function withFinally<R>(result: R, onFinally: () => void): R {
  return (result as PromiseLike<unknown>).then(
    (value) => {
      onFinally();
      return value;
    },
    (error) => {
      onFinally();
      throw error;
    },
  ) as R;
}

export class SequentialAsyncLocalStorage<Store> {
  getStore(): Store | undefined {
    const self = this as SequentialAsyncLocalStorage<unknown>;
    const store = currentFrame.stores.has(self)
      ? currentFrame.stores.get(self)
      : ambientStores?.get(self);
    return store === exited ? undefined : (store as Store | undefined);
  }

  run<R, TArgs extends unknown[]>(
    store: Store,
    callback: RunCallback<R, TArgs>,
    ...args: TArgs
  ): R {
    const previousFrame = currentFrame;
    const frame = createFrame(previousFrame, previousFrame.stores);
    frame.stores.set(this as SequentialAsyncLocalStorage<unknown>, store);
    currentFrame = frame;
    if (ambientStores && !ambientStores.has(this as SequentialAsyncLocalStorage<unknown>)) {
      ambientStores.set(this as SequentialAsyncLocalStorage<unknown>, store);
    }

    let result: R;
    try {
      result = callback(...args);
    } catch (error) {
      closeFrame(frame);
      throw error;
    }

    if (isPromiseLike(result)) {
      return withFinally(result, () => {
        closeFrame(frame);
      });
    }

    closeFrame(frame);
    return result;
  }

  exit<R, TArgs extends unknown[]>(callback: RunCallback<R, TArgs>, ...args: TArgs): R {
    const previousFrame = currentFrame;
    const frame = createFrame(previousFrame, previousFrame.stores);
    frame.stores.set(this as SequentialAsyncLocalStorage<unknown>, exited);
    currentFrame = frame;

    let result: R;
    try {
      result = callback(...args);
    } catch (error) {
      closeFrame(frame);
      throw error;
    }

    if (isPromiseLike(result)) {
      return withFinally(result, () => {
        closeFrame(frame);
      });
    }

    closeFrame(frame);
    return result;
  }

  enterWith(store: Store): void {
    // Provided for compatibility with Node/Next consumers. WinterCG's portable
    // subset avoids enterWith/disable, but Next still probes for these methods.
    const frame = createFrame(currentFrame, currentFrame.stores);
    frame.stores.set(this as SequentialAsyncLocalStorage<unknown>, store);
    currentFrame = frame;
  }

  disable(): void {
    // Compatibility-only counterpart to enterWith().
    const frame = createFrame(currentFrame, currentFrame.stores);
    frame.stores.set(this as SequentialAsyncLocalStorage<unknown>, exited);
    currentFrame = frame;
  }

  static bind<T extends (...args: unknown[]) => unknown>(fn: T): T {
    const runInSnapshot = SequentialAsyncLocalStorage.snapshot();
    return ((...args: Parameters<T>) => runInSnapshot(fn, ...args)) as T;
  }

  static snapshot(): <R, TArgs extends unknown[]>(fn: RunCallback<R, TArgs>, ...args: TArgs) => R {
    const snapshot = SequentialAsyncLocalStorage.#snapshotStores();
    const snapshotGeneration = resetGeneration;

    return <R, TArgs extends unknown[]>(fn: RunCallback<R, TArgs>, ...args: TArgs): R => {
      // Snapshots captured before test cleanup are ignored so delayed callbacks
      // from one test cannot re-enter the previous test's request context.
      if (snapshotGeneration !== resetGeneration) return fn(...args);

      const frame = createFrame(currentFrame, snapshot);
      currentFrame = frame;

      let result: R;
      try {
        result = fn(...args);
      } catch (error) {
        closeFrame(frame);
        throw error;
      }

      if (isPromiseLike(result)) {
        return withFinally(result, () => {
          closeFrame(frame);
        });
      }

      closeFrame(frame);
      return result;
    };
  }

  static #snapshotStores(): StoreValues {
    return new Map(currentFrame.stores);
  }
}

export function createAsyncLocalStorage<Store>(): SequentialAsyncLocalStorage<Store> {
  return new SequentialAsyncLocalStorage<Store>();
}

export function bindSnapshot<T>(fn: T): T {
  if (typeof fn !== "function") return fn;
  return SequentialAsyncLocalStorage.bind(fn as (...args: unknown[]) => unknown) as T;
}

export function createSnapshot(): <R, TArgs extends unknown[]>(
  fn: RunCallback<R, TArgs>,
  ...args: TArgs
) => R {
  return SequentialAsyncLocalStorage.snapshot();
}

/**
 * Starts a scope in which the first store a storage is entered with stays
 * readable after its `run()` has returned, until the returned function is
 * called.
 *
 * A server enters its request stores once and then does the work from
 * scheduled tasks: React renders a tree that way, and an async component
 * resumes that way after every `await`. Node carries the store along. A
 * browser cannot, so inside this scope the outermost store of the request is
 * what a later task reads. That is right for one request at a time.
 */
export function enterAmbientScope(): () => void {
  const stores: StoreValues = new Map();
  // A server can make a request to itself while it handles one. The inner
  // request is the one at work until it ends.
  const outerStores = ambientStores;
  ambientStores = stores;
  return () => {
    if (ambientStores === stores) ambientStores = outerStores;
  };
}

export function resetAsyncLocalStorage(): void {
  // Test cleanup must call this to drop request-local state that may be left
  // behind by a failed render, an unawaited promise, or other hanging work.
  // Bumping the generation also prevents delayed promise finalizers and old
  // snapshots from re-entering a previous test's frame.
  resetGeneration++;
  ambientStores = undefined;
  rootFrame = createFrame(undefined, new Map());
  currentFrame = rootFrame;
}

function createFrame(
  parent: AsyncContextFrame | undefined,
  stores: StoreValues,
): AsyncContextFrame {
  return {
    stores: new Map(stores),
    parent,
    active: true,
    generation: resetGeneration,
  };
}

function closeFrame(frame: AsyncContextFrame): void {
  frame.active = false;
  if (frame.generation !== resetGeneration || currentFrame !== frame) return;

  currentFrame = nearestActiveFrame(frame.parent);
}

function nearestActiveFrame(frame: AsyncContextFrame | undefined): AsyncContextFrame {
  while (frame && !frame.active) {
    frame = frame.parent;
  }

  return frame ?? rootFrame;
}
