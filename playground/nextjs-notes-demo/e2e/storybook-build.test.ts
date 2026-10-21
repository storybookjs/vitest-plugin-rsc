import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect } from "vitest";
import { copyProject } from "../../test-helpers/build.ts";
import { createProject, serveFiles, test, type Site } from "../../test-helpers/host.ts";
import { openStory } from "../../test-helpers/storybook.ts";
import { envOf, sentinels, shellEnv, writeEnvFiles } from "./env-files.ts";
import { index, renderEveryDocsPage, runEveryStory } from "./stories.ts";

// `storybook build` of the notes demo behind a server of files: the stories
// and docs pages of storybook.test.ts, without a dev server. Of a copy of
// the project with a value in each env file, which the site has only of
// `.env.test` and `.env`.

const root = fileURLToPath(new URL("../", import.meta.url));
// Not in the project, where the dev server of storybook.test.ts would see
// the build.
const out = fs.mkdtempSync(path.join(os.tmpdir(), "nextjs-notes-demo-storybook-"));
// Made in `beforeAll`, which a run that skips every test here does not run,
// as it does not run `afterAll`.
let copy = "";
let site: Site | undefined;

beforeAll(async () => {
  copy = fs.mkdtempSync(path.join(root, "..", ".nextjs-notes-demo-"));
  copyProject(root, copy);
  writeEnvFiles(copy);
  await createProject(copy, { env: { STORYBOOK_DISABLE_TELEMETRY: "1", ...shellEnv } }).run(
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
  if (copy) fs.rmSync(copy, { recursive: true, force: true });
});

test("the site has the env of .env.test, and nothing of a .local file, another env file or the shell", async ({
  page,
}) => {
  const built = fs
    .readdirSync(out, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), "latin1"))
    .join("\n");
  expect(built).toContain(sentinels.test);
  for (const absent of [
    sentinels.testLocal,
    sentinels.local,
    sentinels.development,
    sentinels.production,
    sentinels.shell,
  ]) {
    expect(built).not.toContain(absent);
  }

  // In the page: also for the preview's first import, which reads it as it
  // evaluates.
  const canvas = await openStory(page, site!.url, "app-page--support-address");
  expect(await envOf(canvas)).toEqual({
    SENTINEL: sentinels.test,
    NEXT_PUBLIC_SENTINEL: sentinels.test,
    firstImportRead: sentinels.test,
  });
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
