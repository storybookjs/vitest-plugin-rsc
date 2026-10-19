import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, beforeAll, expect, onTestFinished } from "vitest";
import { filesWithMachinePaths, viteBuild } from "../../test-helpers/build.ts";
import { serveFiles, test, type PageErrors, type Site } from "../../test-helpers/host.ts";
import type { HostWindow } from "../host/state.ts";
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
 * like Vite's `/@id/` or the dev server's `/@vite/`, fails the test.
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

// A Client Component of a package that says it has no side effects, which
// reaches a module of the page only through a module of its package that the
// scan of the browser layer drops: see fixtures/host-package/ui/tagged.js.
test("shares a module of the page that the browser layer reaches through a package without side effects", async ({
  page,
  errors,
}) => {
  const host = await open(page, errors, "tag", async (page) => {
    await page.locator("#host-root").getByText("Tagged by the host").waitFor();
  });
  // The host reads what the component tagged, which React may render more
  // than once: one instance, from the host's build.
  expect(host.__hostTags).toContain("Tagged by the host");
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

// The server in front of the app is the document's: it says which requests
// are the app's with the build's routing alone. So a page of the host that
// renders no route waits for no ssr layer, which is the largest file of the
// build, and only a request that the server handles does. Here that file is
// held until the host is ready: a host that waited for it would never be.
test("a page that renders no route does not wait for the ssr layer", async ({ page, errors }) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/vitest-plugin-rsc/next_ssr/modules.json", async (route) => {
    await released;
    // Not for a page that a failed test has closed.
    await route.continue().catch(() => {});
  });
  onTestFinished(() => release());
  type Early = HostWindow & { __dropped?: Promise<unknown>; __answered?: Promise<unknown> };
  const host = await open(page, errors, "early", async (page) => {
    // A request to the app, sent before a `cleanup()`, with no page open, is
    // one of the page that was left: it is dropped, as one that waits for the
    // server. One sent after that waits for the layer, and is answered.
    await page.evaluate(() => {
      const host = window as Early;
      host.__dropped = host.__hostRequest!("/");
      return host.__hostCleanup!();
    });
    await page.evaluate(() => {
      const host = window as Early;
      host.__answered = host.__hostRequest!("/");
    });
    const waiting = await page.evaluate(() => {
      const { __dropped, __answered } = window as Early;
      return Promise.all(
        [__dropped, __answered].map((sent) => Promise.race([sent, Promise.resolve("waits")])),
      );
    });
    expect(waiting).toEqual(["waits", "waits"]);
    release();
    const settled = await page.evaluate(() => {
      const { __dropped, __answered } = window as Early;
      return Promise.all([__dropped, __answered]);
    });
    expect(settled).toEqual(["AbortError", 200]);
  });
  // The host's own file came from the network.
  expect(host.__hostFetched).toBe(200);
  const timing = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const end = (path: string) =>
      resources.find((resource) => new URL(resource.name).pathname.endsWith(path))?.responseEnd;
    return {
      ready: (window as HostWindow).__hostReadyAt,
      fetched: end("/callout.html"),
      ssrLayer: end("/vitest-plugin-rsc/next_ssr/modules.json"),
    };
  });
  // Held until then, so these hold: they say that it was this file that was held.
  expect(timing.ready).toBeLessThan(timing.ssrLayer!);
  expect(timing.fetched).toBeLessThan(timing.ssrLayer!);
});

// A layer that does not load fails the requests that need it, as the first
// request does: not the host, nor its own requests.
test("a page that renders no route works without the ssr layer", async ({ page, errors }) => {
  // The file of the layer, which the network fails, and which the browser
  // reports again without its URL.
  errors.ignore = [
    /^requestfailed: .*\/vitest-plugin-rsc\/next_ssr\/modules\.json /,
    /^console\.error: Failed to load resource: net::ERR_FAILED$/,
  ];
  await page.route("**/vitest-plugin-rsc/next_ssr/modules.json", (route) => route.abort("failed"));
  const host = await open(page, errors, "early", async (page) => {
    const answered = await page.evaluate(() => (window as HostWindow).__hostRequest!("/"));
    // The name of the error it rejects with: the layer's, not a page's.
    expect(answered).toEqual(expect.any(String));
    expect(answered).not.toBe("AbortError");
  });
  expect(host.__hostFetched).toBe(200);
});

test("a node has the CSS of the files of the host that render it", async ({ page, errors }) => {
  // The second page of the host, callout.html.
  const callout = await open(
    page,
    errors,
    "callout",
    async (page) => {
      await page.locator("#host-root").getByText("From the host").waitFor();
      expect(await style(page, "[data-testid=callout]", "border-top-color")).toBe("rgb(255, 0, 0)");
    },
    "callout.html",
  );
  // Its file with `"use client"` loaded before the page imported the plugin.
  expect(callout.__hostReports).toEqual([{ from: "host/callout-note.tsx", react: nextReact }]);
  const host = await open(page, errors, "switch", expectGreetingStylesheets);
  expect(host.__hostCalloutLinked).toBe(true);
});
