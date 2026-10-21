import { todoRecipeTests } from "#test/todo-recipe.ts";
import { addTodos } from "#recipes/postgres-drizzle/todos.ts";
import { db } from "#recipes/postgres-drizzle/db.ts";
import { todos } from "#recipes/postgres-drizzle/schema.ts";

todoRecipeTests({
  url: "/postgres-drizzle",
  seed: async (titles) => {
    await db.insert(todos).values(titles.map((title) => ({ title })));
  },
  addTodos,
  read: () => db.select().from(todos).orderBy(todos.id),
});
