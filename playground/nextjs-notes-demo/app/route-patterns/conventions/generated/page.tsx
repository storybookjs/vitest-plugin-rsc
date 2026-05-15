import type { Metadata, Viewport } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const dynamicParams = true;
export const runtime = "edge";
export const preferredRegion = "auto";
export const maxDuration = 5;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Generated route convention metadata",
    description: "Generated through Next route metadata conventions.",
  };
}

export function generateViewport(): Viewport {
  return {
    themeColor: "#123456",
    colorScheme: "dark",
  };
}

export default function GeneratedConventionPage() {
  return (
    <main>
      <h1>Generated route conventions</h1>
      <p>Next app-render resolved this page through generated route metadata.</p>
    </main>
  );
}
