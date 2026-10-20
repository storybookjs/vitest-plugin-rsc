import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect } from "vitest";
import { copyProject } from "../../test-helpers/build.ts";
import { createProject, type DevServer } from "../../test-helpers/host.ts";
import type { Frame, Page } from "playwright";
import {
  openDocs,
  openStory,
  rendered,
  runStory,
  storyInDocs,
  storyRun,
  test,
} from "../../test-helpers/storybook.ts";

// `storybook dev` after a change of a file, as a user edits one with a story
// open. In a copy of the project, which the test changes, so that the other
// tests do not see it.

const root = fileURLToPath(new URL("../", import.meta.url));
const copy = fs.mkdtempSync(path.join(root, "..", ".nextjs-host-demo-"));
copyProject(root, copy);

let site: DevServer | undefined;

beforeAll(async () => {
  site = await createProject(copy, { env: { STORYBOOK_DISABLE_TELEMETRY: "1" } }).serve(
    (port) => ["storybook", "dev", "--port", String(port), "--ci", "--exact-port"],
    { timeout: 120_000 },
  );
});

afterAll(async () => {
  await site?.close();
  fs.rmSync(copy, { recursive: true, force: true });
});

// Marks the document of the canvas, which a full reload replaces.
const mark = (canvas: Frame) => canvas.evaluate(() => Object.assign(window, { __marked: true }));
const reloaded = (canvas: Frame) =>
  expect.poll(() => canvas.evaluate(() => !("__marked" in window)).catch(() => false)).toBe(true);

function change(file: string, from: string, to: string) {
  const changed = path.join(copy, file);
  const source = fs.readFileSync(changed, "utf8");
  expect(source).toContain(from);
  fs.writeFileSync(changed, source.replace(from, to));
}

/**
 * What the preview does after a save: the stories it renders, counted in the
 * manager, whose channel stays as the preview loads again, and the loads of
 * its document. Call before the story opens; `since()` starts the count
 * once the story is rendered, and `afterSave()` resolves once something
 * rendered and nothing more did for two seconds.
 */
async function watchPreview(page: Page) {
  await page.addInitScript(() => {
    if (location.pathname === "/iframe.html") return;
    type Channel = { on(event: string, listener: (id: string) => void): void };
    const rendered: string[] = [];
    let channel: Channel | undefined;
    Object.defineProperty(window, "__STORYBOOK_ADDONS_CHANNEL__", {
      configurable: true,
      get: () => channel,
      set(value: Channel) {
        if (value !== channel) value.on("storyRendered", (id) => rendered.push(id));
        channel = value;
      },
    });
    Object.assign(window, { __rendered: rendered });
  });
  let loads = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && new URL(request.url()).pathname === "/iframe.html") {
      loads++;
    }
  });
  const rendered = () =>
    page.evaluate(() => [...(window as unknown as { __rendered: string[] }).__rendered]);
  return {
    async since(story: string) {
      await expect.poll(rendered).toContain(story);
      await page.evaluate(() => {
        (window as unknown as { __rendered: string[] }).__rendered.length = 0;
      });
      loads = 0;
    },
    async afterSave() {
      await expect.poll(async () => (await rendered()).length).not.toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return { rendered: await rendered(), loads };
    },
  };
}

const inDocs = (canvas: Frame) => canvas.locator("#storybook-docs");
// After a change the docs page renders again, with new iframes of its server
// stories, and an iframe that it replaces stops what it was loading.
const replacedIframe = /^requestfailed: .* net::ERR_ABORTED$/;

// The MDX file imports the story file's evaluation that the store has: the
// story file did not change, so it is the one evaluation of it, and
// `<Canvas of>` names a story that the store knows.
test("an MDX page renders again after a change of the file", async ({ page, errors }) => {
  errors.ignore!.push(replacedIframe);
  const canvas = await openDocs(page, site!.url, "introduction--docs");
  await storyInDocs(canvas, "greeting--default");
  change("stories/introduction.mdx", "# Introduction", "# Introduction, changed");
  await expect
    .poll(() => inDocs(canvas).getByRole("heading", { name: "Introduction, changed" }).count())
    .toBe(1);
  await storyInDocs(canvas, "greeting--default");
});

test("an MDX page renders again after a change of a story file it imports", async ({
  page,
  errors,
}) => {
  errors.ignore!.push(replacedIframe);
  const canvas = await openDocs(page, site!.url, "introduction--docs");
  await storyInDocs(canvas, "greeting--default");
  await mark(canvas);
  change("stories/press-button.stories.tsx", 'label: "Press"', 'label: "Pushed"');
  // The story of the store after the change, in place.
  await expect
    .poll(() => inDocs(canvas).getByRole("button", { name: "Pushed: 0" }).count())
    .toBe(1);
  expect(await canvas.evaluate(() => "__marked" in window)).toBe(true);
});

