// Experiment J: what a forced garbage collection costs, once per test file,
// as a leak detector would run it. The notes demo with a page open.
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { test } from "vitest";
import { cdp } from "vitest/browser";
import { seedNotes } from "../../../../playground/nextjs-notes-demo/.storybook/sample-notes.ts";
import { signedInAs, testUser } from "../../../../playground/nextjs-notes-demo/test/auth.ts";

test("a forced collection", async () => {
  await signedInAs();
  await seedNotes(testUser.id, 3);
  for (let index = 0; index < 10; index++) await renderServer({ url: "/notes" });
  const times: number[] = [];
  for (let round = 0; round < 10; round++) {
    const started = performance.now();
    await cdp().send("HeapProfiler.collectGarbage");
    times.push(Math.round(performance.now() - started));
  }
  const { usedSize } = (await cdp().send("Runtime.getHeapUsage")) as { usedSize: number };
  console.log(`PLM ${JSON.stringify({ gcMs: times, usedMB: Math.round(usedSize / 2 ** 20) })}`);
});
