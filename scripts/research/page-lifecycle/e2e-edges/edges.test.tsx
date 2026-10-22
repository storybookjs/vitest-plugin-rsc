// Experiment K: what still points into a page once it is left. Records the
// listeners on window and document, the timers, the observers and the
// message ports that are made while a page is open, with the module that
// made them, and prints the ones that are still there after `cleanup()`.
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { onTestFinished, test } from "vitest";
import { page } from "vitest/browser";

type Made = { what: string; where: string };

// The first frame of the stack that is not this file's or the plugin's
// recording of listeners.
function where(): string {
  const frames = new Error().stack!.split("\n").slice(2);
  const frame =
    frames.find((line) => !/edges\.test|leftovers\.ts|@vitest|vitest\/dist/.test(line)) ?? "";
  const file = /(?:\/|\()([^/()]+?\.(?:js|ts|tsx|mjs))(?:\?[^:]*)?:(\d+)/.exec(frame);
  return file ? `${file[1]}:${file[2]}` : frame.trim().slice(0, 80);
}

function record() {
  const listeners = new Map<string, Made>();
  const keyOf = (target: string, args: unknown[]) => {
    const [type, listener, options] = args as [string, object, unknown];
    const capture =
      typeof options === "boolean" ? options : !!(options as { capture?: boolean })?.capture;
    return `${target} ${type} ${capture} ${ids.get(listener) ?? ids.set(listener, ids.size).size - 1}`;
  };
  const ids = new WeakMap<object, number>() as WeakMap<object, number> & { size: number };
  let nextId = 0;
  Object.defineProperty(ids, "size", { get: () => nextId++ });
  const restores: (() => void)[] = [];
  for (const [name, target] of [
    ["window", window],
    ["document", document],
  ] as const) {
    const add = target.addEventListener;
    const remove = target.removeEventListener;
    target.addEventListener = function (this: EventTarget, ...args: Parameters<typeof add>) {
      listeners.set(keyOf(name, args), { what: `${name} ${args[0]}`, where: where() });
      return add.apply(this ?? target, args);
    } as typeof add;
    target.removeEventListener = function (this: EventTarget, ...args: Parameters<typeof remove>) {
      listeners.delete(keyOf(name, args));
      return remove.apply(this ?? target, args);
    } as typeof remove;
    restores.push(() => {
      target.addEventListener = add;
      target.removeEventListener = remove;
    });
  }

  const timers = new Map<unknown, Made>();
  const {
    setTimeout: nativeSet,
    clearTimeout: nativeClear,
    setInterval: nativeInterval,
    clearInterval: nativeClearInterval,
  } = globalThis;
  globalThis.setTimeout = ((
    callback: (...args: unknown[]) => void,
    delay?: number,
    ...args: unknown[]
  ) => {
    const made = { what: `setTimeout ${delay ?? 0}ms`, where: where() };
    const id = nativeSet(
      (...a: unknown[]) => {
        timers.delete(id);
        callback(...a);
      },
      delay,
      ...args,
    );
    timers.set(id, made);
    return id;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: unknown) => {
    timers.delete(id);
    nativeClear(id as number);
  }) as typeof clearTimeout;
  globalThis.setInterval = ((callback: () => void, delay?: number) => {
    const id = nativeInterval(callback, delay);
    timers.set(id, { what: `setInterval ${delay ?? 0}ms`, where: where() });
    return id;
  }) as typeof setInterval;
  globalThis.clearInterval = ((id: unknown) => {
    timers.delete(id);
    nativeClearInterval(id as number);
  }) as typeof clearInterval;
  restores.push(() => {
    Object.assign(globalThis, {
      setTimeout: nativeSet,
      clearTimeout: nativeClear,
      setInterval: nativeInterval,
      clearInterval: nativeClearInterval,
    });
  });

  const observers = new Map<PerformanceObserver, Made>();
  const { observe, disconnect } = PerformanceObserver.prototype;
  PerformanceObserver.prototype.observe = function (this: PerformanceObserver, ...args) {
    observers.set(this, { what: `PerformanceObserver ${JSON.stringify(args[0])}`, where: where() });
    return observe.apply(this, args);
  };
  PerformanceObserver.prototype.disconnect = function (this: PerformanceObserver) {
    observers.delete(this);
    return disconnect.apply(this);
  };
  restores.push(() => Object.assign(PerformanceObserver.prototype, { observe, disconnect }));

  const ports = new Map<MessagePort, Made>();
  const Native = globalThis.MessageChannel;
  globalThis.MessageChannel = class extends Native {
    constructor() {
      super();
      const made = { what: "MessageChannel", where: where() };
      ports.set(this.port1, made);
    }
  };
  const close = MessagePort.prototype.close;
  MessagePort.prototype.close = function (this: MessagePort) {
    ports.delete(this);
    return close.apply(this);
  };
  restores.push(() => {
    globalThis.MessageChannel = Native;
    MessagePort.prototype.close = close;
  });

  return {
    left: () => [
      ...listeners.values(),
      ...timers.values(),
      ...observers.values(),
      ...ports.values(),
    ],
    restore: () => restores.reverse().forEach((restore) => restore()),
  };
}

const router = () =>
  (window as unknown as { next: { router: { push(href: string): void } } }).next.router;

async function leaveAndReport(name: string, open: () => Promise<void>) {
  await cleanup();
  const recording = record();
  onTestFinished(() => recording.restore());
  await open();
  await cleanup();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const counts = new Map<string, number>();
  for (const { what, where } of recording.left()) {
    const key = `${what} @ ${where}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  console.log(`PLM ${JSON.stringify({ route: name, left: Object.fromEntries(counts) })}`);
}

test("/", async () => {
  await leaveAndReport("/", async () => {
    await renderServer({ url: "/" });
  });
});

test("/ then a client navigation to /images", async () => {
  await leaveAndReport("/ -> /images", async () => {
    await renderServer({ url: "/" });
    router().push("/images");
    await page.getByRole("heading", { name: "Images" }).hover();
  });
});

test("/ then a client navigation to /styles", async () => {
  await leaveAndReport("/ -> /styles", async () => {
    await renderServer({ url: "/" });
    router().push("/styles");
    await page.getByRole("heading", { name: "Styles" }).hover();
  });
});

test("/settings with next-themes", async () => {
  await leaveAndReport("/settings", async () => {
    await renderServer({ url: "/settings" });
    await page.getByRole("button", { name: "Theme: light" }).click();
    await page.getByRole("button", { name: "Theme: dark" }).hover();
  });
});

test("/help with a portal", async () => {
  await leaveAndReport("/help", async () => {
    await renderServer({ url: "/help" });
    await page.getByRole("button", { name: "Help" }).click();
  });
});
