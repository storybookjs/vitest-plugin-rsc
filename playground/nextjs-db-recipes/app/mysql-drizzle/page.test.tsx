import { todoRecipeTests } from "#test/todo-recipe.ts";
import { addTodos } from "#recipes/mysql-drizzle/todos.ts";
import { db } from "#recipes/mysql-drizzle/db.ts";
import { todos } from "#recipes/mysql-drizzle/schema.ts";

todoRecipeTests({
  url: "/mysql-drizzle",
  seed: async (titles) => {
    await db.insert(todos).values(titles.map((title) => ({ title })));
  },
  addTodos,
  read: () => db.select().from(todos).orderBy(todos.id),
});
