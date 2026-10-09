import fs from "node:fs";
import path from "node:path";
import type { Frame, Locator, Page } from "playwright";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { root, run, serve, serveFiles, test, type Site } from "./helpers.ts";

// The stories in Storybook, on the framework of
// playground/storybook-nextjs-vite-rsc: with `storybook dev`, and in a static
// build of `storybook build`.

// The canvas of a story, in the manager: the way a user opens it.
async function open(page: Page, site: Site, story: string): Promise<Frame> {
  await page.goto(`${site.url}?path=/story/${story}`);
  const iframe = await page.locator("#storybook-preview-iframe").elementHandle();
  return (await iframe!.contentFrame())!;
}

type Channel = {
  emit(event: string, payload: object): void;
  on(event: string, listener: (id: string) => void): void;
  off(event: string, listener: (id: string) => void): void;
};

// Another story in the same preview, as a click in the sidebar selects it.
// Resolves once Storybook has rendered it.
async function select(canvas: Frame, story: string): Promise<void> {
  await canvas.evaluate((storyId) => {
    const { channel } = (window as unknown as { __STORYBOOK_PREVIEW__: { channel: Channel } })
      .__STORYBOOK_PREVIEW__;
    return new Promise<void>((resolve) => {
      const rendered = (id: string) => {
        if (id !== storyId) return;
        channel.off("storyRendered", rendered);
        resolve();
      };
      channel.on("storyRendered", rendered);
      channel.emit("setCurrentStory", { storyId, viewMode: "story" });
    });
  }, story);
}

// Another story, selected while the story that is there is still rendering:
// before its page has loaded.
async function selectWhileRendering(canvas: Frame, story: string): Promise<void> {
  type Preview = { channel: Channel; currentRender?: { phase?: string } };
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

type Check = (page: Page, site: Site) => Promise<void>;

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
    test(name, ({ page }) => check(page, site()));
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

  // A story file with "use client" that changes: the browser layer evaluates
  // it again, as it is now, by the URL it had before.
  test("a client story after an edit", async ({ page }) => {
    const file = path.join(root, "stories/button.stories.tsx");
    const source = fs.readFileSync(file, "utf8");
    const canvas = await open(page, site, "client-button--with-badge");
    await canvas.getByText("New", { exact: true }).waitFor();
    try {
      fs.writeFileSync(file, source.replace("<Badge>New</Badge>", "<Badge>Edited</Badge>"));
      await canvas.getByText("Edited", { exact: true }).waitFor();
    } finally {
      fs.writeFileSync(file, source);
    }
    await canvas.getByText("New", { exact: true }).waitFor();
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
