import fs from "node:fs";
import path from "node:path";
import type { Frame, Locator, Page } from "playwright";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { openStory, selectStory } from "../../test-helpers/storybook.ts";
import { root, run, serve, serveFiles, test, type PageErrors, type Site } from "./helpers.ts";

// The stories in Storybook, on the framework of
// playground/storybook-nextjs-vite-rsc: with `storybook dev`, and in a static
// build of `storybook build`.

const open = (page: Page, site: Site, story: string) => openStory(page, site.url, story);
const select = selectStory;

// Another story, selected while the story that is there is still rendering:
// before its page has loaded.
async function selectWhileRendering(canvas: Frame, story: string): Promise<void> {
  type Preview = { currentRender?: { phase?: string } };
  await canvas.waitForFunction(
    () =>
      (window as unknown as { __STORYBOOK_PREVIEW__?: Preview }).__STORYBOOK_PREVIEW__
        ?.currentRender?.phase === "rendering",
    undefined,
    { polling: 1 },
  );
  await select(canvas, story);
}

// What the Actions panel has logged, by the name of the action.
async function actions(page: Page, name: string): Promise<number> {
  await page.getByRole("tab", { name: /Actions/ }).click();
  return page.locator("#storybook-panel-root").getByText(`${name}:`).count();
}

const panel = (page: Page) => page.locator("#storybook-panel-root");

// Changes an arg of the story in the Controls panel, as a user types it.
async function control(page: Page, arg: string, value: string): Promise<void> {
  await page.getByRole("tab", { name: /Controls/ }).click();
  await panel(page).locator(`#control-${arg}`).fill(value);
}

// Marks an element of the canvas, which a page load would replace.
const mark = (element: Locator) =>
  element.evaluate((node) => ((node as { kept?: boolean }).kept = true));
const isMarked = (element: Locator) =>
  element.evaluate((node) => (node as { kept?: boolean }).kept === true);

type Check = (page: Page, site: Site, errors: PageErrors) => Promise<void>;

