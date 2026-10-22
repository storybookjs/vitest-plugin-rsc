// One for one with tests/vitest/filter.test.tsx.
import { expect, test } from "./test.ts";
import { seed } from "#test/db.ts";

test("filters the list", async ({ page }) => {
  await seed(["Milk", "Bread", "Oat milk"]);
  await page.goto("/");

  await page.getByLabel("Filter").fill("milk");

  await expect(page.getByRole("link", { name: "Milk", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Oat milk" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Bread" })).toHaveCount(0);
});

test("filters without regard to case", async ({ page }) => {
  await seed(["Milk", "Bread"]);
  await page.goto("/");

  await page.getByLabel("Filter").fill("BREAD");

  await expect(page.getByRole("link", { name: "Bread" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Milk" })).toHaveCount(0);
});

test("says so when no todo matches", async ({ page }) => {
  await seed(["Milk"]);
  await page.goto("/");

  await page.getByLabel("Filter").fill("cheese");

  await expect(page.getByText("No todos match")).toBeVisible();
});

test("shows every todo again when the filter is cleared", async ({ page }) => {
  await seed(["Milk", "Bread"]);
  await page.goto("/");

  await page.getByLabel("Filter").fill("milk");
  await expect(page.getByRole("link", { name: "Bread" })).toHaveCount(0);
  await page.getByLabel("Filter").fill("");

  await expect(page.getByRole("link", { name: "Bread" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Milk" })).toBeVisible();
});

test("keeps the count of every todo while filtering", async ({ page }) => {
  await seed(["Milk", "Bread"], ["Bread"]);
  await page.goto("/");

  await page.getByLabel("Filter").fill("milk");

  await expect(page.getByText("1 of 2 done")).toBeVisible();
});
