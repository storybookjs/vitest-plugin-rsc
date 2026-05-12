import { AsyncLocalStorage } from "node:async_hooks";

export type UserStore = {
  user: {
    name: string;
    role: string;
  };
};

export const userAsyncStorage = new AsyncLocalStorage<UserStore>();

export function injectUserContext(store: UserStore) {
  userAsyncStorage.enterWith(store);
}

export function runWithUserContext<T>(store: UserStore, callback: () => T): T {
  return userAsyncStorage.run(store, callback);
}

export function getOptionalCurrentUser() {
  return userAsyncStorage.getStore()?.user;
}

export function getCurrentUser() {
  const store = userAsyncStorage.getStore();
  if (!store) {
    throw new Error("No user store found in AsyncLocalStorage.");
  }
  return store.user;
}
