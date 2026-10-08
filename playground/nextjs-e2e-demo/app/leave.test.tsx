import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";

type Held = { loading: boolean; loaded: boolean; release: Promise<void> };
// Client code that waits in the browser while a test holds it: of a widget,
// app/components/slow-widget.tsx, and of the root, app/global-error.tsx.
const held = globalThis as { slowWidget?: Held; globalError?: Held };

function hold(): [Held, () => void] {
  let release = () => {};
  const holding = {
    loading: false,
    loaded: false,
    release: new Promise<void>((resolve) => (release = resolve)),
  };
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
