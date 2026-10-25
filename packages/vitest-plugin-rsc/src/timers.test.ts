import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { runnerTimers } from "./timers.ts";

type Timer = (callback: () => void, delay?: number) => number;

afterEach(() => {
  vi.useRealTimers();
});

test("gives the globals as a module reads them, also the fake ones of a test, and none the browser lacks", () => {
  const timers = runnerTimers(() => false);
  const setTimeout = timers.setTimeout as Timer;
  vi.useFakeTimers();
  const fired: string[] = [];
  (timers.setTimeout as Timer)(() => fired.push("fake"), 10);
  vi.advanceTimersByTime(10);
  expect(fired).toEqual(["fake"]);
  expect(timers.setTimeout).not.toBe(setTimeout);
  // Node.js has no animation frames.
  expect(timers.requestAnimationFrame).toBeUndefined();
});

test("calls a global without the object of the timers, which a browser would refuse as its receiver", () => {
  const timer = vi.fn(function (this: unknown) {
    return 1;
  });
  vi.stubGlobal("requestIdleCallback", timer);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  (runnerTimers(() => false).requestIdleCallback as Timer)(() => {});
  expect(timer.mock.contexts).toEqual([undefined]);
});

test("calls a callback with the receiver that the timer calls it with", () => {
  const receiver = {};
  const timer = (callback: (this: unknown) => void) => (callback.call(receiver), 1);
  vi.stubGlobal("requestIdleCallback", timer);
  vi.stubGlobal("setInterval", timer);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  const timers = runnerTimers(() => false);
  const callback = vi.fn();
  (timers.requestIdleCallback as Timer)(callback);
  (timers.setInterval as Timer)(callback);
  expect(callback.mock.contexts).toEqual([receiver, receiver]);
});

test("writes the global, as a polyfill of a module does", () => {
  onTestFinished(() => {
    delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
  });
  const polyfill = () => 1;
  runnerTimers(() => false).requestIdleCallback = polyfill;
  expect((globalThis as { requestIdleCallback?: unknown }).requestIdleCallback).toBe(polyfill);
});

test("drops an immediate of Node.js once the runner is closed, as a page in a worker of Node.js has", async () => {
  let closed = false;
  const timers = runnerTimers(() => closed);
  const fired: string[] = [];
  const setImmediate = timers.setImmediate as (callback: () => void) => unknown;
  setImmediate(() => fired.push("open"));
  closed = true;
  setImmediate(() => fired.push("closed"));
  await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
  expect(fired).toEqual([]);
});

test("calls nothing once the runner is closed, as a browser drops the timers of a page that is left", () => {
  vi.useFakeTimers();
  let closed = false;
  const timers = runnerTimers(() => closed);
  const setTimeout = timers.setTimeout as Timer;
  const setInterval = timers.setInterval as Timer;
  const fired: string[] = [];
  setTimeout(() => fired.push("timeout"), 10);
  setInterval(() => fired.push("interval"), 10);
  vi.advanceTimersByTime(10);
  expect(fired).toEqual(["timeout", "interval"]);

  setTimeout(() => fired.push("late timeout"), 10);
  closed = true;
  vi.advanceTimersByTime(100);
  expect(fired).toEqual(["timeout", "interval"]);
  // The interval is cleared.
  expect(vi.getTimerCount()).toBe(0);
});

test("gives the same timer for the same global, as a module that reads it twice expects", () => {
  const timers = runnerTimers(() => false);
  const setTimeout = timers.setTimeout;
  expect(timers.setTimeout).toBe(setTimeout);
  vi.useFakeTimers();
  // Another global, another timer.
  expect(timers.setTimeout).not.toBe(setTimeout);
});

test("gives each global the timer of its name, also one that is the function of another", () => {
  const callbacks: (() => void)[] = [];
  const timer = (callback: () => void) => callbacks.push(callback);
  const cleared: unknown[] = [];
  vi.stubGlobal("setTimeout", timer);
  vi.stubGlobal("setInterval", timer);
  vi.stubGlobal("clearInterval", (id: unknown) => cleared.push(id));
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  const timers = runnerTimers(() => true);
  (timers.setTimeout as Timer)(() => {});
  (timers.setInterval as Timer)(() => {});
  for (const callback of callbacks) callback();
  // Only the interval is cleared.
  expect(cleared).toEqual([2]);
});
