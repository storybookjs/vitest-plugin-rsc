// One for one with tests/vitest/add.test.tsx.
import { expect, test } from "./test.ts";
import { seed, stored } from "#test/db.ts";

test("adds a todo", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Title").fill("Milk");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByRole("link", { name: "Milk" })).toBeVisible();
  await expect.poll(stored).toEqual([{ title: "Milk", done: false }]);
});

test("trims the title", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("Title").fill("  Bread  ");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByRole("link", { name: "Bread" })).toBeVisible();
  await expect.poll(stored).toEqual([{ title: "Bread", done: false }]);
});

test("shows an error for an empty title", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByText("Title is required.")).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");
  expect(await stored()).toEqual([]);
});

test("clears the error after a todo is added", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Title is required.")).toBeVisible();
  await page.getByLabel("Title").fill("Eggs");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByRole("link", { name: "Eggs" })).toBeVisible();
  await expect(page.getByText("Title is required.")).toHaveCount(0);
});

test("adds after the todos there are", async ({ page }) => {
  await seed(["Milk", "Bread"]);
  await page.goto("/");

  await page.getByLabel("Title").fill("Eggs");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByText("0 of 3 done")).toBeVisible();
  await expect.poll(stored).toEqual([
    { title: "Milk", done: false },
    { title: "Bread", done: false },
    { title: "Eggs", done: false },
  ]);
});
