// One for one with tests/playwright/list.spec.ts.
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { seed } from "#test/db.ts";

test("shows the heading and the count", async () => {
  await seed(["Milk", "Bread"]);
  await renderServer({ url: "/" });

  await expect.element(page.getByRole("heading", { name: "Todos" })).toBeInTheDocument();
  await expect.element(page.getByText("0 of 2 done")).toBeInTheDocument();
});

test("shows an empty state without todos", async () => {
  await renderServer({ url: "/" });

  await expect.element(page.getByText("No todos yet")).toBeInTheDocument();
});

test("lists the todos in the order they were added", async () => {
  await seed(["Milk", "Bread", "Eggs"]);
  await renderServer({ url: "/" });

  await expect
    .poll(() =>
      page
        .getByRole("link")
        .elements()
        .map((element) => element.textContent),
    )
    .toEqual(["Milk", "Bread", "Eggs"]);
});

test("marks the todos that are done", async () => {
  await seed(["Milk", "Bread"], ["Bread"]);
  await renderServer({ url: "/" });

  await expect.element(page.getByText("1 of 2 done")).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Undo: Bread" })).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Done: Milk" })).toBeInTheDocument();
});

test("opens a todo from the list", async () => {
  await seed(["Milk"]);
  await renderServer({ url: "/" });

  await page.getByRole("link", { name: "Milk" }).click();

  await expect.element(page.getByRole("heading", { name: "Milk" })).toBeInTheDocument();
  await expect.element(page.getByText("Status: Open")).toBeInTheDocument();
});
