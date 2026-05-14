import { executeAsync as executeUnctxAsync } from "unctx";

type RunCallback<R, TArgs extends unknown[]> = (...args: TArgs) => R;
type StoreKey = symbol | SequentialAsyncLocalStorage<unknown>;
type StoreValues = Map<StoreKey, unknown>;
type AsyncContextRestore = () => void;
type AsyncContextLeave = () => AsyncContextRestore | undefined;
type AsyncContextFrame = {
  stores: StoreValues;
  parent: AsyncContextFrame | undefined;
  active: boolean;
  persistent: boolean;
  generation: number;
};
type AsyncContextState = {
  resetGeneration: number;
  rootFrame: AsyncContextFrame;
  currentFrame: AsyncContextFrame;
  asyncContextHandlers: Set<AsyncContextLeave>;
};

// This is a small WinterCG-style AsyncLocalStorage shim for browser tests.
// It intentionally does not patch Promise, timers, events, or React's scheduler.
// Instead, vitestPluginRSC() applies an unctx-powered transform to async
// callbacks passed to AsyncLocalStorage boundaries. The transformed awaits call
// executeAsync() below so this shim can leave the current frame while an async
// continuation is suspended, then restore it before the continuation resumes.
//
// The frame chain keeps overlapping returned promises from restoring stale
// context if they settle out of order.
// Cleanup invalidates older async finalizers so a previous test cannot
// restore a stale frame after the stores have been reset.
const asyncContextState = getAsyncContextState();
const contextBoundReadableStream = Symbol.for(
  "vitest-plugin-rsc.async-local-storage.contextBoundReadableStream",
);

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function isReadableStreamLike(value: unknown): value is ReadableStream<unknown> {
  return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
}

function isContextBoundReadableStream(stream: ReadableStream<unknown>): boolean {
  return Boolean((stream as Record<symbol, unknown>)[contextBoundReadableStream]);
}

export class SequentialAsyncLocalStorage<Store> {
  readonly #storeKey: StoreKey;

  constructor(storeKey?: StoreKey) {
    this.#storeKey = storeKey ?? (this as SequentialAsyncLocalStorage<unknown>);
  }

