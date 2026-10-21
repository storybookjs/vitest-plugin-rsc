import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { handleRequest, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// env/server.ts has no default for SUPPORT_EMAIL: the page's server code
// reads it from .env.test, as the plugin fills `process.env` for a run.
test("shows the support address of the env", async () => {
  await renderServer({ url: "/" });

  await expect
    .element(page.getByRole("link", { name: "support@notes.example" }))
    .toHaveAttribute("href", "mailto:support@notes.example");
});

// `app/favicon.ico` is a metadata file: the page links it, with the hash of
// what is in it, and its route serves it.
test("links the favicon of the app, and serves it", async () => {
  await renderServer({ url: "/" });

  const href = document.querySelector('link[rel="icon"]')?.getAttribute("href");
  expect(href).toMatch(/^\/favicon\.ico\?\w+$/);
  const response = await handleRequest(href!);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/x-icon");
});
