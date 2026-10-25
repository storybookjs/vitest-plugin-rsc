// `expect.element()` takes a locator of the package: by Vitest's locator
// symbol and the methods it calls, `findElement()`, `query()` for
// `.not.toBeInTheDocument()` and `elements()` for `toHaveLength()`. And a
// locator is assignable to `Locator` of `vitest/browser`.

import { beforeEach, expect, expectTypeOf, test } from "vitest";
import type { Locator } from "vitest/browser";
import { DomLocator, page } from "../src/index.ts";

beforeEach(() => {
  document.body.innerHTML = '<main><input aria-label="Title"><p>One</p><p>Two</p></main>';
});

const later = (change: () => void) => setTimeout(change, 30);

test("waits for the element, then runs Vitest's matcher on it", async () => {
  later(() => document.querySelector("main")!.insertAdjacentHTML("beforeend", "<h1>Later</h1>"));
  await expect.element(page.getByRole("heading", { name: "Later" })).toBeInTheDocument();
  await page.getByLabelText("Title").fill("Groceries");
  await expect.element(page.getByLabelText("Title")).toHaveValue("Groceries");
});

test(".not, with query() for toBeInTheDocument", async () => {
  later(() => document.querySelector("p")!.remove());
  await expect.element(page.getByText("One")).not.toBeInTheDocument();
  await expect.element(page.getByText("Two")).not.toHaveValue("x");
});

test("toHaveLength, with elements()", async () => {
  await expect.element(page.getByRole("paragraph")).toHaveLength(2);
  later(() => document.querySelector("main")!.insertAdjacentHTML("beforeend", "<p>Three</p>"));
  await expect.element(page.getByRole("paragraph")).toHaveLength(3);
});

test("{ timeout } is the wait's, and the error is the locator's", async () => {
  const start = performance.now();
  await expect(
    expect.element(page.getByText("Never"), { timeout: 150 }).toBeInTheDocument(),
  ).rejects.toThrow("Cannot find element with locator: getByText('Never')");
  const elapsed = performance.now() - start;
  expect(elapsed).toBeGreaterThanOrEqual(140);
  expect(elapsed).toBeLessThan(1000);
});

test("more than one element is a strict mode violation", async () => {
  await expect(
    expect.element(page.getByRole("paragraph"), { timeout: 100 }).toBeInTheDocument(),
  ).rejects.toThrow("strict mode violation: getByRole('paragraph') resolved to 2 elements");
});

test("a locator is assignable to Locator of vitest/browser", () => {
  expectTypeOf<DomLocator>().toExtend<Locator>();
  const locator: Locator = page.getByRole("main");
  expect(locator.selector).toBe("internal:role=main");
});
