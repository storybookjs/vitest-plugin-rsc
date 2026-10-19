import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Frame, Page } from "playwright";
import { expect } from "vitest";
import type { PageErrors } from "../../test-helpers/host.ts";
import {
  openDocs,
  openStory,
  runStory,
  selectDocs,
  storyRun,
  type StoryRun,
} from "../../test-helpers/storybook.ts";

// What the tests of `storybook dev` and of the static build of Storybook
// check of every story and every docs page of the project: see
// storybook.test.ts.

export const passed: StoryRun = { phase: "finished", reports: [], interactions: "PASS" };

type Story = { id: string; page: boolean; client: boolean };

/** A docs page, and the stories it shows. */
type Docs = { id: string; stories: Story[] };

const root = new URL("../", import.meta.url);

// The stories that each MDX file shows, with `<Canvas of={…} />`.
const mdx: Record<string, string[]> = {
  "introduction--docs": ["components-flashcookieprobe--from-request", "ui-button--disabled"],
};

/**
 * The stories and docs pages of the Storybook at `url`, in the order of its
 * sidebar: a page is a story of a `page.stories.tsx`, a client story one of
 * a file with "use client". An autodocs page shows the stories of its file
 * that have the `autodocs` tag.
 */
export async function index(url: string): Promise<{ stories: Story[]; docs: Docs[] }> {
  const { entries } = (await (await fetch(new URL("index.json", url))).json()) as {
    entries: Record<string, { id: string; type: string; importPath: string; tags: string[] }>;
  };
  const all = Object.values(entries);
  const storyEntries = all.filter((entry) => entry.type === "story");
  const docsEntries = all.filter((entry) => entry.type === "docs");
  const files = (pattern: string) =>
    new Set(fs.globSync(pattern, { cwd: fileURLToPath(root) }).map((file) => `./${file}`));
  // Every file of stories of the project is in the index, and so is every
  // MDX file. The stories of components have a docs page, the pages do not.
  expect(new Set(storyEntries.map((entry) => entry.importPath))).toEqual(
    files("{app,components}/**/*.stories.tsx"),
  );
  expect(new Set(docsEntries.map((entry) => entry.importPath))).toEqual(
    new Set([...files("components/**/*.mdx"), ...files("components/**/*.stories.tsx")]),
  );
  const stories = storyEntries.map(({ id, importPath, tags }) => ({
    id,
    page: importPath.endsWith("/page.stories.tsx"),
    client: /^["']use client["']/.test(fs.readFileSync(new URL(importPath, root), "utf8")),
    autodocs: tags.includes("autodocs") && !tags.includes("!autodocs"),
    importPath,
  }));
  const docs = docsEntries.map(({ id, importPath }) => {
    if (!importPath.endsWith(".mdx")) {
      const of = stories.filter((story) => story.importPath === importPath && story.autodocs);
      return { id, stories: of };
    }
    const of = stories.filter((story) => mdx[id]?.includes(story.id));
    expect(
      of.map((story) => story.id),
      `the stories that ${importPath} shows`,
    ).toEqual(mdx[id]);
    return { id, stories: of };
  });
  const story = ({ id, page, client }: Story): Story => ({ id, page, client });
  return {
    stories: stories.map(story),
    docs: docs.map(({ id, stories }) => ({ id, stories: stories.map(story) })),
  };
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
    root: document.getElementById("storybook-root")?.tagName,
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
  const [first, ...rest] = (await index(url)).stories;
  const canvas = await openStory(page, url, first!.id);
  const check = async ({ id, page: isPage, client }: Story, run: StoryRun) => {
    expect(run, id).toEqual(passed);
    expect((await body(canvas)).root, id).toBe(isPage ? "BODY" : "DIV");
    if (client) expect(atStory(canvas), id).toBe(`/iframe.html?id=${id}`);
    else expect(new URL(canvas.url()).pathname, id).not.toBe("/iframe.html");
    const logged = errors.list.splice(0);
    if (!notFound.has(id)) return expect(logged, id).toEqual([]);
    for (const error of logged) expect(error, id).toMatch(scriptTagWarning);
  };
  await check(first!, await storyRun(page, canvas, first!.id));
  for (const story of rest) await check(story, await runStory(page, canvas, story.id));
}

/** A story that a docs page shows: inline, or in an iframe of its own, and whether it shows an error. */
type Shown = { id: string; in: "inline" | "iframe"; error: boolean };

// The stories that the docs page in the preview shows, once each has
// rendered: an inline story once its block has its root or the error in
// place of it, a story in an iframe once the render of the preview in it has
// ended. The primary story of an autodocs page has a block of its own too.
// Storybook makes the next docs page the current render before it removes
// the blocks of the last one, which `selectDocs()` waits for.
async function shownStories(canvas: Frame): Promise<Shown[]> {
  const shown = await canvas.waitForFunction(
    (ended) => {
      const blocks = [...document.querySelectorAll("#storybook-docs .sb-story")];
      if (!blocks.length) return false;
      const stories = [];
      for (const block of blocks) {
        const id = block.id.replace(/^story--/, "").replace(/--primary$/, "");
        const iframe = block.querySelector("iframe");
        if (iframe) {
          const render = (iframe.contentWindow as Window | null)?.__STORYBOOK_PREVIEW__
            ?.currentRender;
          if (render?.id !== id || !ended.includes(render.phase!)) return false;
          const error = !!iframe.contentDocument?.body.classList.contains("sb-show-errordisplay");
          stories.push({ id, in: "iframe", error });
        } else if (block.querySelector("pre")) {
          stories.push({ id, in: "inline", error: true });
        } else {
          if (!block.querySelector(`[id$="-inner"]`)?.childElementCount) return false;
          stories.push({ id, in: "inline", error: false });
        }
      }
      return stories;
    },
    ["finished", "errored", "aborted"],
    { timeout: 90_000, polling: 100 },
  );
  return (await shown.jsonValue()) as Shown[];
}

/**
 * Selects every docs page of the Storybook at `url` in turn, as the sidebar
 * does. Each shows its stories, a client story inline and a server story in
 * an iframe, where it renders in a page of the app and runs its play
 * function, without an error, and the page logs no error: a play function
 * that fails logs one.
 */
export async function renderEveryDocsPage(
  page: Page,
  url: string,
  errors: PageErrors,
): Promise<void> {
  const [first, ...rest] = (await index(url)).docs;
  const canvas = await openDocs(page, url, first!.id);
  const check = async ({ id, stories }: Docs) => {
    const shown = await shownStories(canvas);
    expect(new Set(shown.map((story) => story.id)), id).toEqual(
      new Set(stories.map((story) => story.id)),
    );
    const expected = shown.map((story) => ({
      id: story.id,
      in: stories.find((of) => of.id === story.id)!.client ? "inline" : "iframe",
      error: false,
    }));
    expect(shown, id).toEqual(expected);
    expect(errors.list.splice(0), id).toEqual([]);
  };
  await check(first!);
  for (const docs of rest) {
    await selectDocs(canvas, docs.id);
    await check(docs);
  }
}