test("a client story has the project's decorator after a change of its file", async ({ page }) => {
  const preview = await watchPreview(page);
  const canvas = await openStory(page, site!.url, "press-button--labelled");
  await preview.since("press-button--labelled");
  await mark(canvas);
  change("stories/press-button.stories.tsx", 'label: "Labelled"', 'label: "Relabelled"');
  // The components of the story file and of the preview file, both as the
  // browser layer evaluated them after the change.
  const button = canvas.locator("#storybook-root").getByRole("button", { name: "Relabelled: 0" });
  await expect.poll(() => button.getAttribute("data-theme")).toBe("storybook");
  expect(await preview.afterSave()).toEqual({ rendered: ["press-button--labelled"], loads: 0 });
  expect(await canvas.evaluate(() => "__marked" in window)).toBe(true);
});

// Storybook's Vite builder loads the preview again after any change of the
// preview file, for the `sb.mock()` calls in it (its vite-mock plugin): the
// story renders once, after that load, which stops what the preview was
// fetching, like the index of the stories.
const reloadedPreview = [
  /^requestfailed: .* net::ERR_ABORTED$/,
  /^console\.error: (Error loading story index:|TypeError: Failed to fetch)/,
];

test("a client story renders once after a change of the preview file", async ({ page, errors }) => {
  errors.ignore!.push(...reloadedPreview);
  const preview = await watchPreview(page);
  const canvas = await openStory(page, site!.url, "press-button--labelled");
  await preview.since("press-button--labelled");
  change(".storybook/preview.tsx", "<Story />", '<Story />\n        <span data-testid="saved" />');
  const saved = canvas.locator("#storybook-root").getByTestId("theme").getByTestId("saved");
  await expect.poll(() => saved.count()).toBe(1);
  expect(await preview.afterSave()).toEqual({ rendered: ["press-button--labelled"], loads: 1 });
});

// A browser module that only files with "use client" import: the story file
// is evaluated again, and its story renders with the new module.
test("a client story renders once after a change of its component", async ({ page }) => {
  const preview = await watchPreview(page);
  const canvas = await openStory(page, site!.url, "press-button--labelled");
  await preview.since("press-button--labelled");
  change(
    "app/components/press-button.tsx",
    "data-theme={useTheme()}",
    'data-theme={useTheme()} data-saved=""',
  );
  const button = canvas.locator("#storybook-root").getByRole("button", { name: "Relabelled: 0" });
  await expect.poll(() => button.getAttribute("data-saved")).toBe("");
  expect(await preview.afterSave()).toEqual({ rendered: ["press-button--labelled"], loads: 0 });
});

test("a server story renders once after a change of the server preview", async ({ page }) => {
  const preview = await watchPreview(page);
  const canvas = await openStory(page, site!.url, "greeting--default");
  await preview.since("greeting--default");
  change(
    ".storybook/preview.server.tsx",
    'data-testid="server-decorator"',
    'data-testid="server-decorator" data-saved=""',
  );
  const decorator = canvas.locator("#storybook-root").getByTestId("server-decorator");
  await expect.poll(() => decorator.getAttribute("data-saved")).toBe("");
  expect(await preview.afterSave()).toEqual({ rendered: ["greeting--default"], loads: 0 });
});

test("a server story renders once after a change of its file", async ({ page }) => {
  const preview = await watchPreview(page);
  const canvas = await openStory(page, site!.url, "greeting--server-action");
  await preview.since("greeting--server-action");
  change(
    "stories/greeting.stories.tsx",
    "render: () => <Like />",
    'render: () => [<Like key="like" />, <p key="saved">Saved</p>]',
  );
  const saved = canvas.locator("#storybook-root").getByText("Saved");
  await expect.poll(() => saved.count()).toBe(1);
  expect(await storyRun(page, canvas, "greeting--server-action")).toMatchObject({
    phase: "finished",
    reports: [],
  });
  expect(await preview.afterSave()).toEqual({ rendered: ["greeting--server-action"], loads: 0 });
});

// A Client Component of the app that only a story renders, not a route.
test("a server story renders once after a change of a component only it imports", async ({
  page,
}) => {
  const preview = await watchPreview(page);
  const canvas = await openStory(page, site!.url, "greeting--server-action");
  await preview.since("greeting--server-action");
  change("app/components/like.tsx", "<button\n", '<button\n        data-saved=""\n');
  const button = canvas.locator("#storybook-root").getByRole("button", { name: /^Likes: / });
  await expect.poll(() => button.getAttribute("data-saved")).toBe("");
  expect(await preview.afterSave()).toEqual({ rendered: ["greeting--server-action"], loads: 0 });
});

