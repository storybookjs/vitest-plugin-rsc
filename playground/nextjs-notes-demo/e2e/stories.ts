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

// The stories that each MDX file shows, with `<Canvas of={…} />` or
// `<Canvas id="…" />`.
const mdx: Record<string, string[]> = {
  "components-introduction--docs": [
    "components-flash-cookie-probe--from-request",
    "components-ui-button--disabled",
  ],
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
  // The files of the project that `pattern` matches, as the indexer globs
  // the `stories` of .storybook/main.ts: not in node_modules.
  const files = (pattern: string) =>
    new Set(
      fs
        .globSync(pattern, { cwd: fileURLToPath(root), exclude: ["node_modules/**"] })
        .map((file) => `./${file}`),
    );
  // Every file of stories of the project is in the index, and so is every
  // MDX file. Every file of stories has a docs page.
  const storyFiles = files("**/*.stories.tsx");
  expect(new Set(storyEntries.map((entry) => entry.importPath))).toEqual(storyFiles);
  expect(new Set(docsEntries.map((entry) => entry.importPath))).toEqual(
    new Set([...files("**/*.mdx"), ...storyFiles]),
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
const notFound = new Set(["app-notes-id-page--invalid-id", "app-notes-id-page--not-yours"]);
const scriptTagWarning = /^console\.error: Encountered a script tag while rendering React/;

// What the page logged since the last check, while it showed the stories
// `ids`: no error, but the warning of a not-found page.
function expectNoErrorLogged(errors: PageErrors, label: string, ids: string[]) {
  const logged = errors.list.splice(0);
  if (!ids.some((id) => notFound.has(id))) return expect(logged, label).toEqual([]);
  for (const error of logged) expect(error, label).toMatch(scriptTagWarning);
}

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
    expectNoErrorLogged(errors, id, [id]);
  };
  await check(first!, await storyRun(page, canvas, first!.id));
  for (const story of rest) await check(story, await runStory(page, canvas, story.id));
}

/** A story that a docs page shows: inline, or in an iframe of its own, and whether it shows an error. */
type Shown = { id: string; in: "inline" | "iframe"; error: boolean; played?: boolean };

// Every preview of the page, a docs page's iframes too, keeps the phases of
// its renders as Storybook reports them, from the moment it starts.
async function recordPhases(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let preview: { channel: { on(event: string, listener: (event: never) => void): void } };
    Object.defineProperty(window, "__STORYBOOK_PREVIEW__", {
      configurable: true,
      get: () => preview,
      set(value: typeof preview) {
        // Storybook sets it more than once, to the same preview.
        if (value === preview) return;
        preview = value;
        const phases: string[] = ((window as { phases?: string[] }).phases = []);
        preview.channel.on("storyRenderPhaseChanged", ({ newPhase }: { newPhase: string }) =>
          phases.push(newPhase),
        );
      },
    });
  });
}

// The stories that the docs page in the preview shows, once each of `ids`
// has a block and each block has rendered: an inline story once its block
// has its root or the error in place of it, a story in an iframe once the
// render of the preview in it has ended. A block that names its story by id
// has none until it loaded the story's file. The primary story of an
// autodocs page has a block of its own too, unless it renders in an iframe,
// which a docs page shows once. Storybook makes the next docs
// page the current render before it removes the blocks of the last one,
// which `selectDocs()` waits for.
async function shownStories(canvas: Frame, ids: string[]): Promise<Shown[]> {
  const shown = await canvas.waitForFunction(
    ({ ended, ids }) => {
      const blocks = [...document.querySelectorAll("#storybook-docs .sb-story")];
      const idOf = (block: Element) => block.id.replace(/^story--/, "").replace(/--primary$/, "");
      if (!ids.every((id) => blocks.some((block) => idOf(block) === id))) return false;
      const stories = [];
      for (const block of blocks) {
        const id = idOf(block);
        const iframe = block.querySelector("iframe");
        if (iframe) {
          const render = (iframe.contentWindow as Window | null)?.__STORYBOOK_PREVIEW__
            ?.currentRender;
          if (render?.id !== id || !ended.includes(render.phase!)) return false;
          const error = !!iframe.contentDocument?.body.classList.contains("sb-show-errordisplay");
          const phases = (iframe.contentWindow as { phases?: string[] } | null)?.phases;
          // Whether it played, of a render that the phases saw.
          const played = phases?.includes("rendering") ? phases.includes("playing") : undefined;
          stories.push({ id, in: "iframe", error, played });
        } else if (block.querySelector("pre")) {
          stories.push({ id, in: "inline", error: true });
        } else {
          if (!block.querySelector(`[id$="-inner"]`)?.childElementCount) return false;
          stories.push({ id, in: "inline", error: false });
        }
      }
      return stories;
    },
    { ended: ["finished", "errored", "aborted"], ids },
    { timeout: 90_000, polling: 100 },
  );
  return (await shown.jsonValue()) as Shown[];
}

