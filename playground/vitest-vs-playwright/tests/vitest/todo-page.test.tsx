// One for one with tests/playwright/todo-page.spec.ts.
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seed, stored } from "#test/db.ts";

test("shows the title and the status", async () => {
  await seed(["Milk"], ["Milk"]);
  await renderServer({ url: "/todos/1" });

  await expect.element(page.getByRole("heading", { name: "Milk" })).toBeInTheDocument();
  await expect.element(page.getByText("Status: Done")).toBeInTheDocument();
});

test("shows a 404 for a todo that does not exist", async () => {
  await renderServer({ url: "/todos/42" });

  await expect.element(page.getByText("This page could not be found.")).toBeInTheDocument();
});

test("deletes the todo and goes back to the list", async () => {
  await seed(["Milk", "Bread"]);
  await renderServer({ url: "/todos/1" });

  await page.getByRole("button", { name: "Delete" }).click();

  await expect.element(page.getByRole("heading", { name: "Todos" })).toBeInTheDocument();
  await expect.element(page.getByRole("link", { name: "Milk" })).not.toBeInTheDocument();
  await expect.poll(stored).toEqual([{ title: "Bread", done: false }]);
});

test("renames the todo", async () => {
  await seed(["Milk"]);
  await renderServer({ url: "/todos/1" });

  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabelText("Title").fill("Oat milk");
  await page.getByRole("button", { name: "Save" }).click();

  await expect.element(page.getByRole("heading", { name: "Oat milk" })).toBeInTheDocument();
  await expect.poll(stored).toEqual([{ title: "Oat milk", done: false }]);
});

test("does not rename the todo to an empty title", async () => {
  await seed(["Milk"]);
  await renderServer({ url: "/todos/1/edit" });

  await page.getByLabelText("Title").fill("");
  await page.getByRole("button", { name: "Save" }).click();

  await expect.element(page.getByText("Title is required.")).toBeInTheDocument();
  expect(await stored()).toEqual([{ title: "Milk", done: false }]);
});
