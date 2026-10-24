//#region src/async-local-storage.d.ts
type RunCallback$1<R, TArgs extends unknown[]> = (...args: TArgs) => R;
declare class SequentialStorage<Store> {
  getStore(): Store | undefined;
  run<R, TArgs extends unknown[]>(store: Store, callback: RunCallback$1<R, TArgs>, ...args: TArgs): R;
  exit<R, TArgs extends unknown[]>(callback: RunCallback$1<R, TArgs>, ...args: TArgs): R;
  enterWith(store: Store): void;
  disable(): void;
  static bind<T extends (...args: unknown[]) => unknown>(fn: T): T;
  static snapshot(): <R, TArgs extends unknown[]>(fn: RunCallback$1<R, TArgs>, ...args: TArgs) => R;
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
 * in that part reads the store of the request, unless it is compiled to get
 * its own back (asyncFunctionHooks). The alternative is worse. Keeping such a
 * store until the promise of its callback settles hands it to everything else
 * that runs in the meantime, which is the rest of the page.
 *
 * The same goes for `exit()`: the work that its callback starts goes on after
 * the promise has settled, and has to stay outside the store. Next renders
 * the page after a Server Action that way, outside the store of the action.
 * What was started in the store before the `exit()` and goes on after it,
 * like a promise the action passed to `after()`, has its store back when it
 * is compiled (asyncFunctionHooks) or bound (`bind()`, `snapshot()`): both
 * take the stores they are called with, the ambient ones included, as Node's
 * context does. So does code that awaits the `exit()`, when it is compiled.
 * What is not compiled reads the exited store for the rest of the scope.
 *
 * A `run()` that started before the scope keeps its own rule: it lasts until
 * its promise settles, and the request reads its store until then.
 */
declare const SequentialAsyncLocalStorage: typeof SequentialStorage;
type SequentialAsyncLocalStorage<Store> = SequentialStorage<Store>;
//#endregion
//#region src/async-hooks.d.ts
type RunCallback<R, TArgs extends unknown[]> = (...args: TArgs) => R;
declare class AsyncHook {
  enable(): this;
  disable(): this;
}
declare class AsyncResource {
  #private;
  constructor(_type: string);
  runInAsyncScope<R, TArgs extends unknown[], This = unknown>(fn: (this: This, ...args: TArgs) => R, thisArg?: This, ...args: TArgs): R;
  bind<T extends RunCallback<unknown, unknown[]>, This = unknown>(fn: T, thisArg?: This): T;
  asyncId(): number;
  triggerAsyncId(): number;
  emitDestroy(): void;
  static bind<T extends RunCallback<unknown, unknown[]>, This = unknown>(fn: T, _type?: string, thisArg?: This): T;
}
declare const asyncWrapProviders: Record<string, number>;
declare function createHook(): AsyncHook;
declare function executionAsyncId(): number;
declare function executionAsyncResource(): Record<string, never>;
declare function triggerAsyncId(): number;
declare const _default: {
  AsyncLocalStorage: {
    new <Store>(): {
      getStore(): Store | undefined;
      run<R, TArgs extends unknown[]>(store: Store, callback: (...args: TArgs) => R, ...args: TArgs): R;
      exit<R, TArgs extends unknown[]>(callback: (...args: TArgs) => R, ...args: TArgs): R;
      enterWith(store: Store): void;
      disable(): void;
    };
    bind<T extends (...args: unknown[]) => unknown>(fn: T): T;
    snapshot(): <R, TArgs extends unknown[]>(fn: (...args: TArgs) => R, ...args: TArgs) => R;
  };
  AsyncResource: typeof AsyncResource;
  asyncWrapProviders: Record<string, number>;
  createHook: typeof createHook;
  executionAsyncId: typeof executionAsyncId;
  executionAsyncResource: typeof executionAsyncResource;
  triggerAsyncId: typeof triggerAsyncId;
};
//#endregion
export { SequentialAsyncLocalStorage as AsyncLocalStorage, AsyncResource, asyncWrapProviders, createHook, _default as default, executionAsyncId, executionAsyncResource, triggerAsyncId };