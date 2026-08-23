import { beforeEach, expect, test, vi } from "vitest";

const stub = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    calls.push(args);
    return Promise.resolve(["", {}, null, null, null] as const);
  };

  return {
    calls,
    fn,
    setLength(length: number) {
      // Function.length is `configurable: true` in ES2015+, which lets one
      // stub simulate every Next minor without redefining or re-importing
      // the SUT per test.
      Object.defineProperty(fn, "length", { value: length, configurable: true });
    },
  };
});

vi.mock(
  "next/dist/server/app-render/create-flight-router-state-from-loader-tree.js",
  () => ({ createFlightRouterStateFromLoaderTree: stub.fn }),
);

const { buildFlightRouterStateWithNext } = await import("./flight-router-state.ts");

beforeEach(() => {
  stub.calls.length = 0;
});

test("dispatches Next 16.0.x/16.1.x with the 3-argument signature", async () => {
  stub.setLength(3);

  await buildFlightRouterStateWithNext("/notes/[id]", "/notes/1", "?a=1");

  expect(stub.calls).toHaveLength(1);
  const args = stub.calls[0]!;
  expect(args).toHaveLength(3);
  expect(Array.isArray(args[0])).toBe(true);
  expect(typeof args[1]).toBe("function");
  expect(args[2]).toEqual({ a: "1" });
});

test("dispatches Next 16.2.x with the 4-argument signature and a null hint tree", async () => {
  stub.setLength(4);

  await buildFlightRouterStateWithNext("/notes/[id]", "/notes/1", "");

  const args = stub.calls[0]!;
  expect(args).toHaveLength(4);
  expect(Array.isArray(args[0])).toBe(true);
  expect(args[1]).toBeNull();
  expect(typeof args[2]).toBe("function");
  expect(args[3]).toEqual({});
});

test("dispatches Next 16.3 canary with the 8-argument signature and false prerender switches", async () => {
  stub.setLength(8);

  await buildFlightRouterStateWithNext("/notes/[id]", "/notes/1", "");

  const args = stub.calls[0]!;
  expect(args).toHaveLength(8);
  expect(args[1]).toBeNull();
  expect(args.slice(2, 6)).toEqual([false, false, false, false]);
  expect(typeof args[6]).toBe("function");
  expect(args[7]).toEqual({});
});

test("dispatches Next 16.3.x with the 9-argument signature and an extra false positional", async () => {
  stub.setLength(9);

  await buildFlightRouterStateWithNext("/notes/[id]", "/notes/1", "");

  const args = stub.calls[0]!;
  expect(args).toHaveLength(9);
  expect(args[1]).toBeNull();
  expect(args.slice(2, 7)).toEqual([false, false, false, false, false]);
  expect(typeof args[7]).toBe("function");
  expect(args[8]).toEqual({});
});