test("a page story renders again after a change of its file", async ({ page }) => {
  const preview = await watchPreview(page);
  const canvas = await openStory(page, site!.url, "home--home");
  await preview.since("home--home");
  await mark(canvas);
  change("stories/home.stories.tsx", 'url: "/"', 'url: "/?changed"');
  await expect.poll(() => new URL(canvas.url()).search).toBe("?changed");
  expect(await storyRun(page, canvas, "home--home")).toMatchObject({
    phase: "finished",
    reports: [],
  });
  expect(await preview.afterSave()).toEqual({ rendered: ["home--home"], loads: 0 });
  expect(await canvas.evaluate(() => "__marked" in window)).toBe(true);
});

test("a client story renders once after a change of a component of the preview file", async ({
  page,
}) => {
  const preview = await watchPreview(page);
  const canvas = await openStory(page, site!.url, "press-button--labelled");
  await preview.since("press-button--labelled");
  change("app/components/theme.tsx", "data-theme={theme}>", 'data-theme={theme} data-changed="">');
  // A browser module of the preview file: the preview file changes with it,
  // in place.
  const theme = canvas.locator("#storybook-root").getByTestId("theme");
  await expect.poll(() => theme.getAttribute("data-changed")).toBe("");
  const button = theme.getByRole("button");
  await expect.poll(() => button.getAttribute("data-theme")).toBe("storybook");
  expect(await preview.afterSave()).toEqual({ rendered: ["press-button--labelled"], loads: 0 });
});

test("server stories render after a change of a component of the app", async ({ page }) => {
  const preview = await watchPreview(page);
  const canvas = await openStory(page, site!.url, "home--home");
  await preview.since("home--home");
  await mark(canvas);
  change("app/components/greeting.tsx", "<h2>Hello from {name}</h2>", "<h2>Hi from {name}</h2>");
  // A change of the app loads the preview again, with the page open too.
  await reloaded(canvas);
  await rendered(canvas, "home--home");
  await expect
    .poll(() => canvas.getByRole("heading", { name: "Hi from the page" }).count())
    .toBe(1);
  expect(await preview.afterSave()).toEqual({ rendered: ["home--home"], loads: 1 });
  expect(await runStory(page, canvas, "greeting--server-action")).toMatchObject({
    phase: "finished",
    reports: [],
  });
});

test("a change of the preview's stylesheet shows in place", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "press-button--labelled");
  await mark(canvas);
  change(".storybook/preview.css", "rgb(255, 0, 0)", "rgb(0, 128, 0)");
  const theme = canvas.locator("#storybook-root").getByTestId("theme");
  await expect
    .poll(() => theme.evaluate((element) => getComputedStyle(element).outlineColor))
    .toBe("rgb(0, 128, 0)");
  expect(await canvas.evaluate(() => "__marked" in window)).toBe(true);
});

// The server preview's own stylesheet, which the story's node links.
test("a change of the server preview's stylesheet shows in place", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "greeting--server-action");
  await mark(canvas);
  change(".storybook/preview.server.css", "rgb(0, 128, 0)", "rgb(0, 0, 255)");
  const decorator = canvas.locator("#storybook-root").getByTestId("server-decorator");
  await expect
    .poll(() => decorator.evaluate((element) => getComputedStyle(element).borderLeftColor))
    .toBe("rgb(0, 0, 255)");
  expect(await canvas.evaluate(() => "__marked" in window)).toBe(true);
});

// An MDX file is a file with "use client": Next's own error of server code
// in the browser. Fails: the browser layer finds `server-only` to pre-bundle
// only as the MDX file imports it, and the docs page keeps Vite's error of
// the outdated pre-bundle, as no page load follows.
test.fails("an MDX file that imports server code shows Next's error", async ({ page, errors }) => {
  fs.writeFileSync(
    path.join(copy, "stories/server-code.mdx"),
    'import "server-only";\nimport { Meta } from "@storybook/addon-docs/blocks";\n\n' +
      '<Meta title="Server code" />\n\n# Server code\n',
  );
  try {
    // A docs page that fails shows Storybook's error, not its content.
    await page.goto(`${site!.url}?path=/docs/server-code--docs`);
    const iframe = await page.locator("#storybook-preview-iframe").elementHandle();
    const canvas = (await iframe!.contentFrame())!;
    await expect
      .poll(() => canvas.locator("#error-message").textContent())
      .toContain("This module cannot be imported from a Client Component module");
    errors.list.splice(0);
  } finally {
    fs.rmSync(path.join(copy, "stories/server-code.mdx"));
  }
});
