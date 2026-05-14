import { expect, test } from "vitest";
import { headers } from "next/headers";
import { createNextRequestContext } from "vitest-plugin-rsc/nextjs/request-context";

const startTogether = createBarrier(2);
const firstEntered = deferred<void>();
const secondEntered = deferred<void>();

test.concurrent("keeps the first Next request async storage isolated across awaits", async () => {
  await startTogether();

  const requestContext = await createNextRequestContext({
    url: "/concurrent-first",
    headers: {
      "x-test-request": "first",
      cookie: "flash=first",
    },
  });

  await requestContext.run("render", async () => {
    expect((await headers()).get("x-test-request")).toBe("first");
    firstEntered.resolve();
    await secondEntered.promise;
    await Promise.resolve();
    expect((await headers()).get("x-test-request")).toBe("first");
  });
});

test.concurrent("keeps the second Next request async storage isolated across awaits", async () => {
  await startTogether();
  await firstEntered.promise;

  const requestContext = await createNextRequestContext({
    url: "/concurrent-second",
    headers: {
      "x-test-request": "second",
      cookie: "flash=second",
    },
  });

  await requestContext.run("render", async () => {
    expect((await headers()).get("x-test-request")).toBe("second");
    secondEntered.resolve();
    await Promise.resolve();
    expect((await headers()).get("x-test-request")).toBe("second");
  });
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
