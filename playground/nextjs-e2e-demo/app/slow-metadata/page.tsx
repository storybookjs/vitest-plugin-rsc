import type { Metadata } from "next";

// Metadata that takes a while: Next streams it after the page.
export async function generateMetadata(): Promise<Metadata> {
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { description: "Streamed after the page" };
}

export default function SlowMetadataPage() {
  return <h1>Slow metadata</h1>;
}
