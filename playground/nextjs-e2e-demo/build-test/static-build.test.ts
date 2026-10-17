import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { createProject, serveFiles, test, type Site } from "../../test-helpers/host.ts";

// The app in a static build, which `vite build` makes with Vite's app builder:
// see vite.config.ts. A server of files serves the directory, and nothing
// else: no dev server, no server of the app. The page of `index.html` hosts
// the app, see host/main.tsx.

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");

type HostResponse = { status: number; url: string; redirected: boolean };

/**
 * Opens the host page with the URL of the app in its query: see host/main.tsx.
 * Resolves with the response of the server in the browser.
 */
async function open(
  page: Page,
  site: Site,
  url: string,
  query: Record<string, string> = {},
): Promise<HostResponse> {
  await page.goto(`${site.url}?${new URLSearchParams({ url, ...query })}`);
  await page.waitForFunction(() => (window as { __hostState?: string }).__hostState);
  const host = await page.evaluate(() => {
    const state = window as {
      __hostState?: string;
      __hostError?: unknown;
      __hostResponse?: HostResponse;
    };
    return {
      state: state.__hostState,
      error: String(state.__hostError),
      response: state.__hostResponse,
    };
  });
  expect(host.state, `the host of ${url} (${host.error})`).toBe("ready");
  return host.response!;
}

/** Opens another page of the app in the same tab, as a second `renderServer()` of a test. */
const openNext = (page: Page, url: string) =>
  page.evaluate(
    (url) => (window as { __hostOpen?: (url: string) => Promise<HostResponse> }).__hostOpen!(url),
    url,
  );

const pathname = (page: Page) => page.evaluate(() => window.location.pathname);
const heading = (page: Page, name: string) => page.getByRole("heading", { name }).waitFor();
const loadedImage = (page: Page, alt: string) =>
  page.waitForFunction((name) => {
    const image = document.querySelector<HTMLImageElement>(`img[alt="${name}"]`);
    return image?.complete && image.naturalWidth > 0;
  }, alt);
const style = (page: Page, selector: string, property: string) =>
  page.evaluate(
    ([element, name]) =>
      getComputedStyle(document.querySelector(element!)!).getPropertyValue(name!),
    [selector, property],
  );
const fontLoaded = (page: Page, family: RegExp) =>
  page.waitForFunction(
    (source) =>
      Array.from(document.fonts).some(
        (face) => new RegExp(source).test(face.family) && face.status === "loaded",
      ),
    family.source,
  );

