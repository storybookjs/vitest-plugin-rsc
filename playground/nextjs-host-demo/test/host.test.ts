import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, beforeAll, expect } from "vitest";
import { createProject, test, type DevServer, type PageErrors } from "../../test-helpers/host.ts";
import type { HostWindow } from "../host/state.ts";
import { expectGreetingStylesheets, nextReact, open as openView, style } from "./host-page.ts";

// The app in a page of Vite's own dev server, without Vitest: see
// ../vite.config.ts and ../host/main.tsx. The acceptance test of a host other
// than Vitest, like Storybook's builder: it loads a page of the app, a node in
// a container of its own, and a file of the host with `"use client"`.

const root = fileURLToPath(new URL("../", import.meta.url));

let site: DevServer | undefined;

// The dev server of the project, as `vite` starts it. Without the
// environment of Vitest, but with NODE_OPTIONS, which has the condition that
// runs the source of the plugin when the suite does: see test-helpers/host.ts.
beforeAll(async () => {
  site = await createProject(root).serve((port) => [
    "vite",
    "--configLoader",
    "native",
    "--port",
    String(port),
    "--strictPort",
  ]);
});

afterAll(() => site?.close());

/** Opens a page of the host on the dev server with a view: see host-page.ts. */
const open = (
  page: Page,
  errors: PageErrors,
  view: string,
  run: (page: Page) => Promise<void>,
  document = "",
) => openView(page, errors, site!, view, run, document);

test("renders a page of the app", async ({ page, errors }) => {
  const host = await open(page, errors, "page", async (page) => {
    await page.getByRole("heading", { name: "Home" }).waitFor();
    await page.getByRole("heading", { name: "Hello from the page" }).waitFor();
    await page.getByText("The server read the request.").waitFor();
    // Next's client has hydrated the page: the Client Component works.
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
    // The CSS of the layout, and the CSS module of the component.
    expect(await style(page, "body", "margin-top")).toBe("32px");
    expect(await style(page, "[data-testid=greeting]", "border-left-color")).toBe(
      "rgb(0, 112, 243)",
    );
  });
  expect(host.__hostResponse).toEqual({ status: 200, url: site!.url });
});

test("leaving a page puts back the URL the host had as the page opened", async ({
  page,
  errors,
}) => {
  // The host moved its URL between the two pages: leaving the second one
  // puts that URL back, not the one the document loaded with, nor the one
  // the host set while the page was open.
  await open(page, errors, "pages", async (page) => {
    expect(page.url()).toBe(`${site!.url}?view=pages&shows=second`);
  });
});

test("keeps what a document of the host stores to that document", async ({ page, errors }) => {
  await open(page, errors, "node", async (page) => {
    // A second document of the host next to this one, as a page of docs has
    // one for each story, whose page stores in the browser. Neither this one
    // nor the browser's storage of the origin has it, and this one hears
    // nothing of it.
    const frame = await page.evaluate(async () => {
      const heard: Array<string | null> = [];
      const hear = ({ key }: StorageEvent) => heard.push(key);
      window.addEventListener("storage", hear);
      const iframe = document.body.appendChild(document.createElement("iframe"));
      iframe.src = "?view=stored";
      const other = () => iframe.contentWindow as (Window & HostWindow) | null;
      while (!other()?.__hostState) await new Promise((resolve) => setTimeout(resolve, 50));
      const { __hostState, __hostError } = other()!;
      const stored = [other()!.localStorage, other()!.sessionStorage].map((storage) =>
        storage.getItem("visitor"),
      );
      // A document of the origin without the plugin has the browser's storage.
      const blank = document.body.appendChild(document.createElement("iframe"));
      const browser = [blank.contentWindow!.localStorage, blank.contentWindow!.sessionStorage];
      const inBrowser = browser.map((storage) => storage.getItem("visitor"));
      await new Promise((resolve) => setTimeout(resolve));
      window.removeEventListener("storage", hear);
      iframe.remove();
      blank.remove();
      return {
        state: __hostState,
        error: String(__hostError),
        stored,
        inBrowser,
        here: [localStorage.getItem("visitor"), sessionStorage.getItem("visitor")],
        heard,
      };
    });
    expect(frame.state, frame.error).toBe("ready");
    expect(frame).toMatchObject({
      stored: ["Ada", "Ada"],
      inBrowser: [null, null],
      here: [null, null],
      heard: [],
    });
  });
});