  getStore(): Store | undefined {
    return asyncContextState.currentFrame.stores.get(this.#storeKey) as Store | undefined;
  }

  run<R, TArgs extends unknown[]>(
    store: Store,
    callback: RunCallback<R, TArgs>,
    ...args: TArgs
  ): R {
    const previousFrame = asyncContextState.currentFrame;
    const frame = createFrame(previousFrame, previousFrame.stores);
    frame.stores.set(this.#storeKey, store);
    return runInFrame(frame, callback, args);
  }

  exit<R, TArgs extends unknown[]>(callback: RunCallback<R, TArgs>, ...args: TArgs): R {
    const previousFrame = asyncContextState.currentFrame;
    const frame = createFrame(previousFrame, previousFrame.stores);
    frame.stores.delete(this.#storeKey);
    return runInFrame(frame, callback, args);
  }

  enterWith(store: Store): void {
    // Provided for compatibility with Node/Next consumers. WinterCG's portable
    // subset avoids enterWith/disable, but Next still probes for these methods.
    const frame = createFrame(
      asyncContextState.currentFrame,
      asyncContextState.currentFrame.stores,
    );
    frame.stores.set(this.#storeKey, store);
    registerFrame(frame);
    asyncContextState.currentFrame = frame;
  }

  disable(): void {
    // Compatibility-only counterpart to enterWith().
    const frame = createFrame(
      asyncContextState.currentFrame,
      asyncContextState.currentFrame.stores,
    );
    frame.stores.delete(this.#storeKey);
    registerFrame(frame);
    asyncContextState.currentFrame = frame;
  }

  static bind<T extends (...args: unknown[]) => unknown>(fn: T): T {
    const runInSnapshot = SequentialAsyncLocalStorage.snapshot();
    return ((...args: Parameters<T>) => runInSnapshot(fn, ...args)) as T;
  }

  static snapshot(): <R, TArgs extends unknown[]>(fn: RunCallback<R, TArgs>, ...args: TArgs) => R {
    const snapshot = SequentialAsyncLocalStorage.#snapshotStores();
    const snapshotGeneration = asyncContextState.resetGeneration;

    return <R, TArgs extends unknown[]>(fn: RunCallback<R, TArgs>, ...args: TArgs): R => {
      // Snapshots captured before test cleanup are ignored so delayed callbacks
      // from one test cannot re-enter the previous test's request context.
      if (snapshotGeneration !== asyncContextState.resetGeneration) return fn(...args);

      const frame = createFrame(asyncContextState.currentFrame, snapshot);
      return runInFrame(frame, fn, args);
    };
  }

  static #snapshotStores(): StoreValues {
    return new Map(asyncContextState.currentFrame.stores);
  }
}

export function createAsyncLocalStorage<Store>(): SequentialAsyncLocalStorage<Store> {
  return new SequentialAsyncLocalStorage<Store>(getCreateAsyncLocalStorageKey());
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

export function withAsyncLocalStorageContext<T extends (...args: unknown[]) => unknown>(
  fn: T,
  _transformed?: true,
): T {
  return fn;
}

export const executeAsync = executeUnctxAsync as <T>(callback: () => T) => [T, AsyncContextRestore];

export function resetAsyncLocalStorage(): void {
  // Test cleanup must call this to drop request-local state that may be left
  // behind by a failed render, an unawaited promise, or other hanging work.
  // Bumping the generation also prevents delayed promise finalizers and old
  // snapshots from re-entering a previous test's frame.
  asyncContextState.resetGeneration++;
  asyncContextState.asyncContextHandlers.clear();
  asyncContextState.rootFrame = createRootFrame(asyncContextState.resetGeneration);
  asyncContextState.currentFrame = asyncContextState.rootFrame;
}

function runInFrame<R, TArgs extends unknown[]>(
  frame: AsyncContextFrame,
  callback: RunCallback<R, TArgs>,
  args: TArgs,
): R {
  asyncContextState.currentFrame = frame;
  const unregister = registerFrame(frame);

  let result: R;
  try {
    result = callback(...args);
  } catch (error) {
    unregister();
    closeFrame(frame);
    throw error;
  }

  if (isPromiseLike(result)) {
    suspendFrame(frame);
    return withAsyncResultLifecycle(result, frame, () => {
      unregister();
      closeFrame(frame);
    });
  }

  if (isReadableStreamLike(result)) {
    if (frame.stores.size === 0 || isContextBoundReadableStream(result)) {
      unregister();
      closeFrame(frame);
      return result;
    }

    frame.persistent = true;
    return withStreamLifecycle(result, () => {
      frame.persistent = false;
      unregister();
      closeFrame(frame);
    }) as R;
  }

  unregister();
  closeFrame(frame);
  return result;
}

function registerFrame(frame: AsyncContextFrame): () => void {
  const handler = () => leaveFrame(frame);
  asyncContextState.asyncContextHandlers.add(handler);
  return () => asyncContextState.asyncContextHandlers.delete(handler);
}

function withAsyncResultLifecycle<R>(
  result: R,
  frame: AsyncContextFrame,
  onFinally: () => void,
): R {
  return (result as PromiseLike<unknown>).then(
    (value) => {
      if (isReadableStreamLike(value)) {
        if (frame.stores.size === 0 || isContextBoundReadableStream(value)) {
          onFinally();
          return value;
        }

        frame.persistent = true;
        asyncContextState.currentFrame = frame;
        return withStreamLifecycle(value, () => {
          frame.persistent = false;
          onFinally();
        });
      }

      onFinally();
      return value;
    },
    (error) => {
      onFinally();
      throw error;
    },
  ) as R;
}

function withStreamLifecycle<T>(
  stream: ReadableStream<T>,
  onFinally: () => void,
): ReadableStream<T> {
  const reader = stream.getReader();
  let closed = false;

  const close = () => {
    if (closed) return;

    closed = true;
    onFinally();
  };

  const wrappedStream = new ReadableStream<T>({
    pull(controller) {
      let next: Promise<ReadableStreamReadResult<T>>;
      try {
        next = reader.read();
      } catch (error) {
        close();
        controller.error(error);
        throw error;
      }

      return next.then(
        (result) => {
          if (result.done) {
            close();
            controller.close();
            return;
          }

          controller.enqueue(result.value);
        },
        (error) => {
          close();
          controller.error(error);
          throw error;
        },
      );
    },
    cancel(reason) {
      let cancelResult: Promise<void>;
      try {
        cancelResult = reader.cancel(reason);
      } catch (error) {
        close();
        throw error;
      }

      return cancelResult.then(
        () => {
          close();
        },
        (error) => {
          close();
          throw error;
        },
      );
    },
  });

  Object.defineProperty(wrappedStream, contextBoundReadableStream, {
    value: true,
  });

  return wrappedStream;
}

function createFrame(
  parent: AsyncContextFrame | undefined,
  stores: StoreValues,
): AsyncContextFrame {
  return {
    stores: new Map(stores),
    parent,
    active: true,
    persistent: false,
    generation: asyncContextState.resetGeneration,
  };
}

function createRootFrame(generation: number): AsyncContextFrame {
  return {
    stores: new Map(),
    parent: undefined,
    active: true,
    persistent: false,
    generation,
  };
}

function closeFrame(frame: AsyncContextFrame): void {
  frame.active = false;
  suspendFrame(frame);
}

function suspendFrame(frame: AsyncContextFrame): void {
  if (
    frame.generation !== asyncContextState.resetGeneration ||
    asyncContextState.currentFrame !== frame
  ) {
    return;
  }

  asyncContextState.currentFrame = nearestActiveFrame(frame.parent);
}

function leaveFrame(frame: AsyncContextFrame): AsyncContextRestore | undefined {
  if (
    frame.generation !== asyncContextState.resetGeneration ||
    frame.persistent ||
    !frame.active ||
    asyncContextState.currentFrame !== frame
  ) {
    return;
  }

  suspendFrame(frame);

  return () => {
    if (frame.generation !== asyncContextState.resetGeneration || !frame.active) return;

    asyncContextState.currentFrame = frame;
  };
}

function nearestActiveFrame(frame: AsyncContextFrame | undefined): AsyncContextFrame {
  while (frame && !frame.active) {
    frame = frame.parent;
  }

  return frame ?? asyncContextState.rootFrame;
}

function getAsyncContextState(): AsyncContextState {
  const globalScope = globalThis as typeof globalThis & {
    __vitest_plugin_rsc_async_context__?: AsyncContextState;
  };

  if (!globalScope.__vitest_plugin_rsc_async_context__) {
    const rootFrame = createRootFrame(0);
    globalScope.__vitest_plugin_rsc_async_context__ = {
      resetGeneration: 0,
      rootFrame,
      currentFrame: rootFrame,
      asyncContextHandlers: getUnctxAsyncHandlers(),
    };
  }

  return globalScope.__vitest_plugin_rsc_async_context__;
}

function getCreateAsyncLocalStorageKey(): symbol {
  const callsite = getCreateAsyncLocalStorageCallsite();
  if (!callsite) return Symbol("vitest-plugin-rsc.async-local-storage");

  const registry = getCreateAsyncLocalStorageKeyRegistry();
  let key = registry.get(callsite);
  if (!key) {
    key = Symbol(callsite);
    registry.set(callsite, key);
  }

  return key;
}

function getCreateAsyncLocalStorageCallsite(): string | undefined {
  const stack = new Error().stack;
  if (!stack) return;

  for (const rawLine of stack.split("\n").slice(1)) {
    const line = rawLine.trim();
    if (
      line.includes("getCreateAsyncLocalStorageCallsite") ||
      line.includes("getCreateAsyncLocalStorageKey") ||
      line.includes("createAsyncLocalStorage") ||
      line.includes("vitest-plugin-rsc/async-local-storage") ||
      /[/\\]async-local-storage-[^/\\]+\.js/.test(line)
    ) {
      continue;
    }

    return normalizeStorageCallsite(line);
  }
}

function normalizeStorageCallsite(callsite: string): string {
  return callsite.replace(/\?[^:)]+/g, "");
}

function getCreateAsyncLocalStorageKeyRegistry(): Map<string, symbol> {
  const globalScope = globalThis as typeof globalThis & {
    __vitest_plugin_rsc_async_storage_keys__?: Map<string, symbol>;
  };

  return (globalScope.__vitest_plugin_rsc_async_storage_keys__ ??= new Map());
}

function getUnctxAsyncHandlers(): Set<AsyncContextLeave> {
  const globalScope = globalThis as typeof globalThis & {
    __unctx_async_handlers__?: Set<AsyncContextLeave>;
  };

  return (globalScope.__unctx_async_handlers__ ??= new Set());
}
