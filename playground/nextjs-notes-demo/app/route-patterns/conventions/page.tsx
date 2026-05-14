import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Route convention metadata",
};

export default function ConventionPage() {
  return (
    <main>
      <h1>Route conventions</h1>
      <p>The conventions page rendered through the Next app route tree.</p>
    </main>
  );
}
