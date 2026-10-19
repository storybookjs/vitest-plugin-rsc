import Link from "next/link";
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, onTestFinished, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { Counter } from "./components/counter.tsx";
import { FavoriteButton } from "./components/favorite-button.tsx";
import { RefreshButton } from "./components/refresh-button.tsx";
import { db } from "./lib/notes.ts";
import { seenByProxy } from "./lib/proxy-log.ts";

type Held = { loading: boolean; loaded: boolean; release: Promise<void> };
// Code that waits while a test holds it: the client code of a widget
// (app/components/slow-widget.tsx) and of the root (app/global-error.tsx),
// and the proxy for a request to /held (proxy.ts).
const held = globalThis as { slowWidget?: Held; globalError?: Held; heldProxy?: Held };

function hold(): [Held, () => void] {
  let release = () => {};
  const holding = {
    loading: false,
    loaded: false,
    release: new Promise<void>((resolve) => (release = resolve)),
  };
  // A test that fails while it holds code leaves nothing waiting.
  onTestFinished(() => release());
  return [holding, release];
}

let consoleError: MockInstance<typeof console.error>;

beforeEach(async () => {
  vi.restoreAllMocks();
  consoleError = vi.spyOn(console, "error");
  // Next's client and the route are loaded once, so that what waits is the held code.
  await renderServer({ url: "/settings" });
});

afterEach(() => {
  // React reports a second root on the document here.
  expect(consoleError.mock.calls).toEqual([]);
  delete held.slowWidget;
  delete held.globalError;
  delete held.heldProxy;
});

test("leaves a page whose client code is still loading once its root is there, which does not start in the next one", async () => {
  const [holding, release] = hold();
  held.slowWidget = holding;
  const left = renderServer({ url: "/slow-start" }).catch((error: unknown) => error);
  // The page hydrates, and waits for the client code of its widget.
  await expect.poll(() => holding.loading, { timeout: 10_000 }).toBe(true);

  await renderServer({ url: "/settings" });
  expect(await left).toMatchObject({ name: "AbortError" });

  // The client code of the page that was left, once it is there, does nothing.
  release();
  await expect.poll(() => holding.loaded).toBe(true);
  await page.getByRole("button", { name: "Use Dutch" }).click();
  await expect.element(page.getByText("Language: nl")).toBeInTheDocument();
  await expect.element(page.getByText("Slow widget")).not.toBeInTheDocument();
});

test("leaves a page before Next has created its root, which creates none in the next one", async () => {
  const [holding, release] = hold();
  held.globalError = holding;
  const left = renderServer({ url: "/settings" }).catch((error: unknown) => error);
  await expect.poll(() => holding.loading, { timeout: 10_000 }).toBe(true);
  // Only the page that is left waits for it.
  delete held.globalError;

  await renderServer({ url: "/settings" });
  expect(await left).toMatchObject({ name: "AbortError" });

  release();
  await expect.poll(() => holding.loaded).toBe(true);
  await page.getByRole("button", { name: "Use Dutch" }).click();
  await expect.element(page.getByText("Language: nl")).toBeInTheDocument();
});

test("leaves a page before Next has created its root when the test ends, without an error", async () => {
  const [holding, release] = hold();
  held.globalError = holding;
  void renderServer({ url: "/settings" }).catch(() => {});
  await expect.poll(() => holding.loading, { timeout: 10_000 }).toBe(true);

  // What runs between two tests.
  await cleanup();

  // An error that the page reports once its root would be there fails the run.
  release();
  await expect.poll(() => holding.loaded).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 100));
});

test("keeps the node of a page that is left while its request renders, until the server is done with it", async () => {
  // The route of the node is loaded once, so that what waits is the proxy.
  await renderServer(<p>Held node</p>, { url: "/held", proxy: true });
  const [holding, release] = hold();
  held.heldProxy = holding;
  const left = renderServer(<p>Held node</p>, { url: "/held", proxy: true }).catch(
    (error: unknown) => error,
  );
  // The server has the request, and has not rendered the node yet.
  await expect.poll(() => holding.loading, { timeout: 10_000 }).toBe(true);

  // As a host does when it switches stories while one renders.
  const next = renderServer(<p>Next node</p>);
  expect(await left).toMatchObject({ name: "AbortError" });

  // The request of the page that was left renders its node, which is still
  // there: the next page waits for that request before it opens. Without the
  // node, Next logs "the node of the test is gone", which fails afterEach.
  release();
  await next;
  await expect.element(page.getByText("Next node")).toBeInTheDocument();
  await expect.element(page.getByText("Held node")).not.toBeInTheDocument();
});

test("hears no more of the requests of its router once a page is left, also while the next one runs", async () => {
  await renderServer(
    <>
      <RefreshButton />
      <Link href="/settings">Settings</Link>
    </>,
    { url: "/held", proxy: true },
  );
  const [holding, release] = hold();
  held.heldProxy = holding;
  // The refresh waits in the proxy, and the navigation for the refresh.
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(() => holding.loading, { timeout: 10_000 }).toBe(true);
  await page.getByRole("link", { name: "Settings" }).click();

  // What runs between two tests: it waits for the refresh, and drops the
  // navigation, which waits behind it.
  const left = cleanup();
  release();
  await left;

  // The router of the page that was left would report the stopped request:
  // "Failed to fetch RSC payload".
  expect(consoleError).not.toHaveBeenCalled();
  await renderServer(<Counter />);
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeInTheDocument();
});

