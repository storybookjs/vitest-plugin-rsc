import path from "node:path";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { root, run, serve, serveFiles, test, type Site } from "./helpers.ts";

// The app in the host page of Vite, `index.html` and `host/main.tsx`: with a
// dev server, and in a static build, which `vite build` makes with Vite's
// app builder.

type HostResponse = { status: number; url: string; redirected: boolean };

/**
 * Opens the host page with what it is to show in its query: see
 * host/main.tsx. Resolves with the response of the server in the browser.
 */
async function open(page: Page, site: Site, query: string): Promise<HostResponse> {
  await page.goto(`${site.url}?${query}`);
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
  expect(host.state, `the host of "${query}" (${host.error})`).toBe("ready");
  return host.response!;
}

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

type Check = (page: Page, site: Site) => Promise<void>;

// What the files of a build are about: its fonts, images and CSS.
const files: Record<string, Check> = {
  async home(page, site) {
    const response = await open(page, site, "url=/");
    expect(response.status).toBe(200);
    await heading(page, "Home");
    expect(await pathname(page)).toBe("/");
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
  },
  // `next/font/local` in the root layout: its class is on the body, and the
  // browser has loaded the file its CSS names.
  async font(page, site) {
    await open(page, site, "url=/");
    await heading(page, "Home");
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(
      /^"?geist"?,/i,
    );
    await page.waitForFunction(() =>
      Array.from(document.fonts).some(
        (face) => /^"?geist"?$/i.test(face.family) && face.status === "loaded",
      ),
    );
  },
  // `next/image` with an imported file, in a Server Component and in a Client
  // Component, and a file of Vite's `?no-inline`, which the server renders too.
  async image(page, site) {
    await open(page, site, "url=/");
    for (const alt of ["Logo", "Badge logo", "Badge dot"]) await loadedImage(page, alt);
  },
  // The global CSS of the layout, and the CSS module of a Client Component.
  async styles(page, site) {
    await open(page, site, "url=/");
    expect(await style(page, "body", "margin-top")).toBe("32px");
    expect(await style(page, "[data-testid=badge]", "background-color")).toBe("rgb(0, 112, 243)");
  },
  // A file of `public/`, which Vite copies into the build.
  async public(page, site) {
    const response = await page.request.get(`${site.url}hello.txt`);
    expect(response.status()).toBe(200);
    expect(await response.text()).toBe("Hello from public/\n");
  },
  // `next/dynamic` without SSR: a chunk the browser asks for, with CSS of its own.
  async dynamic(page, site) {
    await open(page, site, "url=/");
    await page.getByText("Panel: loaded in a browser").waitFor();
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("[data-testid=panel]")!).borderLeftColor ===
        "rgb(121, 40, 202)",
    );
  },
};

