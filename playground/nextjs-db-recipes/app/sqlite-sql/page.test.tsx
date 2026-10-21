import { client } from "#recipes/sqlite-sql/db.ts";
import { addTodos, listTodos } from "#recipes/sqlite-sql/todos.ts";
import { todoRecipeTests } from "#test/todo-recipe.ts";

todoRecipeTests({
  url: "/sqlite-sql",
  seed: async (titles) => {
    for (const title of titles) {
      await client.execute({
        sql: "INSERT INTO todos (title, created_at) VALUES (?, ?)",
        args: [title, Date.now()],
      });
    }
  },
  addTodos,
  read: listTodos,
});
