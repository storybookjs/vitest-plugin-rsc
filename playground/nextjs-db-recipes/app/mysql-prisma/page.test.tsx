import { todoRecipeTests } from "#test/todo-recipe.ts";
import { addTodos } from "#recipes/mysql-prisma/todos.ts";
import { prisma } from "#recipes/mysql-prisma/db.ts";

todoRecipeTests({
  url: "/mysql-prisma",
  seed: async (titles) => {
    await prisma.todo.createMany({ data: titles.map((title) => ({ title })) });
  },
  addTodos,
  read: () => prisma.todo.findMany({ orderBy: { id: "asc" } }),
});
