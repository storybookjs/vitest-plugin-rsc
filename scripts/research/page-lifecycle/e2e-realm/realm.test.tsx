// Experiment H: what a page would cost in a realm of its own. Needs
// compile-per-page.patch applied to the plugin: with `__plmFresh` set, a
// page compiles all of its modules anew, as an iframe's realm would.
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { test } from "vitest";
import { cdp } from "vitest/browser";

const scope = globalThis as { __plmFresh?: number };

async function usedMB() {
  for (let round = 0; round < 3; round++) await cdp().send("HeapProfiler.collectGarbage");
  const { usedSize } = (await cdp().send("Runtime.getHeapUsage")) as { usedSize: number };
  return Number((usedSize / 2 ** 20).toFixed(2));
}

async function pages(count: number, fresh: boolean) {
  const times: number[] = [];
  for (let index = 0; index < count; index++) {
    scope.__plmFresh = fresh ? index + 1 + Math.random() : undefined;
    const started = performance.now();
    await renderServer({ url: "/" });
    times.push(performance.now() - started);
  }
  scope.__plmFresh = undefined;
  times.sort((a, b) => a - b);
  return {
    median: Math.round(times[count >> 1]!),
    p90: Math.round(times[Math.floor(count * 0.9)]!),
  };
}

test("a page that compiles its modules anew", async () => {
  await pages(10, false);
  for (let round = 0; round < 2; round++) {
    const shared = await pages(30, false);
    const fresh = await pages(30, true);
    console.log(`PLM ${JSON.stringify({ round, shared, fresh })}`);
  }
  await cleanup();
});

test("a same-origin iframe, made and removed", async () => {
  const before = await usedMB();
  const times: number[] = [];
  for (let index = 0; index < 100; index++) {
    const started = performance.now();
    const frame = document.createElement("iframe");
    document.body.append(frame);
    // A realm with its globals, as a page would get.
    void frame.contentWindow!.document.body;
    times.push(performance.now() - started);
    frame.remove();
  }
  times.sort((a, b) => a - b);
  const after = await usedMB();
  console.log(
    `PLM ${JSON.stringify({ iframe: { median: times[50], p90: times[90] }, before, after })}`,
  );
});
