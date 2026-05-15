import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Route convention metadata",
};

export default async function ConventionPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  if (mode === "not-found") notFound();

  return (
    <main>
      <h1>Route conventions</h1>
      <p>The conventions page rendered through the Next app route tree.</p>
    </main>
  );
}
