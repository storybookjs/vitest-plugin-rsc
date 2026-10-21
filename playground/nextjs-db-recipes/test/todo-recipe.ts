import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { Todo } from "#components/todos.tsx";

// The time of every test: see vitest.setup.ts.
export const TEST_NOW = new Date("2026-05-06T00:00:00.000Z");

/**
 * The tests of a recipe: the same app on another database and ORM. The test
 * seeds and reads the database with the ORM of the app.
 */
export function todoRecipeTests(recipe: {
  url: string;
  seed: (titles: string[]) => Promise<void>;
  read: () => Promise<Todo[]>;
  addTodos: (titles: string[]) => Promise<void>;
}) {
  test("starts with no todos", async () => {
    await renderServer({ url: recipe.url });

    await expect.element(page.getByText("No todos")).toBeVisible();
  });

  test("shows the todos that the test seeds", async () => {
    await recipe.seed(["Buy milk", "Walk the dog"]);

    await renderServer({ url: recipe.url });

    const todos = page.getByRole("list", { name: "Todos" });
    await expect.element(todos.getByText("#1 Buy milk")).toBeVisible();
    await expect.element(todos.getByText("#2 Walk the dog")).toBeVisible();
  });

  test("adds a todo with a Server Action, at the time of the test", async () => {
    await renderServer({ url: recipe.url });

    await userEvent.fill(page.getByLabelText("Title"), "Write a recipe");
    await userEvent.click(page.getByRole("button", { name: "Add" }));

    await expect.element(page.getByText("#1 Write a recipe")).toBeVisible();
    await expect.element(page.getByText(TEST_NOW.toISOString())).toBeVisible();
    expect(await recipe.read()).toEqual([
      { id: 1, title: "Write a recipe", done: false, createdAt: TEST_NOW },
    ]);
  });

  test("marks a todo done in a transaction", async () => {
    await recipe.seed(["Buy milk"]);
    await renderServer({ url: recipe.url });

    await userEvent.click(page.getByRole("button", { name: "Done: Buy milk" }));

    await expect.element(page.getByText("#1 Buy milk (done)")).toBeVisible();
    expect((await recipe.read()).map((todo) => todo.done)).toEqual([true]);
  });

  test("rolls a transaction back: none of its rows are there after an error", async () => {
    await expect(recipe.addTodos(["Buy milk", ""])).rejects.toThrow("A todo needs a title");

    expect(await recipe.read()).toEqual([]);
    await recipe.addTodos(["Buy milk", "Walk the dog"]);
    expect((await recipe.read()).map((todo) => todo.title)).toEqual(["Buy milk", "Walk the dog"]);
  });

  test("has a database of its own: what an earlier test wrote is gone, ids start at 1", async () => {
    expect(await recipe.read()).toEqual([]);
    await recipe.seed(["Again"]);

    expect((await recipe.read()).map((todo) => todo.id)).toEqual([1]);
  });
}
