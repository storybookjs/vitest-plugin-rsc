import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, onTestFinished } from "vitest";
import {
  copyProject,
  filesWithMachinePaths,
  hashesOf,
  viteBuild,
} from "../../test-helpers/build.ts";
import { serveFiles, test, type Site } from "../../test-helpers/host.ts";

// The app in a static build, which `vite build` makes with Vite's app builder:
// see vite.config.ts. A server of files serves the directory, and nothing
// else: no dev server, no server of the app. The page of `index.html` hosts
// the app, see host/main.tsx.
//
// Built twice: as `vite build` builds it, with Next's production code, the
// plugin's default for a build, and with `build: "development"`, which
// vite.config.ts takes from `VITEST_PLUGIN_RSC_BUILD`. What each test checks
// holds for both, as none of it is what only the development code has, like
// React's warnings, but for `window.nd`.

const root = fileURLToPath(new URL("../", import.meta.url));
// The repository the app is in, which Next's config names too.
const repository = path.resolve(root, "../..");

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

const builds = [
  { build: "production", env: {} },
  { build: "development", env: { VITEST_PLUGIN_RSC_BUILD: "development" } },
] as const;

describe.for(builds)("a static build, $build", ({ build, env }) => {
  const dist = path.join(root, "dist", build);
  let site: Site;
  beforeAll(async () => {
    await viteBuild(root, dist, env);
    site = await serveFiles(dist);
  });
  afterAll(() => site?.close());

  // A build is the same on every machine, and says nothing of the one it
  // was built on: who built it, and where.
  test("has no path of the machine that built it", () => {
    expect(filesWithMachinePaths(dist, repository)).toEqual({});
  });

  // The same tree, built in another directory, is the same build, byte for
  // byte: its content hashes hold on another machine, and so do the caches
  // of CI and of a CDN. One build more, of the code a build has by default.
  // A build takes the time of one, like the builds above.
  test.runIf(build === "production")(
    "is the same build in another directory",
    { timeout: 600_000 },
    async () => {
      const copy = fs.mkdtempSync(path.join(root, "..", ".nextjs-e2e-demo-"));
      onTestFinished(() => fs.rmSync(copy, { recursive: true, force: true }));
      copyProject(root, copy);
      const moved = path.join(copy, "dist");
      await viteBuild(copy, moved, env);
      expect(hashesOf(moved)).toEqual(hashesOf(dist));
    },
  );

  // Vite RSC keys a client reference of a package by the hash of the bare
  // specifier it saw resolve to the file, the last one if it saw several. The
  // route entries import Next's global error page by its CommonJS path, which
  // the rsc layer resolves to Next's ESM file, without a specifier of its
  // own for Vite RSC to see: the key is the one of the route entries' import,
  // in every build. The test above sees it change only when two builds
  // happen to differ.
  test("keys a Client Component of Next by the specifier it is imported by", () => {
    const key = (specifier: string) =>
      createHash("sha256").update(specifier).digest("hex").slice(0, 12);
    const assets = path.join(dist, "assets");
    const chunks = fs
      .readdirSync(assets)
      .filter((file) => file.endsWith(".js"))
      .map((file) => fs.readFileSync(path.join(assets, file), "utf8"));
    const withKey = (specifier: string) =>
      chunks.filter((code) => code.includes(`\`${key(specifier)}\``)).length;
    const file = "client/components/builtin/global-error.js";
    expect(withKey(`next/dist/${file}`)).toBeGreaterThan(0);
    expect(withKey(`next/dist/esm/${file}`)).toBe(0);
    // Next's own files import the layout router by a relative path: it is
    // keyed by its specifier in `next/dist/esm`, the same on any install.
    expect(withKey("next/dist/esm/client/components/layout-router.js")).toBeGreaterThan(0);
  });

  test("renders a page with a Client Component", async ({ page }) => {
    const response = await open(page, site, "/");
    expect(response.status).toBe(200);
    await heading(page, "Home");
    expect(await pathname(page)).toBe("/");
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
    // Next's router puts itself on `window.nd` in development, for debugging.
    expect(await page.evaluate(() => "nd" in window)).toBe(build === "development");
  });

  // A page of the host that renders a Client Component itself, with
  // `loadClientModule()`, and fetches a file of its own, and opens no page of
  // the app: see host/client.tsx.
  test('renders a file of the host with "use client" on a page of its own', async ({ page }) => {
    await page.goto(`${site.url}client.html`);
    await page.waitForFunction(() => (window as { __hostState?: string }).__hostState);
    const host = await page.evaluate(() => {
      const state = window as { __hostState?: string; __hostError?: unknown };
      return { state: state.__hostState, error: String(state.__hostError) };
    });
    expect(host.state, host.error).toBe("ready");
    expect(await page.evaluate(() => (window as { __hostData?: unknown }).__hostData)).toEqual({
      from: "public/host.json",
    });
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

  // `rerender()` in a build: the page has the module the server renders
  // around every node, which says when the page has committed it, among the
  // client references of the build.
  test("renders a node of the host again, without a page load", async ({ page }) => {
    await open(page, site, "/notes/7", { node: "7" });
    const favorite = page.getByRole("button", { name: "Favorite" });
    await favorite.click();
    await expect
      .poll(() => favorite.getAttribute("aria-pressed"), { timeout: 30_000 })
      .toBe("true");
    type Rerendering = {
      __favorite?: Element | null;
      __hostRerender?: (id: string) => Promise<void>;
    };
    await page.evaluate(() => {
      const state = window as Rerendering;
      state.__favorite = document.querySelector("button[aria-pressed]");
    });

    // The node of another note, which the host has none of.
    const same = await page.evaluate(async () => {
      const state = window as Rerendering;
      await state.__hostRerender!("8");
      return state.__favorite === document.querySelector("button[aria-pressed]");
    });

    expect(await page.getByText("No note").count()).toBe(1);
    // The same element, with the state of its Client Component.
    expect(same).toBe(true);
    expect(await favorite.getAttribute("aria-pressed")).toBe("true");
  });

  // The node has the CSS of the file of the host that renders it, `hostFiles`
  // of renderServer(): host/node.tsx, whose NoteCard of the app has a CSS
  // module. A page route has not, and the stylesheet goes with the node.
  test("links the stylesheets of the files of the host that render a node", async ({ page }) => {
    await open(page, site, "/notes/7", { node: "7" });
    const card = page.getByText("Seeded by the host");
    expect(await card.evaluate((element) => getComputedStyle(element).color)).toBe(
      "rgb(128, 0, 128)",
    );
    expect(await page.locator("link[rel=stylesheet][href*='note-card']").count()).toBe(1);

    await openNext(page, "/notes/7");
    await heading(page, "Seeded by the host");
    expect(await page.locator("link[rel=stylesheet][href*='note-card']").count()).toBe(0);
  });

  // A file that the build has no stylesheets for, like a file of the app,
  // warns in the page, and the node renders without them.
  test("warns of a file of a node that is not the host's", async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });
    await open(page, site, "/notes/7", { node: "7", file: "app/page.tsx" });
    await heading(page, "A node of the host");
    expect(warnings).toContainEqual(
      expect.stringMatching(
        /`hostFiles` of renderServer\(\), name app\/page\.tsx, which the static/,
      ),
    );
    expect(await page.locator("link[rel=stylesheet][href*='note-card']").count()).toBe(0);
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
