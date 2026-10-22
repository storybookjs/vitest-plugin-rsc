import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { Registrations } from "./registrations.ts";

type Timer = (callback: unknown, delay?: number) => number;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Long enough for a message that a port would deliver.
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 10));

test("clears the timeouts and intervals of its runner as it is released", () => {
  vi.useFakeTimers();
  const registrations = new Registrations();
  const timeout = vi.fn();
  const interval = vi.fn();
  registrations.setTimeout!(timeout, 100);
  registrations.setInterval!(interval, 50);
  vi.advanceTimersByTime(60);
  expect(interval).toHaveBeenCalledOnce();

  registrations.release();
  vi.advanceTimersByTime(1000);

  expect(timeout).not.toHaveBeenCalled();
  expect(interval).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test("makes no timer once released, as a page that is gone runs none", () => {
  vi.useFakeTimers();
  const registrations = new Registrations();
  registrations.release();
  const later = vi.fn();

  expect(registrations.setTimeout!(later, 0)).toBe(0);
  vi.runAllTimers();

  expect(later).not.toHaveBeenCalled();
  expect(registrations.closed).toBe(true);
});

test("gives the globals as a module reads them, also the fake ones of a test, and none the browser lacks", () => {
  const registrations = new Registrations();
  onTestFinished(() => registrations.release());
  // Read once its page loaded, like React DOM's: the real timer.
  const kept = registrations.setTimeout!;
  vi.useFakeTimers();
  const fired = vi.fn();
  const faked = vi.fn();
  kept(fired, 0);
  // Read as it is called: the fake one.
  registrations.setTimeout!(faked, 1000);

  vi.advanceTimersByTime(1000);

  expect(faked).toHaveBeenCalledOnce();
  expect(fired).not.toHaveBeenCalled();
  expect(registrations.setTimeout).not.toBe(kept);
  // Node.js has no animation frames.
  expect(registrations.requestAnimationFrame).toBeUndefined();
});

test("gives the same function for the same global, as a module that reads it twice expects", () => {
  const registrations = new Registrations();
  onTestFinished(() => registrations.release());
  expect(registrations.setTimeout).toBe(registrations.setTimeout);
  expect(registrations.clearTimeout).toBe(registrations.clearTimeout);
  expect(registrations.MessageChannel).toBe(registrations.MessageChannel);
  expect(registrations.addEventListener).toBe(registrations.addEventListener);
});

test("clears a timer of its own, and one it did not make, as the browser does", () => {
  vi.useFakeTimers();
  const registrations = new Registrations();
  onTestFinished(() => registrations.release());
  const own = vi.fn();
  const browsers = vi.fn();
  const ownId = registrations.setTimeout!(own, 10);
  const browsersId = setTimeout(browsers, 10) as unknown as number;

  registrations.clearTimeout!(ownId);
  registrations.clearInterval!(browsersId);
  vi.advanceTimersByTime(10);

  expect(own).not.toHaveBeenCalled();
  expect(browsers).not.toHaveBeenCalled();
});

test("cancels an interval that fires after the release, as it can when a test stubbed the request and not its cancel", () => {
  const intervals = new Map<number, () => void>();
  let ids = 0;
  const cleared: number[] = [];
  vi.stubGlobal("setInterval", (callback: () => void) => (intervals.set(++ids, callback), ids));
  vi.stubGlobal("clearInterval", (id: number) => {
    cleared.push(id);
    intervals.delete(id);
  });
  const registrations = new Registrations();
  const tick = vi.fn();
  const id = registrations.setInterval!(tick);
  // The browser's `clearInterval`, which knows nothing of the stub's id.
  vi.stubGlobal("clearInterval", () => {});

  registrations.release();
  // The stub fires it once more.
  intervals.get(id)?.();

  expect(tick).not.toHaveBeenCalled();
  expect(cleared).toEqual([id]);
  expect(intervals.size).toBe(0);
});

test("makes a timer of a string, which a browser evaluates, and clears it", () => {
  // A browser's, which takes a string. Node's does not.
  const timers = new Map<number, unknown>();
  let ids = 0;
  vi.stubGlobal("setTimeout", (code: unknown) => (timers.set(++ids, code), ids));
  vi.stubGlobal("clearTimeout", (id: number) => timers.delete(id));
  const registrations = new Registrations();
  const id = registrations.setTimeout!("globalThis.__ran = true", 10);
  expect(timers.get(id)).toBe("globalThis.__ran = true");

  registrations.release();

  expect(timers.size).toBe(0);
});

test("calls a global without the object of the registrations, which a browser would refuse as its receiver", () => {
  const timer = vi.fn(function (this: unknown) {
    return 1;
  });
  vi.stubGlobal("requestIdleCallback", timer);
  vi.stubGlobal("cancelIdleCallback", () => {});
  const registrations = new Registrations();
  onTestFinished(() => registrations.release());

  (registrations.requestIdleCallback as Timer)(() => {});

  expect(timer.mock.contexts).toEqual([undefined]);
});

test("calls a callback with the receiver that the browser calls it with", () => {
  const receiver = {};
  const timer = (callback: (this: unknown) => void) => (callback.call(receiver), 1);
  vi.stubGlobal("requestIdleCallback", timer);
  vi.stubGlobal("cancelIdleCallback", () => {});
  vi.stubGlobal("setInterval", timer);
  const registrations = new Registrations();
  onTestFinished(() => registrations.release());
  const callback = vi.fn();

  (registrations.requestIdleCallback as Timer)(callback);
  (registrations.setInterval as Timer)(callback);

  expect(callback.mock.contexts).toEqual([receiver, receiver]);
});

test("runs a frame that a stub of a test runs right away, and keeps no record of it", () => {
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => (callback(), 7));
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const registrations = new Registrations();
  const frame = vi.fn();

  expect(registrations.requestAnimationFrame!(frame)).toBe(7);
  registrations.release();

  expect(frame).toHaveBeenCalledOnce();
  expect(cancel).not.toHaveBeenCalled();
});

test("cancels the animation frames and idle callbacks of its runner", () => {
  const frames = new Map<number, () => void>();
  let ids = 0;
  const request = (callback: () => void) => (frames.set(++ids, callback), ids);
  const cancel = (id: number) => frames.delete(id);
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.stubGlobal("requestIdleCallback", request);
  vi.stubGlobal("cancelIdleCallback", cancel);
  const registrations = new Registrations();
  registrations.requestAnimationFrame!(() => {});
  registrations.requestIdleCallback!(() => {});
  expect(frames.size).toBe(2);

  registrations.release();

  expect(frames.size).toBe(0);
});

test("writes the global, as a polyfill of a module does", () => {
  onTestFinished(() => {
    delete (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback;
  });
  const polyfill = () => 1;

  new Registrations().requestIdleCallback = polyfill;

  expect((globalThis as { requestIdleCallback?: unknown }).requestIdleCallback).toBe(polyfill);
});

test("closes the ports of the message channels of its runner, which a scheduler leaves open", async () => {
  const registrations = new Registrations();
  const { port1, port2 } = new registrations.MessageChannel!();
  const heard = vi.fn();
  port1.onmessage = heard;
  port2.postMessage("while the page is open");
  await vi.waitFor(() => expect(heard).toHaveBeenCalledOnce());

  registrations.release();
  port2.postMessage("after the page is left");
  await nextTask();

  expect(heard).toHaveBeenCalledOnce();
});

test("makes a message channel of the browser's, of the class that is there when it is made", () => {
  const registrations = new Registrations();
  onTestFinished(() => registrations.release());
  const channel = new registrations.MessageChannel!();
  channel.port1.close();

  expect(channel).toBeInstanceOf(MessageChannel);
  // Another class of the browser's, like a test's that records channels.
  const Recorded = class extends MessageChannel {};
  vi.stubGlobal("MessageChannel", Recorded);
  const recorded = new registrations.MessageChannel!();
  recorded.port1.close();
  expect(recorded).toBeInstanceOf(Recorded);
});

test("disconnects the performance observers of its runner, which next/image never does", () => {
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
  const registrations = new Registrations();
  const observer = new registrations.PerformanceObserver!(() => {});
  observer.observe({ type: "largest-contentful-paint", buffered: true });

  registrations.release();
  // What its page asks for once it is gone, it does not observe.
  new registrations.PerformanceObserver!(() => {}).observe({ type: "paint" });

  expect(calls).toEqual(["observe", "disconnect"]);
});

test("removes the listeners of its runner from window and document, and keeps the others", () => {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", new EventTarget());
  const registrations = new Registrations();
  const others = vi.fn();
  window.addEventListener("pagehide", others);
  const pages = vi.fn();
  registrations.addEventListener("pagehide", pages);
  registrations.documentAddEventListener("visibilitychange", pages, { capture: true });
  const removed = vi.fn();
  registrations.addEventListener("pageshow", removed);
  registrations.removeEventListener("pageshow", removed);

  registrations.release();
  window.dispatchEvent(new Event("pagehide"));
  document.dispatchEvent(new Event("visibilitychange"));
  registrations.addEventListener("pagehide", pages);
  window.dispatchEvent(new Event("pagehide"));

  expect(pages).not.toHaveBeenCalled();
  expect(others).toHaveBeenCalledTimes(2);
  window.removeEventListener("pagehide", others);
});

test("removes the listener of a type and a capture, as the browser does, not another's", () => {
  vi.stubGlobal("window", new EventTarget());
  const registrations = new Registrations();
  const listener = vi.fn();
  // An object: Node's `removeEventListener()` reads no capture off a boolean.
  registrations.addEventListener("pagehide", listener, { capture: true });
  // Another registration, in the browser's eyes.
  registrations.removeEventListener("pagehide", listener);
  window.dispatchEvent(new Event("pagehide"));
  expect(listener).toHaveBeenCalledOnce();

  registrations.release();
  window.dispatchEvent(new Event("pagehide"));

  expect(listener).toHaveBeenCalledOnce();
});

test("writes a listener method of the target, as a module's write of it does", () => {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", new EventTarget());
  const registrations = new Registrations();
  const add = vi.fn();
  const remove = vi.fn();

  registrations.addEventListener = add;
  registrations.documentRemoveEventListener = remove;

  expect(window.addEventListener).toBe(add);
  expect(document.removeEventListener).toBe(remove);
  expect(registrations.addEventListener).not.toBe(add);
});

test("releases every one of them, also after one that throws, which it rethrows", () => {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "PerformanceObserver",
    class {
      observe() {}
      disconnect() {
        throw new Error("disconnected twice");
      }
    },
  );
  const registrations = new Registrations();
  new registrations.PerformanceObserver!(() => {}).observe({ type: "paint" });
  const listener = vi.fn();
  registrations.addEventListener("pagehide", listener);

  expect(() => registrations.release()).toThrow("disconnected twice");
  window.dispatchEvent(new Event("pagehide"));

  expect(listener).not.toHaveBeenCalled();
  // Once.
  expect(() => registrations.release()).not.toThrow();
});
