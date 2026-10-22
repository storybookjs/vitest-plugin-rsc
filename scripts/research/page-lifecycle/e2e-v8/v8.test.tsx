// Experiment M: which page stays once Next's and React's globals are gone
// too, and what keeps it: the page that V8 keeps by a shape the tab shares,
// see memory.test.tsx of the e2e demo.
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { test } from "vitest";
import { cdp, commands, page } from "vitest/browser";

const globalsOfNext = [
  "next",
  "nd",
  "_N_E_STYLE_LOAD",
  "__NEXT_HYDRATED",
  "__NEXT_HYDRATED_AT",
  "__NEXT_IMAGE_IMPORTED",
  "__next_set_public_path__",
  "__NEXT_HMR_CB",
  "__nextDevClientId",
  "$RB",
  "$RM",
  "$RR",
  "$RS",
  "$RT",
  "$RV",
  "$RX",
];

const router = () =>
  (window as unknown as { next: { router: { push(href: string): void } } }).next.router;

test("what keeps a page once the globals are gone", async () => {
  const left: WeakRef<object>[] = [];
  for (let index = 0; index < 12; index++) {
    await renderServer({ url: "/" });
    left.push(new WeakRef((globalThis as { __viteRscCallServer?: object }).__viteRscCallServer!));
    router().push("/styles");
    await page.getByRole("heading", { name: "Styles" }).hover();
  }
  await cleanup();
  for (const name of globalsOfNext) Reflect.deleteProperty(window, name);
  const button = document.body.appendChild(document.createElement("button"));
  button.textContent = "Outside";
  await page.elementLocator(button).hover();
  button.remove();
  for (let round = 0; round < 3; round++) await cdp().send("HeapProfiler.collectGarbage");
  const alive = left.filter((ref) => ref.deref()).length;
  console.log(`PLM ${JSON.stringify({ opened: left.length, alive })}`);
  await commands.heapSnapshot("../../scripts/research/page-lifecycle/results/v8.heapsnapshot");
});
