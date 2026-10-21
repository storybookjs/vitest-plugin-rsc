import { todoRecipeTests } from "#test/todo-recipe.ts";
import { addTodos } from "#recipes/sqlite-drizzle/todos.ts";
import { db } from "#recipes/sqlite-drizzle/db.ts";
import { todos } from "#recipes/sqlite-drizzle/schema.ts";

todoRecipeTests({
  url: "/sqlite-drizzle",
  seed: async (titles) => {
    await db.insert(todos).values(titles.map((title) => ({ title })));
  },
  addTodos,
  read: () => db.select().from(todos).orderBy(todos.id),
});