test("renders a node of the host in a container of the host", async ({ page, errors }) => {
  await open(page, errors, "node", async (page) => {
    // In the container, with the document of the host around it.
    await page
      .locator("#host-root")
      .getByRole("heading", { name: "Hello from the host" })
      .waitFor();
    await page.getByText("The document of the host").waitFor();
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
    // The stylesheets of the node, which the dev server tells the page of.
    expect(await style(page, "[data-testid=greeting]", "border-left-color")).toBe(
      "rgb(0, 112, 243)",
    );
  });
});

test("renders a node of the host again with other props, keeping its state", async ({
  page,
  errors,
}) => {
  await open(page, errors, "rerender", async (page) => {
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();

    await page.evaluate(() => (window as HostWindow).__hostRerender!("a rerender"));

    expect(await page.getByRole("heading", { name: "Hello from a rerender" }).count()).toBe(1);
    expect(await page.getByRole("button", { name: "Count: 1" }).count()).toBe(1);
    expect(await style(page, "[data-testid=greeting]", "border-left-color")).toBe(
      "rgb(0, 112, 243)",
    );
  });
});

test("a node has the CSS of the files of the host that render it", async ({ page, errors }) => {
  // A page of the host that renders a node from another file of the host,
  // in a page of its own: callout.html.
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
  // Its file with `"use client"`, which loaded before the page imported the
  // plugin.
  expect(callout.__hostReports).toEqual([{ from: "host/callout-note.tsx", react: nextReact }]);
  // The dev server has loaded both files of the host now, and the page of
  // `?view=node` imports both: a node has the CSS of the files that render
  // it, whatever the server and the page loaded. Then `?view=switch`, which
  // renders the callout first, with its stylesheet, and leaves it: as a story
  // has in Storybook's canvas after the story before it.
  await open(page, errors, "node", expectGreetingStylesheets);
  const host = await open(page, errors, "switch", expectGreetingStylesheets);
  expect(host.__hostCalloutLinked).toBe(true);
});

test("a node has the CSS of a Client Component of a package that is not pre-bundled", async ({
  page,
  errors,
}) => {
  // The dev server gives the id of the component's module Vite's version of
  // the dependencies, `?v=1a2b3c4d`, in the rsc layer too: see ../vite.config.ts.
  // What the test is about: the page imports the file with that query.
  const versioned = /\/host-package\/ui\/tag\.js\?v=\w+$/;
  let requested = false;
  page.on("request", (request) => {
    if (versioned.test(request.url())) requested = true;
  });
  const host = await open(page, errors, "tag", async (page) => {
    await page.locator("#host-root").getByText("Tagged by the host").waitFor();
    await page.locator("link[rel=stylesheet][href*='ui/tag.css']").waitFor({ state: "attached" });
    expect(await style(page, "[data-testid=tag]", "color")).toBe("rgb(128, 0, 128)");
  });
  expect(requested).toBe(true);
  // Through the page's own `host-report/tags`, which React may render more
  // than once.
  expect(host.__hostTags).toContain("Tagged by the host");
});

test("leaves a file of the app out of `hostFiles`, with a warning", async ({ page, errors }) => {
  // Only a file of the host is the host's to say: see styles.ts. The CSS of
  // a file of the app is its route's, and the route of a node has none of its
  // own. The same node with the file of the host has it: `?view=node`.
  await open(page, errors, "app-file", async (page) => {
    await page
      .locator("#host-root")
      .getByRole("heading", { name: "Hello from the host" })
      .waitFor();
    expect(await page.locator("link[rel=stylesheet][href*='greeting.module.css']").count()).toBe(0);
    expect(await style(page, "[data-testid=greeting]", "border-left-color")).not.toBe(
      "rgb(0, 112, 243)",
    );
  });
  // The warning comes over the pipe of the server, after the answer can.
  await expect.poll(() => site!.output()).toContain("greeting.tsx, which is neither");
  await open(page, errors, "node", expectGreetingStylesheets);
});

