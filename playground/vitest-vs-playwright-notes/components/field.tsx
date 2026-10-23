import type { InputHTMLAttributes } from "react";

// A labelled input with the error of the server, if any.
export function Field({
  label,
  name,
  error,
  ...input
}: { label: string; name: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <p>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : undefined}
        {...input}
      />
      {error && <span id={`${name}-error`}>{error}</span>}
    </p>
  );
}
