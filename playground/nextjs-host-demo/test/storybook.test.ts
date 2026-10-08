import path from "node:path";
import type { Frame, Page } from "playwright";
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
