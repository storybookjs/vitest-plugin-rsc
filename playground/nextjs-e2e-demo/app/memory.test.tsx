import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, onTestFinished, test, vi, type MockInstance } from "vitest";
import { cdp, page } from "vitest/browser";
import { Counter } from "./components/counter.tsx";
import { HelpDialog } from "./components/help-dialog.tsx";
import { Shortcuts } from "./components/shortcuts.tsx";

// Every `renderServer()` is a page load, in a document that stays. What a page
// leaves behind would keep it in memory, with all of its modules: so the
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

// Every page that a test of this file has left. One of them may stay,
// whichever test left it: since V8 7dcf3d06ea (Chromium 153), a live shape
// keeps every descriptor of its array, also those that only longer shapes
// use. The first page whose objects extend a shape of the tab, like the
// interop object of a CommonJS package, puts its getters there, and they lead
// back to the page: V8 keeps that page for as long as the tab has an object
// of the shape. That is one page per such shape for the tab, not one per
// test, so every test leaves two pages or more: what a page leaves behind
// keeps them all.
const left: WeakRef<object>[] = [];

// Passes once the browser has let go of all pages in `left` but at most one:
// after the tasks that the pages had queued have run. The garbage collection
// is forced through the Chrome DevTools Protocol, which Chromium always has.
async function expectCollected(): Promise<void> {
  await expect
    .poll(
      async () => {
        await cdp().send("HeapProfiler.collectGarbage");
        // Not the objects themselves: the assertion would keep them.
        return left.filter((of) => of.deref() !== undefined).length;
      },
      { timeout: 4000, interval: 100 },
    )
    .toBeLessThanOrEqual(1);
}

// Next's router, as Next's own e2e tests reach it.
const router = () =>
  (window as unknown as { next: { router: { push(href: string): void } } }).next.router;

test("lets go of every page that navigated to a route with stylesheets", async () => {
  // React waits for a stylesheet that has not loaded before it shows a route,
  // with a timer of a minute that it does not clear once it has: that timer
  // would keep the page. So the browser has loaded them already.
  await renderServer({ url: "/styles" });
  // Many pages, and first in the file: whether what a page left on the
  // document keeps it can depend on the shape that the document has at that
  // moment. One page, or a garbage collection before them, can let go of it
  // by luck. One of them may stay all the same: see `left`.
  for (let pages = 0; pages < 12; pages++) {
    await renderServer({ url: "/" });
    // React inserts the stylesheets of the route, keeps them on the document,
    // and listens for them to load.
    router().push("/styles");
    await expect.element(page.getByRole("heading", { name: "Styles" })).toBeInTheDocument();
    left.push(modulesOfPage());
  }

  await renderServer({ url: "/" });
  await page.getByRole("heading", { name: "Home" }).hover();

  await expectCollected();
});

// The properties React DOM keeps on a node, named for the copy of React DOM
// that sets them: the page's.
const reactProperties = (of: object) => Object.keys(of).filter((key) => /^_+react/.test(key));

test("takes back what React DOM kept on the document, and only that", async () => {
  // As a React of the host's would have it. The tab's own React DOM may have
  // set its own already, for an earlier test file.
  const host = { __reactResources$host: {}, _reactListeninghost: true };
  Object.assign(document, host);
  onTestFinished(() => {
    for (const key of Object.keys(host)) Reflect.deleteProperty(document, key);
  });
  const reactTargets = () => [document, document.documentElement, document.head];
  const runner = reactTargets().map(reactProperties);
  const added = vi.spyOn(document, "addEventListener");
  const removed = vi.spyOn(document, "removeEventListener");

  await renderServer({ url: "/" });
  router().push("/styles");
  await expect.element(page.getByRole("heading", { name: "Styles" })).toBeInTheDocument();
  const first = reactTargets().map(reactProperties);
  const listenersOfFirst = added.mock.calls.slice();
  expect(first[0]).toEqual(expect.arrayContaining(Object.keys(host)));
  expect(first[0]!.length).toBeGreaterThan(runner[0]!.length);

  const { unmount } = await renderServer({ url: "/" });
  // The second page's React DOM is another copy, with names of its own.
  reactTargets().forEach((of, index) =>
    expect(reactProperties(of).filter((key) => first[index]!.includes(key))).toEqual(runner[index]),
  );
  expect(removed.mock.calls).toEqual(expect.arrayContaining(listenersOfFirst));
  await unmount();

  expect(reactTargets().map(reactProperties)).toEqual(runner);
});

test("takes back every property that was set on the document while the page was open", async () => {
  // Of no React in particular: what the page set goes with it, whatever its
  // name. What was there before stays.
  const container = document.body.appendChild(document.createElement("section"));
  onTestFinished(() => container.remove());
  const targets = [document, document.documentElement, document.head, container];
  const before = Symbol("before");
  for (const target of targets) Object.assign(target, { fromBefore: true, [before]: true });
  onTestFinished(() => {
    for (const target of targets) {
      Reflect.deleteProperty(target, "fromBefore");
      Reflect.deleteProperty(target, before);
    }
  });

  const { unmount } = await renderServer(<Counter />, { container });
  const during = Symbol("during");
  for (const target of targets) Object.assign(target, { duringPage: {}, [during]: {} });
  await unmount();

  for (const target of targets) {
    expect(Object.hasOwn(target, "duringPage")).toBe(false);
    expect(Object.hasOwn(target, during)).toBe(false);
    expect(Object.hasOwn(target, "fromBefore")).toBe(true);
    expect(Object.hasOwn(target, before)).toBe(true);
  }
});

