import { expect, test } from "vitest";
import { getCurrentUser, userAsyncStorage } from "./user-storage";

const startTogether = createBarrier(2);
const firstEntered = deferred<void>();
const secondEntered = deferred<void>();

test.concurrent("keeps the first AsyncLocalStorage run isolated across awaits", async () => {
  await startTogether();

  await userAsyncStorage.run(
    {
      user: {
        name: "Ada Lovelace",
        role: "admin",
      },
    },
    async () => {
      expect(getCurrentUser().name).toBe("Ada Lovelace");
      firstEntered.resolve();
      await secondEntered.promise;
      await Promise.resolve();
      expect(getCurrentUser()).toEqual({
        name: "Ada Lovelace",
        role: "admin",
      });
    },
  );
});

test.concurrent("keeps the second AsyncLocalStorage run isolated across awaits", async () => {
  await startTogether();
  await firstEntered.promise;

  await userAsyncStorage.run(
    {
      user: {
        name: "Grace Hopper",
        role: "maintainer",
      },
    },
    async () => {
      expect(getCurrentUser().name).toBe("Grace Hopper");
      secondEntered.resolve();
      await Promise.resolve();
      expect(getCurrentUser()).toEqual({
        name: "Grace Hopper",
        role: "maintainer",
      });
    },
  );
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolve_) => {
    resolve = resolve_;
  });

  return { promise, resolve };
}

function createBarrier(count: number) {
  let waiting = 0;
  const ready = deferred<void>();

  return () => {
    waiting++;
    if (waiting === count) {
      ready.resolve();
    }
    return ready.promise;
  };
}
