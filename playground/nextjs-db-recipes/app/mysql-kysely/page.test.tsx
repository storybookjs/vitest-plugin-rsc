import { db } from "#recipes/mysql-kysely/db.ts";
import { addTodos, listTodos } from "#recipes/mysql-kysely/todos.ts";
import { todoRecipeTests } from "#test/todo-recipe.ts";

todoRecipeTests({
  url: "/mysql-kysely",
  seed: async (titles) => {
    await db
      .insertInto("todos")
      .values(titles.map((title) => ({ title })))
      .execute();
  },
  addTodos,
  read: listTodos,
});
