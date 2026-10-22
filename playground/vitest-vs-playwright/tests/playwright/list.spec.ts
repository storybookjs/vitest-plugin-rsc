// One for one with tests/vitest/list.test.tsx.
import { expect, test } from "./test.ts";
import { seed } from "#test/db.ts";

test("shows the heading and the count", async ({ page }) => {
  await seed(["Milk", "Bread"]);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
  await expect(page.getByText("0 of 2 done")).toBeVisible();
});

test("shows an empty state without todos", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("No todos yet")).toBeVisible();
});

test("lists the todos in the order they were added", async ({ page }) => {
  await seed(["Milk", "Bread", "Eggs"]);
  await page.goto("/");

  await expect(page.getByRole("link")).toHaveText(["Milk", "Bread", "Eggs"]);
});

test("marks the todos that are done", async ({ page }) => {
  await seed(["Milk", "Bread"], ["Bread"]);
  await page.goto("/");

  await expect(page.getByText("1 of 2 done")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo: Bread" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Done: Milk" })).toBeVisible();
});

test("opens a todo from the list", async ({ page }) => {
  await seed(["Milk"]);
  await page.goto("/");

  await page.getByRole("link", { name: "Milk" }).click();

  await expect(page.getByRole("heading", { name: "Milk" })).toBeVisible();
  await expect(page.getByText("Status: Open")).toBeVisible();
});
