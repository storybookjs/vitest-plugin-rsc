import { todoRecipeTests } from "#test/todo-recipe.ts";
import { addTodos } from "#recipes/postgres-prisma/todos.ts";
import { prisma } from "#recipes/postgres-prisma/db.ts";

todoRecipeTests({
  url: "/postgres-prisma",
  seed: async (titles) => {
    await prisma.todo.createMany({ data: titles.map((title) => ({ title })) });
  },
  addTodos,
  read: () => prisma.todo.findMany({ orderBy: { id: "asc" } }),
});
