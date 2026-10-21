import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { globalTimers, pageTimers } from "./timers.ts";

type Timer = (callback: () => void, delay?: number) => number;

afterEach(() => {
  vi.useRealTimers();
});

test("gives the globals as a module reads them, also the fake ones of a test, and none the browser lacks", () => {
  const setTimeout = globalTimers.setTimeout as Timer;
  vi.useFakeTimers();
  const fired: string[] = [];
  (globalTimers.setTimeout as Timer)(() => fired.push("fake"), 10);
  vi.advanceTimersByTime(10);
  expect(fired).toEqual(["fake"]);
  expect(globalTimers.setTimeout).not.toBe(setTimeout);
  // Node.js has no animation frames.
  expect(globalTimers.requestAnimationFrame).toBeUndefined();
});

test("calls a global without the object of the timers, which a browser would refuse as its receiver", () => {
  const timer = vi.fn(function (this: unknown) {
    return 1;
  });
  vi.stubGlobal("requestIdleCallback", timer);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  for (const timers of [globalTimers, pageTimers(() => false)]) {
    (timers.requestIdleCallback as Timer)(() => {});
  }
  expect(timer.mock.contexts).toEqual([undefined, undefined]);
});

test("writes the global, as a polyfill of a module does", () => {
  onTestFinished(() => {
    delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
  });
  const polyfill = () => 1;
  globalTimers.requestIdleCallback = polyfill;
  expect((globalThis as { requestIdleCallback?: unknown }).requestIdleCallback).toBe(polyfill);
});

test("calls nothing of a page once it is left, as a browser drops its timers", () => {
  vi.useFakeTimers();
  let left = false;
  const timers = pageTimers(() => left);
  const setTimeout = timers.setTimeout as Timer;
  const setInterval = timers.setInterval as Timer;
  const fired: string[] = [];
  setTimeout(() => fired.push("timeout"), 10);
  setInterval(() => fired.push("interval"), 10);
  vi.advanceTimersByTime(10);
  expect(fired).toEqual(["timeout", "interval"]);

  setTimeout(() => fired.push("late timeout"), 10);
  left = true;
  vi.advanceTimersByTime(100);
  expect(fired).toEqual(["timeout", "interval"]);
  // The interval is cleared.
  expect(vi.getTimerCount()).toBe(0);
});

test("gives the same timer for the same global, as a module that reads it twice expects", () => {
  expect(globalTimers.setTimeout).toBe(globalTimers.setTimeout);
  const timers = pageTimers(() => false);
  expect(timers.setTimeout).toBe(timers.setTimeout);
  vi.useFakeTimers();
  // Another global, another timer.
  expect(timers.setTimeout).not.toBe(pageTimers(() => false).setTimeout);
});
