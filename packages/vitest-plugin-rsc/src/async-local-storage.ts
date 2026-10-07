type RunCallback<R, TArgs extends unknown[]> = (...args: TArgs) => R;
type StoreValues = Map<SequentialAsyncLocalStorage<unknown>, unknown>;
// See enterAmbientScope().
type AmbientScope = { stores: StoreValues; outer: AmbientScope | undefined; ended: boolean };
type AsyncContextFrame = {
  stores: StoreValues;
  parent: AsyncContextFrame | undefined;
  active: boolean;
  generation: number;
};

// This is a small WinterCG-style AsyncLocalStorage shim for browser tests.
// It intentionally does not patch Promise, timers, events, or React's scheduler.
// Context is preserved while a `run()`/snapshot callback is executing and until
// the promise returned by that callback settles. Inside the scope of a request
// it ends when the callback returns: see enterAmbientScope().
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
// The innermost ambient scope that has not ended, see enterAmbientScope().
let ambientScope: AmbientScope | undefined;
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

// Makes a frame the current one for a callback. The frame lasts until the
// promise the callback returns has settled. Not in an ambient scope: there it
// ends when the callback returns, see enterAmbientScope().
function runInFrame<R, TArgs extends unknown[]>(
  frame: AsyncContextFrame,
  callback: RunCallback<R, TArgs>,
  args: TArgs,
): R {
  const untilSettled = ambientScope === undefined;
  currentFrame = frame;

  let result: R;
  try {
    result = callback(...args);
  } catch (error) {
    closeFrame(frame);
    throw error;
  }

  if (untilSettled && isPromiseLike(result)) {
    return withFinally(result, () => {
      closeFrame(frame);
    });
  }

  closeFrame(frame);
  return result;
}

export class SequentialAsyncLocalStorage<Store> {
  getStore(): Store | undefined {
    const self = this as SequentialAsyncLocalStorage<unknown>;
    const store = currentFrame.stores.has(self)
      ? currentFrame.stores.get(self)
      : ambientStore(self);
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
    if (ambientScope && !ambientScope.stores.has(this as SequentialAsyncLocalStorage<unknown>)) {
      ambientScope.stores.set(this as SequentialAsyncLocalStorage<unknown>, store);
    }
    return runInFrame(frame, callback, args);
  }

  exit<R, TArgs extends unknown[]>(callback: RunCallback<R, TArgs>, ...args: TArgs): R {
    const previousFrame = currentFrame;
    const frame = createFrame(previousFrame, previousFrame.stores);
    frame.stores.set(this as SequentialAsyncLocalStorage<unknown>, exited);
    const scope = ambientScope;
    const result = runInFrame(frame, callback, args);
    // See enterAmbientScope(): the work that starts here goes on outside the
    // store, for longer than this frame and than the promise.
    if (scope && isPromiseLike(result)) {
      scope.stores.set(this as SequentialAsyncLocalStorage<unknown>, exited);
    }
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

      return runInFrame(createFrame(currentFrame, snapshot), fn, args);
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
 * Starts the scope of one request on a server. Until the returned function is
 * called:
 *
 * - The first store a storage is entered with stays readable after its
 *   `run()` has returned.
 * - A `run()` lasts for the synchronous part of its callback, also when the
 *   callback returns a promise. So does a snapshot.
 * - An `exit()` whose callback returns a promise leaves the storage for the
 *   rest of the scope.
 *
 * A server enters its request stores once and then does the work from
 * scheduled tasks: React renders a tree that way, and an async component
 * resumes that way after every `await`. Node carries the store along. A
 * browser cannot, so inside this scope the outermost store of the request is
 * what a later task reads. That is right for one request at a time.
 *
 * It is wrong for a store that is entered inside the request for a part of
 * the work, like the one of a cache scope: code that resumes after an `await`
 * in that part reads the store of the request. The alternative is worse.
 * Keeping such a store until the promise of its callback settles hands it to
 * everything else that runs in the meantime, which is the rest of the page.
 *
 * The same goes for `exit()`: the work that its callback starts goes on after
 * the promise has settled, and has to stay outside the store. Next renders
 * the page after a Server Action that way, outside the store of the action,
 * and nothing of the action runs after it. It is wrong for code that awaits
 * such an `exit()` and then reads the store again.
 *
 * A `run()` that started before the scope keeps its own rule: it lasts until
 * its promise settles, and the request reads its store until then.
 */
export function enterAmbientScope(): () => void {
  // A server can make a request to itself while it handles one. The inner
  // request is the one at work until it ends, and has the stores of the outer
  // one until it enters its own.
  const scope: AmbientScope = { stores: new Map(), outer: ambientScope, ended: false };
  ambientScope = scope;
  return () => {
    // The inner request can end after the outer one: it waits for the work
    // it does after its response.
    scope.ended = true;
    while (ambientScope?.ended) ambientScope = ambientScope.outer;
  };
}

function ambientStore(storage: SequentialAsyncLocalStorage<unknown>): unknown {
  for (let scope = ambientScope; scope; scope = scope.outer) {
    if (!scope.ended && scope.stores.has(storage)) return scope.stores.get(storage);
  }
}

export function resetAsyncLocalStorage(): void {
  // Test cleanup must call this to drop request-local state that may be left
  // behind by a failed render, an unawaited promise, or other hanging work.
  // Bumping the generation also prevents delayed promise finalizers and old
  // snapshots from re-entering a previous test's frame.
  resetGeneration++;
  ambientScope = undefined;
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