test("keeps the mark that a host set on the document before its first page, for every page", async () => {
  // A library that marks the document on its first use, as `prepareDocument()`
  // of `@testing-library/user-event` does: a symbol on `document`, and a
  // capture listener of its own.
  const prepared = Symbol("prepared");
  const listeners = new Set<unknown>();
  const prepare = () => {
    if (Object.hasOwn(document, prepared)) return;
    const listener = () => {};
    listeners.add(listener);
    document.addEventListener("focus", listener, { capture: true });
    Object.assign(document, { [prepared]: true });
  };
  const added = vi.spyOn(document, "addEventListener");
  const preparations = () =>
    added.mock.calls.filter(([, listener]) => listeners.has(listener)).length;
  onTestFinished(() => {
    for (const listener of listeners) {
      document.removeEventListener("focus", listener as EventListener, { capture: true });
    }
    Reflect.deleteProperty(document, prepared);
  });

  prepare();
  await renderServer({ url: "/" });
  prepare();
  await renderServer({ url: "/" });
  prepare();
  await cleanup();
  expect(Object.hasOwn(document, prepared)).toBe(true);
  expect(preparations()).toBe(1);

  // Prepared while a page is open, the mark goes with the page, and the next
  // page prepares the document again, with one more listener.
  Reflect.deleteProperty(document, prepared);
  await renderServer({ url: "/" });
  prepare();
  await renderServer({ url: "/" });
  expect(Object.hasOwn(document, prepared)).toBe(false);
  prepare();
  expect(preparations()).toBe(3);
});

test("lets go of a page that the test has left, with all of its modules", async () => {
  for (let pages = 0; pages < 2; pages++) {
    await renderServer({ url: "/" });
    left.push(modulesOfPage());
  }

  await renderServer({ url: "/" });
  // The browser keeps the element that the pointer is over, and with it its
  // page, until the pointer is over another one.
  await page.getByRole("heading", { name: "Home" }).hover();

  await expectCollected();
});

test("lets go of the last page after cleanup(), with no page after it", async () => {
  // A page after another: V8 may keep the first page whose objects extend a
  // shape of the tab, see `left`.
  await renderServer({ url: "/" });
  await renderServer({ url: "/" });
  // The only page that this test asks about, so not one of `left`, which
  // may keep one.
  const last = modulesOfPage();

  await cleanup();
  // The browser keeps the element that the pointer is over, and with it its
  // page, until the pointer is over another one.
  const elsewhere = document.body.appendChild(document.createElement("button"));
  elsewhere.textContent = "Elsewhere";
  onTestFinished(() => elsewhere.remove());
  await page.getByRole("button", { name: "Elsewhere" }).hover();

  await expect
    .poll(
      async () => {
        await cdp().send("HeapProfiler.collectGarbage");
        return last.deref() === undefined;
      },
      { timeout: 4000, interval: 100 },
    )
    .toBe(true);
});

test("lets go of a page that rendered a portal in the body", async () => {
  for (let pages = 0; pages < 2; pages++) {
    await renderServer({ url: "/help" });
    // React adds its listeners to where a portal renders: the body.
    await page.getByRole("button", { name: "Help" }).click();
    await page.getByRole("dialog", { name: "Help" }).getByRole("button", { name: "Close" }).click();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    left.push(modulesOfPage());
  }

  await renderServer({ url: "/" });
  // The browser keeps the element that was clicked last, and with it its
  // page, until the pointer is somewhere else.
  await page.getByRole("heading", { name: "Home" }).hover();

  await expectCollected();
});

test("lets go of a node that rendered a portal in the body", async () => {
  // What the test has in the body stays there for the node.
  const mine = document.body.appendChild(document.createElement("aside"));
  for (let pages = 0; pages < 2; pages++) {
    await renderServer(<HelpDialog />);
    // Not the elements themselves: the assertion would keep them.
    expect(mine.parentElement === document.body).toBe(true);
    await page.getByRole("button", { name: "Help" }).click();
    await page.getByRole("dialog", { name: "Help" }).getByRole("button", { name: "Close" }).click();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    left.push(modulesOfPage());
  }

  await renderServer({ url: "/" });
  await page.getByRole("heading", { name: "Home" }).hover();

  await expectCollected();
  await cleanup();
  expect(mine.parentElement).toBe(document.body);
  mine.remove();
});

test("lets go of a node that the test has left, also in a container of the test's", async () => {
  // The test keeps this container, and React adds its listeners to it, not
  // to the document.
  const container = document.body.appendChild(document.createElement("section"));
  for (let pages = 0; pages < 2; pages++) {
    await renderServer(<Counter />, { container });
    left.push(modulesOfPage());
  }

  await renderServer(<Counter />);
  // The pointer may be over the button of the node that was left.
  await page.getByRole("button", { name: "Count: 0" }).hover();

  await expectCollected();
  // React DOM marked the container as the root of the node's page.
  expect(reactProperties(container)).toEqual([]);
  container.remove();
});

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
