// @vitest-environment node

import { expect, test } from "vitest";
import manifest from "./manifest";
import OpenGraphImage, {
  alt as openGraphAlt,
  generateImageMetadata as generateOpenGraphImageMetadata,
  size as openGraphSize,
} from "./opengraph-image";
import robots from "./robots";
import sitemap, { generateSitemaps } from "./sitemap";
import TwitterImage, {
  alt as twitterAlt,
  generateImageMetadata as generateTwitterImageMetadata,
  size as twitterSize,
} from "./twitter-image";

test("metadata route exports cover robots, sitemap, and manifest conventions", async () => {
  expect(robots()).toEqual({
    rules: [
      {
        allow: "/",
        disallow: "/private",
        userAgent: "*",
      },
    ],
    sitemap: "https://notes.example.test/sitemap.xml",
  });
  expect(generateSitemaps()).toEqual([{ id: "notes" }, { id: "archive" }]);
  expect(await sitemap()).toEqual([
    {
      changeFrequency: "daily",
      lastModified: new Date("2026-05-15T00:00:00.000Z"),
      priority: 0.8,
      url: "https://notes.example.test/notes",
    },
  ]);
  expect(await sitemap({ id: Promise.resolve("archive") })).toEqual([
    {
      changeFrequency: "daily",
      lastModified: new Date("2026-05-15T00:00:00.000Z"),
      priority: 0.8,
      url: "https://notes.example.test/notes/archive",
    },
  ]);
  expect(manifest()).toEqual(
    expect.objectContaining({
      display: "standalone",
      icons: [{ sizes: "any", src: "/favicon.ico", type: "image/x-icon" }],
      name: "Vitest RSC Notes",
      start_url: "/notes",
    }),
  );
});

test("generated metadata image routes expose metadata and image responses", async () => {
  expect(generateOpenGraphImageMetadata()).toEqual([
    {
      alt: openGraphAlt,
      contentType: "image/png",
      id: "notes",
      size: openGraphSize,
    },
  ]);
  expect(generateTwitterImageMetadata()).toEqual([
    {
      alt: twitterAlt,
      contentType: "image/png",
      id: "notes-twitter",
      size: twitterSize,
    },
  ]);

  const openGraphResponse = OpenGraphImage({ id: "notes" });
  expect(openGraphResponse.headers.get("content-type")).toBe("image/png");
  expect((await openGraphResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);

  const twitterResponse = TwitterImage({ id: "notes-twitter" });
  expect(twitterResponse.headers.get("content-type")).toBe("image/png");
  expect((await twitterResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);
});
