import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { expect, open, runChecks, type Check } from "../../scripts/check-host.ts";

// What the app does in the host page, with a dev server and in a static
// build: see scripts/check-host.ts for how to run it.

const pathname = (page: Page) => page.evaluate(() => window.location.pathname);
const heading = (page: Page, name: string) => page.getByRole("heading", { name }).waitFor();

const checks: Record<string, Check> = {
  async home(page, host) {
    const response = await open(page, host, "url=/");
    expect(response.status, 200, "the status");
    await heading(page, "Home");
    expect(await pathname(page), "/", "the pathname");
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
  },
  // `next/font/local` in the root layout: its class is on the body, and the
  // browser has loaded the file its CSS names.
  async font(page, host) {
    await open(page, host, "url=/");
    await heading(page, "Home");
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(/^"?geist"?,/i.test(family), true, `the font family of the body, ${family},`);
    await page.waitForFunction(
      () =>
        Array.from(document.fonts).some(
          (face) => /^"?geist"?$/i.test(face.family) && face.status === "loaded",
        ),
      null,
      { timeout: 10_000 },
    );
  },
  // `next/image` with an imported file, in a Server Component and in a Client
  // Component, and a file of Vite's `?url`.
  async image(page, host) {
    await open(page, host, "url=/");
    for (const alt of ["Logo", "Badge logo", "Badge dot"]) {
      await page.waitForFunction(
        (name) => {
          const image = document.querySelector<HTMLImageElement>(`img[alt="${name}"]`);
          return image?.complete && image.naturalWidth > 0;
        },
        alt,
        { timeout: 10_000 },
      );
    }
  },
  // The global CSS of the layout, and the CSS module of a Client Component.
  async styles(page, host) {
    await open(page, host, "url=/");
    const style = (selector: string, property: string) =>
      page.evaluate(
        ([element, name]) =>
          getComputedStyle(document.querySelector(element!)!).getPropertyValue(name!),
        [selector, property],
      );
    expect(await style("body", "margin-top"), "32px", "the margin of the body");
    expect(
      await style("[data-testid=badge]", "background-color"),
      "rgb(0, 112, 243)",
      "the background of the badge",
    );
  },
  // `next/dynamic` without SSR: a chunk the browser asks for, with CSS of its own.
  async dynamic(page, host) {
    await open(page, host, "url=/");
    await page.getByText("Panel: loaded in a browser").waitFor();
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("[data-testid=panel]")!).borderLeftColor ===
        "rgb(121, 40, 202)",
      null,
      { timeout: 10_000 },
    );
  },
  // A page that waits for data. Its first load has all of it. A navigation
  // shows `loading.tsx`, and then the fallback of the boundary in the page.
  async loading(page, host) {
    await open(page, host, "url=/slow");
    await heading(page, "Slow");
    await page.getByText("Report: ready").waitFor();
    await page.getByRole("link", { name: "Home" }).click();
    await heading(page, "Home");
    await page.getByRole("link", { name: "Slow" }).click();
    await page.getByText("Loading the slow page…").waitFor();
    await page.getByText("Loading the report…").waitFor();
    await page.getByText("Report: ready").waitFor();
    expect(await page.title(), "Slow | Host demo", "the title");
  },
  // A route handler, asked by the `fetch` of a Client Component. It reads
  // what the host seeded.
  async routeHandler(page, host) {
    await open(page, host, "url=/");
    await page.getByRole("button", { name: "Load notes" }).click();
    await page.getByText("Notes: Seeded by the host").waitFor();
  },
  async redirect(page, host) {
    const response = await open(page, host, "url=/old");
    await heading(page, "Seeded by the host");
    expect(await pathname(page), "/notes/7", "the pathname");
    expect(response.redirected, true, "whether the response was redirected");
  },
  // `proxy.ts` serves another route at a URL, which stays the one of the document.
  async proxy(page, host) {
    const response = await open(page, host, "url=/latest");
    await heading(page, "Seeded by the host");
    expect(response.status, 200, "the status");
    expect(await pathname(page), "/latest", "the pathname");
  },
  async notFound(page, host) {
    const response = await open(page, host, "url=/notes/unknown");
    await heading(page, "No such page");
    expect(response.status, 404, "the status");
    expect(await pathname(page), "/notes/unknown", "the pathname");
  },
  // A Server Action sets a cookie, and the next render reads it: the one of
  // the action, and the one of a navigation after it.
  async cookies(page, host) {
    await open(page, host, "url=/settings");
    await page.getByText("Theme: light").waitFor();
    await page.getByRole("button", { name: "Use the dark theme" }).click();
    await page.getByText("Theme: dark").waitFor();
    expect(
      await page.evaluate(() => document.cookie.includes("theme=dark")),
      true,
      "whether the browser has the cookie",
    );
    await page.getByRole("link", { name: "Home" }).click();
    await heading(page, "Home");
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByText("Theme: dark").waitFor();
  },
  // Next's router, there and back: with links, and with the history of the
  // browser. The document stays the one that loaded.
  async navigation(page, host) {
    await open(page, host, "url=/");
    await page.evaluate(() => void ((window as { __loadedOnce?: boolean }).__loadedOnce = true));
    await page.getByRole("link", { name: "Note 7" }).click();
    await heading(page, "Seeded by the host");
    expect(await page.title(), "Seeded by the host | Host demo", "the title");
    expect(await pathname(page), "/notes/7", "the pathname");
    await page.getByRole("link", { name: "Home" }).click();
    await heading(page, "Home");
    expect(await pathname(page), "/", "the pathname");
    await page.evaluate(() => window.history.back());
    await heading(page, "Seeded by the host");
    expect(await pathname(page), "/notes/7", "the pathname after going back");
    await page.evaluate(() => window.history.forward());
    await heading(page, "Home");
    expect(
      await page.evaluate(() => (window as { __loadedOnce?: boolean }).__loadedOnce),
      true,
      "whether the document is the one that loaded",
    );
  },
  async note(page, host) {
    await open(page, host, "url=/notes/7");
    await heading(page, "Seeded by the host");
    // A Server Action, and the page it revalidates.
    await page.getByRole("button", { name: "Likes: 0" }).click();
    await page.getByRole("button", { name: "Likes: 1" }).waitFor();
  },
  // Outside Vitest `cleanup()` forgets only what the app added, while a page
  // of it was open: the rest is the host's.
  async storage(page, host) {
    await open(page, host, "view=storage");
    const stored = await page.evaluate(
      () => (window as { __hostStorage?: { keys: string[]; cookie: string } }).__hostStorage,
    );
    expect(
      JSON.stringify(stored?.keys),
      JSON.stringify(["host-setting"]),
      "the keys of the storage",
    );
    expect(stored?.cookie, "host-cookie=kept", "the cookies");
  },
  async node(page, host) {
    await open(page, host, "view=node");
    await heading(page, "Hello from the host");
    await page.getByText("The server read the request.").waitFor();
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
    // The host's own document stays: a node renders in a container.
    await page.getByText("Loading the host…").waitFor();
  },
};

await runChecks({ root: fileURLToPath(new URL("./", import.meta.url)), checks });
