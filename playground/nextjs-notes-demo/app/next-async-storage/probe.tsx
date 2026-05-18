import { createAsyncLocalStorage } from "next/dist/server/app-render/async-local-storage.js";

export const nextAsyncStorage = createAsyncLocalStorage<{ route: string }>();

export function NextAsyncStorageProbe() {
  return <p>Next async storage route: {nextAsyncStorage.getStore()?.route ?? "missing"}</p>;
}
