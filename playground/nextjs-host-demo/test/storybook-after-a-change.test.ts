import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect } from "vitest";
import { copyProject } from "../../test-helpers/build.ts";
import { createProject, type DevServer } from "../../test-helpers/host.ts";
import type { Frame } from "playwright";
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
  expect
    .poll(() => canvas.evaluate(() => !("__marked" in window)).catch(() => false), {
      timeout: 30_000,
    })
    .toBe(true);

function change(file: string, from: string, to: string) {
  const changed = path.join(copy, file);
  const source = fs.readFileSync(changed, "utf8");
  expect(source).toContain(from);
  fs.writeFileSync(changed, source.replace(from, to));
}

const inDocs = (canvas: Frame) => canvas.locator("#storybook-docs");
// After a change the docs page renders again, with new iframes of its server
// stories, and an iframe that it replaces stops what it was loading.
const replacedIframe = /^requestfailed: .* net::ERR_ABORTED$/;

test("an MDX page renders again after a change of the file", async ({ page, errors }) => {
  errors.ignore!.push(replacedIframe);
  const canvas = await openDocs(page, site!.url, "introduction--docs");
  await storyInDocs(canvas, "greeting--default");
  change("stories/introduction.mdx", "# Introduction", "# Introduction, changed");
  await expect
    .poll(() => inDocs(canvas).getByRole("heading", { name: "Introduction, changed" }).count(), {
      timeout: 30_000,
    })
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
    .poll(() => inDocs(canvas).getByRole("button", { name: "Pushed: 0" }).count(), {
      timeout: 30_000,
    })
    .toBe(1);
  expect(await canvas.evaluate(() => "__marked" in window)).toBe(true);
});

test("a client story has the project's decorator after a change of its file", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "press-button--labelled");
  change("stories/press-button.stories.tsx", 'label: "Labelled"', 'label: "Relabelled"');
  // The components of the story file and of the preview file, both as the
  // browser layer evaluated them after the change.
  const button = canvas.locator("#storybook-root").getByRole("button", { name: "Relabelled: 0" });
  await expect.poll(() => button.getAttribute("data-theme"), { timeout: 30_000 }).toBe("storybook");
});

// Retried until SB-2295 is fixed in Storybook: a render that Storybook drops
// while it prepares runs the cleanup of the render on screen, which leaves
// the page while it loads. Under CI load that hits this test.
test("a page story renders again after a change of its file", { retry: 2 }, async ({ page }) => {
  const canvas = await openStory(page, site!.url, "home--home");
  change("stories/home.stories.tsx", 'url: "/"', 'url: "/?changed"');
  await expect.poll(() => new URL(canvas.url()).search, { timeout: 30_000 }).toBe("?changed");
  expect(await storyRun(page, canvas, "home--home")).toMatchObject({
    phase: "finished",
    reports: [],
  });
});

test("a client story has the project's decorator after a change of a component of it", async ({
  page,
}) => {
  const canvas = await openStory(page, site!.url, "press-button--labelled");
  await mark(canvas);
  change("app/components/theme.tsx", "data-theme={theme}>", 'data-theme={theme} data-changed="">');
  // A change that reaches the preview file loads the preview again.
  await reloaded(canvas);
  await rendered(canvas, "press-button--labelled");
  const theme = canvas.locator("#storybook-root").getByTestId("theme");
  await expect.poll(() => theme.getAttribute("data-changed")).toBe("");
  const button = theme.getByRole("button");
  await expect.poll(() => button.getAttribute("data-theme")).toBe("storybook");
});

test("server stories render after a change of a component of the app", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "home--home");
  await mark(canvas);
  change("app/components/greeting.tsx", "<h2>Hello from {name}</h2>", "<h2>Hi from {name}</h2>");
  // A change of the app loads the preview again, with the page open too.
  await reloaded(canvas);
  await rendered(canvas, "home--home");
  await expect
    .poll(() => canvas.getByRole("heading", { name: "Hi from the page" }).count())
    .toBe(1);
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
    .poll(() => theme.evaluate((element) => getComputedStyle(element).outlineColor), {
      timeout: 30_000,
    })
    .toBe("rgb(0, 128, 0)");
  expect(await canvas.evaluate(() => "__marked" in window)).toBe(true);
});

test("an MDX file that imports server code says so", async ({ page, errors }) => {
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
      .poll(() => canvas.locator("#error-message").textContent(), { timeout: 30_000 })
      .toContain("./stories/server-code.mdx could not load in the browser");
    errors.list.splice(0);
  } finally {
    fs.rmSync(path.join(copy, "stories/server-code.mdx"));
  }
});

// Last: the preview does not load until the change is undone.
test("a theme of storybook/theming in the preview file says where it goes", async ({
  page,
  errors,
}) => {
  const canvas = await openStory(page, site!.url, "press-button--labelled");
  change(
    ".storybook/preview.tsx",
    'import "./preview.css";',
    'import "./preview.css";\nimport { themes } from "storybook/theming";\nconsole.log(themes);',
  );
  // Vite's overlay of the error, in the preview, which did not load.
  const overlay = () =>
    canvas
      .evaluate(
        () =>
          document.querySelector("vite-error-overlay")?.shadowRoot?.querySelector(".message-body")
            ?.textContent ?? "",
      )
      .catch(() => "");
  await expect
    .poll(overlay, { timeout: 30_000 })
    .toContain("preview.tsx imports storybook/theming, which renders with React DOM");
  expect(await overlay()).toContain("a theme from storybook/theming/create");
  errors.list.splice(0);
});
