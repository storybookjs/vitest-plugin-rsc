import { AsyncLocalStorage } from "node:async_hooks";

type UserStore = {
  label: string;
};

export const userAsyncStorage = new AsyncLocalStorage<UserStore>();

export function runWithUserStore<Result>(
  store: UserStore,
  callback: () => Result | Promise<Result>,
): Result | Promise<Result> {
  return userAsyncStorage.run(store, callback);
}
