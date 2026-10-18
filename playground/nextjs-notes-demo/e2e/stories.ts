import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Frame, Page } from "playwright";
import { expect } from "vitest";
import type { PageErrors } from "../../test-helpers/host.ts";
import { openStory, runStory, storyRun, type StoryRun } from "../../test-helpers/storybook.ts";

// What the tests of `storybook dev` and of the static build of Storybook
// check of every story of the project: see storybook.test.ts.

export const passed: StoryRun = { phase: "finished", reports: [], interactions: "PASS" };

type Story = { id: string; page: boolean; client: boolean };

const root = new URL("../", import.meta.url);

/**
 * The stories of the Storybook at `url`, in the order of its sidebar: a page
 * is one of a `page.stories.tsx`, a client story one of a file with
 * "use client".
 */
export async function stories(url: string): Promise<Story[]> {
  const index = (await (await fetch(new URL("index.json", url))).json()) as {
    entries: Record<string, { id: string; type: string; importPath: string }>;
  };
  const entries = Object.values(index.entries).filter((entry) => entry.type === "story");
  // Every file of stories of the project is in the index.
  const files = fs.globSync("{app,components}/**/*.stories.tsx", { cwd: fileURLToPath(root) });
  expect(new Set(entries.map((entry) => entry.importPath))).toEqual(
    new Set(files.map((file) => `./${file}`)),
  );
  return entries.map(({ id, importPath }) => ({
    id,
    page: importPath.endsWith("/page.stories.tsx"),
    client: /^["']use client["']/.test(fs.readFileSync(new URL(importPath, root), "utf8")),
  }));
}

/** The path of the preview with the id of its story: where a reload lands. */
export function atStory(canvas: Frame): string {
  const url = new URL(canvas.url());
  return `${url.pathname}?id=${url.searchParams.get("id")}`;
}

/** The document of the preview: Storybook's, or the one of a page, which owns it. */
export const body = (canvas: Frame) =>
  canvas.evaluate(() => ({
    classes: [...document.body.classList].sort(),
    root: !!document.getElementById("storybook-root"),
  }));

// The root layout has the provider of next-themes, whose script React's
// development build warns of when it renders it in the browser. Next does so
// with the layouts of its not-found page, also in `next dev`.
const notFound = new Set(["pages-note--invalid-id", "pages-note--not-yours"]);
const scriptTagWarning = /^console\.error: Encountered a script tag while rendering React/;

/**
 * Selects every story of the Storybook at `url` in turn, as the sidebar
 * does. Each renders, its play function passes and the page logs no error.
 * A page has the document of the app. A server story, a page or not, is at
 * the URL of its request, which Next's router reads. A client story after it
 * has Storybook's document and URL back: the URL of the story, where a
 * reload lands.
 */
export async function runEveryStory(page: Page, url: string, errors: PageErrors): Promise<void> {
  const [first, ...rest] = await stories(url);
  const canvas = await openStory(page, url, first!.id);
  const check = async ({ id, page: isPage, client }: Story, run: StoryRun) => {
    expect(run, id).toEqual(passed);
    expect((await body(canvas)).root, id).toBe(!isPage);
    if (client) expect(atStory(canvas), id).toBe(`/iframe.html?id=${id}`);
    else expect(new URL(canvas.url()).pathname, id).not.toBe("/iframe.html");
    const logged = errors.list.splice(0);
    if (!notFound.has(id)) return expect(logged, id).toEqual([]);
    for (const error of logged) expect(error, id).toMatch(scriptTagWarning);
  };
  await check(first!, await storyRun(page, canvas, first!.id));
  for (const story of rest) await check(story, await runStory(page, canvas, story.id));
}
