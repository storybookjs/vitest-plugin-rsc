import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { cleanup, handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { getQuote } from "./lib/quotes.ts";

// Next stamps a revalidation with its time rounded to a millisecond, which can
// be half a millisecond ahead. A request in that time gets the old entry once.
const revalidate = async (tag: string) => {
  await handleRequest(`/api/revalidate?tag=${tag}`, { method: "POST" });
  await new Promise((resolve) => setTimeout(resolve, 1));
};
const heading = () => page.getByRole("heading").element().textContent;

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  expect(consoleError.mock.calls).toEqual([]);
});

test('keeps what a "use cache" function returns for the next request, until its tag is revalidated', async () => {
  document.cookie = "name=Ada";
  await renderServer({ url: "/quotes" });
  const first = heading();
  expect(first).toMatch(/^Quote \d+ about tabs$/);
  // The part of the page that reads the request, behind its Suspense boundary.
  await expect.element(page.getByText("Hello Ada")).toBeVisible();

  await renderServer({ url: "/quotes" });
  expect(heading()).toBe(first);

  await revalidate("quotes");
  await renderServer({ url: "/quotes" });
  expect(heading()).not.toBe(first);
});

test("runs a cached function again after a Server Action has updated its tag", async () => {
  await renderServer({ url: "/quotes" });
  const first = heading();
  await renderServer({ url: "/quotes" });
  expect(heading()).toBe(first);

  await page.getByRole("button", { name: "Refresh" }).click();

  await expect.poll(heading).not.toBe(first);
  expect(heading()).toMatch(/^Quote \d+ about tabs$/);
});

test("gives two cached functions that run at once in a request each its own scope", async () => {
  // Each awaits, then tags its own entry, and awaits a cached function of its own.
  const quotes = async () =>
    (await (await handleRequest("/api/quotes?topics=a,bb")).json()) as { runs: number }[];
  const [a, bb] = await quotes();
  expect([a, bb]).toMatchObject([
    { topic: "a", author: "author 1" },
    { topic: "bb", author: "author 2" },
  ]);

  await revalidate("quote-a");
  const [nextA, nextBb] = await quotes();

  expect(nextA!.runs).toBeGreaterThan(bb!.runs);
  expect(nextBb).toEqual(bb);
});

test("runs a cached function again when the tag of a cached function inside it is revalidated", async () => {
  const quote = async () =>
    (await (await handleRequest("/api/quote?topic=nested")).json()) as { runs: number };
  const first = await quote();
  expect(await quote()).toEqual(first);

  await revalidate("authors");

  expect((await quote()).runs).toBe(first.runs + 1);
});

test("runs each of two cached functions again when the tag of a cached function they share is revalidated", async () => {
  // Both await the cached function of an author, with the same arguments.
  const quotes = async () =>
    (await (await handleRequest("/api/quotes?topics=aa,bb")).json()) as { runs: number }[];
  const first = await quotes();
  expect(await quotes()).toEqual(first);

  await revalidate("authors");
  const second = await quotes();

  expect(second[0]!.runs).toBeGreaterThan(first[1]!.runs);
  expect(second[1]!.runs).toBeGreaterThan(first[1]!.runs);
});

test("caches every function of a module with the directive", async () => {
  const report = async () =>
    (await (await handleRequest("/api/report?year=2025")).json()) as { year: number; runs: number };
  const first = await report();
  expect(first.year).toBe(2025);

  expect(await report()).toEqual(first);

  await revalidate("reports");
  expect((await report()).runs).toBe(first.runs + 1);
});

test("caches a component", async () => {
  const summary = () => page.getByText(/^Summary \d+ of report \d+ for 2026$/);
  await renderServer({ url: "/report" });
  await expect.element(summary()).toBeVisible();
  const first = summary().element().textContent;

  await renderServer({ url: "/report" });
  expect(summary().element().textContent).toBe(first);

  // The component tags its entry after an `await`.
  await revalidate("summaries");
  await renderServer({ url: "/report" });
  expect(summary().element().textContent).not.toBe(first);
});

test("makes two calls of a cached function with the same arguments in one render one call", async () => {
  await renderServer({ url: "/report" });

  await expect.element(page.getByText("One call: true")).toBeVisible();
});

test("keys a cached function by a value it closes over", async () => {
  const total = async (unit: string) =>
    (await (await handleRequest(`/api/total?unit=${unit}`)).json()) as string;
  const euros = await total("EUR");
  expect(euros).toMatch(/^42 EUR, computed \d+ times$/);

  expect(await total("USD")).toMatch(/^42 USD/);
  expect(await total("EUR")).toBe(euros);
});

test("keys a cached function by the arguments it declares, as Next does", async () => {
  const single = (await (await handleRequest("/api/quote?topic=mapped")).json()) as object;

  // `topics.map(getQuote)` also passes the index and the topics.
  const mapped = (await (
    await handleRequest("/api/quotes?topics=mapped,other")
  ).json()) as object[];

  expect(mapped[0]).toEqual(single);
});

test("starts a test without what an earlier one cached", async () => {
  const quote = async () =>
    (await (await handleRequest("/api/quote?topic=isolated")).json()) as { runs: number };
  const first = await quote();
  expect(await quote()).toEqual(first);

  // What runs between two tests.
  await cleanup();

  expect((await quote()).runs).toBe(first.runs + 1);
});

test("does not let a cached function read the request, as Next does not", async () => {
  document.cookie = "name=Ada";
  await renderServer({ url: "/visitor" });

  await expect
    .element(
      page.getByText(
        /^Not allowed: Route "\/visitor": `cookies\(\)` can't be read inside `"use cache"`/,
      ),
    )
    .toBeVisible();
});

test("known limit: renders a page that reads the request outside a Suspense boundary", async () => {
  document.cookie = "name=Ada";
  // `next build` stops at this page: "Next.js encountered uncached or runtime
  // data during prerendering". Nothing is prerendered here.
  await renderServer({ url: "/blocking" });

  await expect.element(page.getByRole("heading", { name: "Hello Ada" })).toBeVisible();
});

test("known limit: a component that a cached component renders reads the request", async () => {
  document.cookie = "name=Ada";
  await renderServer({ url: "/nested" });

  // `next start`: "Child of nobody, cookies() throws, tagged".
  await expect.element(page.getByText("Child of Ada, not tagged")).toBeVisible();
});

test("known limit: a cached component that a cached component renders does not pass its tags on", async () => {
  const text = () => page.getByText(/^outer \d+ inner \d+$/).element().textContent;
  await renderServer({ url: "/outer" });
  await expect.element(page.getByText(/^outer/)).toBeVisible();
  const first = text();
  await renderServer({ url: "/outer" });
  expect(text()).toBe(first);

  await revalidate("inner");
  await renderServer({ url: "/outer" });

  // `next start` runs both again: "outer 2 inner 2" after "outer 1 inner 1".
  expect(text()).toBe(first);
});

test("known limit: a test cannot call a cached function itself", async () => {
  // Next's wrapper wants the stores of a request. `unstable_cache` does not.
  await expect(getQuote("direct")).rejects.toThrow('"use cache"');
});
