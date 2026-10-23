// One for one with tests/vitest/todo-page.test.tsx.
import { expect, test } from "./test.ts";
import { seed, stored } from "#test/db.ts";

test("shows the title and the status", async ({ page }) => {
  await seed(["Milk"], ["Milk"]);
  await page.goto("/todos/1");

  await expect(page.getByRole("heading", { name: "Milk" })).toBeVisible();
  await expect(page.getByText("Status: Done")).toBeVisible();
});

test("shows a 404 for a todo that does not exist", async ({ page }) => {
  await page.goto("/todos/42");

  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("deletes the todo and goes back to the list", async ({ page }) => {
  await seed(["Milk", "Bread"]);
  await page.goto("/todos/1");

  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page.getByRole("heading", { name: "Todos" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Milk" })).toHaveCount(0);
  await expect.poll(stored).toEqual([{ title: "Bread", done: false }]);
});

test("renames the todo", async ({ page }) => {
  await seed(["Milk"]);
  await page.goto("/todos/1");

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Title").fill("Oat milk");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { name: "Oat milk" })).toBeVisible();
  await expect.poll(stored).toEqual([{ title: "Oat milk", done: false }]);
});

test("does not rename the todo to an empty title", async ({ page }) => {
  await seed(["Milk"]);
  await page.goto("/todos/1/edit");

  await page.getByLabel("Title").fill("");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Title is required.")).toBeVisible();
  expect(await stored()).toEqual([{ title: "Milk", done: false }]);
});
