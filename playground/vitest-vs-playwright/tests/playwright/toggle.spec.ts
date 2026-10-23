// One for one with tests/vitest/toggle.test.tsx.
import { expect, test } from "./test.ts";
import { seed, stored } from "#test/db.ts";

test("marks a todo done from the list", async ({ page }) => {
  await seed(["Milk"]);
  await page.goto("/");

  await page.getByRole("button", { name: "Done: Milk" }).click();

  await expect(page.getByRole("button", { name: "Undo: Milk" })).toBeVisible();
  await expect.poll(stored).toEqual([{ title: "Milk", done: true }]);
});

test("marks a done todo open again", async ({ page }) => {
  await seed(["Milk"], ["Milk"]);
  await page.goto("/");

  await page.getByRole("button", { name: "Undo: Milk" }).click();

  await expect(page.getByRole("button", { name: "Done: Milk" })).toBeVisible();
  await expect.poll(stored).toEqual([{ title: "Milk", done: false }]);
});

test("updates the count", async ({ page }) => {
  await seed(["Milk", "Bread"]);
  await page.goto("/");

  await page.getByRole("button", { name: "Done: Milk" }).click();
  await expect(page.getByText("1 of 2 done")).toBeVisible();
  await page.getByRole("button", { name: "Done: Bread" }).click();

  await expect(page.getByText("2 of 2 done")).toBeVisible();
});

test("leaves the other todos as they are", async ({ page }) => {
  await seed(["Milk", "Bread", "Eggs"]);
  await page.goto("/");

  await page.getByRole("button", { name: "Done: Bread" }).click();

  await expect(page.getByRole("button", { name: "Undo: Bread" })).toBeVisible();
  await expect.poll(stored).toEqual([
    { title: "Milk", done: false },
    { title: "Bread", done: true },
    { title: "Eggs", done: false },
  ]);
});

test("marks a todo done on its own page", async ({ page }) => {
  await seed(["Milk"]);
  await page.goto("/todos/1");

  await page.getByRole("button", { name: "Mark done" }).click();

  await expect(page.getByText("Status: Done")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark open" })).toBeVisible();
});
