import { revalidatePath } from "next/cache";
import { connection } from "next/server";
import { Todos } from "#components/todos.tsx";
import { addTodo, listTodos, toggleTodo } from "#recipes/mysql-sql/todos.ts";

async function add(formData: FormData) {
  "use server";
  await addTodo(String(formData.get("title")));
  revalidatePath("/mysql-sql");
}

async function toggle(formData: FormData) {
  "use server";
  await toggleTodo(Number(formData.get("id")));
  revalidatePath("/mysql-sql");
}

export default async function Page() {
  await connection();
  return <Todos title="MySQL + SQL" todos={await listTodos()} add={add} toggle={toggle} />;
}
