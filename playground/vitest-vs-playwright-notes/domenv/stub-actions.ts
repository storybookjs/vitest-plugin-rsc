// The server part, stubbed: the client components' actions, as plain async
// functions with the app's validation, no database, no redirect.
import { field, noteErrors, type FormState } from "#lib/validation.ts";

export async function createNote(_: FormState, formData: FormData): Promise<FormState> {
  const values = { title: field(formData, "title"), content: field(formData, "content") };
  const errors = noteErrors(values.title, values.content);
  await Promise.resolve();
  return { errors, values };
}
export const signIn = async (_: FormState, fd: FormData): Promise<FormState> => ({
  errors: { form: "Invalid email or password." },
  values: { email: field(fd, "email") },
});
export const signUp = signIn;
export const updateName = signIn;
export const signOut = async () => {};
