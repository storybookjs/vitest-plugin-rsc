// Experiment I: what grows with every client navigation to /images, while
// the pages themselves are collected (experiment A5). Two heap snapshots
// for diff.ts, and one for retainers.ts.
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { inject, test } from "vitest";
import { cdp, commands, page } from "vitest/browser";

declare module "vitest" {
  interface ProvidedContext {
    leak: boolean;
    pages: number;
  }
}

const pages = inject("pages");
const router = () =>
  (window as unknown as { next: { router: { push(href: string): void } } }).next.router;

async function hoverOutside() {
  const button = document.createElement("button");
  button.textContent = "Outside";
  document.body.append(button);
  await page.elementLocator(button).hover();
  button.remove();
}

const left: WeakRef<object>[] = [];

async function alive() {
  for (let round = 0; round < 3; round++) await cdp().send("HeapProfiler.collectGarbage");
  return left.filter((ref) => ref.deref()).length;
}

async function open(count: number) {
  for (let index = 0; index < count; index++) {
    await renderServer({ url: "/" });
    left.push(new WeakRef((globalThis as { __viteRscCallServer?: object }).__viteRscCallServer!));
    router().push("/images");
    await page.getByRole("heading", { name: "Images" }).hover();
  }
  await cleanup();
  await hoverOutside();
}

test("what a navigation to /images leaves", async () => {
  const results = "../../scripts/research/page-lifecycle/results";
  await open(10);
  await commands.heapSnapshot(`${results}/img-before.heapsnapshot`);
  await open(pages);
  console.log(`PLM ${JSON.stringify({ opened: left.length, alive: await alive() })}`);
  await commands.heapSnapshot(`${results}/img-after.heapsnapshot`);
});
