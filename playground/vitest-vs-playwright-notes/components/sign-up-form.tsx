"use client";

import { useActionState } from "react";
import { signUp } from "#lib/actions.ts";
import { emptyForm } from "#lib/validation.ts";
import { Field } from "./field.tsx";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, emptyForm);
  return (
    <form action={action}>
      <Field label="Name" name="name" defaultValue={state.values.name} error={state.errors.name} />
      <Field
        label="Email"
        name="email"
        defaultValue={state.values.email}
        error={state.errors.email}
      />
      <Field label="Password" name="password" type="password" error={state.errors.password} />
      <button type="submit" disabled={pending}>
        Create account
      </button>
    </form>
  );
}
