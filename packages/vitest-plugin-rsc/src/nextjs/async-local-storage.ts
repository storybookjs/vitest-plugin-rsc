type RunCallback<R, TArgs extends unknown[]> = (...args: TArgs) => R;

const instances = new Set<SequentialAsyncLocalStorage<unknown>>();

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function withFinally<R>(result: R & PromiseLike<unknown>, onFinally: () => void): R {
  return result.then(
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
  stack: Store[] = [];

  constructor() {
    instances.add(this as SequentialAsyncLocalStorage<unknown>);
  }

  getStore(): Store | undefined {
    return this.stack.at(-1);
  }

  run<R, TArgs extends unknown[]>(
    store: Store,
    callback: RunCallback<R, TArgs>,
    ...args: TArgs
  ): R {
    this.stack.push(store);

    let result: R;
    try {
      result = callback(...args);
    } catch (error) {
      this.stack.pop();
      throw error;
    }

    if (isPromiseLike(result)) {
      return withFinally(result, () => {
        this.stack.pop();
      });
    }

    this.stack.pop();
    return result;
  }

  exit<R, TArgs extends unknown[]>(callback: RunCallback<R, TArgs>, ...args: TArgs): R {
    const previousStack = this.stack;
    this.stack = [];

    let result: R;
    try {
      result = callback(...args);
    } catch (error) {
      this.stack = previousStack;
      throw error;
    }

    if (isPromiseLike(result)) {
      return withFinally(result, () => {
        this.stack = previousStack;
      });
    }

    this.stack = previousStack;
    return result;
  }

  enterWith(store: Store): void {
    if (this.stack.length === 0) {
      this.stack.push(store);
      return;
    }

    this.stack[this.stack.length - 1] = store;
  }

  disable(): void {
    this.stack = [];
  }

  static bind<T extends (...args: unknown[]) => unknown>(fn: T): T {
    const runInSnapshot = SequentialAsyncLocalStorage.snapshot();
    return ((...args: Parameters<T>) => runInSnapshot(fn, ...args)) as T;
  }

  static snapshot(): <R, TArgs extends unknown[]>(fn: RunCallback<R, TArgs>, ...args: TArgs) => R {
    const snapshot = new Map(
      [...instances].map((instance) => [instance, instance.stack.slice()] as const),
    );

    return <R, TArgs extends unknown[]>(fn: RunCallback<R, TArgs>, ...args: TArgs): R => {
      const previous = new Map(
        [...instances].map((instance) => [instance, instance.stack.slice()] as const),
      );

      for (const [instance, stack] of snapshot) {
        instance.stack = stack.slice();
      }

      let result: R;
      try {
        result = fn(...args);
      } catch (error) {
        restoreStacks(previous);
        throw error;
      }

      if (isPromiseLike(result)) {
        return withFinally(result, () => restoreStacks(previous));
      }

      restoreStacks(previous);
      return result as R;
    };
  }
}

function restoreStacks(snapshot: Map<SequentialAsyncLocalStorage<unknown>, unknown[]>): void {
  for (const [instance, stack] of snapshot) {
    instance.stack = stack;
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
