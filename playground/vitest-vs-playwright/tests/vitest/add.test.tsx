// One for one with tests/playwright/add.spec.ts.
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seed, stored } from "#test/db.ts";

test("adds a todo", async () => {
  await renderServer({ url: "/" });

  await page.getByLabelText("Title").fill("Milk");
  await page.getByRole("button", { name: "Add" }).click();

  await expect.element(page.getByRole("link", { name: "Milk" })).toBeInTheDocument();
  await expect.poll(stored).toEqual([{ title: "Milk", done: false }]);
});

test("trims the title", async () => {
  await renderServer({ url: "/" });

  await page.getByLabelText("Title").fill("  Bread  ");
  await page.getByRole("button", { name: "Add" }).click();

  await expect.element(page.getByRole("link", { name: "Bread" })).toBeInTheDocument();
  await expect.poll(stored).toEqual([{ title: "Bread", done: false }]);
});

test("shows an error for an empty title", async () => {
  await renderServer({ url: "/" });

  await page.getByRole("button", { name: "Add" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await expect.element(page.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  expect(await stored()).toEqual([]);
});

test("clears the error after a todo is added", async () => {
  await renderServer({ url: "/" });

  await page.getByRole("button", { name: "Add" }).click();
  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  await page.getByLabelText("Title").fill("Eggs");
  await page.getByRole("button", { name: "Add" }).click();

  await expect.element(page.getByRole("link", { name: "Eggs" })).toBeInTheDocument();
  await expect.element(page.getByText("Title is required.")).not.toBeInTheDocument();
});

test("adds after the todos there are", async () => {
  await seed(["Milk", "Bread"]);
  await renderServer({ url: "/" });

  await page.getByLabelText("Title").fill("Eggs");
  await page.getByRole("button", { name: "Add" }).click();

  await expect.element(page.getByText("0 of 3 done")).toBeInTheDocument();
  await expect.poll(stored).toEqual([
    { title: "Milk", done: false },
    { title: "Bread", done: false },
    { title: "Eggs", done: false },
  ]);
});
