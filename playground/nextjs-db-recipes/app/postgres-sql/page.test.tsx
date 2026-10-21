import { pool } from "#recipes/postgres-sql/db.ts";
import { addTodos, listTodos } from "#recipes/postgres-sql/todos.ts";
import { todoRecipeTests } from "#test/todo-recipe.ts";

todoRecipeTests({
  url: "/postgres-sql",
  seed: async (titles) => {
    for (const title of titles) await pool.query("INSERT INTO todos (title) VALUES ($1)", [title]);
  },
  addTodos,
  read: listTodos,
});
