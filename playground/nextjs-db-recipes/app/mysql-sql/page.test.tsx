import { pool } from "#recipes/mysql-sql/db.ts";
import { addTodos, listTodos } from "#recipes/mysql-sql/todos.ts";
import { todoRecipeTests } from "#test/todo-recipe.ts";

todoRecipeTests({
  url: "/mysql-sql",
  seed: async (titles) => {
    for (const title of titles) await pool.query("INSERT INTO todos (title) VALUES (?)", [title]);
  },
  addTodos,
  read: listTodos,
});
