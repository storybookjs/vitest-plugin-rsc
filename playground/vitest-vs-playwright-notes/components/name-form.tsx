"use client";

import { useActionState } from "react";
import { updateName } from "#lib/actions.ts";
import { emptyForm } from "#lib/validation.ts";
import { Field } from "./field.tsx";

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateName, { ...emptyForm, values: { name } });
  return (
    <form action={action}>
      <Field
        key={state.values.name}
        label="Name"
        name="name"
        defaultValue={state.values.name}
        error={state.errors.name}
      />
      <button type="submit" disabled={pending}>
        Save name
      </button>
    </form>
  );
}
