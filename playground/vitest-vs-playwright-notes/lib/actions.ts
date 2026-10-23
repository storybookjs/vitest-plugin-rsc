"use server";

import { and, eq, not } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, requireUser, startSession } from "./auth.ts";
import { db } from "./db.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { notes, users } from "./schema.ts";
import { field, noteErrors, type FormState } from "./validation.ts";

export async function signUp(_: FormState, formData: FormData): Promise<FormState> {
  const values = {
    name: field(formData, "name"),
    email: field(formData, "email").toLowerCase(),
  };
  const password = String(formData.get("password") ?? "");
  const errors: Record<string, string> = {};
  if (!values.name) errors.name = "Name is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))
    errors.email = "Enter a valid email address.";
  if (password.length < 8) errors.password = "Password must be at least 8 characters.";
  if (!errors.email) {
    const [taken] = await db.select().from(users).where(eq(users.email, values.email));
    if (taken) errors.email = "An account with this email already exists.";
  }
  if (Object.keys(errors).length) return { errors, values };
  const [user] = await db
    .insert(users)
    .values({ ...values, passwordHash: await hashPassword(password) })
    .returning();
  await startSession(user!.id);
  redirect("/notes?welcome=1");
}

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const values = { email: field(formData, "email").toLowerCase() };
  const password = String(formData.get("password") ?? "");
  const [user] = await db.select().from(users).where(eq(users.email, values.email));
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { errors: { form: "Invalid email or password." }, values };
  }
  await startSession(user.id);
  redirect("/notes");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/sign-in?signed-out=1");
}

export async function createNote(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = { title: field(formData, "title"), content: field(formData, "content") };
  const errors = noteErrors(values.title, values.content);
  if (Object.keys(errors).length) return { errors, values };
  const [note] = await db
    .insert(notes)
    .values({ ...values, ownerId: user.id })
    .returning();
  redirect(`/notes/${note!.id}?created=1`);
}

export async function updateNote(id: number, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = { title: field(formData, "title"), content: field(formData, "content") };
  const errors = noteErrors(values.title, values.content);
  if (Object.keys(errors).length) return { errors, values };
  await db
    .update(notes)
    .set(values)
    .where(and(eq(notes.id, id), eq(notes.ownerId, user.id)));
  redirect(`/notes/${id}?saved=1`);
}

export async function toggleFavorite(formData: FormData): Promise<void> {
  const user = await requireUser();
  await db
    .update(notes)
    .set({ favorite: not(notes.favorite) })
    .where(and(eq(notes.id, Number(formData.get("id"))), eq(notes.ownerId, user.id)));
  refresh();
}

export async function deleteNote(formData: FormData): Promise<void> {
  const user = await requireUser();
  await db
    .delete(notes)
    .where(and(eq(notes.id, Number(formData.get("id"))), eq(notes.ownerId, user.id)));
  redirect("/notes?deleted=1");
}

export async function updateName(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = { name: field(formData, "name") };
  if (!values.name) return { errors: { name: "Name is required." }, values };
  await db.update(users).set(values).where(eq(users.id, user.id));
  // The header of every page shows the name.
  revalidatePath("/", "layout");
  redirect("/profile?saved=1");
}
