import type { MetadataRoute } from "next";

export function generateSitemaps() {
  return [{ id: "notes" }, { id: "archive" }];
}

export default async function sitemap({
  id,
}: {
  id?: string | Promise<string | undefined>;
} = {}): Promise<MetadataRoute.Sitemap> {
  const sitemapId = await id;
  const path = sitemapId === "archive" ? "/notes/archive" : "/notes";

  return [
    {
      url: `https://notes.example.test${path}`,
      lastModified: new Date("2026-05-15T00:00:00.000Z"),
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];
}
