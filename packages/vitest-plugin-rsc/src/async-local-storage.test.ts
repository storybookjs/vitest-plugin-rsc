import { expect, test } from "vitest";
import { enterAmbientScope, resetAsyncLocalStorage } from "./async-local-storage.ts";
import {
  AsyncLocalStorage,
  AsyncResource,
  createHook,
  executionAsyncId,
  executionAsyncResource,
  triggerAsyncId,
} from "./async-hooks.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolve_) => {
    resolve = resolve_;
  });

  return { promise, resolve };
}

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

test("does not restore stale frames when overlapping runs settle out of order", async () => {
  const storage = new AsyncLocalStorage<string>();
  const first = deferred<string>();
  const second = deferred<string>();

  const firstResult = storage.run("first", () => first.promise);
  const secondResult = storage.run("second", () => second.promise);

  first.resolve("first done");
  await expect(firstResult).resolves.toBe("first done");
  expect(storage.getStore()).toBe("second");

  second.resolve("second done");
  await expect(secondResult).resolves.toBe("second done");
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

test("keeps the outermost store of an ambient scope readable after run() returns", async () => {
  const storage = new AsyncLocalStorage<string>();
  const leaveScope = enterAmbientScope();

  storage.run("request", () => {});
  // What a server does after it entered its request store: more work, from a
  // task that nothing carried the store into.
  await Promise.resolve();
  expect(storage.getStore()).toBe("request");

  expect(storage.run("nested", () => storage.getStore())).toBe("nested");
  expect(storage.getStore()).toBe("request");
  expect(storage.exit(() => storage.getStore())).toBeUndefined();

  leaveScope();
  expect(storage.getStore()).toBeUndefined();
});

test("restores the outer ambient scope when a nested one ends", () => {
  const storage = new AsyncLocalStorage<string>();
  const leaveOuter = enterAmbientScope();
  storage.run("outer request", () => {});

  const leaveInner = enterAmbientScope();
  storage.run("inner request", () => {});
  expect(storage.getStore()).toBe("inner request");

  leaveInner();
  expect(storage.getStore()).toBe("outer request");
  leaveOuter();
  expect(storage.getStore()).toBeUndefined();
});

test("reads the store of the outer scope until the nested one enters its own", () => {
  const storage = new AsyncLocalStorage<string>();
  const leaveOuter = enterAmbientScope();
  storage.run("outer request", () => {});

  const leaveInner = enterAmbientScope();
  expect(storage.getStore()).toBe("outer request");
  storage.run("inner request", () => {});
  expect(storage.getStore()).toBe("inner request");

  leaveInner();
  leaveOuter();
});

test("leaves nothing behind when a nested scope ends after its outer one", () => {
  const storage = new AsyncLocalStorage<string>();
  const leaveOuter = enterAmbientScope();
  storage.run("outer request", () => {});
  const leaveInner = enterAmbientScope();
  storage.run("inner request", () => {});

  leaveOuter();
  expect(storage.getStore()).toBe("inner request");
  leaveInner();
  expect(storage.getStore()).toBeUndefined();

  // The next request does not get the stores of the ones before it.
  const leaveNext = enterAmbientScope();
  expect(storage.getStore()).toBeUndefined();
  leaveNext();
});

test("ends a run inside an ambient scope when its callback returns, not when its promise settles", async () => {
  const storage = new AsyncLocalStorage<string>();
  const leaveScope = enterAmbientScope();
  storage.run("request", () => {});
  const pending = deferred<void>();

  // What Next does for a cached function: a store for a part of the work.
  const result = storage.run("cache", async () => {
    const before = storage.getStore();
    await pending.promise;
    return [before, storage.getStore()];
  });

  // What else the server does in the meantime reads the store of the request.
  expect(storage.getStore()).toBe("request");
  await Promise.resolve();
  expect(storage.getStore()).toBe("request");

  pending.resolve();
  // And so does the callback itself once it has awaited: the known limit.
  await expect(result).resolves.toEqual(["cache", "request"]);
  expect(storage.getStore()).toBe("request");
  leaveScope();
});

test("ends a snapshot and an exit inside an ambient scope when their callback returns", async () => {
  const storage = new AsyncLocalStorage<string>();
  const leaveScope = enterAmbientScope();
  storage.run("request", () => {});
  const runInSnapshot = storage.run("cache", () => AsyncLocalStorage.snapshot());
  const pending = deferred<void>();

  const inSnapshot = runInSnapshot(async () => {
    const before = storage.getStore();
    await pending.promise;
    return [before, storage.getStore()];
  });
  expect(storage.getStore()).toBe("request");
  const exited = storage.exit(async () => {
    const before = storage.getStore();
    await pending.promise;
    return [before, storage.getStore()];
  });
  expect(storage.getStore()).toBe("request");

  pending.resolve();
  await expect(inSnapshot).resolves.toEqual(["cache", "request"]);
  await expect(exited).resolves.toEqual([undefined, "request"]);
  leaveScope();
});

test("has no ambient store outside an ambient scope", () => {
  const storage = new AsyncLocalStorage<string>();

  storage.run("request", () => {});

  expect(storage.getStore()).toBeUndefined();
});
