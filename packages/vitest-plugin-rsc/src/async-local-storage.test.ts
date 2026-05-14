import { expect, test } from "vitest";
import { createAsyncLocalStorage, executeAsync, resetAsyncLocalStorage } from "./async-local-storage";
import {
  AsyncLocalStorage,
  AsyncResource,
  createHook,
  executionAsyncId,
  executionAsyncResource,
  triggerAsyncId,
} from "./async-hooks";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolve_) => {
    resolve = resolve_;
  });

  return { promise, resolve };
}

async function preserveAsyncLocalStorage<T>(value: T | PromiseLike<T>): Promise<T> {
  const [awaitable, restore] = executeAsync(() => value);
  const result = await awaitable;
  restore();
  return result;
}

test("scopes a store to the run callback", () => {
  const storage = new AsyncLocalStorage<string>();

  const result = storage.run("inside", () => storage.getStore());

  expect(result).toBe("inside");
  expect(storage.getStore()).toBeUndefined();
});

test("keeps a store across a transformed await", async () => {
  const storage = new AsyncLocalStorage<string>();

  const result = await storage.run("inside", async () => {
    await preserveAsyncLocalStorage(Promise.resolve());
    return storage.getStore();
  });

  expect(result).toBe("inside");
  expect(storage.getStore()).toBeUndefined();
});