const checks: Record<string, Check> = {
  ...files,
  // A page that waits for data. Its first load has all of it. A navigation
  // shows `loading.tsx`, and then the fallback of the boundary in the page.
  async loading(page, site) {
    await open(page, site, "url=/slow");
    await heading(page, "Slow");
    await page.getByText("Report: ready").waitFor();
    await page.getByRole("link", { name: "Home" }).click();
    await heading(page, "Home");
    await page.getByRole("link", { name: "Slow" }).click();
    await page.getByText("Loading the slow page…").waitFor();
    await page.getByText("Loading the report…").waitFor();
    await page.getByText("Report: ready").waitFor();
    expect(await page.title()).toBe("Slow | Host demo");
  },
  // A route handler, asked by the `fetch` of a Client Component. It reads
  // what the host seeded.
  async "route handler"(page, site) {
    await open(page, site, "url=/");
    await page.getByRole("button", { name: "Load notes" }).click();
    await page.getByText("Notes: Seeded by the host").waitFor();
  },
  async redirect(page, site) {
    const response = await open(page, site, "url=/old");
    await heading(page, "Seeded by the host");
    expect(await pathname(page)).toBe("/notes/7");
    expect(response.redirected).toBe(true);
  },
  // `proxy.ts` serves another route at a URL, which stays the one of the document.
  async proxy(page, site) {
    const response = await open(page, site, "url=/latest");
    await heading(page, "Seeded by the host");
    expect(response.status).toBe(200);
    expect(await pathname(page)).toBe("/latest");
  },
  async "not found"(page, site) {
    const response = await open(page, site, "url=/notes/unknown");
    await heading(page, "No such page");
    expect(response.status).toBe(404);
    expect(await pathname(page)).toBe("/notes/unknown");
  },
  // A Server Action sets a cookie, and the next render reads it: the one of
  // the action, and the one of a navigation after it.
  async cookies(page, site) {
    await open(page, site, "url=/settings");
    await page.getByText("Theme: light").waitFor();
    await page.getByRole("button", { name: "Use the dark theme" }).click();
    await page.getByText("Theme: dark").waitFor();
    expect(await page.evaluate(() => document.cookie)).toContain("theme=dark");
    await page.getByRole("link", { name: "Home" }).click();
    await heading(page, "Home");
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByText("Theme: dark").waitFor();
  },
  // Next's router, there and back: with links, and with the history of the
  // browser. The document stays the one that loaded.
  async navigation(page, site) {
    await open(page, site, "url=/");
    await page.evaluate(() => void ((window as { __loadedOnce?: boolean }).__loadedOnce = true));
    await page.getByRole("link", { name: "Note 7" }).click();
    await heading(page, "Seeded by the host");
    expect(await page.title()).toBe("Seeded by the host | Host demo");
    expect(await pathname(page)).toBe("/notes/7");
    await page.getByRole("link", { name: "Home" }).click();
    await heading(page, "Home");
    expect(await pathname(page)).toBe("/");
    await page.evaluate(() => window.history.back());
    await heading(page, "Seeded by the host");
    expect(await pathname(page)).toBe("/notes/7");
    await page.evaluate(() => window.history.forward());
    await heading(page, "Home");
    expect(await page.evaluate(() => (window as { __loadedOnce?: boolean }).__loadedOnce)).toBe(
      true,
    );
  },
  // A Server Action, and the page it revalidates.
  async "server action"(page, site) {
    await open(page, site, "url=/notes/7");
    await heading(page, "Seeded by the host");
    await page.getByRole("button", { name: "Likes: 0" }).click();
    await page.getByRole("button", { name: "Likes: 1" }).waitFor();
  },
  // A Server Action of a form that keeps what failed in a cookie for the
  // next render, and then redirects to what it made.
  async "server action that redirects"(page, site) {
    await open(page, site, "url=/notes/new");
    await page.getByLabel("Body").fill("Keep this body");
    await page.getByRole("button", { name: "Create note" }).click();
    await page.getByText("Title is required.").waitFor();
    expect(await page.getByLabel("Body").inputValue()).toBe("Keep this body");
    await page.getByLabel("Title").fill("Made in the browser");
    await page.getByRole("button", { name: "Create note" }).click();
    await heading(page, "Made in the browser");
    await page.getByText("Keep this body").waitFor();
    expect(await pathname(page)).toMatch(/^\/notes\/[\w-]{36}$/);
  },
  // A page for who is signed in. The host stands in for the module that
  // knows, with an alias of its config: see host/session.ts.
  async "signed in"(page, site) {
    await open(page, site, "url=/account");
    await heading(page, "Signed in as Ada");
  },
  async "signed out"(page, site) {
    const response = await open(page, site, "user=none&url=/account");
    await heading(page, "Home");
    expect(await pathname(page)).toBe("/");
    expect(response.redirected).toBe(true);
  },
  // Postgres in PGlite, with Drizzle: its WebAssembly is a file of the build.
  async database(page, site) {
    await open(page, site, "url=/visits");
    await page.getByText("Visits: 0").waitFor();
    await page.getByRole("button", { name: "Visit" }).click();
    await page.getByText("Visits: 1").waitFor();
  },
  // Client Components of a package, Base UI: a menu in a portal.
  async "client package"(page, site) {
    await open(page, site, "url=/settings");
    await page.getByRole("button", { name: "Density: comfortable" }).click();
    await page.getByRole("menuitem", { name: "compact" }).click();
    await page.getByRole("button", { name: "Density: compact" }).waitFor();
  },
  // Outside Vitest `cleanup()` forgets only what the app added, while a page
  // of it was open: the rest is the host's.
  async storage(page, site) {
    await open(page, site, "view=storage");
    const stored = await page.evaluate(
      () => (window as { __hostStorage?: { keys: string[]; cookie: string } }).__hostStorage,
    );
    expect(stored).toEqual({ keys: ["host-setting"], cookie: "host-cookie=kept" });
  },
  // A node of the host, in a container of its document.
  async node(page, site) {
    await open(page, site, "view=node");
    await heading(page, "Hello from the host");
    await page.getByText("The server read the request.").waitFor();
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
    // The host's own document stays.
    await page.getByText("Loading the host…").waitFor();
  },
};

// A few at a time: a check waits for the page more than it works.
function runChecks(site: () => Site, which: Record<string, Check>) {
  for (const [name, check] of Object.entries(which)) {
    test.concurrent(name, ({ page }) => check(page, site()));
  }
}

const dist = path.join(root, "dist");

describe("a dev server", () => {
  let site: Site;
  beforeAll(async () => {
    site = await serve((port) => [
      "vite",
      "--configLoader=native",
      `--port=${port}`,
      "--strictPort",
    ]);
  });
  afterAll(() => site?.close());

  runChecks(() => site, checks);
});

describe("a static build of `vite build`", () => {
  let site: Site;
  beforeAll(async () => {
    await run("vite", "build", "--configLoader=native", "--logLevel=warn");
    site = await serveFiles(dist);
  });
  afterAll(() => site?.close());

  runChecks(() => site, checks);
});

describe("a static build with a relative base, served from a directory of a site", () => {
  let site: Site;
  beforeAll(async () => {
    await run("vite", "build", "--configLoader=native", "--logLevel=warn", "--base=./");
    site = await serveFiles(dist, "/nested/site/");
  });
  afterAll(() => site?.close());

  runChecks(() => site, files);
});

// Vite's `build()` builds the environment of the host, and not the layers of
// the app. It fails before it has built anything.
test("says to build with Vite's app builder when Vite's build() builds the app", async () => {
  const script = `import { build } from "vite";\nawait build({ configLoader: "native" });\n`;

  await expect(run("node", "--input-type=module", "--eval", script)).rejects.toThrow(
    "vitest-plugin-rsc: the app is built outside the plugin's `buildApp()`, which builds its " +
      "three layers. Vite's `build()` does that: it builds one environment. Build with Vite's " +
      "app builder: `vite build`, or `await (await createBuilder(config, null)).buildApp()`.",
  );
});
