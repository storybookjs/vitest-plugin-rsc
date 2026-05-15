"use client";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html>
      <body>
        <main>
          <h1>Global route error boundary</h1>
          <p>{error.message}</p>
        </main>
      </body>
    </html>
  );
}
