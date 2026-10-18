import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect } from "vitest";
import { createProject, serveFiles, test, type Site } from "../../test-helpers/host.ts";
import { index, renderEveryDocsPage, runEveryStory } from "./stories.ts";

// `storybook build` of the notes demo behind a server of files: the stories
// and docs pages of storybook.test.ts, without a dev server.

const root = fileURLToPath(new URL("../", import.meta.url));
// Not in the project, where the dev server of storybook.test.ts would see
// the build.
const out = fs.mkdtempSync(path.join(os.tmpdir(), "nextjs-notes-demo-storybook-"));

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

test("every story renders and plays, at its own URL", async ({ page, errors }) => {
  await runEveryStory(page, site!.url, errors);
});

test("every docs page shows its stories: a client story inline, a server story in an iframe", async ({
  page,
  errors,
}) => {
  await renderEveryDocsPage(page, site!.url, errors);
});

// What Chromatic does with a build: the stories of every entry of the index,
// which loads every file, the MDX file too. One file that fails to load
// rejects extract().
test("extract() of the preview has every story", async ({ page }) => {
  await page.goto(new URL("iframe.html", site!.url).href);
  await page.waitForFunction(
    () => !!(window.__STORYBOOK_PREVIEW__ as Extracting | undefined)?.storyStoreValue,
    null,
    { timeout: 60_000 },
  );
  const stories = await page.evaluate(async () =>
    Object.keys(await (window.__STORYBOOK_PREVIEW__ as Extracting).extract()),
  );
  const { stories: all } = await index(site!.url);
  expect(new Set(stories)).toEqual(new Set(all.map((story) => story.id)));
});

// What the preview has for Chromatic.
type Extracting = Window["__STORYBOOK_PREVIEW__"] & {
  storyStoreValue?: object;
  extract(): Promise<object>;
};
