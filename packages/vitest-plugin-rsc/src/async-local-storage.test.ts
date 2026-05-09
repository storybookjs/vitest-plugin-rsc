import { expect, test } from "vitest";
import { AsyncLocalStorage } from "./async-hooks";

test("scopes a store to the run callback", () => {
  const storage = new AsyncLocalStorage<string>();

  const result = storage.run("inside", () => storage.getStore());

  expect(result).toBe("inside");
  expect(storage.getStore()).toBeUndefined();
});

test("keeps a store until the returned promise settles", async () => {
  const storage = new AsyncLocalStorage<string>();

  const result = await storage.run("inside", async () => {
    await Promise.resolve();
    return storage.getStore();
  });

  expect(result).toBe("inside");
  expect(storage.getStore()).toBeUndefined();
});

test("temporarily exits a store", () => {
  const storage = new AsyncLocalStorage<string>();

  const result = storage.run("inside", () => {
    const exited = storage.exit(() => storage.getStore());
    return [exited, storage.getStore()];
  });

  expect(result).toEqual([undefined, "inside"]);
});

test("does not preserve context for async work that is not returned", async () => {
  const storage = new AsyncLocalStorage<string>();
  let scheduledStore: string | undefined;

  storage.run("inside", () => {
    queueMicrotask(() => {
      scheduledStore = storage.getStore();
    });
  });

  await Promise.resolve();
  expect(scheduledStore).toBeUndefined();
});