const checks: Record<string, Check> = {
  // A Server Component, with a Client Component in it.
  async "a server story"(page, site) {
    const canvas = await open(page, site, "server-greeting--default");
    await canvas.getByRole("heading", { name: "Hello from Storybook" }).waitFor();
    await canvas.getByText("The server read the request.").waitFor();
    await canvas.getByRole("button", { name: "Count: 0" }).click();
    await canvas.getByRole("button", { name: "Count: 1" }).waitFor();
  },
  // A page of the app, in its layouts, with what the story seeded.
  async "a page of the app"(page, site) {
    const canvas = await open(page, site, "pages-note--note");
    await canvas.getByRole("heading", { name: "Seeded by the story" }).waitFor();
    await canvas.getByRole("navigation", { name: "Main" }).waitFor();
  },
  // A story of a file with "use client": the arg is a spy, which its play
  // function clicks and asserts on, and the Actions panel logs.
  async "a client story"(page, site) {
    const canvas = await open(page, site, "client-button--default");
    await canvas.getByRole("button", { name: "Press" }).waitFor();
    await page.getByRole("tab", { name: /Interactions/ }).click();
    await panel(page).getByText("toHaveBeenCalledOnce").waitFor();
    expect(await actions(page, "onClick"), "the actions the play function logged").toBe(1);
    await canvas.getByRole("button", { name: "Press" }).click();
    await panel(page).getByText("onClick:").nth(1).waitFor();
  },
  // A render function with state, in Next's router at the URL of the story.
  async "a client story with state and usePathname()"(page, site) {
    const canvas = await open(page, site, "client-button--counting");
    await canvas.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
    await page.getByRole("tab", { name: /Interactions/ }).click();
    await panel(page).getByText("toHaveBeenCalledTimes").waitFor();
    expect(await actions(page, "onClick"), "the actions the play function logged").toBe(2);
    await canvas.getByRole("button", { name: "Press at /notes/7: 2" }).click();
    await canvas.getByRole("button", { name: "Press at /notes/7: 3" }).waitFor();
  },
  // The CSS module and the image of a Client Component that a client story
  // renders.
  async "the CSS and the image of a client story"(page, site) {
    const canvas = await open(page, site, "client-button--with-badge");
    await canvas.getByTestId("badge").waitFor();
    await canvas.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("[data-testid=badge]")!).backgroundColor ===
        "rgb(0, 112, 243)",
    );
    await canvas.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>('img[alt="Badge logo"]');
      return image?.complete && image.naturalWidth > 0;
    });
  },
  // A story links the CSS of what its own story file imports, and not that of
  // another story file the preview has loaded: Callout's CSS underlines every
  // heading of its page. With a file of `public/` that the CSS names by a URL
  // with a query.
  async "the CSS of a story is that of its story file"(page, site) {
    const canvas = await open(page, site, "server-callout--default");
    await canvas.getByRole("heading", { name: "Read this first" }).waitFor();
    await canvas.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#storybook-root h2")!).textDecorationLine ===
        "underline",
    );
    const image = await canvas.evaluate(async () => {
      const callout = document.querySelector(".callout")!;
      const url = /url\("(.*)"\)/.exec(getComputedStyle(callout).backgroundImage)![1]!;
      return { url, status: (await fetch(url)).status };
    });
    expect(image.url).toMatch(/\/stripes\.svg\?v=1$/);
    expect(image.status).toBe(200);

    // Greeting and what it renders import no CSS: neither Callout's nor that
    // of a client story, like the Badge of client-button.
    await select(canvas, "server-greeting--default");
    await canvas.getByRole("heading", { name: "Hello from Storybook" }).waitFor();
    const linked = await canvas.evaluate(() =>
      [...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")]
        .map((link) => link.href)
        .filter((href) => href.includes("/_next/static/css/")),
    );
    expect(linked).toEqual([]);
    expect(
      await canvas.evaluate(
        () => getComputedStyle(document.querySelector("#storybook-root h2")!).textDecorationLine,
      ),
    ).toBe("none");
  },
  // A Client Component that is no story file and imports a spy of
  // `storybook/test`: the preview's own module, also in a build.
  async "a spy of storybook/test in a Client Component"(page, site) {
    const canvas = await open(page, site, "server-spiedbutton--default");
    await canvas.getByRole("button", { name: "Spied presses: 0" }).click();
    await canvas.getByRole("button", { name: "Spied presses: 1" }).waitFor();
  },
  // A decorator of the project is a Server Component around every story,
  // also around one of a file with "use client".
  async "the decorators of the project"(page, site) {
    const canvas = await open(page, site, "server-greeting--default");
    const decorated = canvas.getByTestId("project-decorator");
    await decorated.getByRole("heading", { name: "Hello from Storybook" }).waitFor();
    // Around the decorators of the story file, which render in the browser.
    await select(canvas, "client-button--default");
    await decorated.getByTestId("meta-decorator").getByRole("button", { name: "Press" }).waitFor();
  },
  // A story of CSF Next that extends another, and a client story of CSF 3.
  async "an extended story, and a client story in CSF 3"(page, site) {
    let canvas = await open(page, site, "client-button--pressed");
    await canvas.getByRole("button", { name: "Pressed" }).waitFor();
    await page.getByRole("tab", { name: /Interactions/ }).click();
    await panel(page).getByText("toHaveBeenCalledOnce").waitFor();
    canvas = await open(page, site, "client-buttonincsf3--default");
    await canvas.getByRole("button", { name: "Tap" }).waitFor();
    await page.getByRole("tab", { name: /Interactions/ }).click();
    await panel(page).getByText("toHaveBeenCalledOnce").waitFor();
    expect(await actions(page, "onClick"), "the actions the play function logged").toBe(1);
  },
  // Docs, a story and docs again in one preview: every story is a page load,
  // and the docs page renders in a module graph that lives as long as the
  // document.
  async "from a docs page to a story and back"(page, site, errors) {
    await page.goto(`${site.url}?path=/docs/introduction--docs`);
    const preview = page.frameLocator("#storybook-preview-iframe");
    await preview.getByRole("heading", { name: "Stories of a Next.js app" }).waitFor();
    const counting = preview.frameLocator(`iframe[src*="id=client-button--counting"]`);
    await counting.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
    await page.locator('[data-item-id="client-button"]').click();
    await page.locator('[data-item-id="client-button--counting"]').click();
    await preview.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
    await page.locator('[data-item-id="introduction--docs"]').click();
    const greeting = preview.frameLocator(`iframe[src*="id=server-greeting--default"]`);
    await greeting.getByRole("heading", { name: "Hello from Storybook" }).waitFor();
    await page.locator('[data-item-id="server-greeting"]').click();
    await page.locator('[data-item-id="server-greeting--docs"]').click();
    await preview.getByRole("heading", { name: "Greeting", exact: true }).waitFor();
    // The requests for modules that a page load stops when the next story
    // opens before it is done. Nothing else.
    const logged = errors.list.splice(0);
    expect(logged.filter((error) => !error.endsWith("net::ERR_ABORTED"))).toEqual([]);
  },
  // Stories that use the framework wrong: Storybook shows each error, which
  // says what to do instead.
  async "errors that say what to do"(page, site, errors) {
    const misuse = [
      ["misuse-server--hook-on-the-server", "calls useState() on the server"],
      ["misuse-server--throws-on-the-server", "The render function threw on the server"],
      ["misuse-server--page-without-url", "which needs a URL to open"],
      ["misuse-server--page-with-layouts", "renders in its layouts already"],
      ["misuse-client--page-in-a-client-file", 'but its story file has "use client"'],
    ];
    for (const [story, message] of misuse) {
      const canvas = await open(page, site, story!);
      await canvas.getByText(message!, { exact: false }).first().waitFor();
    }
    // What Storybook logs of them, and the requests that the next page load
    // stops. Nothing else.
    const logged = errors.list.splice(0);
    expect(logged.filter((error) => !/misuse|net::ERR_ABORTED$/.test(error))).toEqual([]);
  },
  // What the manager stores on the origin of the preview is its own: a story
  // that loads does not take it.
  async "the manager's storage"(page, site) {
    const canvas = await open(page, site, "server-greeting--default");
    // Once the story has rendered, which is once it has hydrated.
    await canvas.getByRole("button", { name: "Count: 0" }).click();
    await canvas.getByRole("button", { name: "Count: 1" }).waitFor();
    await page.evaluate(() => localStorage.setItem("manager-setting", "kept"));
    await select(canvas, "server-greeting--other-name");
    await canvas.getByRole("heading", { name: "Hello from a story with other args" }).waitFor();
    expect(await page.evaluate(() => localStorage.getItem("manager-setting"))).toBe("kept");
  },
  // A docs page of autodocs, which shows every story in an iframe of its own:
  // React DOM renders the page, and each iframe has the app of its story.
  async "a docs page"(page, site) {
    await page.goto(`${site.url}?path=/docs/server-greeting--docs`);
    const docs = page.frameLocator("#storybook-preview-iframe");
    await docs.getByRole("heading", { name: "Greeting", exact: true }).waitFor();
    for (const [story, heading] of [
      ["server-greeting--default", "Hello from Storybook"],
      ["server-greeting--other-name", "Hello from a story with other args"],
    ]) {
      const canvas = docs.frameLocator(`iframe[src*="id=${story}"]`).first();
      await canvas.getByRole("heading", { name: heading }).waitFor();
      await canvas.getByRole("button", { name: "Count: 0" }).click();
      await canvas.getByRole("button", { name: "Count: 1" }).waitFor();
    }
  },
  // A docs page in MDX, which is code of the browser layer, with a server
  // story and a client story on it: each in an iframe of its own.
  async "an MDX docs page"(page, site) {
    await page.goto(`${site.url}?path=/docs/introduction--docs`);
    const docs = page.frameLocator("#storybook-preview-iframe");
    await docs.getByRole("heading", { name: "Stories of a Next.js app" }).waitFor();
    const greeting = docs.frameLocator(`iframe[src*="id=server-greeting--default"]`).first();
    await greeting.getByRole("heading", { name: "Hello from Storybook" }).waitFor();
    const button = docs.frameLocator(`iframe[src*="id=client-button--counting"]`).first();
    await button.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
  },
  // From story to story in one preview, as in a session: every story is a
  // page load, and a client story reads its imports from the page it is on.
  // Each one has rendered before the next is selected.
  async "from story to story"(page, site) {
    const canvas = await open(page, site, "server-greeting--default");
    await canvas.getByRole("button", { name: "Count: 0" }).click();
    await canvas.getByRole("button", { name: "Count: 1" }).waitFor();
    await select(canvas, "client-button--counting");
    await canvas.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
    await select(canvas, "client-button--default");
    await canvas.getByRole("button", { name: "Press", exact: true }).waitFor();
    await select(canvas, "pages-note--note");
    await canvas.getByRole("heading", { name: "Seeded by the story" }).waitFor();
    await select(canvas, "client-button--counting");
    await canvas.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
    await select(canvas, "server-greeting--other-name");
    await canvas.getByRole("heading", { name: "Hello from a story with other args" }).waitFor();
  },
  // An arg from the Controls renders the story again in place, without a
  // page load: the state of its Client Component stays.
  async "an arg of a server story from the Controls"(page, site) {
    const canvas = await open(page, site, "server-greeting--default");
    const counter = canvas.getByRole("button", { name: /^Count: / });
    await canvas.getByRole("button", { name: "Count: 0" }).click();
    await canvas.getByRole("button", { name: "Count: 1" }).waitFor();
    await mark(counter);
    await control(page, "name", "the Controls");
    await canvas.getByRole("heading", { name: "Hello from the Controls" }).waitFor();
    await canvas.getByText("The server read the request.").waitFor();
    expect(await counter.textContent()).toBe("Count: 1");
    expect(await isMarked(counter), "the counter of the page that was there").toBe(true);
  },
  async "an arg of a client story from the Controls"(page, site) {
    const canvas = await open(page, site, "client-button--counting");
    const button = canvas.getByRole("button", { name: / at \/notes\/7: / });
    await page.getByRole("tab", { name: /Interactions/ }).click();
    await panel(page).getByText("toHaveBeenCalledTimes").waitFor();
    await canvas.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
    await mark(button);
    await control(page, "children", "Tap");
    await canvas.getByRole("button", { name: "Tap at /notes/7: 2" }).waitFor();
    expect(await isMarked(button), "the button of the page that was there").toBe(true);
    await button.click();
    await canvas.getByRole("button", { name: "Tap at /notes/7: 3" }).waitFor();
  },
  // `parameters.nextjs.proxy` runs proxy.ts for a story of a component,
  // whose rewrite decides the route of its URL.
  async "a story through the proxy"(page, site) {
    const canvas = await open(page, site, "server-routeparams--through-the-proxy");
    await canvas.getByText('{"id":"7"}').waitFor();
    await select(canvas, "server-routeparams--default");
    await canvas.getByText("{}", { exact: true }).waitFor();
    await canvas.getByText("/latest").waitFor();
  },
  // A story that is selected while the one before it is still rendering
  // takes its place, and the preview goes on with the next one.
  async "to another story while one renders"(page, site) {
    const canvas = await open(page, site, "server-greeting--default");
    await selectWhileRendering(canvas, "client-button--counting");
    await canvas.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
    await select(canvas, "server-greeting--other-name");
    await canvas.getByRole("heading", { name: "Hello from a story with other args" }).waitFor();
    await canvas.getByRole("button", { name: "Count: 0" }).click();
    await canvas.getByRole("button", { name: "Count: 1" }).waitFor();
  },
};