describe("a static build", () => {
  let site: Site;
  beforeAll(async () => {
    await createProject(root).run("vite", "build", "--configLoader", "native");
    site = await serveFiles(dist);
  });
  afterAll(() => site?.close());

  test("renders a page with a Client Component", async ({ page }) => {
    const response = await open(page, site, "/");
    expect(response.status).toBe(200);
    await heading(page, "Home");
    expect(await pathname(page)).toBe("/");
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
  });

  // A Server Component of the host, on a route of the app, with a Client
  // Component of the app and the Server Action it calls.
  test("renders a node of the host", async ({ page }) => {
    const response = await open(page, site, "/notes/7", { node: "7" });
    expect(response.status).toBe(200);
    await heading(page, "A node of the host");
    await page.getByText("Seeded by the host").waitFor();
    expect(await pathname(page)).toBe("/notes/7");
    const favorite = page.getByRole("button", { name: "Favorite" });
    expect(await favorite.getAttribute("aria-pressed")).toBe("false");
    await favorite.click();
    await expect
      .poll(() => favorite.getAttribute("aria-pressed"), { timeout: 30_000 })
      .toBe("true");
  });

  // The pages read the `db` that the host seeded in the rsc layer, and Next's
  // router navigates between them.
  test("navigates with Next's router", async ({ page }) => {
    await open(page, site, "/notes");
    await heading(page, "Notes");
    await page.getByRole("link", { name: "Seeded by the host" }).click();
    await heading(page, "Seeded by the host");
    expect(await pathname(page)).toBe("/notes/7");
    await page.getByText("From host/main.tsx").waitFor();
    await page.getByRole("link", { name: "Home" }).click();
    await heading(page, "Home");
  });

  test("redirects, and renders the not-found page with its status", async ({ page }) => {
    const redirected = await open(page, site, "/old");
    await heading(page, "Notes");
    expect(await pathname(page)).toBe("/notes");
    expect(redirected.redirected).toBe(true);

    // A path that is no route.
    const missing = await open(page, site, "/nope");
    await heading(page, "Nothing here");
    expect(missing.status).toBe(404);
    expect(await pathname(page)).toBe("/nope");

    // A page that calls notFound(). Its route has a loading.tsx, so the
    // response had started: the status is the 200 it started with.
    const unknown = await openNext(page, "/notes/unknown");
    await heading(page, "Nothing here");
    expect(unknown.status).toBe(200);
    expect(await pathname(page)).toBe("/notes/unknown");
  });

  // Global CSS, a CSS module of a Server Component and of a Client Component,
  // the CSS of a layout, and the CSS of a package, each a file of the build
  // that Next links.
  test("links the stylesheets of a route", async ({ page }) => {
    await open(page, site, "/styles");
    await heading(page, "Styles");
    expect(await style(page, "body", "background-color")).toBe("rgb(240, 240, 255)");
    expect(await style(page, ".global-note", "color")).toBe("rgb(0, 0, 255)");
    expect(await style(page, "section.styles-layout", "border-left-color")).toBe("rgb(0, 0, 255)");
    const card = page.getByText("Styled by a CSS module in a Server Component");
    expect(await card.evaluate((element) => getComputedStyle(element).color)).toBe(
      "rgb(0, 128, 0)",
    );
    const clientCard = page.getByText("Styled by a CSS module in a Client Component");
    expect(await clientCard.evaluate((element) => getComputedStyle(element).color)).toBe(
      "rgb(128, 0, 0)",
    );
    expect(await style(page, ".package-reset", "color")).toBe("rgb(0, 128, 128)");
    expect(await style(page, ".package-badge", "color")).toBe("rgb(128, 128, 0)");
    const badge = page.getByText("Styled by the CSS of a Client Component of a package");
    expect(await badge.evaluate((element) => getComputedStyle(element).color)).toBe(
      "rgb(0, 0, 128)",
    );
    // The CSS of the page goes with the page, when the next page loads.
    await openNext(page, "/notice");
    await page.getByText("The office is closed on Friday.").waitFor();
    expect(await style(page, "body", "background-color")).toBe("rgba(0, 0, 0, 0)");
  });

  // `next/font/local` and `next/font/google` in a Server Component, a Client
  // Component and a package: their CSS and the font files are files of the build.
  test("serves the fonts that Next's loaders made", async ({ page }) => {
    await open(page, site, "/fonts");
    await heading(page, "Fonts");
    await page.getByText("Set in a font of a Client Component").waitFor();
    await fontLoaded(page, /^"?geist"?$/i);
    const setInGeist = page.getByText("Set in Geist", { exact: true });
    expect(await setInGeist.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(
      /geist/i,
    );
  });

  // `next/image` with imported files, which `images.unoptimized` asks for as
  // they are, and a file of `public/`, which Vite copies into the build.
  test("serves the images of the app", async ({ page }) => {
    await open(page, site, "/images");
    await heading(page, "Images");
    await page.getByText("Logo: 40×30").waitFor();
    for (const alt of ["Logo", "Logo with a placeholder", "Plain logo", "Mark", "Hill"]) {
      await loadedImage(page, alt);
    }
  });

  // `next/dynamic` in a Server Component and a Client Component, with and
  // without SSR: chunks of the layers that load when they are asked for.
  test("loads what next/dynamic imports", async ({ page }) => {
    await open(page, site, "/lazy");
    await heading(page, "Lazy");
    await page.getByText("Summary: rendered on the server").waitFor();
    await page.getByText("Chart: drawn in a browser").waitFor();
    await page.getByRole("button", { name: "Legend: closed" }).click();
    await page.getByRole("button", { name: "Legend: open" }).waitFor();
  });

  // A Server Action from a form, which sets a cookie that the next render
  // reads, and one from a Client Component, which answers with a value.
  test("runs Server Actions, with the cookies of the app", async ({ page }) => {
    await open(page, site, "/settings");
    await heading(page, "Settings");
    await page.getByText("Language: en").waitFor();
    await page.getByRole("button", { name: "Use Dutch" }).click();
    await page.getByText("Language: nl").waitFor();

    await open(page, site, "/notes/7");
    const favorite = page.getByRole("button", { name: "Favorite" });
    await expect
      .poll(() => favorite.getAttribute("aria-pressed"), { timeout: 30_000 })
      .toBe("false");
    await favorite.click();
    await expect
      .poll(() => favorite.getAttribute("aria-pressed"), { timeout: 30_000 })
      .toBe("true");
  });

  // A route handler, asked by the `fetch` of a Client Component, which then
  // has the router render the page again.
  test("answers a route handler", async ({ page }) => {
    await open(page, site, "/notes/7");
    await page.getByLabel("New title").fill("Renamed by the build");
    await page.getByRole("button", { name: "Rename" }).click();
    await page.getByText("Renamed to Renamed by the build by a guest").waitFor();
    await heading(page, "Renamed by the build");
  });

  // `proxy.ts` runs in front of the app: it sends a visitor without a session
  // to the account page, and lets one with a session through with a header.
  test("runs the proxy", async ({ page }) => {
    const sentAway = await open(page, site, "/team");
    await heading(page, "Account");
    expect(sentAway.redirected).toBe(true);
    expect(await pathname(page)).toBe("/account");
    await page.getByRole("button", { name: "Sign in as ada" }).click();
    await page.getByText("Signed in as ada").waitFor();

    // The app keeps its cookies in the tab: the next page sees the session.
    const team = await openNext(page, "/team");
    expect(team.redirected).toBe(false);
    await heading(page, "Team");
    // The header the proxy gives the app, and the cookie it sets.
    await page.getByText("Team: core", { exact: true }).waitFor();
    await page.getByText("Last team: core").waitFor();
  });

  test("has every file the page asks for", async ({ page }) => {
    // The layers, one file each, and the stylesheets: see the plugin.
    for (const file of [
      "vitest-plugin-rsc/next_ssr/modules.json",
      "vitest-plugin-rsc/react_client/modules.json",
      "vitest-plugin-rsc/next-stylesheets.json",
    ]) {
      const response = await page.request.get(site.url + file);
      expect(response.status(), file).toBe(200);
    }
  });
});
