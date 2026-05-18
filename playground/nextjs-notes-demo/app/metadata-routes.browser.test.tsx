import { expect, test } from "vitest";

test("browser fetch dispatches metadata routes through MSW Edge App Route handlers", async () => {
  await expectMetadataRoute({
    url: "/robots.txt",
    contentType: "text/plain",
    bodyFragment: "Disallow: /private",
  });
  await expectMetadataRoute({
    url: "/manifest.webmanifest",
    contentType: "application/manifest+json",
    bodyFragment: '"name":"Vitest RSC Notes"',
  });
  await expectMetadataRoute({
    url: "/sitemap/notes.xml",
    contentType: "application/xml",
    bodyFragment: "<loc>https://notes.example.test/notes</loc>",
  });
});

async function expectMetadataRoute(options: {
  url: string;
  contentType: string;
  bodyFragment: string;
}) {
  const response = await fetch(options.url);
  const body = await response.text();

  expect(response.status, options.url).toBe(200);
  expect(response.headers.get("content-type"), options.url).toContain(options.contentType);
  expect(body, options.url).toContain(options.bodyFragment);
}