test("hears nothing of a Server Action of a page once it is left", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });
  await renderServer(<FavoriteButton id="1" favorite={false} />, { url: "/held", proxy: true });
  const [holding, release] = hold();
  held.heldProxy = holding;
  // The action waits in the proxy.
  await page.getByRole("button", { name: "Favorite" }).click();
  await expect.poll(() => holding.loading, { timeout: 10_000 }).toBe(true);

  const left = cleanup();
  release();
  await left;

  // Next would report the action that failed, and the transition would
  // reject unhandled.
  expect(consoleError).not.toHaveBeenCalled();
  await renderServer(<Counter />);
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeInTheDocument();
});

test("sends no Server Action of a page once it is left", async () => {
  db.notes.set("1", { id: "1", title: "Inbox triage", body: "" });
  const note = db.notes.get("1")!;
  await renderServer(<FavoriteButton id="1" favorite={false} />, { proxy: true });
  const seen = seenByProxy.length;

  // Next sends the action a few microtasks after the click, and the page is
  // left before that.
  (page.getByRole("button", { name: "Favorite" }).element() as HTMLElement).click();
  await cleanup();

  expect(seenByProxy.length).toBe(seen);
  expect(note.favorite).toBeUndefined();
  expect(consoleError).not.toHaveBeenCalled();
});

test("sends nothing more for a page once it is left, also what its router sends a moment later", async () => {
  await renderServer(<RefreshButton />, { proxy: true });
  const seen = seenByProxy.length;

  // Next's router sends the request of a refresh a few microtasks after the
  // click, and the page is left before that.
  (page.getByRole("button", { name: "Refresh" }).element() as HTMLElement).click();
  await cleanup();
  expect(seenByProxy.length).toBe(seen);

  await renderServer(<Counter />);
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeInTheDocument();
  // The router of the page that was left would report the dropped request:
  // "Failed to fetch RSC payload".
  expect(consoleError).not.toHaveBeenCalled();
});

test("stops a page load when its signal aborts: it rejects at once, as fetch does, and leaves the page", async () => {
  const [holding, release] = hold();
  held.slowWidget = holding;
  const controller = new AbortController();
  const load = renderServer({ url: "/slow-start", signal: controller.signal });
  await expect.poll(() => holding.loading, { timeout: 10_000 }).toBe(true);
  await expect.element(page.getByRole("heading", { name: "Slow start" })).toBeInTheDocument();

  controller.abort();

  // With the signal's reason, while the client code of the page still loads.
  await expect(load).rejects.toBe(controller.signal.reason);
  expect(controller.signal.reason).toMatchObject({ name: "AbortError" });
  expect(holding.loaded).toBe(false);
  // Leaving goes on, and `cleanup()` waits for it.
  await cleanup();
  await expect.element(page.getByRole("heading", { name: "Slow start" })).not.toBeInTheDocument();
  await expect.element(page.getByText("Slow widget")).not.toBeInTheDocument();

  // The client code of the page that was left, once it is there, does nothing.
  release();
  await expect.poll(() => holding.loaded).toBe(true);
  await renderServer({ url: "/settings" });
  await page.getByRole("button", { name: "Use Dutch" }).click();
  await expect.element(page.getByText("Language: nl")).toBeInTheDocument();
  await expect.element(page.getByText("Slow widget")).not.toBeInTheDocument();
});

test("stops the page load of a node while the server renders it, with the reason of the signal", async () => {
  // The route of the node is loaded once, so that what waits is the proxy.
  await renderServer(<p>Held node</p>, { url: "/held", proxy: true });
  const [holding, release] = hold();
  held.heldProxy = holding;
  const controller = new AbortController();
  const load = renderServer(<p>Held node</p>, {
    url: "/held",
    proxy: true,
    signal: controller.signal,
  });
  await expect.poll(() => holding.loading, { timeout: 10_000 }).toBe(true);

  controller.abort(new Error("The host moved on"));

  await expect(load).rejects.toThrow("The host moved on");
  // The next page waits for the request of the one that was left.
  const next = renderServer(<p>Next node</p>);
  release();
  await next;
  await expect.element(page.getByText("Next node")).toBeInTheDocument();
  await expect.element(page.getByText("Held node")).not.toBeInTheDocument();
});

test("opens nothing for a signal that has aborted, and keeps the page that is open", async () => {
  const signal = AbortSignal.abort();

  await expect(renderServer({ url: "/notes", signal })).rejects.toBe(signal.reason);
  await expect(renderServer(<p>Not opened</p>, { signal })).rejects.toBe(signal.reason);

  // The page of `beforeEach()`.
  await page.getByRole("button", { name: "Use Dutch" }).click();
  await expect.element(page.getByText("Language: nl")).toBeInTheDocument();
});

test("keeps a page that has opened when its signal aborts later", async () => {
  const controller = new AbortController();
  const { errors } = await renderServer(<Counter />, { signal: controller.signal });

  controller.abort();

  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeInTheDocument();
  expect(errors).toEqual([]);
});
