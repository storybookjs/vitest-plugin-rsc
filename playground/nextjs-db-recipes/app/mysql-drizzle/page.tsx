import { revalidatePath } from "next/cache";
import { connection } from "next/server";
import { Todos } from "#components/todos.tsx";
import { addTodo, listTodos, toggleTodo } from "#recipes/mysql-drizzle/todos.ts";

async function add(formData: FormData) {
  "use server";
  await addTodo(String(formData.get("title")));
  revalidatePath("/mysql-drizzle");
}

async function toggle(formData: FormData) {
  "use server";
  await toggleTodo(Number(formData.get("id")));
  revalidatePath("/mysql-drizzle");
}

export default async function Page() {
  await connection();
  return <Todos title="MySQL + Drizzle" todos={await listTodos()} add={add} toggle={toggle} />;
}
