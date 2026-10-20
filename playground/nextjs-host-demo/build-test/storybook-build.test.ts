import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect } from "vitest";
import { filesWithMachinePaths } from "../../test-helpers/build.ts";
import { createProject, serveFiles, test, type Site } from "../../test-helpers/host.ts";
import {
  openDocs,
  openStory,
  rendered,
  runStory,
  storyInDocs,
  storyRun,
  stylesInOrder,
  type StoryRun,
} from "../../test-helpers/storybook.ts";

// `storybook build` of the project with @storybook/nextjs-vite-rsc, which
// builds the layers with Vite's app builder, behind a server of files: the
// stories of test/storybook.test.ts, without a dev server.

const root = fileURLToPath(new URL("../", import.meta.url));
const repository = path.resolve(root, "../..");
// Not in the project, where the dev server of test/storybook.test.ts would
// see the build.
const out = fs.mkdtempSync(path.join(os.tmpdir(), "nextjs-host-demo-storybook-"));

let site: Site | undefined;

beforeAll(async () => {
  await createProject(root, { env: { STORYBOOK_DISABLE_TELEMETRY: "1" } }).run(
    "storybook",
    "build",
    "--output-dir",
    out,
  );
  site = await serveFiles(out);
});

afterAll(async () => {
  await site?.close();
  fs.rmSync(out, { recursive: true, force: true });
});

const passed: StoryRun = { phase: "finished", reports: [], interactions: "PASS" };

// What the layers built. Storybook's docgen of a component, in `services/`,
// names its file by its path on the machine.
test("has no path of the machine that built it, but in Storybook's docgen", () => {
  const files = Object.keys(filesWithMachinePaths(out, repository));
  expect(files.filter((file) => !file.startsWith("services/core/docgen/"))).toEqual([]);
});

test("server stories, a page, a Server Action and client stories", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  expect(await storyRun(page, canvas, "greeting--default")).toEqual(passed);
  expect(await runStory(page, canvas, "home--home")).toEqual(passed);
  expect(await runStory(page, canvas, "greeting--server-action")).toEqual(passed);
  expect(await runStory(page, canvas, "press-button--pressed")).toEqual(passed);
  // The CSS module of the component, from the build.
  await expect
    .poll(() =>
      canvas
        .getByRole("button", { name: "Press: 1" })
        .evaluate((element) => getComputedStyle(element).color),
    )
    .toBe("rgb(0, 0, 255)");
});

// A story has the CSS of its own file and of its route, whatever story ran
// before it, in the build as with the dev server: a client story that of its file, which imports preview.tsx and
// press-button.stories.css, a server story that of preview.server.tsx and
// its node, and a page that of its route alone.
test("a story has the CSS of its file and its route, in any order of the stories", async ({
  page,
}) => {
  const stories = ["press-button--pressed", "greeting--default", "home--home"];
  // The server stories after a client story, and before one.
  const forwards = await stylesInOrder(page, site!.url, [...stories, "press-button--labelled"]);
  const backwards = await stylesInOrder(page, site!.url, [
    "home--home",
    "greeting--default",
    "press-button--labelled",
    "press-button--pressed",
  ]);
  expect(backwards).toEqual(forwards);
  const has = (story: string, selector: string) =>
    forwards[story]!.some((rule) => rule.startsWith(`${selector} {`));
  expect(stories.map((story) => has(story, ".story-frame"))).toEqual([true, false, false]);
  expect(stories.map((story) => has(story, '[data-testid="theme"]'))).toEqual([true, true, false]);
});

// A server story of a component is a node, in the preview's document: a
// reload loads the preview again, not the app's page at the node's URL.
test("a reload at a server story of a component shows the story again", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  await canvas.evaluate(() => ((window as { before?: true }).before = true));
  await canvas.evaluate(() => location.reload());
  await canvas.waitForFunction(() => !(window as { before?: true }).before, null, {
    timeout: 30_000,
  });
  // Once the preview of the new document has rendered the story: `storyRun()`
  // reads the preview, which loads after the document.
  expect(await rendered(canvas, "greeting--default")).toBe("finished");
  expect(await storyRun(page, canvas, "greeting--default")).toEqual(passed);
  expect(await canvas.getByText("Hello from the page").count()).toBe(0);
});

test("an MDX page and autodocs, with server stories in iframes and client stories inline", async ({
  page,
}) => {
  const canvas = await openDocs(page, site!.url, "introduction--docs");
  const docs = canvas.locator("#storybook-docs");
  const server = await storyInDocs(canvas, "greeting--default");
  expect(await server.getByText("Hello from Storybook").count()).toBe(1);
  const button = docs.getByTestId("meta-decorator").getByRole("button", { name: "Press: 0" });
  await expect.poll(() => button.getAttribute("data-theme")).toBe("storybook");
  await button.click();
  await expect.poll(() => docs.getByRole("button", { name: "Press: 1" }).count()).toBe(1);
  // A file with `"use client"` next to the preview file, which imports
  // Storybook's theming.
  expect(await docs.getByTestId("docs-blockquote").getAttribute("data-theme-base")).toBe("light");
  const autodocs = await openDocs(page, site!.url, "press-button--docs");
  await expect
    .poll(() =>
      autodocs.locator("#storybook-docs").getByRole("button", { name: "Press: 0" }).count(),
    )
    .toBe(2);
});

// What Chromatic does with a build: the stories of every entry of the index,
// which loads every file. The misuse files of this project that do not load
// reject it with their error, as a file that does not load does in any
// Storybook. The notes demo's build has every story in extract().
test("extract() of the preview fails with the error of a file that does not load", async ({
  page,
}) => {
  await page.goto(new URL("iframe.html", site!.url).href);
  await page.waitForFunction(
    () => !!(window.__STORYBOOK_PREVIEW__ as Extracting | undefined)?.storyStoreValue,
    null,
    { timeout: 60_000 },
  );
  const extract = page.evaluate(async () =>
    Object.keys(await (window.__STORYBOOK_PREVIEW__ as Extracting).extract()),
  );
  await expect(extract).rejects.toThrow(
    /has no story of meta\.story\(\)|so its stories render in the browser|so it is server code|declares the globals|defineServerPreview\(\) got a beforeAll/,
  );
});

// What the preview has for Chromatic.
type Extracting = Window["__STORYBOOK_PREVIEW__"] & {
  storyStoreValue?: object;
  extract(): Promise<object>;
};
