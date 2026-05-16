import { SequentialAsyncLocalStorage } from "./async-local-storage.ts";

export { SequentialAsyncLocalStorage as AsyncLocalStorage } from "./async-local-storage.ts";

type RunCallback<R, TArgs extends unknown[]> = (...args: TArgs) => R;

// This module is a compatibility surface for packages that import
// `node:async_hooks` in the browser test environment. Only the context-carrying
// pieces are meaningful here; lifecycle hooks and async IDs are no-ops.
class AsyncHook {
  enable(): this {
    return this;
  }

  disable(): this {
    return this;
  }
}

export class AsyncResource {
  #runInAsyncScope = SequentialAsyncLocalStorage.snapshot();

  constructor(_type: string) {}

  runInAsyncScope<R, TArgs extends unknown[], This = unknown>(
    fn: (this: This, ...args: TArgs) => R,
    thisArg?: This,
    ...args: TArgs
  ): R {
    return this.#runInAsyncScope(() => fn.apply(thisArg as This, args));
  }

  bind<T extends RunCallback<unknown, unknown[]>, This = unknown>(fn: T, thisArg?: This): T {
    return ((...args: Parameters<T>) =>
      this.runInAsyncScope(
        fn as (this: This, ...args: Parameters<T>) => ReturnType<T>,
        thisArg,
        ...args,
      )) as T;
  }

  asyncId(): number {
    return 0;
  }

  triggerAsyncId(): number {
    return 0;
  }

  emitDestroy(): void {}

  static bind<T extends RunCallback<unknown, unknown[]>, This = unknown>(
    fn: T,
    _type?: string,
    thisArg?: This,
  ): T {
    return new AsyncResource("bound").bind(fn, thisArg);
  }
}

export const asyncWrapProviders: Record<string, number> = {
  NONE: 0,
};

export function createHook(): AsyncHook {
  return new AsyncHook();
}

export function executionAsyncId(): number {
  return 0;
}

export function executionAsyncResource(): Record<string, never> {
  return Object.create(null) as Record<string, never>;
}

export function triggerAsyncId(): number {
  return 0;
}

export default {
  AsyncLocalStorage: SequentialAsyncLocalStorage,
  AsyncResource,
  asyncWrapProviders,
  createHook,
  executionAsyncId,
  executionAsyncResource,
  triggerAsyncId,
};
