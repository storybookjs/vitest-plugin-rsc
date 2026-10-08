import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { expect, open, runChecks, type Check } from "../../../scripts/check-host.ts";

// What the notes app does in a host page, with a dev server and in a static
// build: see scripts/check-host.ts for how to run it.

const pathname = (page: Page) => page.evaluate(() => window.location.pathname);
const heading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name }).waitFor();

const checks: Record<string, Check> = {
  // The notes of the user the host signed in, from the database in the browser.
  async notes(page, host) {
    const response = await open(page, host, "url=/notes");
    expect(response.status, 200, "the status");
    await heading(page, "Notes");
    await page.getByText("2 notes · 1 favorited").waitFor();
    await page.getByRole("heading", { name: "Seeded by the host" }).waitFor();
    await page.getByRole("heading", { name: "Groceries" }).waitFor();
  },
  // Tailwind, through PostCSS, and a font of `next/font/google`.
  async styles(page, host) {
    await open(page, host, "url=/notes");
    const style = await page.evaluate(() => {
      const { fontWeight, fontFamily } = getComputedStyle(document.querySelector("h1")!);
      return { fontWeight, fontFamily };
    });
    expect(style.fontWeight, "600", "the weight of the heading");
    expect(style.fontFamily, 'Geist, "Geist Fallback"', "the font of the heading");
    await page.waitForFunction(
      () =>
        Array.from(document.fonts).some(
          (face) => /^"?Geist"?$/.test(face.family) && face.status === "loaded",
        ),
      null,
      { timeout: 10_000 },
    );
  },
  // A dynamic route, there and back with Next's router.
  async note(page, host) {
    await open(page, host, "url=/notes");
    await page.getByRole("link", { name: "Seeded by the host" }).click();
    await heading(page, "Seeded by the host");
    await page.getByText("From host/main.tsx").waitFor();
    expect(await pathname(page), "/notes/33333333-3333-4333-8333-333333333333", "the pathname");
    await page.getByRole("link", { name: "All notes" }).click();
    await heading(page, "Notes");
  },
  // A Server Action of a form writes to the database, and the list reads it.
  async favorite(page, host) {
    await open(page, host, "url=/notes");
    await page.getByRole("button", { name: "Favorite note", exact: true }).click();
    await page.getByText("2 notes · 2 favorited").waitFor();
  },
  // A form whose Server Action keeps what failed in a cookie for the next
  // render, and redirects to the note it made.
  async create(page, host) {
    await open(page, host, "url=/notes/new");
    await heading(page, "New note");
    await page.getByLabel("Content").fill("Keep this body");
    await page.getByRole("button", { name: "Create note" }).click();
    await page.getByText("Title is required.").waitFor();
    expect(await page.getByLabel("Content").inputValue(), "Keep this body", "the content");
    await page.getByLabel("Title").fill("Written in the browser");
    await page.getByRole("button", { name: "Create note" }).click();
    await heading(page, "Written in the browser");
    await page.getByText("Keep this body").waitFor();
    await page.getByRole("link", { name: "All notes" }).click();
    await page.getByText("3 notes · 1 favorited").waitFor();
  },
  // A page that asks the auth server, which the host stands in for.
  async profile(page, host) {
    await open(page, host, "url=/profile");
    await heading(page, "Profile");
    await page.getByText("Signed in as test@example.com.").waitFor();
    await page.getByText("No passkeys yet").waitFor();
  },
  // A route handler, asked with the `fetch` of the page.
  async routeHandler(page, host) {
    await open(page, host, "url=/notes");
    const answer = await page.evaluate(async () => {
      const response = await fetch("/healthcheck");
      return `${response.status} ${await response.text()}`;
    });
    expect(answer, "200 OK", "what /healthcheck answers");
  },
  // A page that redirects a visitor who is not signed in.
  async signedOut(page, host) {
    const response = await open(page, host, "user=none&url=/notes");
    await heading(page, "Welcome back to Notes Demo");
    expect(await pathname(page), "/auth/sign-in", "the pathname");
    expect(response.redirected, true, "whether the response was redirected");
  },
  // A package of Client Components, with a menu in a portal and next-themes.
  async theme(page, host) {
    await open(page, host, "url=/notes");
    await page.getByRole("button", { name: "Toggle theme" }).click();
    await page.getByRole("menuitem", { name: "Dark" }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
      "dark",
      "the color scheme",
    );
  },
};

await runChecks({
  root: fileURLToPath(new URL("../", import.meta.url)),
  configFile: fileURLToPath(new URL("./vite.config.ts", import.meta.url)),
  page: "host/index.html",
  checks,
});
