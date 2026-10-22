import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { hostScope } from "../runner-scope.ts";
import { PageScope } from "./page-scope.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Long enough for a message that a port would deliver.
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 10));

test("clears the timeouts and intervals of its page as the page is left", () => {
  vi.useFakeTimers();
  const scope = new PageScope();
  const timeout = vi.fn();
  const interval = vi.fn();
  scope.setTimeout!(timeout, 100);
  scope.setInterval!(interval, 50);
  vi.advanceTimersByTime(60);
  expect(interval).toHaveBeenCalledOnce();

  scope.close();
  vi.advanceTimersByTime(1000);

  expect(timeout).not.toHaveBeenCalled();
  expect(interval).toHaveBeenCalledOnce();
});

test("makes no timer once the page is left, as a page that is gone runs none", () => {
  vi.useFakeTimers();
  const scope = new PageScope();
  scope.close();
  const later = vi.fn();

  expect(scope.setTimeout!(later, 0)).toBe(0);
  vi.runAllTimers();

  expect(later).not.toHaveBeenCalled();
});

test("uses the timers of the moment it is called, which a test may have faked", () => {
  const scope = new PageScope();
  onTestFinished(() => scope.close());
  vi.useFakeTimers();
  const fired = vi.fn();
  scope.setTimeout!(fired, 1000);

  vi.advanceTimersByTime(1000);

  expect(fired).toHaveBeenCalledOnce();
});

test("clears a timer of its own, and one it did not make, as the browser does", () => {
  vi.useFakeTimers();
  const scope = new PageScope();
  onTestFinished(() => scope.close());
  const own = vi.fn();
  const browsers = vi.fn();
  const ownId = scope.setTimeout!(own, 10);
  const browsersId = setTimeout(browsers, 10) as unknown as number;

  scope.clearTimeout!(ownId);
  scope.clearInterval!(browsersId);
  vi.advanceTimersByTime(10);

  expect(own).not.toHaveBeenCalled();
  expect(browsers).not.toHaveBeenCalled();
});

test("cancels the animation frames and idle callbacks of its page", () => {
  const frames = new Map<number, () => void>();
  let ids = 0;
  const request = (callback: () => void) => (frames.set(++ids, callback), ids);
  const cancel = (id: number) => frames.delete(id);
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal("requestIdleCallback", request);
  vi.stubGlobal("cancelIdleCallback", cancel);
  const scope = new PageScope();
  scope.requestAnimationFrame!(() => {});
  scope.requestIdleCallback!(() => {});
  expect(frames.size).toBe(2);

  scope.close();

  expect(frames.size).toBe(0);
});

test("has none of what the browser has none of, as `typeof` would find", () => {
  vi.stubGlobal("requestIdleCallback", undefined);
  vi.stubGlobal("PerformanceObserver", undefined);
  const scope = new PageScope();

  expect(scope.requestIdleCallback).toBeUndefined();
  expect(scope.PerformanceObserver).toBeUndefined();
  expect(hostScope.requestIdleCallback).toBeUndefined();
  expect(scope.setTimeout).toBeTypeOf("function");
});

test("closes the ports of the message channels of its page, which a scheduler leaves open", async () => {
  const scope = new PageScope();
  const { port1, port2 } = new scope.MessageChannel!();
  const heard = vi.fn();
  port1.onmessage = heard;
  port2.postMessage("while the page is open");
  await vi.waitFor(() => expect(heard).toHaveBeenCalledOnce());

  scope.close();
  port2.postMessage("after the page is left");
  await nextTask();

  expect(heard).toHaveBeenCalledOnce();
});

test("makes a message channel of the browser's, of the class that is there when it is made", () => {
  const scope = new PageScope();
  onTestFinished(() => scope.close());
  const channel = new scope.MessageChannel!();
  channel.port1.close();

  expect(channel).toBeInstanceOf(MessageChannel);
  // Another class of the browser's, like a test's that records channels.
  const Recorded = class extends MessageChannel {};
  vi.stubGlobal("MessageChannel", Recorded);
  const recorded = new scope.MessageChannel!();
  recorded.port1.close();
  expect(recorded).toBeInstanceOf(Recorded);
});

test("disconnects the performance observers of its page, which next/image never does", () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "PerformanceObserver",
    class {
      observe() {
        calls.push("observe");
      }
      disconnect() {
        calls.push("disconnect");
      }
    },
  );
  const scope = new PageScope();
  const observer = new scope.PerformanceObserver!(() => {});
  observer.observe({ type: "largest-contentful-paint", buffered: true });

  scope.close();
  // What its page asks for once it is gone, it does not observe.
  new scope.PerformanceObserver!(() => {}).observe({ type: "paint" });

  expect(calls).toEqual(["observe", "disconnect"]);
});

test("removes the listeners of its page from window and document, and keeps the others", () => {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", new EventTarget());
  const scope = new PageScope();
  const others = vi.fn();
  window.addEventListener("pagehide", others);
  const pages = vi.fn();
  scope.windowAddEventListener("pagehide", pages);
  scope.documentAddEventListener("visibilitychange", pages, { capture: true });
  const removed = vi.fn();
  scope.windowAddEventListener("pageshow", removed);
  scope.windowRemoveEventListener("pageshow", removed);

  scope.close();
  window.dispatchEvent(new Event("pagehide"));
  document.dispatchEvent(new Event("visibilitychange"));
  scope.windowAddEventListener("pagehide", pages);
  window.dispatchEvent(new Event("pagehide"));

  expect(pages).not.toHaveBeenCalled();
  expect(others).toHaveBeenCalledTimes(2);
  window.removeEventListener("pagehide", others);
});

test("passes on to the browser's own outside a page", () => {
  vi.useFakeTimers();
  const fired = vi.fn();
  hostScope.setTimeout!(fired, 10);
  vi.advanceTimersByTime(10);

  expect(fired).toHaveBeenCalledOnce();
  expect(hostScope.MessageChannel).toBe(MessageChannel);
});
