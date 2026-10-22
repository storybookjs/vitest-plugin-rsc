// One for one with tests/playwright/toggle.spec.ts.
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seed, stored } from "#test/db.ts";

test("marks a todo done from the list", async () => {
  await seed(["Milk"]);
  await renderServer({ url: "/" });

  await page.getByRole("button", { name: "Done: Milk" }).click();

  await expect.element(page.getByRole("button", { name: "Undo: Milk" })).toBeInTheDocument();
  await expect.poll(stored).toEqual([{ title: "Milk", done: true }]);
});

test("marks a done todo open again", async () => {
  await seed(["Milk"], ["Milk"]);
  await renderServer({ url: "/" });

  await page.getByRole("button", { name: "Undo: Milk" }).click();

  await expect.element(page.getByRole("button", { name: "Done: Milk" })).toBeInTheDocument();
  await expect.poll(stored).toEqual([{ title: "Milk", done: false }]);
});

test("updates the count", async () => {
  await seed(["Milk", "Bread"]);
  await renderServer({ url: "/" });

  await page.getByRole("button", { name: "Done: Milk" }).click();
  await expect.element(page.getByText("1 of 2 done")).toBeInTheDocument();
  await page.getByRole("button", { name: "Done: Bread" }).click();

  await expect.element(page.getByText("2 of 2 done")).toBeInTheDocument();
});

test("leaves the other todos as they are", async () => {
  await seed(["Milk", "Bread", "Eggs"]);
  await renderServer({ url: "/" });

  await page.getByRole("button", { name: "Done: Bread" }).click();

  await expect.element(page.getByRole("button", { name: "Undo: Bread" })).toBeInTheDocument();
  await expect.poll(stored).toEqual([
    { title: "Milk", done: false },
    { title: "Bread", done: true },
    { title: "Eggs", done: false },
  ]);
});

test("marks a todo done on its own page", async () => {
  await seed(["Milk"]);
  await renderServer({ url: "/todos/1" });

  await page.getByRole("button", { name: "Mark done" }).click();

  await expect.element(page.getByText("Status: Done")).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Mark open" })).toBeInTheDocument();
});
