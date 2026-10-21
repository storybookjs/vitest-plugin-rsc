import { db } from "#recipes/postgres-kysely/db.ts";
import { addTodos, listTodos } from "#recipes/postgres-kysely/todos.ts";
import { todoRecipeTests } from "#test/todo-recipe.ts";

todoRecipeTests({
  url: "/postgres-kysely",
  seed: async (titles) => {
    await db
      .insertInto("todos")
      .values(titles.map((title) => ({ title })))
      .execute();
  },
  addTodos,
  read: listTodos,
});
