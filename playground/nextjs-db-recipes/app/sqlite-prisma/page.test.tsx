import { todoRecipeTests } from "#test/todo-recipe.ts";
import { addTodos } from "#recipes/sqlite-prisma/todos.ts";
import { prisma } from "#recipes/sqlite-prisma/db.ts";

todoRecipeTests({
  url: "/sqlite-prisma",
  seed: async (titles) => {
    await prisma.todo.createMany({ data: titles.map((title) => ({ title })) });
  },
  addTodos,
  read: () => prisma.todo.findMany({ orderBy: { id: "asc" } }),
});
