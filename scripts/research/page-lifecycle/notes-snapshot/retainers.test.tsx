// Experiment E: why pages that the app leaked stay after the leak is gone.
// Writes a heap snapshot for retainers.ts to read.
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { inject, test } from "vitest";
import { cdp, commands, page } from "vitest/browser";
import { seedNotes } from "../../../../playground/nextjs-notes-demo/.storybook/sample-notes.ts";
import { signedInAs, testUser } from "../../../../playground/nextjs-notes-demo/test/auth.ts";

declare module "vitest" {
  interface ProvidedContext {
    leak: boolean;
    pages: number;
  }
}

const pages = inject("pages");
const leak = inject("leak");

async function alive(left: WeakRef<object>[]) {
  for (let round = 0; round < 3; round++) {
    await cdp().send("HeapProfiler.collectGarbage");
  }
  return left.filter((ref) => ref.deref()).length;
}

async function hoverOutside() {
  const button = document.createElement("button");
  button.textContent = "Outside";
  document.body.append(button);
  await page.elementLocator(button).hover();
  button.remove();
}

test("what keeps the pages", async () => {
  await cleanup();
  await signedInAs();
  await seedNotes(testUser.id, 3);
  const left: WeakRef<object>[] = [];
  const listeners: (() => void)[] = [];
  for (let index = 0; index < pages; index++) {
    await renderServer({ url: "/notes" });
    await page.getByRole("heading", { name: "Notes" }).hover({ timeout: 10_000 });
    const ofPage = (globalThis as { __viteRscCallServer?: object }).__viteRscCallServer!;
    left.push(new WeakRef(ofPage));
    if (leak) {
      const listener = () => void ofPage;
      window.addEventListener("resize", listener);
      listeners.push(listener);
    }
  }
  await cleanup();
  await hoverOutside();
  for (const listener of listeners) window.removeEventListener("resize", listener);
  listeners.length = 0;
  const kept = await alive(left);
  console.log(`PLM ${JSON.stringify({ leak, pages, kept })}`);
  const file = await commands.heapSnapshot(
    `../../scripts/research/page-lifecycle/results/notes-leak${Number(leak)}.heapsnapshot`,
  );
  console.log(`PLM ${JSON.stringify({ snapshot: file })}`);
});
