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
