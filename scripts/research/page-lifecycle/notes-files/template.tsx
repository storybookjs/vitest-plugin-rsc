// Experiment D: what a test file costs in the notes demo with and without
// `isolate`. `make-files.sh` copies this into n1..n4.test.tsx.
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterAll, beforeAll, inject, test } from "vitest";
import { cdp, page } from "vitest/browser";
import { seedNotes } from "../../../../playground/nextjs-notes-demo/.storybook/sample-notes.ts";
import { signedInAs, testUser } from "../../../../playground/nextjs-notes-demo/test/auth.ts";

declare module "vitest" {
  interface ProvidedContext {
    leak: boolean;
    pages: number;
  }
}

const file = import.meta.url.split("/").pop()!.split("?")[0];
const pages = inject("pages");
const fileStarted = performance.now();

async function measure(at: string, extra: object = {}) {
  const session = cdp();
  for (let round = 0; round < 3; round++) {
    await session.send("HeapProfiler.collectGarbage");
  }
  const heap = (await session.send("Runtime.getHeapUsage")) as { usedSize: number };
  const usedMB = Number((heap.usedSize / 2 ** 20).toFixed(2));
  console.log(`PLM ${JSON.stringify({ file, at, usedMB, ...extra })}`);
}

beforeAll(async () => {
  await measure("file-start", { sinceImportMs: Math.round(performance.now() - fileStarted) });
});

afterAll(async () => {
  await measure("file-end", { fileMs: Math.round(performance.now() - fileStarted) });
});

test(`${pages} pages`, async () => {
  await signedInAs();
  await seedNotes(testUser.id, 3);
  const started = performance.now();
  await renderServer({ url: "/notes" });
  const firstMs = Math.round(performance.now() - started);
  for (let index = 1; index < pages; index++) {
    await renderServer({ url: "/notes" });
  }
  await page.getByRole("heading", { name: "Notes" }).hover({ timeout: 10_000 });
  const msPerPage = Math.round((performance.now() - started - firstMs) / (pages - 1));
  await measure("pages-done", { firstMs, msPerPage });
});