test("leaves a store while a transformed await is pending", async () => {
  const storage = new AsyncLocalStorage<string>();
  const pending = deferred<string>();

  const result = storage.run("inside", async () => {
    const value = await preserveAsyncLocalStorage(pending.promise);
    return [value, storage.getStore()];
  });

  expect(storage.getStore()).toBeUndefined();

  pending.resolve("done");
  await expect(result).resolves.toEqual(["done", "inside"]);
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

test("keeps overlapping transformed runs isolated when they settle out of order", async () => {
  const storage = new AsyncLocalStorage<string>();
  const first = deferred<string>();
  const second = deferred<string>();

  const firstResult = storage.run("first", async () => {
    await preserveAsyncLocalStorage(first.promise);
    return storage.getStore();
  });
  const secondResult = storage.run("second", async () => {
    await preserveAsyncLocalStorage(second.promise);
    return storage.getStore();
  });

  expect(storage.getStore()).toBeUndefined();

  first.resolve("first done");
  await expect(firstResult).resolves.toBe("first");
  expect(storage.getStore()).toBeUndefined();

  second.resolve("second done");
  await expect(secondResult).resolves.toBe("second");
  expect(storage.getStore()).toBeUndefined();
});

test("captures a snapshot across instances", () => {
  const first = new AsyncLocalStorage<string>();
  const second = new AsyncLocalStorage<number>();

  const runInSnapshot = first.run("first", () => second.run(2, () => AsyncLocalStorage.snapshot()));

  first.enterWith("outside");
  second.enterWith(3);

  const result = runInSnapshot(() => [first.getStore(), second.getStore()]);

  expect(result).toEqual(["first", 2]);
  expect(first.getStore()).toBe("outside");
  expect(second.getStore()).toBe(3);
});

test("binds a callback to the current snapshot", () => {
  const storage = new AsyncLocalStorage<string>();
  const bound = storage.run("inside", () => AsyncLocalStorage.bind(() => storage.getStore()));

  storage.enterWith("outside");

  expect(bound()).toBe("inside");
  expect(storage.getStore()).toBe("outside");
});

test("reuses createAsyncLocalStorage keys for duplicate module callsites", () => {
  const createStorageFromSameCallsite = () => createAsyncLocalStorage<string>();
  const first = createStorageFromSameCallsite();
  const second = createStorageFromSameCallsite();

  const result = first.run("inside", () => second.getStore());

  expect(result).toBe("inside");
  expect(second.getStore()).toBeUndefined();
});

test("keeps a stream result in context until it is consumed", async () => {
  const storage = new AsyncLocalStorage<string>();
  const seenStores: (string | undefined)[] = [];

  const stream = storage.run(
    "inside",
    () =>
      new ReadableStream<string>({
        pull(controller) {
          seenStores.push(storage.getStore());
          controller.enqueue("chunk");
          controller.close();
        },
      }),
  );

  expect(storage.getStore()).toBe("inside");

  const reader = stream.getReader();
  await expect(reader.read()).resolves.toEqual({ done: false, value: "chunk" });
  expect((await reader.read()).done).toBe(true);
  expect(seenStores).toEqual(["inside"]);
  expect(storage.getStore()).toBeUndefined();
});

test("does not leave an active stream frame during a transformed await", async () => {
  const storage = new AsyncLocalStorage<string>();

  const stream = storage.run(
    "inside",
    () =>
      new ReadableStream<string>({
        pull(controller) {
          controller.enqueue("chunk");
          controller.close();
        },
      }),
  );

  await preserveAsyncLocalStorage(Promise.resolve());
  expect(storage.getStore()).toBe("inside");

  const reader = stream.getReader();
  await expect(reader.read()).resolves.toEqual({ done: false, value: "chunk" });
  expect((await reader.read()).done).toBe(true);
  expect(storage.getStore()).toBeUndefined();
});

test("keeps a promised stream result in context until it is consumed", async () => {
  const storage = new AsyncLocalStorage<string>();
  const seenStores: (string | undefined)[] = [];

  const stream = await storage.run("inside", async () => {
    await preserveAsyncLocalStorage(Promise.resolve());
    return new ReadableStream<string>({
      pull(controller) {
        seenStores.push(storage.getStore());
        controller.enqueue("chunk");
        controller.close();
      },
    });
  });

  expect(storage.getStore()).toBe("inside");

  const reader = stream.getReader();
  await expect(reader.read()).resolves.toEqual({ done: false, value: "chunk" });
  expect((await reader.read()).done).toBe(true);
  expect(seenStores).toEqual(["inside"]);
  expect(storage.getStore()).toBeUndefined();
});

test("keeps nested run stores inside a stream result", async () => {
  const first = new AsyncLocalStorage<string>();
  const second = new AsyncLocalStorage<number>();
  const seenStores: Array<[string | undefined, number | undefined]> = [];

  const stream = first.run("first", () =>
    second.run(
      2,
      () =>
        new ReadableStream<string>({
          pull(controller) {
            seenStores.push([first.getStore(), second.getStore()]);
            controller.enqueue("chunk");
            controller.close();
          },
        }),
    ),
  );

  expect(first.getStore()).toBe("first");
  expect(second.getStore()).toBe(2);

  const reader = stream.getReader();
  await expect(reader.read()).resolves.toEqual({ done: false, value: "chunk" });
  expect((await reader.read()).done).toBe(true);
  expect(seenStores).toEqual([["first", 2]]);
  expect(first.getStore()).toBeUndefined();
  expect(second.getStore()).toBeUndefined();
});

test("keeps nested run stores inside a promised stream result", async () => {
  const first = new AsyncLocalStorage<string>();
  const second = new AsyncLocalStorage<number>();
  const seenStores: Array<[string | undefined, number | undefined]> = [];

  const stream = await first.run("first", () =>
    second.run(2, async () => {
      await preserveAsyncLocalStorage(Promise.resolve());
      return new ReadableStream<string>({
        pull(controller) {
          seenStores.push([first.getStore(), second.getStore()]);
          controller.enqueue("chunk");
          controller.close();
        },
      });
    }),
  );

  expect(first.getStore()).toBe("first");
  expect(second.getStore()).toBe(2);

  const reader = stream.getReader();
  await expect(reader.read()).resolves.toEqual({ done: false, value: "chunk" });
  expect((await reader.read()).done).toBe(true);
  expect(seenStores).toEqual([["first", 2]]);
  expect(first.getStore()).toBeUndefined();
  expect(second.getStore()).toBeUndefined();
});

test("resets all stores", () => {
  const first = new AsyncLocalStorage<string>();
  const second = new AsyncLocalStorage<number>();

  first.enterWith("first");
  second.enterWith(2);

  resetAsyncLocalStorage();

  expect(first.getStore()).toBeUndefined();
  expect(second.getStore()).toBeUndefined();
});

test("does not restore stores from a run that settles after reset", async () => {
  const storage = new AsyncLocalStorage<string>();
  const pending = deferred<string>();

  storage.enterWith("outside");
  const result = storage.run("inside", () => pending.promise);

  resetAsyncLocalStorage();
  pending.resolve("done");

  await expect(result).resolves.toBe("done");
  expect(storage.getStore()).toBeUndefined();
});

test("does not restore stores from a snapshot that settles after reset", async () => {
  const storage = new AsyncLocalStorage<string>();
  const pending = deferred<string>();

  storage.enterWith("outside");
  const runInSnapshot = storage.run("inside", () => AsyncLocalStorage.snapshot());
  const result = runInSnapshot(() => pending.promise);

  resetAsyncLocalStorage();
  pending.resolve("done");

  await expect(result).resolves.toBe("done");
  expect(storage.getStore()).toBeUndefined();
});

test("does not use snapshots captured before reset", () => {
  const storage = new AsyncLocalStorage<string>();
  const runInSnapshot = storage.run("inside", () => AsyncLocalStorage.snapshot());

  resetAsyncLocalStorage();

  expect(runInSnapshot(() => storage.getStore())).toBeUndefined();
});

test("AsyncResource runs callbacks in the context captured at construction", () => {
  const storage = new AsyncLocalStorage<string>();
  const resource = storage.run("inside", () => new AsyncResource("test-resource"));

  storage.enterWith("outside");

  expect(resource.runInAsyncScope(() => storage.getStore())).toBe("inside");
  expect(storage.getStore()).toBe("outside");
});

test("AsyncResource binds callbacks to the current context", () => {
  const storage = new AsyncLocalStorage<string>();
  const bound = storage.run("inside", () =>
    AsyncResource.bind(() => storage.getStore(), "test-resource"),
  );

  storage.enterWith("outside");

  expect(bound()).toBe("inside");
  expect(storage.getStore()).toBe("outside");
});

test("exposes async_hooks compatibility noops", () => {
  const hook = createHook();

  expect(hook.enable()).toBe(hook);
  expect(hook.disable()).toBe(hook);
  expect(executionAsyncId()).toBe(0);
  expect(triggerAsyncId()).toBe(0);
  expect(executionAsyncResource()).toEqual({});
});
