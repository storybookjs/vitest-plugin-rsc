import type { Metadata } from "next";
import { forbidden, notFound, redirect, unauthorized } from "next/navigation";

export const metadata: Metadata = {
  title: "Route convention metadata",
};

export default async function ConventionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; mode?: string }>;
}) {
  const { from, mode } = await searchParams;
  if (mode === "not-found") notFound();
  if (mode === "forbidden") forbidden();
  if (mode === "unauthorized") unauthorized();
  if (mode === "redirect") redirect("/route-patterns/conventions?from=render-redirect");
  if (mode === "error") throw new Error("segment convention failure");

  return (
    <main>
      <h1>Route conventions</h1>
      <p>The conventions page rendered through the Next app route tree.</p>
      {from ? <p>Redirect source: {from}</p> : null}
    </main>
  );
}
