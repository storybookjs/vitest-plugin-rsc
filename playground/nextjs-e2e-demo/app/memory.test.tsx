import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { cdp, page } from "vitest/browser";
import { Counter } from "./components/counter.tsx";
import { HelpDialog } from "./components/help-dialog.tsx";
import { Shortcuts } from "./components/shortcuts.tsx";

// Every `renderServer()` is a page load, in a tab that stays. What a page
// leaves on the tab would keep it in memory, with all of its modules: so the
// plugin takes back what React and Next added, and only that.

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  // React reports a hydration mismatch here, and Next a failed render.
  expect(consoleError.mock.calls).toEqual([]);
});

// A function of the modules of the page that is open now, or of the node:
// it is collected when they are.
const modulesOfPage = () =>
  new WeakRef((globalThis as { __viteRscCallServer?: object }).__viteRscCallServer!);

// Passes once the tab has let go of what `modules` refers to: after the tasks
// that the page had queued have run. A full collection of a tab that has run
// many tests takes a while on a slow machine, like the runners of CI.
const collected = { timeout: 15_000 };

async function expectCollected(modules: WeakRef<object>): Promise<void> {
  await expect
    .poll(
      async () => {
        await cdp().send("HeapProfiler.collectGarbage");
        // Not the object itself: the assertion would keep it.
        return modules.deref() === undefined;
      },
      { timeout: 12_000, interval: 100 },
    )
    .toBe(true);
}

test("lets go of a page that the test has left, with all of its modules", collected, async () => {
  await renderServer({ url: "/" });
  const modules = modulesOfPage();

  await renderServer({ url: "/" });

  await expectCollected(modules);
});

test("lets go of the last page once the test has cleaned up", collected, async () => {
  await renderServer({ url: "/" });
  const modules = modulesOfPage();

  // No page after it, whose globals take the place of this one's.
  await cleanup();

  await expectCollected(modules);
});

test("lets go of a page that rendered a portal in the body", collected, async () => {
  await renderServer({ url: "/help" });
  // React adds its listeners to where a portal renders: the body.
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("dialog", { name: "Help" }).getByRole("button", { name: "Close" }).click();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  const modules = modulesOfPage();

  await renderServer({ url: "/" });
  // The browser keeps the element that was clicked last, and with it its
  // page, until the pointer is somewhere else.
  await page.getByRole("heading", { name: "Home" }).hover();

  await expectCollected(modules);
});

test("lets go of a node that rendered a portal in the body", collected, async () => {
  // What the test has in the body stays there for the node.
  const mine = document.body.appendChild(document.createElement("aside"));
  await renderServer(<HelpDialog />);
  // Not the elements themselves: the assertion would keep them.
  expect(mine.parentElement === document.body).toBe(true);
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("dialog", { name: "Help" }).getByRole("button", { name: "Close" }).click();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  const modules = modulesOfPage();

  await renderServer({ url: "/" });
  await page.getByRole("heading", { name: "Home" }).hover();

  await expectCollected(modules);
  await cleanup();
  expect(mine.parentElement).toBe(document.body);
  mine.remove();
});

test(
  "lets go of a node that the test has left, also in a container of the test's",
  collected,
  async () => {
    // The test keeps this container, and React adds its listeners to it, not
    // to the document.
    const container = document.body.appendChild(document.createElement("section"));
    await renderServer(<Counter />, { container });
    const modules = modulesOfPage();

    await renderServer(<Counter />);

    await expectCollected(modules);
    container.remove();
  },
);

test("removes the listeners that React added to the document", async () => {
  const added = vi.spyOn(document, "addEventListener");
  const removed = vi.spyOn(document, "removeEventListener");

  const { unmount } = await renderServer({ url: "/" });
  // One for every event React knows.
  expect(added.mock.calls.length).toBeGreaterThan(50);
  await unmount();

  expect(removed.mock.calls).toEqual(expect.arrayContaining(added.mock.calls));
});

test("keeps the listeners that the test adds while a page is open", async () => {
  await renderServer({ url: "/" });
  const listener = vi.fn();
  window.addEventListener("test-event", listener);

  await renderServer({ url: "/" });

  window.dispatchEvent(new Event("test-event"));
  window.removeEventListener("test-event", listener);
  expect(listener).toHaveBeenCalledOnce();
});

test("keeps the listeners that the app's own code adds", async () => {
  const { unmount } = await renderServer(<Shortcuts />);
  await unmount();
  const answer = vi.fn();
  window.addEventListener("shortcuts-answer", answer, { once: true });

  window.dispatchEvent(new Event("shortcuts-ask"));

  expect(answer).toHaveBeenCalledOnce();
});

test("leaves an error that the test handles to the test", async () => {
  const handle = vi.fn((event: ErrorEvent) => event.preventDefault());
  window.addEventListener("error", handle);
  const { unmount } = await renderServer({ url: "/" });
  await unmount();

  reportError(new Error("Handled by the test"));

  window.removeEventListener("error", handle);
  expect(handle).toHaveBeenCalledOnce();
  // Vitest fails the run on an error that the test has no listener for. One
  // that it has a listener for, it logs.
  expect(consoleError).toHaveBeenCalledExactlyOnceWith(
    new Error("Uncaught Error: Handled by the test"),
  );
  consoleError.mockClear();
});
