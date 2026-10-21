import { revalidatePath } from "next/cache";
import { connection } from "next/server";
import { Todos } from "#components/todos.tsx";
import { addTodo, listTodos, toggleTodo } from "#recipes/redis-ioredis/todos.ts";

async function add(formData: FormData) {
  "use server";
  await addTodo(String(formData.get("title")));
  revalidatePath("/redis-ioredis");
}

async function toggle(formData: FormData) {
  "use server";
  await toggleTodo(Number(formData.get("id")));
  revalidatePath("/redis-ioredis");
}

export default async function Page() {
  await connection();
  return <Todos title="Redis + ioredis" todos={await listTodos()} add={add} toggle={toggle} />;
}
