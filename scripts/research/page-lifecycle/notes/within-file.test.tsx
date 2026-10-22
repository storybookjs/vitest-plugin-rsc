// Experiment C: the notes demo, a realistic app, signed in on /notes with
// three notes. Prints one `PLM {...}` line per measurement.
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { inject, test } from "vitest";
import { cdp, page } from "vitest/browser";
import { seedNotes } from "../../../../playground/nextjs-notes-demo/.storybook/sample-notes.ts";
import { signedInAs, testUser } from "../../../../playground/nextjs-notes-demo/test/auth.ts";

declare module "vitest" {
  interface ProvidedContext {
    leak: boolean;
    pages: number;
  }
}

const pages = inject("pages");
const aliveOf = (refs: WeakRef<object>[]) => refs.filter((ref) => ref.deref()).length;

async function measure(scenario: string, opened: number, left?: WeakRef<object>[]) {
  const session = cdp();
  for (let round = 0; round < 3; round++) {
    await session.send("HeapProfiler.collectGarbage");
  }
  const alive = left && aliveOf(left);
  const heap = (await session.send("Runtime.getHeapUsage")) as { usedSize: number };
  const dom = (await session.send("Memory.getDOMCounters" as never)) as {
    documents: number;
    nodes: number;
    jsEventListeners: number;
  };
  const line = {
    scenario,
    opened,
    usedMB: Number((heap.usedSize / 2 ** 20).toFixed(2)),
    documents: dom.documents,
    nodes: dom.nodes,
    listeners: dom.jsEventListeners,
    alive,
  };
  console.log(`PLM ${JSON.stringify(line)}`);
}

const modulesOfPage = () =>
  new WeakRef((globalThis as { __viteRscCallServer?: object }).__viteRscCallServer!);

async function hoverOutside() {
  const button = document.createElement("button");
  button.textContent = "Outside";
  document.body.append(button);
  await page.elementLocator(button).hover();
  button.remove();
}

async function run(scenario: string, leak: boolean) {
  const left: WeakRef<object>[] = [];
  const listeners: (() => void)[] = [];
  // A new browser context: before signing in, which sets its cookie.
  await cleanup();
  await hoverOutside();
  await measure(scenario, 0);
  await signedInAs();
  await seedNotes(testUser.id, 3);
  const started = performance.now();
  for (let index = 1; index <= pages; index++) {
    await renderServer({ url: "/notes" });
    await page.getByRole("heading", { name: "Notes" }).hover({ timeout: 10_000 });
    left.push(modulesOfPage());
    if (leak) {
      const ofPage = (globalThis as { __viteRscCallServer?: object }).__viteRscCallServer;
      const listener = () => void ofPage;
      window.addEventListener("resize", listener);
      listeners.push(listener);
    }
    if (index % 10 === 0) await measure(scenario, index, left);
  }
  const msPerPage = Math.round((performance.now() - started) / pages);
  console.log(`PLM ${JSON.stringify({ scenario, msPerPage })}`);
  await cleanup();
  await hoverOutside();
  await measure(`${scenario}:after-cleanup`, pages, left);
  for (const listener of listeners) window.removeEventListener("resize", listener);
  listeners.length = 0;
  if (leak) await measure(`${scenario}:after-removing-listeners`, pages, left);
}

test("C1 /notes again and again", async () => {
  await run("C1-notes", false);
});

test("C2 /notes, the app leaks every page", async () => {
  await run("C2-notes-leak", true);
});
