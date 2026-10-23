"use client";

import { useActionState } from "react";
import { signIn } from "#lib/actions.ts";
import { emptyForm } from "#lib/validation.ts";
import { Field } from "./field.tsx";

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, emptyForm);
  return (
    <form action={action}>
      {state.errors.form && <output>{state.errors.form}</output>}
      <Field label="Email" name="email" defaultValue={state.values.email} />
      <Field label="Password" name="password" type="password" />
      <button type="submit" disabled={pending}>
        Sign in
      </button>
    </form>
  );
}