test('runs a file of the host with "use client" in the browser layer', async ({ page, errors }) => {
  const host = await open(page, errors, "client", async (page) => {
    // The Client Component the file rendered, in a root it made itself.
    await page.locator("#client-root").getByRole("button", { name: "Count: 0" }).click();
    await page.locator("#client-root").getByRole("button", { name: "Count: 1" }).waitFor();
    // The CSS module of the component, a stylesheet of the app that the page
    // links once the file has loaded: from the dev server, not Vite's
    // `<style>` of a module.
    await page
      .locator("link[rel=stylesheet][href*='counter.module.css']")
      .waitFor({ state: "attached" });
    expect(await style(page, "#client-root button", "color")).toBe("rgb(0, 112, 243)");
  });
  // With Next's React for the browser, and with the page's own instance of
  // the package of the host: the host read what the file reported.
  expect(host.__hostReports).toEqual([{ from: "host/client.tsx", react: nextReact }]);
});

test('runs a file with "use client" of a package of the host in the browser layer', async ({
  page,
  errors,
}) => {
  // A package in `node_modules` that Vite does not pre-bundle, like a
  // framework of Storybook: see ../vite.config.ts.
  // What the test is about: the page imports the files with Vite's version
  // query.
  const versioned = /\/host-package\/client-(?:greeting|story)\.js\?v=\w+$/;
  const requested = new Set<string>();
  page.on("request", (request) => {
    if (versioned.test(request.url())) requested.add(request.url());
  });
  const host = await open(page, errors, "package", async () => {
    expect(requested.size).toBe(2);
  });
  // The file the host imports by the name of the package, and the one the
  // entry of the package imports.
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
    // The component of the file, which the host rendered in its container,
    // with the renderer of another such file.
    await page.locator("#host-root").getByRole("button", { name: "Clicks: 0" }).click();
    await page.locator("#host-root").getByRole("button", { name: "Clicks: 1" }).waitFor();
    // Its CSS module, linked once: as the file loaded, and not again by the
    // import of the file after it.
    const badge = page.locator("link[rel=stylesheet][href*='badge.module.css']");
    await badge.waitFor({ state: "attached" });
    expect(await badge.count()).toBe(1);
    expect(await style(page, "#host-root button", "color")).toBe("rgb(0, 128, 0)");
  });
  expect(host.__hostModule).toEqual({
    reference: true,
    same: true,
    again: true,
    plain: true,
    app: expect.stringContaining(
      '/app/components/counter.tsx has "use client" and is not a file of the host',
    ),
  });
  expect(host.__hostModule?.app).toContain("host.files of vitestPluginNext()");
  // Each file ran as its module loaded, with Next's React for the browser:
  // once, also the file of the stories, which the host imported twice, and
  // never for a call of loadClientModule().
  expect(host.__hostReports).toEqual([
    { from: "host/client-module.tsx", react: nextReact },
    { from: "host/render-client.tsx", react: nextReact },
  ]);
});

test('keeps the Server Actions of a node that is open while a file with "use client" loads', async ({
  page,
  errors,
}) => {
  const host = await open(page, errors, "action", async (page) => {
    // The action posts to the page of the node, which is still open: the
    // file that loaded after it did not take that over.
    await page.locator("#host-root").getByRole("button", { name: "Likes: 0" }).click();
    await page.locator("#host-root").getByRole("button", { name: "Likes: 1" }).waitFor();
  });
  expect(host.__hostReports).toEqual([{ from: "host/client-module.tsx", react: nextReact }]);
});

test('keeps the CSS of a file with "use client" that loaded during a page', async ({
  page,
  errors,
}) => {
  await open(page, errors, "after-page", async (page) => {
    // The tab's, not the page's: two pages came and went, and the link is
    // there once.
    await page.locator("#host-root").getByRole("button", { name: "Clicks: 0" }).waitFor();
    const badge = page.locator("link[rel=stylesheet][href*='badge.module.css']");
    expect(await badge.count()).toBe(1);
    expect(await style(page, "#host-root button", "color")).toBe("rgb(0, 128, 0)");
    // No page is open: a Server Action says so, and does not post to the
    // page that was left.
    await page.locator("#host-root").getByRole("button", { name: "Likes: 0" }).click();
    await page
      .locator("#host-root")
      .getByRole("alert")
      .getByText("a component called the Server Action like, and no page of the app is open")
      .waitFor();
  });
});
