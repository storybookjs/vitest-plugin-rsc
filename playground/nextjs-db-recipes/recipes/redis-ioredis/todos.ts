import type { Result } from "ioredis";
import type { Todo } from "#components/todos.tsx";
import { redis } from "./db.ts";

// A todo is a hash, `todo:<id>`, and the list `todos` has the ids in order.
const ids = "todos";
const lastId = "todos:last-id";
const keyOf = (id: number | string) => `todo:${id}`;

// A todo with the next id, in one step: the server runs a script as a whole.
// The script makes the key of the hash itself, as `keyOf()` does, from the id
// it has only then: not a key of a client with a `keyPrefix`, or of a
// cluster. The id as `%d`: ioredis-mock's Lua has the number INCR gives as 1.0.
redis.defineCommand("addTodo", {
  numberOfKeys: 2,
  lua: `
local id = string.format("%d", redis.call("INCR", KEYS[1]))
redis.call("HSET", "todo:" .. id, "id", id, "title", ARGV[1], "done", "0", "createdAt", ARGV[2])
redis.call("RPUSH", KEYS[2], id)
return id
`,
});
// A todo marked done, or not: a read and a write, in one step too. `false`,
// which Redis answers as nil, for no todo: ioredis-mock's Lua has no
// `redis.error_reply()`.
redis.defineCommand("toggleTodo", {
  numberOfKeys: 1,
  lua: `
local done = redis.call("HGET", KEYS[1], "done")
if not done then return false end
redis.call("HSET", KEYS[1], "done", done == "1" and "0" or "1")
return done
`,
});
// The scripts as commands of the client, and of its `multi()`.
declare module "ioredis" {
  interface RedisCommander<Context> {
    addTodo(lastId: string, ids: string, title: string, createdAt: number): Result<string, Context>;
    toggleTodo(key: string): Result<string | null, Context>;
  }
}

export async function listTodos(): Promise<Todo[]> {
  const pipeline = redis.pipeline();
  for (const id of await redis.lrange(ids, 0, -1)) pipeline.hgetall(keyOf(id));
  const results = (await pipeline.exec()) ?? [];
  return results.map(([error, hash]) => {
    if (error) throw error;
    const todo = hash as Record<string, string>;
    return {
      id: Number(todo.id),
      title: todo.title,
      done: todo.done === "1",
      createdAt: new Date(Number(todo.createdAt)),
    };
  });
}

export async function addTodo(title: string): Promise<void> {
  await redis.addTodo(lastId, ids, title, Date.now());
}

export async function toggleTodo(id: number): Promise<void> {
  if (!(await redis.toggleTodo(keyOf(id)))) throw new Error(`No todo #${id}`);
}

// All of them, or none: a MULTI, which ioredis sends as one when it is
// complete. Redis undoes nothing of a MULTI, so the titles are checked before
// then: an empty one throws, and none of it is sent. An error of a command
// as it runs is in the answer of EXEC, not thrown.
export async function addTodos(titles: string[]): Promise<void> {
  const multi = redis.multi();
  for (const title of titles) {
    if (!title) throw new Error("A todo needs a title");
    multi.addTodo(lastId, ids, title, Date.now());
  }
  for (const [error] of (await multi.exec()) ?? []) if (error) throw error;
}
