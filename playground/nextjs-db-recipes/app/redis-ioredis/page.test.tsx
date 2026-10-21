import { addTodos, listTodos } from "#recipes/redis-ioredis/todos.ts";
import { todoRecipeTests } from "#test/todo-recipe.ts";

todoRecipeTests({
  url: "/redis-ioredis",
  // A todo is a hash and an id in a list: the test writes them as the app does.
  seed: addTodos,
  addTodos,
  read: listTodos,
});