// The iframes of the story blocks of the docs page in the preview, with the
// story each renders and its height.
async function iframesOf(canvas: Frame) {
  const elements = await canvas.locator("#storybook-docs .sb-story iframe").elementHandles();
  return Promise.all(
    elements.map(async (element) => {
      const frame = (await element.contentFrame())!;
      const id = await frame.evaluate(() => window.__STORYBOOK_PREVIEW__.currentRender!.id);
      const height = await element.evaluate(
        (iframe) => (iframe as Element).getBoundingClientRect().height,
      );
      return { id, frame, height };
    }),
  );
}

/**
 * Selects every docs page of the Storybook at `url` in turn, as the sidebar
 * does. Each shows its stories, a client story inline and a server story in
 * an iframe once, where it renders in a page of the app without an error
 * and without its play function, and the page logs no error. A page's
 * iframe is 667px high, and each iframe has a storage of its own.
 */
export async function renderEveryDocsPage(
  page: Page,
  url: string,
  errors: PageErrors,
): Promise<void> {
  const [first, ...rest] = (await index(url)).docs;
  await recordPhases(page);
  const canvas = await openDocs(page, url, first!.id);
  const check = async ({ id, stories }: Docs) => {
    const shown = await shownStories(
      canvas,
      stories.map((story) => story.id),
    );
    expect(new Set(shown.map((story) => story.id)), id).toEqual(
      new Set(stories.map((story) => story.id)),
    );
    const expected = shown.map((story) => {
      const client = stories.find((of) => of.id === story.id)!.client;
      return client
        ? { id: story.id, in: "inline", error: false }
        : { id: story.id, in: "iframe", error: false, played: false };
    });
    expect(shown, id).toEqual(expected);
    // Each server story in one iframe, the primary too.
    const iframes = await iframesOf(canvas);
    expect(iframes.map((iframe) => iframe.id).sort(), id).toEqual(
      stories
        .filter((story) => !story.client)
        .map((story) => story.id)
        .sort(),
    );
    // A page owns the document: its iframe is as high as a small phone's
    // screen. No story of the project sets `parameters.docs.story.height`.
    for (const iframe of iframes) {
      const { page: isPage } = stories.find((story) => story.id === iframe.id)!;
      if (isPage) expect(Math.round(iframe.height), iframe.id).toBe(667);
    }
    // The page in each iframe has a storage of its own: each writes before
    // any reads, so in a storage they shared all would read the last one.
    for (const { frame, id } of iframes) {
      await frame.evaluate((id) => {
        localStorage.setItem("written-by", id);
        sessionStorage.setItem("written-by", id);
      }, id);
    }
    for (const { frame, id } of iframes) {
      const read = await frame.evaluate(() =>
        [localStorage, sessionStorage].map((storage) => storage.getItem("written-by")),
      );
      expect(read, id).toEqual([id, id]);
    }
    expectNoErrorLogged(
      errors,
      id,
      stories.map((story) => story.id),
    );
  };
  await check(first!);
  for (const docs of rest) {
    await selectDocs(canvas, docs.id);
    await check(docs);
  }
}
