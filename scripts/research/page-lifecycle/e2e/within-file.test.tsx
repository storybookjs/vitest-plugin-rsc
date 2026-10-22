// Experiment A: many pages in one test file, in one document. Prints one
// `PLM {...}` line per measurement. See docs/page-lifecycle-risk.md.
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, inject, test } from "vitest";
import { cdp, page } from "vitest/browser";
import { Counter } from "../../../../playground/nextjs-e2e-demo/app/components/counter.tsx";

declare module "vitest" {
  interface ProvidedContext {
    leak: boolean;
    pages: number;
  }
}

const pages = inject("pages");

// After a full garbage collection: what the tab keeps.
async function measure(scenario: string, opened: number, left?: WeakRef<object>[]) {
  const session = cdp();
  for (let round = 0; round < 3; round++) {
    await session.send("HeapProfiler.collectGarbage");
  }
  // After the collection, in a job of its own: `deref()` keeps its target
  // until the end of the job.
  const alive = left && aliveOf(left);
  const heap = (await session.send("Runtime.getHeapUsage")) as {
    usedSize: number;
  };
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
  return line;
}

// A function of the modules of the page that is open: collected with them.
const modulesOfPage = () =>
  new WeakRef((globalThis as { __viteRscCallServer?: object }).__viteRscCallServer!);
const aliveOf = (refs: WeakRef<object>[]) => refs.filter((ref) => ref.deref()).length;

// The pointer keeps the element it is over, and with it its page.
async function hoverOutside() {
  const button = document.createElement("button");
  button.textContent = "Outside";
  document.body.append(button);
  await page.elementLocator(button).hover();
  button.remove();
}

const router = () =>
  (window as unknown as { next: { router: { push(href: string): void } } }).next.router;

afterEach(async () => {
  await cleanup();
});

async function run(scenario: string, open: (index: number) => Promise<void>) {
  const left: WeakRef<object>[] = [];
  await cleanup();
  await hoverOutside();
  await measure(scenario, 0);
  const started = performance.now();
  for (let index = 1; index <= pages; index++) {
    await open(index);
    left.push(modulesOfPage());
    if (index % 10 === 0) {
      await page.getByRole("heading").or(page.getByRole("button")).first().hover();
      await measure(scenario, index, left);
    }
  }
  const msPerPage = (performance.now() - started) / pages;
  await cleanup();
  await hoverOutside();
  const after = await measure(`${scenario}:after-cleanup`, pages, left);
  console.log(`PLM ${JSON.stringify({ scenario, msPerPage: Math.round(msPerPage) })}`);
  return { left, after };
}

test("A1 route / again and again", async () => {
  await run("A1-route", async () => {
    await renderServer({ url: "/" });
  });
});

test("A2 a node again and again", async () => {
  await run("A2-node", async () => {
    await renderServer(<Counter />);
  });
});

test("A3 the app leaks a window listener on every page", async () => {
  const listeners: (() => void)[] = [];
  const { left } = await run("A3-app-leak", async () => {
    await renderServer({ url: "/" });
    // As an effect without a cleanup: a closure of the page's modules.
    const ofPage = (globalThis as { __viteRscCallServer?: object }).__viteRscCallServer;
    const listener = () => void ofPage;
    window.addEventListener("resize", listener);
    listeners.push(listener);
  });
  for (const listener of listeners) window.removeEventListener("resize", listener);
  listeners.length = 0;
  await measure("A3-app-leak:after-removing-listeners", pages, left);
});

test("A4 a client navigation to a route with stylesheets", async () => {
  const { left } = await run("A4-styles", async () => {
    await renderServer({ url: "/" });
    router().push("/styles");
    await page.getByRole("heading", { name: "Styles" }).hover();
  });
  // React's timer of a minute for a stylesheet that it waited for.
  await new Promise((resolve) => setTimeout(resolve, 62_000));
  await measure("A4-styles:after-62s", pages, left);
});

test("A5 a client navigation to a route with a plain <img>", async () => {
  const { left } = await run("A5-img", async () => {
    await renderServer({ url: "/" });
    router().push("/images");
    await page.getByRole("heading", { name: "Images" }).hover();
  });
  await new Promise((resolve) => setTimeout(resolve, 62_000));
  await measure("A5-img:after-62s", pages, left);
});
