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

/** What the page loads of the routes of the build, besides the layers: see the plugin. */
type BuiltFiles = { chunks: string[]; modules: Record<string, number[]> };

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
// The requests of the page so far, by their pathname, in the page's time. A
// page keeps 250 by default, fewer than a page of the build may ask for: a
// test that reads them calls `keepResources()` before the page opens.
const keepResources = (page: Page) =>
  page.addInitScript(() => performance.setResourceTimingBufferSize(10_000));
const resources = (page: Page) =>
  page.evaluate(() =>
    (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).map(
      ({ name, startTime, responseEnd }) => ({
        pathname: new URL(name).pathname,
        startTime,
        responseEnd,
      }),
    ),
  );
// The pathnames of the preloads in the document.
const preloads = (page: Page) =>
  page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLLinkElement>("link[rel=preload], link[rel=modulepreload]"),
      (link) => new URL(link.href).pathname,
    ),
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

  // A page of the host whose own module script renders a file of the host
  // with "use client", which no server code imports: see host/example.tsx.
  test('renders a file of the host with "use client" that only the page imports', async ({
    page,
  }) => {
    await page.goto(`${site.url}example.html`);
    await page.waitForFunction(() => (window as { __hostState?: string }).__hostState);
    const host = await page.evaluate(() => {
      const state = window as { __hostState?: string; __hostError?: unknown };
      return { state: state.__hostState, error: String(state.__hostError) };
    });
    expect(host.state, host.error).toBe("ready");
    await page.locator("#host-root").getByText("An example of the host").waitFor();
  });

  // The page of example.html imports the entry of Client Components alone,
  // which loads no layer of Next's server, and sends no request of its own.
  // The server in front of the app is the document's all the same: a Client
  // Component's `fetch` to a route handler gets the app's answer, and that
  // request starts the ssr layer's file, in the task that sends it.
  test("loads the ssr layer on a page of Client Components for its first request to the app", async ({
    page,
  }) => {
    await keepResources(page);
    const ssrFiles: string[] = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/vitest-plugin-rsc/next_ssr/")) ssrFiles.push(pathname);
    });
    await page.goto(`${site.url}example.html`);
    await page.waitForFunction(() => (window as { __hostState?: string }).__hostState);
    const ask = page.getByRole("button", { name: "Ask the app" });
    await ask.waitFor();
    expect(ssrFiles).toEqual([]);

    // The click, and the task after it: the component sends its request in
    // the click's.
    const { clicked, nextTask } = await ask.evaluate((button: HTMLElement) => {
      const clicked = performance.now();
      button.click();
      return new Promise<{ clicked: number; nextTask: number }>((resolve) =>
        setTimeout(() => resolve({ clicked, nextTask: performance.now() })),
      );
    });
    await page.getByRole("button", { name: "The app: plain" }).waitFor();
    expect(ssrFiles).toEqual(["/vitest-plugin-rsc/next_ssr/modules.json"]);
    const ssrLayer = (await resources(page)).find(
      ({ pathname }) => pathname === "/vitest-plugin-rsc/next_ssr/modules.json",
    )!;
    expect(ssrLayer.startTime).toBeGreaterThanOrEqual(clicked);
    expect(ssrLayer.startTime).toBeLessThanOrEqual(nextTask);
    // Nor did the rsc layer load before it: the plugin's module of it is a
    // chunk of its own, which the request imports with the ssr layer.
    const rscChunks = (await resources(page)).filter(({ pathname }) =>
      /^\/assets\/rsc-[^/]*\.js$/.test(pathname),
    );
    expect(rscChunks.length).toBeGreaterThan(0);
    for (const chunk of rscChunks) expect(chunk.startTime).toBeGreaterThanOrEqual(clicked);
  });

  // The ssr layer lists the Client Components that server code reaches: a
  // file of the host with "use client" that a node of the host renders, and
  // not one that only the page imports, which the browser layer renders. The
  // browser layer lists every one.
  test("lists in the ssr layer the Client Components that server code reaches", () => {
    const key = (file: string) => createHash("sha256").update(file).digest("hex").slice(0, 12);
    const listed = (layer: string) => {
      const modules = fs.readFileSync(
        path.join(dist, "vitest-plugin-rsc", layer, "modules.json"),
        "utf8",
      );
      return ["host/badge.tsx", "host/example.tsx"].filter((file) => modules.includes(key(file)));
    };
    expect(listed("next_ssr")).toEqual(["host/badge.tsx"]);
    expect(listed("react_client")).toEqual(["host/badge.tsx", "host/example.tsx"]);
  });

  // A Server Component of the host, on a route of the app, with a Client
  // Component of the app and the Server Action it calls, and a Client
  // Component of the host, which the ssr layer renders and the page hydrates.
  test("renders a node of the host", async ({ page }) => {
    const response = await open(page, site, "/notes/7", { node: "7" });
    expect(response.status).toBe(200);
    await heading(page, "A node of the host");
    await page.getByText("Seeded by the host").waitFor();
    await page
      .locator("p[data-hydrated=true]", { hasText: "A Client Component of the host" })
      .waitFor();
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

  // A page load starts the files of its route at once, by the list of the
  // build: each module of its loader tree with the entry of the route, where
  // Next would load them one segment after the other, and the stylesheets
  // with them, where Next would link them once the HTML is there. Next asks
  // for a segment only once it has run the entry: a file with a preload in
  // the document before the browser has the entry starts before Next could
  // ask for it. The test looks while it holds the request of the entry. And
  // each file is one request: the preload's.
  test("starts the files of a route at once", async ({ page }) => {
    const built = JSON.parse(
      fs.readFileSync(path.join(dist, "vitest-plugin-rsc/next-files.json"), "utf8"),
    ) as BuiltFiles;
    const files = built.modules["(vitest-plugin-rsc)/notes/[id]"]!.map(
      (index) => `/${built.chunks[index]}`,
    );
    expect(files.length).toBeGreaterThan(1);
    const requested: string[] = [];
    page.on("request", (request) => requested.push(new URL(request.url()).pathname));
    let preloaded: string[] | undefined;
    // The first is the chunk of the entry of the route.
    await page.route(
      (url) => url.pathname === files[0],
      async (route) => {
        preloaded = await preloads(page);
        await route.continue();
      },
      { times: 1 },
    );
    await open(page, site, "/notes/7", { node: "7" });
    await heading(page, "A node of the host");
    expect(preloaded).toEqual(expect.arrayContaining(files));
    for (const file of files) {
      expect(
        requested.filter((url) => url === file),
        file,
      ).toHaveLength(1);
    }
    const stylesheets = requested.filter((url) => url.startsWith("/_next/static/css/"));
    expect(stylesheets).toEqual([expect.stringMatching(/\/note-card\.module-\w+\.css$/)]);
    // Next's development code links a stylesheet with the time of the request
    // in its URL, which no preload can know: there it comes with the HTML.
    if (build === "production") expect(preloaded).toContain(stylesheets[0]);
  });

  // What a segment imports with `import()` loads when the segment asks for
  // it: `next/dynamic` of a Server Component.
  test("starts no module that a segment imports later", async ({ page }) => {
    await keepResources(page);
    await open(page, site, "/lazy");
    await page.getByText("Summary: rendered on the server").waitFor();
    const built = JSON.parse(
      fs.readFileSync(path.join(dist, "vitest-plugin-rsc/next-files.json"), "utf8"),
    ) as BuiltFiles;
    const files = built.modules["/lazy/page"]!.map((index) => `/${built.chunks[index]}`);
    const lazy = fs
      .readdirSync(path.join(dist, "assets"))
      .filter((file) => file.startsWith("summary-"));
    expect(lazy).toHaveLength(1);
    expect(files).not.toContain(`/assets/${lazy[0]}`);
    // The page loads it, after the module of the page that imports it.
    const requests = await resources(page);
    const [summary] = requests.filter((request) => request.pathname === `/assets/${lazy[0]}`);
    const pageChunk = files.find((file) => /\/page-[\w-]+\.js$/.test(file))!;
    const [segment] = requests.filter((request) => request.pathname === pageChunk);
    expect(summary!.startTime).toBeGreaterThanOrEqual(segment!.responseEnd);
  });

  // The preloads of a page are the page's, and go with it.
  test("leaves no preload of a page that was left", async ({ page }) => {
    await open(page, site, "/notes/7", { node: "7" });
    await heading(page, "A node of the host");
    await openNext(page, "/notice");
    await page.getByText("The office is closed on Friday.").waitFor();
    const built = JSON.parse(
      fs.readFileSync(path.join(dist, "vitest-plugin-rsc/next-files.json"), "utf8"),
    ) as BuiltFiles;
    const filesOf = (route: string) => built.modules[route]!.map((index) => built.chunks[index]!);
    const next = new Set(filesOf("/notice/page"));
    const left = filesOf("(vitest-plugin-rsc)/notes/[id]").filter((file) => !next.has(file));
    expect(left.length).toBeGreaterThan(0);
    const links = await preloads(page);
    expect(links.filter((link) => /note-card/.test(link))).toEqual([]);
    expect(links.filter((link) => left.includes(link.slice(1)))).toEqual([]);
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

  // The server in front of the app decides with the build's routing alone
  // which requests are the app's: not the proxy, nor a layer. A host that
  // fetches a file of its own, one that the proxy's matcher leaves out, gets
  // it from the network while the ssr layer, the largest file of the build,
  // is still held back, and nothing of the proxy loads for it. Nor do the
  // stylesheets, which only a file of the host with "use client" asks for.
  test("sends a file that the proxy does not take to the network, before the ssr layer", async ({
    page,
  }) => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/vitest-plugin-rsc/next_ssr/modules.json", async (route) => {
      await released;
      // Not for a page that a failed test has closed.
      await route.continue().catch(() => {});
    });
    onTestFinished(() => release());
    // As the host imports the server's API: see the test after this one.
    const ssrAsked = page.waitForRequest("**/vitest-plugin-rsc/next_ssr/modules.json");
    // A file of Next's build, which the matcher of the proxy leaves out: the
    // image that app/images imports.
    const media = fs
      .readdirSync(path.join(dist, "_next/static/media"))
      .find((name) => name.startsWith("logo."));
    const file = `/_next/static/media/${media}`;
    const requested: string[] = [];
    page.on("request", (request) => requested.push(new URL(request.url()).pathname));
    await page.goto(`${site.url}?${new URLSearchParams({ fetch: file })}`);
    await page.waitForFunction(() => (window as { __hostState?: string }).__hostState);
    await ssrAsked;
    const host = await page.evaluate((file) => {
      const { __hostState, __hostFetched } = window as {
        __hostState?: string;
        __hostFetched?: number;
      };
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const timing = (path: string) =>
        resources.find((resource) => new URL(resource.name).pathname === path);
      return {
        state: __hostState,
        fetched: __hostFetched,
        answered: timing(file)?.responseEnd,
        ssrLayer: timing("/vitest-plugin-rsc/next_ssr/modules.json")?.responseEnd,
      };
    }, file);
    expect(host).toMatchObject({ state: "ready", fetched: 200 });
    expect(host.answered).toBeGreaterThan(0);
    // Asked for, and still held: it has not ended.
    expect(requested).toContain("/vitest-plugin-rsc/next_ssr/modules.json");
    expect(host.ssrLayer).toBeUndefined();
    expect(
      requested.filter((path) =>
        /\/(next-middleware-entry|instrumentation)-[^/]*\.js$|next-stylesheets\.json$/.test(path),
      ),
    ).toEqual([]);
  });

  // The ssr layer's file does not wait for the browser layer's, which every
  // page runs: the host imports the server's API, which starts it, and opens
  // a page at once, which needs it. Its file starts while the browser
  // layer's is still held.
  test("starts the ssr layer at once for a page that the host opens before the browser layer has loaded", async ({
    page,
  }) => {
    await keepResources(page);
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/vitest-plugin-rsc/react_client/modules.json", async (route) => {
      await released;
      // Not for a page that a failed test has closed.
      await route.continue().catch(() => {});
    });
    onTestFinished(() => release());
    const ssrAsked = page.waitForRequest("**/vitest-plugin-rsc/next_ssr/modules.json");
    const opened = open(page, site, "/notes");
    await ssrAsked;
    release();
    await opened;
    await heading(page, "Notes");
    const requests = await resources(page);
    const timing = (path: string) => {
      const found = requests.filter((request) => request.pathname === path);
      expect(found, path).toHaveLength(1);
      return found[0]!;
    };
    const browserLayer = timing("/vitest-plugin-rsc/react_client/modules.json");
    const ssrLayer = timing("/vitest-plugin-rsc/next_ssr/modules.json");
    expect(ssrLayer.startTime).toBeLessThan(browserLayer.responseEnd);
  });

  test("has every file the page asks for", async ({ page }) => {
    // The layers, one file each, and the stylesheets: see the plugin.
    for (const file of [
      "vitest-plugin-rsc/next_ssr/modules.json",
      "vitest-plugin-rsc/react_client/modules.json",
      "vitest-plugin-rsc/next-files.json",
    ]) {
      const response = await page.request.get(site.url + file);
      expect(response.status(), file).toBe(200);
    }
  });
});
