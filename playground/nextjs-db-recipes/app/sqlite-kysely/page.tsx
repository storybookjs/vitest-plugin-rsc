import { revalidatePath } from "next/cache";
import { connection } from "next/server";
import { Todos } from "#components/todos.tsx";
import { addTodo, listTodos, toggleTodo } from "#recipes/sqlite-kysely/todos.ts";

async function add(formData: FormData) {
  "use server";
  await addTodo(String(formData.get("title")));
  revalidatePath("/sqlite-kysely");
}

async function toggle(formData: FormData) {
  "use server";
  await toggleTodo(Number(formData.get("id")));
  revalidatePath("/sqlite-kysely");
}

export default async function Page() {
  await connection();
  return <Todos title="SQLite + Kysely" todos={await listTodos()} add={add} toggle={toggle} />;
}
