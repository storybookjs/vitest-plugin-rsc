"use client";

import { useActionState, useState } from "react";
import { emptyForm, type FormState } from "#lib/validation.ts";
import { Field } from "./field.tsx";

// The form of a new note and of a note's edit, with a counter of the
// characters of the content, as one types.
export function NoteForm({
  action: submit,
  note,
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  note?: { title: string; content: string };
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(submit, {
    ...emptyForm,
    values: note ?? {},
  });
  const [length, setLength] = useState((state.values.content ?? "").length);
  return (
    <form action={action}>
      <Field
        key={`title-${state.values.title}`}
        label="Title"
        name="title"
        defaultValue={state.values.title}
        error={state.errors.title}
      />
      <p>
        <label htmlFor="content">Content</label>
        <textarea
          key={`content-${state.values.content}`}
          id="content"
          name="content"
          defaultValue={state.values.content}
          onChange={(event) => setLength(event.target.value.length)}
          aria-invalid={state.errors.content ? true : undefined}
        />
        <span>{length} / 2000</span>
        {state.errors.content && <span>{state.errors.content}</span>}
      </p>
      <button type="submit" disabled={pending}>
        {submitLabel}
      </button>
    </form>
  );
}