function runChecks(site: () => Site) {
  for (const [name, check] of Object.entries(checks)) {
    test(name, ({ page, errors }) => check(page, site(), errors));
  }
}

describe("storybook dev", () => {
  let site: Site;
  beforeAll(async () => {
    site = await serve(
      (port) => ["storybook", "dev", `--port=${port}`, "--exact-port", "--no-open", "--ci"],
      { ready: "index.json" },
    );
  });
  afterAll(() => site?.close());

  runChecks(() => site);

  // An MDX file that changes: the docs page shows it as it is now.
  test("an MDX docs page after an edit", async ({ page, errors }) => {
    const file = path.join(root, "stories/introduction.mdx");
    const source = fs.readFileSync(file, "utf8");
    await page.goto(`${site.url}?path=/docs/introduction--docs`);
    const preview = page.frameLocator("#storybook-preview-iframe");
    const counting = preview.frameLocator(`iframe[src*="id=client-button--counting"]`);
    await preview.getByRole("heading", { name: "Stories of a Next.js app" }).waitFor();
    try {
      fs.writeFileSync(file, source.replace("# Stories of a Next.js app", "# Stories, edited"));
      await preview.getByRole("heading", { name: "Stories, edited" }).waitFor();
      // The stories on the page render again, each in its iframe.
      await counting.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
    } finally {
      fs.writeFileSync(file, source);
    }
    await preview.getByRole("heading", { name: "Stories of a Next.js app" }).waitFor();
    // An edit renders the docs page again, which replaces the iframes of its
    // stories: what one of them still loaded is stopped. Nothing else.
    const logged = errors.list.splice(0);
    expect(logged.filter((error) => !error.endsWith("net::ERR_ABORTED"))).toEqual([]);
  });

  // A story file that changes while a story is at the URL of its page: the
  // preview fetches the story index again, from its own URL, not the page's.
  test("the story index after an edit, with a story at the URL of its page", async ({ page }) => {
    const file = path.join(root, "stories/introduction.mdx");
    const source = fs.readFileSync(file, "utf8");
    const canvas = await open(page, site, "client-button--counting");
    await canvas.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
    const index = () =>
      page.waitForResponse(
        (response) => response.frame() === canvas && response.url().endsWith("index.json"),
      );
    try {
      const edited = index();
      fs.writeFileSync(file, `${source}\n`);
      const response = await edited;
      expect(response.url()).toBe(`${site.url}index.json`);
      expect(response.status()).toBe(200);
    } finally {
      const restored = index();
      fs.writeFileSync(file, source);
      await restored;
    }
    await canvas.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
  });
});

// `storybook build` builds with Vite's app builder: see the patch of
// `@storybook/builder-vite` in patches/.
describe("storybook build", () => {
  let site: Site;
  beforeAll(async () => {
    await run("storybook", "build", "--quiet");
    site = await serveFiles(path.join(root, "storybook-static"));
  });
  afterAll(() => site?.close());

  runChecks(() => site);
});
