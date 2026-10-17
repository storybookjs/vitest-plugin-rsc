import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, onTestFinished, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";

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
