import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Frame, Page } from "playwright";
import { afterAll, beforeAll, expect } from "vitest";
import { copyProject } from "../../test-helpers/build.ts";
import { createProject, type DevServer } from "../../test-helpers/host.ts";
import { openStory, rendered, storyRun, test } from "../../test-helpers/storybook.ts";
import { envOf, sentinels, shellEnv, writeEnvFiles } from "./env-files.ts";
import { passed } from "./stories.ts";

// `storybook dev` of the notes demo after a change of a story file, as a
// user edits one with its story open. The app has Tailwind, whose PostCSS
// plugin makes every file it scans, the story files too, a dependency of
// app/globals.css, which the root layout and the previews import. In a copy
// of the project, which the tests change, so that the other tests do not
// see it. With a value in each env file, of which the page has the ones of
// `.env.test.local`, `.env.test` and `.env`.

const root = fileURLToPath(new URL("../", import.meta.url));
// Made in `beforeAll`, which a run that skips every test here does not run,
// as it does not run `afterAll`.
let copy = "";
let site: DevServer | undefined;

beforeAll(async () => {
  copy = fs.mkdtempSync(path.join(root, "..", ".nextjs-notes-demo-"));
  copyProject(root, copy);
  writeEnvFiles(copy);
  site = await createProject(copy, {
    env: { STORYBOOK_DISABLE_TELEMETRY: "1", ...shellEnv },
  }).serve((port) => ["storybook", "dev", "--port", String(port), "--ci", "--exact-port"], {
    timeout: 120_000,
  });
});

afterAll(async () => {
  await site?.close();
  if (copy) fs.rmSync(copy, { recursive: true, force: true });
});

// Marks the document of the canvas, which a full reload replaces.
const mark = (canvas: Frame) => canvas.evaluate(() => Object.assign(window, { __marked: true }));
const marked = (canvas: Frame) => canvas.evaluate(() => "__marked" in window);

// Opens a story after a page story, so that the root layout, and the
// stylesheet it imports, are in the module graph, as a user has them who
// opened a page before.
async function openAfterPage(page: Page, story: string) {
  await openStory(page, site!.url, "app-page--signed-in");
  return openStory(page, site!.url, story);
}

function change(file: string, from: string, to: string) {
  const changed = path.join(copy, file);
  const source = fs.readFileSync(changed, "utf8");
  expect(source).toContain(from);
  fs.writeFileSync(changed, source.replace(from, to));
}

test("a page story renders again in place after a change of its file", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "app-page--signed-out");
  await mark(canvas);
  change("app/page.stories.tsx", 'url: "/"', 'url: "/?changed"');
  await expect.poll(() => new URL(canvas.url()).search).toBe("?changed");
  expect(await rendered(canvas, "app-page--signed-out")).toBe("finished");
  expect(await storyRun(page, canvas, "app-page--signed-out")).toEqual(passed);
  expect(await marked(canvas)).toBe(true);
});

test("a server story renders again in place after a change of its file", async ({ page }) => {
  const canvas = await openAfterPage(page, "components-ui-field--several-errors");
  await mark(canvas);
  change("components/ui/field.stories.tsx", '"Title is too long."', '"Title is far too long."');
  await expect.poll(() => canvas.getByText("Title is far too long.").count()).toBe(1);
  expect(await storyRun(page, canvas, "components-ui-field--several-errors")).toEqual(passed);
  expect(await marked(canvas)).toBe(true);
});

// A class that only the story file has: Tailwind's CSS of it is in the
// stylesheet after the change, which Vite swaps in place.
test("a client story renders again in place after a change of its file, with Tailwind's CSS of it", async ({
  page,
}) => {
  const canvas = await openAfterPage(page, "components-ui-button--pressed");
  await mark(canvas);
  change(
    "components/ui/button.stories.tsx",
    'children: "Create note",',
    'children: "Create note", className: "text-[rgb(0,128,0)]",',
  );
  const button = canvas.getByRole("button", { name: "Create note" });
  await expect
    .poll(() => button.evaluate((element) => getComputedStyle(element).color))
    .toBe("rgb(0, 128, 0)");
  expect(await storyRun(page, canvas, "components-ui-button--pressed")).toEqual(passed);
  expect(await marked(canvas)).toBe(true);
});

test("the page has the env of .env.test.local and .env.test, and nothing of .env.local, another env file or the shell", async ({
  page,
}) => {
  const canvas = await openStory(page, site!.url, "app-page--support-address");
  expect(await envOf(canvas)).toEqual({
    SENTINEL: sentinels.test,
    NEXT_PUBLIC_SENTINEL: sentinels.test,
    SENTINEL_OF_THE_MACHINE: sentinels.testLocal,
    firstImportRead: sentinels.test,
  });
});

// Not an env file of Vite's mode, which would restart the server: the page
// loads again, with the dependencies as they were bundled.
test("a page story has the new env after a change of .env.test", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "app-page--support-address");
  await mark(canvas);
  const logged = site!.output().length;
  change(
    ".env.test",
    'SUPPORT_EMAIL="support@notes.example"',
    'SUPPORT_EMAIL="help@notes.example"',
  );
  try {
    await expect.poll(() => canvas.getByText("help@notes.example").count()).toBe(1);
    expect(await marked(canvas)).toBe(false);
    const since = site!.output().slice(logged);
    expect(since).toContain("page reload .env.test (vitest-plugin-rsc: an env file changed)");
    expect(since).not.toMatch(
      /optimized dependencies changed|new dependencies optimized|server restarted/,
    );
  } finally {
    change(
      ".env.test",
      'SUPPORT_EMAIL="help@notes.example"',
      'SUPPORT_EMAIL="support@notes.example"',
    );
  }
});
