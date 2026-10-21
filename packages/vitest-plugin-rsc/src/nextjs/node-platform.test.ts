import { expect, test } from "vitest";
import { createNodePlatform } from "./node-platform.ts";

// A stand-in, as a module: its code evaluated here, with a `registry` of the
// test's own for what it calls of the page.
const registryGlobal = "__node_platform_test_registry__";
(globalThis as Record<string, unknown>)[registryGlobal] = {
  setImmediate: (callback: () => void) => setTimeout(callback, 0),
  clearImmediate: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
};
const platform = createNodePlatform(`globalThis.${registryGlobal}`, "\0bridge/");
const load = (name: string): Promise<Record<string, any>> =>
  import(`data:text/javascript,${encodeURIComponent(platform.load(name)!)}`);

test("`timers/promises` waits with the page's timers, and takes a signal", async () => {
  const { setTimeout: sleep, scheduler } = await load("node-timers-promises");
  const started = performance.now();
  expect(await sleep(30, "value")).toBe("value");
  expect(performance.now() - started).toBeGreaterThanOrEqual(25);
  await expect(scheduler.wait(1000, { signal: AbortSignal.abort("why") })).rejects.toMatchObject({
    name: "AbortError",
    code: "ABORT_ERR",
    cause: "why",
  });
});

test("`timers/promises`' setInterval keeps ticking while the consumer works, as Node's does", async () => {
  const { setInterval: every } = await load("node-timers-promises");
  const controller = new AbortController();
  const ticks = every(20, "tick", { signal: controller.signal });
  expect((await ticks.next()).value).toBe("tick");
  // The consumer is busy for several intervals: those ticks come at once.
  await new Promise((resolve) => setTimeout(resolve, 70));
  const started = performance.now();
  await ticks.next();
  await ticks.next();
  expect(performance.now() - started).toBeLessThan(10);
  controller.abort();
  await expect(ticks.next()).rejects.toMatchObject({ name: "AbortError" });
});

test("`timers/promises`' setInterval stops when the consumer is done with it", async () => {
  const { setInterval: every } = await load("node-timers-promises");
  const ticks = every(5, "tick");
  await ticks.next();
  expect(await ticks.return()).toEqual({ done: true, value: undefined });
  // No tick keeps the process alive: the timer is cleared.
  expect((await ticks.next()).done).toBe(true);
});
