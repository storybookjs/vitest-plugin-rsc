// Experiment H in the notes demo: see e2e-realm/realm.test.tsx. Needs
// compile-per-page.patch applied to the plugin.
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { test } from "vitest";
import { seedNotes } from "../../../../playground/nextjs-notes-demo/.storybook/sample-notes.ts";
import { signedInAs, testUser } from "../../../../playground/nextjs-notes-demo/test/auth.ts";

const scope = globalThis as { __plmFresh?: number };

async function pages(count: number, fresh: boolean) {
  const times: number[] = [];
  for (let index = 0; index < count; index++) {
    scope.__plmFresh = fresh ? index + 1 + Math.random() : undefined;
    const started = performance.now();
    await renderServer({ url: "/notes" });
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
  await cleanup();
  await signedInAs();
  await seedNotes(testUser.id, 3);
  await pages(5, false);
  for (let round = 0; round < 2; round++) {
    const shared = await pages(20, false);
    const fresh = await pages(20, true);
    console.log(`PLM ${JSON.stringify({ round, shared, fresh })}`);
  }
});
