"use client";

export default function ConventionError({ error }: { error: Error & { digest?: string } }) {
  return (
    <main>
      <h1>Convention error boundary</h1>
      <p>{error.message}</p>
    </main>
  );
}
