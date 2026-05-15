import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://notes.example.test/notes",
      lastModified: new Date("2026-05-15T00:00:00.000Z"),
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];
}
