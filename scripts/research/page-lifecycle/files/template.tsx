// Experiment B: the same pages in several test files of one tab, with and
// without `isolate`. `make-files.sh` copies this into b1..b5.test.tsx. With
// `leak`, the app leaks every page, as an effect without a cleanup would.
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterAll, beforeAll, inject, test } from "vitest";
import { cdp, page } from "vitest/browser";

declare module "vitest" {
  interface ProvidedContext {
    leak: boolean;
    pages: number;
  }
}

const file = import.meta.url.split("/").pop()!.split("?")[0];
const pages = inject("pages");
const leak = inject("leak");

async function measure(at: string, extra: object = {}) {
  const session = cdp();
  for (let round = 0; round < 3; round++) {
    await session.send("HeapProfiler.collectGarbage");
  }
  const heap = (await session.send("Runtime.getHeapUsage")) as { usedSize: number };
  const dom = (await session.send("Memory.getDOMCounters" as never)) as {
    documents: number;
    nodes: number;
    jsEventListeners: number;
  };
  const line = {
    file,
    at,
    usedMB: Number((heap.usedSize / 2 ** 20).toFixed(2)),
    documents: dom.documents,
    nodes: dom.nodes,
    listeners: dom.jsEventListeners,
    ...extra,
  };
  console.log(`PLM ${JSON.stringify(line)}`);
}

const fileStarted = performance.now();

beforeAll(async () => {
  await measure("file-start");
});

afterAll(async () => {
  await cleanup();
  await measure("file-end", { fileMs: Math.round(performance.now() - fileStarted) });
});

test(`${pages} pages`, async () => {
  const started = performance.now();
  await renderServer({ url: "/" });
  const firstMs = Math.round(performance.now() - started);
  for (let index = 1; index < pages; index++) {
    await renderServer({ url: "/" });
    if (leak) {
      const ofPage = (globalThis as { __viteRscCallServer?: object }).__viteRscCallServer;
      window.addEventListener("resize", () => void ofPage);
    }
  }
  await page.getByRole("heading", { name: "Home" }).hover();
  const msPerPage = Math.round((performance.now() - started - firstMs) / (pages - 1));
  await measure("pages-done", { firstMs, msPerPage });
});
