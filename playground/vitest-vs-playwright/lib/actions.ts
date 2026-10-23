"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { addTodo, deleteTodo, renameTodo, toggleTodo } from "./todos.ts";

export async function add(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect("/?error=title");
  await addTodo(title);
  redirect("/");
}

export async function toggle(formData: FormData): Promise<void> {
  await toggleTodo(Number(formData.get("id")));
  refresh();
}

export async function remove(formData: FormData): Promise<void> {
  await deleteTodo(Number(formData.get("id")));
  redirect("/");
}

export async function rename(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect(`/todos/${id}/edit?error=title`);
  await renameTodo(id, title);
  redirect(`/todos/${id}`);
}
