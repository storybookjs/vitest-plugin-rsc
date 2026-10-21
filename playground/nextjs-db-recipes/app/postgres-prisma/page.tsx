import { revalidatePath } from "next/cache";
import { connection } from "next/server";
import { Todos } from "#components/todos.tsx";
import { addTodo, listTodos, toggleTodo } from "#recipes/postgres-prisma/todos.ts";

async function add(formData: FormData) {
  "use server";
  await addTodo(String(formData.get("title")));
  revalidatePath("/postgres-prisma");
}

async function toggle(formData: FormData) {
  "use server";
  await toggleTodo(Number(formData.get("id")));
  revalidatePath("/postgres-prisma");
}

export default async function Page() {
  await connection();
  return <Todos title="Postgres + Prisma" todos={await listTodos()} add={add} toggle={toggle} />;
}
