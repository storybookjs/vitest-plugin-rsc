export type FormState = {
  errors: Record<string, string>;
  values: Record<string, string>;
};

export const emptyForm: FormState = { errors: {}, values: {} };

export function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export function noteErrors(title: string, content: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required.";
  else if (title.length > 100) errors.title = "Title is at most 100 characters.";
  if (content.length > 2000) errors.content = "Content is at most 2000 characters.";
  return errors;
}

/** The error of a user's name, if any: it is in the header and in the user cookie. */
export function nameError(name: string): string | undefined {
  if (!name) return "Name is required.";
  if (name.length > 100) return "Name is at most 100 characters.";
  return undefined;
}
