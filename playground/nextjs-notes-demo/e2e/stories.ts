import type { Frame, Page } from "playwright";
import { expect } from "vitest";
import type { PageErrors } from "../../test-helpers/host.ts";
import { openStory, runStory, storyRun, type StoryRun } from "../../test-helpers/storybook.ts";

// What the tests of `storybook dev` and of the static build of Storybook
// check of every story of the project: see storybook.test.ts.

export const passed: StoryRun = { phase: "finished", reports: [], interactions: "PASS" };

/** The ids of the stories of the Storybook at `url`, in the order of its sidebar. */
export async function storyIds(url: string): Promise<string[]> {
  const index = (await (await fetch(new URL("index.json", url))).json()) as {
    entries: Record<string, { id: string; type: string }>;
  };
  return Object.values(index.entries)
    .filter((entry) => entry.type === "story")
    .map((entry) => entry.id);
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

// The stories of the pages of the app have the titles `Pages/…`, and the
// client stories are the ones of the files with "use client".
export const isPage = (story: string) => story.startsWith("pages-");
export const isClientStory = (story: string) =>
  /^(ui-button|components-submitbutton)--/.test(story);

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
  const [first, ...rest] = await storyIds(url);
  const canvas = await openStory(page, url, first!);
  const check = async (story: string, run: StoryRun) => {
    expect(run, story).toEqual(passed);
    expect((await body(canvas)).root, story).toBe(!isPage(story));
    if (isClientStory(story)) expect(atStory(canvas), story).toBe(`/iframe.html?id=${story}`);
    else expect(new URL(canvas.url()).pathname, story).not.toBe("/iframe.html");
    const logged = errors.list.splice(0);
    if (!notFound.has(story)) return expect(logged, story).toEqual([]);
    for (const error of logged) expect(error, story).toMatch(scriptTagWarning);
  };
  await check(first!, await storyRun(page, canvas, first!));
  for (const story of rest) await check(story, await runStory(page, canvas, story));
}
