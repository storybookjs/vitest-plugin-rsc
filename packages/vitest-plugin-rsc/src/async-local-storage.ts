type RunCallback<R, TArgs extends unknown[]> = (...args: TArgs) => R;

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
  #currentStore: Store | undefined;

  getStore(): Store | undefined {
    return this.#currentStore;
  }

  run<R, TArgs extends unknown[]>(
    store: Store,
    callback: RunCallback<R, TArgs>,
    ...args: TArgs
  ): R {
    const previousStore = this.#currentStore;
    this.#currentStore = store;

    let result: R;
    try {
      result = callback(...args);
    } catch (error) {
      this.#currentStore = previousStore;
      throw error;
    }

    if (isPromiseLike(result)) {
      return withFinally(result, () => {
        this.#currentStore = previousStore;
      });
    }

    this.#currentStore = previousStore;
    return result;
  }

  exit<R, TArgs extends unknown[]>(callback: RunCallback<R, TArgs>, ...args: TArgs): R {
    const previousStore = this.#currentStore;
    this.#currentStore = undefined;

    let result: R;
    try {
      result = callback(...args);
    } catch (error) {
      this.#currentStore = previousStore;
      throw error;
    }

    if (isPromiseLike(result)) {
      return withFinally(result, () => {
        this.#currentStore = previousStore;
      });
    }

    this.#currentStore = previousStore;
    return result;
  }

  enterWith(store: Store): void {
    this.#currentStore = store;
  }

  disable(): void {
    this.#currentStore = undefined;
  }

  static bind<T extends (...args: unknown[]) => unknown>(fn: T): T {
    return fn;
  }

  static snapshot(): <R, TArgs extends unknown[]>(fn: RunCallback<R, TArgs>, ...args: TArgs) => R {
    return (fn, ...args) => fn(...args);
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
