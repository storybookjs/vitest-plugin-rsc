import { db } from "#recipes/sqlite-kysely/db.ts";
import { addTodos, listTodos } from "#recipes/sqlite-kysely/todos.ts";
import { todoRecipeTests } from "#test/todo-recipe.ts";

todoRecipeTests({
  url: "/sqlite-kysely",
  seed: async (titles) => {
    await db
      .insertInto("todos")
      .values(titles.map((title) => ({ title, created_at: new Date().toISOString() })))
      .execute();
  },
  addTodos,
  read: listTodos,
});
