import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, beforeAll, expect } from "vitest";
import { filesWithMachinePaths, viteBuild } from "../../test-helpers/build.ts";
import { serveFiles, test, type PageErrors, type Site } from "../../test-helpers/host.ts";
import {
  expectGreetingStylesheets,
  nextReact,
  open as openView,
  style,
} from "../test/host-page.ts";

// The host in a static build, which `vite build` makes with Vite's app
// builder: both of its pages, see ../vite.config.ts. A server of files
// serves the directory, and nothing else: no dev server to evaluate a file of
// the host with `"use client"`, to ask for its stylesheets, or to serve the
// page's own `host-report`. As a host builds with Storybook's `storybook
// build`. The same views as test/host.test.ts, which runs them on the dev
// server; Next's code is the one of production, the default of a build.

const root = fileURLToPath(new URL("../", import.meta.url));
// The repository the host is in, which Next's config names too.
const repository = path.resolve(root, "../..");
const dist = path.join(root, "dist");

let site: Site | undefined;

beforeAll(async () => {
  await viteBuild(root, dist);
  site = await serveFiles(dist);
});

afterAll(() => site?.close());

/**
 * Opens a page of the build with a view: see test/host-page.ts. What the
 * page asks for is a file of the build: a request for a path of a dev server,
 * like Vite's `/@id/` or the plugin's `/@vitest-plugin-rsc/`, fails the test.
 */
async function open(
  page: Page,
  errors: PageErrors,
  view: string,
  run: (page: Page) => Promise<void>,
  document = "",
) {
  if (!watched.has(page)) {
    watched.add(page);
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.includes("/@")) {
        errors.list.push(`a request for the dev server: ${request.url()}`);
      }
    });
  }
  return openView(page, errors, site!, view, run, document);
}

const watched = new WeakSet<Page>();

// The modules of the rsc layer name a file of the host by its reference key,
// and by its path from the root of the project: not by its path on the
// machine.
test("has no path of the machine that built it", () => {
  expect(filesWithMachinePaths(dist, repository)).toEqual({});
});

test('runs a file of the host with "use client" in the browser layer', async ({ page, errors }) => {
  const host = await open(page, errors, "client", async (page) => {
    await page.locator("#client-root").getByRole("button", { name: "Count: 0" }).click();
    await page.locator("#client-root").getByRole("button", { name: "Count: 1" }).waitFor();
    // The CSS module of the component, a stylesheet of the build that the
    // page links once the file has loaded, from `next-stylesheets.json`.
    await page
      .locator("link[rel=stylesheet][href*='_next/static/css/counter.module-']")
      .waitFor({ state: "attached" });
    expect(await style(page, "#client-root button", "color")).toBe("rgb(0, 112, 243)");
  });
  // With Next's React for the browser, and with the page's own instance of
  // the package of the host, from the host's build: the host read what the
  // file reported.
  expect(host.__hostReports).toEqual([{ from: "host/client.tsx", react: nextReact }]);
});

test('runs a file with "use client" of a package of the host in the browser layer', async ({
  page,
  errors,
}) => {
  const host = await open(page, errors, "package", async () => {});
  expect(host.__hostReports).toEqual([
    { from: "host-package/client-greeting.js", react: nextReact },
    { from: "host-package/client-story.js", react: nextReact },
  ]);
});

test('gives the host the exports of a file of the host with "use client"', async ({
  page,
  errors,
}) => {
  const host = await open(page, errors, "module", async (page) => {
    await page.locator("#host-root").getByRole("button", { name: "Clicks: 0" }).click();
    await page.locator("#host-root").getByRole("button", { name: "Clicks: 1" }).waitFor();
    const badge = page.locator("link[rel=stylesheet][href*='badge.module-']");
    await badge.waitFor({ state: "attached" });
    expect(await badge.count()).toBe(1);
    expect(await style(page, "#host-root button", "color")).toBe("rgb(0, 128, 0)");
  });
  // One module of the file, so no other import of it.
  expect(host.__hostModule).toEqual({
    reference: true,
    same: true,
    kept: true,
    plain: true,
    // The reference key of a build, a hash, which the message says it is.
    app: expect.stringMatching(
      /^vitest-plugin-rsc: \w+ has "use client" and is not a file of the host.* in a static build a hash of the file/,
    ),
  });
  // Each file ran once, as its module of the rsc layer did.
  expect(host.__hostReports).toEqual([
    { from: "host/client-module.tsx", react: nextReact },
    { from: "host/render-client.tsx", react: nextReact },
  ]);
});

test('keeps the Server Actions of a node that is open while a file with "use client" loads', async ({
  page,
  errors,
}) => {
  await open(page, errors, "action", async (page) => {
    await page.locator("#host-root").getByRole("button", { name: "Likes: 0" }).click();
    await page.locator("#host-root").getByRole("button", { name: "Likes: 1" }).waitFor();
  });
});

test('keeps the CSS of a file with "use client" that loaded during a page', async ({
  page,
  errors,
}) => {
  await open(page, errors, "after-page", async (page) => {
    await page.locator("#host-root").getByRole("button", { name: "Clicks: 0" }).waitFor();
    const badge = page.locator("link[rel=stylesheet][href*='badge.module-']");
    expect(await badge.count()).toBe(1);
    expect(await style(page, "#host-root button", "color")).toBe("rgb(0, 128, 0)");
    await page.locator("#host-root").getByRole("button", { name: "Likes: 0" }).click();
    await page
      .locator("#host-root")
      .getByRole("alert")
      .getByText("a component called the Server Action like, and no page of the app is open")
      .waitFor();
  });
});

test("a node has the CSS of the files of the host that render it", async ({ page, errors }) => {
  // The second page of the host, callout.html.
  await open(
    page,
    errors,
    "callout",
    async (page) => {
      await page.locator("#host-root").getByText("From the host").waitFor();
      expect(await style(page, "[data-testid=callout]", "border-top-color")).toBe("rgb(255, 0, 0)");
    },
    "callout.html",
  );
  const host = await open(page, errors, "switch", expectGreetingStylesheets);
  expect(host.__hostCalloutLinked).toBe(true);
});
