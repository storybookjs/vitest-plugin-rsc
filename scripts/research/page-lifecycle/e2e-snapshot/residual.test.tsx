// Experiment G: what the tab keeps of every page beyond the page itself,
// the 17 KB a page of experiment A. Two heap snapshots, `pages` apart, for
// diff.ts to compare.
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { inject, test } from "vitest";
import { commands, page } from "vitest/browser";

declare module "vitest" {
  interface ProvidedContext {
    leak: boolean;
    pages: number;
  }
}

const pages = inject("pages");

async function hoverOutside() {
  const button = document.createElement("button");
  button.textContent = "Outside";
  document.body.append(button);
  await page.elementLocator(button).hover();
  button.remove();
}

async function open(count: number) {
  for (let index = 0; index < count; index++) await renderServer({ url: "/" });
  await cleanup();
  await hoverOutside();
}

test("the residue of a page", async () => {
  const results = "../../scripts/research/page-lifecycle/results";
  await open(20);
  await commands.heapSnapshot(`${results}/residual-before.heapsnapshot`);
  await open(pages);
  await commands.heapSnapshot(`${results}/residual-after.heapsnapshot`);
});
