import type { Frame, Page } from "playwright";

// What the node tests of a Storybook share: its index, the canvas of a story
// in the manager, and a story that renders and plays there, with what
// Storybook says of it.

/** An entry of the index of a Storybook: a story, a test of one, or a docs page. */
export type IndexEntry = {
  id: string;
  type: "story" | "docs";
  title: string;
  name: string;
  importPath: string;
  tags?: string[];
};

/** The entries of the index of the Storybook at `url`. */
export async function storyIndex(url: string): Promise<IndexEntry[]> {
  const response = await fetch(new URL("index.json", url));
  const { entries } = (await response.json()) as { entries: Record<string, IndexEntry> };
  return Object.values(entries);
}

type Channel = {
  emit(event: string, payload: object): void;
  on(event: string, listener: (...args: never[]) => void): void;
  off(event: string, listener: (...args: never[]) => void): void;
};

type Preview = {
  channel: Channel;
  currentRender?: { id: string; phase?: string; story?: { playFunction?: unknown } };
};

declare global {
  interface Window {
    __STORYBOOK_PREVIEW__: Preview;
    /** What Storybook reported of each story: see `recordReports()`. */
    __storyReports?: Record<string, string[]>;
  }
}

/** The canvas of a story, in the manager: the way a user opens it. */
export async function openStory(page: Page, url: string, story: string): Promise<Frame> {
  await page.goto(`${url}?path=/story/${story}`);
  const iframe = await page.locator("#storybook-preview-iframe").elementHandle();
  return (await iframe!.contentFrame())!;
}

/**
 * Another story in the same preview, as a click in the sidebar selects it.
 * Resolves once Storybook has rendered it.
 */
export async function selectStory(canvas: Frame, story: string): Promise<void> {
  await canvas.evaluate((storyId) => {
    const { channel } = window.__STORYBOOK_PREVIEW__;
    return new Promise<void>((resolve) => {
      const rendered = (id: string) => {
        if (id !== storyId) return;
        channel.off("storyRendered", rendered);
        resolve();
      };
      channel.on("storyRendered", rendered);
      channel.emit("setCurrentStory", { storyId, viewMode: "story" });
    });
  }, story);
}

// The phases a render of Storybook ends in.
const done = ["finished", "errored", "aborted"];

/** Resolves once the story is the one in the preview, and its render has ended. */
export async function rendered(canvas: Frame, story: string, timeout = 90_000): Promise<string> {
  const phase = await canvas.waitForFunction(
    ({ id, ended }) => {
      const render = window.__STORYBOOK_PREVIEW__?.currentRender;
      return render?.id === id && ended.includes(render.phase!) && render.phase;
    },
    { id: story, ended: done },
    { timeout, polling: 100 },
  );
  return (await phase.jsonValue()) as string;
}

/**
 * Has the preview keep what Storybook reports of the story it renders: an
 * exception of its render or of its play function, an error it shows, and
 * the errors that the page had while the play function ran.
 */
async function recordReports(canvas: Frame): Promise<void> {
  await canvas.evaluate(() => {
    if (window.__storyReports) return;
    const reports: Record<string, string[]> = (window.__storyReports = {});
    const preview = window.__STORYBOOK_PREVIEW__;
    const describe = (error: unknown): string =>
      typeof error === "object" && error !== null
        ? String(
            (error as { message?: string; description?: string }).message ??
              (error as { description?: string }).description ??
              JSON.stringify(error),
          )
        : String(error);
    const report =
      (event: string) =>
      (...payload: unknown[]) => {
        const id = preview.currentRender?.id ?? "";
        const errors = Array.isArray(payload[0]) ? payload[0] : payload.slice(0, 1);
        (reports[id] ??= []).push(...errors.map((error) => `${event}: ${describe(error)}`));
      };
    for (const event of [
      "storyThrewException",
      "storyErrored",
      "storyMissing",
      "playFunctionThrewException",
      "unhandledErrorsWhilePlaying",
    ]) {
      preview.channel.on(event, report(event));
    }
  });
}

/** How a story went: what its render ended in, and what Storybook and the manager say. */
export type StoryRun = {
  id: string;
  /** The phase its render ended in: `finished` when all went well. */
  phase: string;
  /** What Storybook reported: exceptions, errors it showed. */
  reports: string[];
  /** The status of the Interactions panel, for a story with a play function. */
  interactions?: string;
};

/**
 * Selects a story in the manager that is open, as a click in the sidebar
 * does, which renders it and runs its play function, and resolves with how
 * that went. The story is not the one that is selected: Storybook would not
 * render that one again.
 */
export async function runStory(
  page: Page,
  canvas: Frame,
  story: string,
  { timeout = 90_000 } = {},
): Promise<StoryRun> {
  await recordReports(canvas);
  // Through the manager, whose panels then show this story.
  await canvas.evaluate((storyId) => {
    delete window.__storyReports![storyId];
    window.__STORYBOOK_PREVIEW__.channel.emit("selectStory", { storyId, viewMode: "story" });
  }, story);
  const phase = await rendered(canvas, story, timeout).catch((error: Error) => {
    return `not ended: ${error.message.split("\n")[0]}`;
  });
  // The panels show the story once the manager has it selected.
  const selected = await page
    .waitForURL((url) => url.searchParams.get("path") === `/story/${story}`, { timeout: 10_000 })
    .then(
      () => true,
      () => false,
    );
  const { reports, hasPlay } = await canvas.evaluate((storyId) => {
    const render = window.__STORYBOOK_PREVIEW__.currentRender;
    return {
      reports: window.__storyReports![storyId] ?? [],
      hasPlay: render?.id === storyId && !!render.story?.playFunction,
    };
  }, story);
  return {
    id: story,
    phase,
    reports: selected ? reports : [...reports, "the manager did not select the story"],
    interactions: hasPlay && selected ? await interactionsStatus(page) : undefined,
  };
}

/**
 * Opens a docs page in the manager, and resolves once each of its stories,
 * which render in an iframe of their own, has rendered: with how each went.
 */
export async function runDocs(
  page: Page,
  url: string,
  docs: string,
  { timeout = 90_000 } = {},
): Promise<StoryRun[]> {
  await page.goto(`${url}?path=/docs/${docs}`);
  const iframe = await page.locator("#storybook-preview-iframe").elementHandle();
  const preview = (await iframe!.contentFrame())!;
  const renders = await preview.waitForFunction(
    (ended) => {
      const iframes = Array.from(
        document.querySelectorAll<HTMLIFrameElement>("#storybook-docs iframe"),
      );
      // Not when it is scrolled to, as a docs page loads a story by default.
      for (const story of iframes) story.loading = "eager";
      const renders = iframes.map(
        (story) => (story.contentWindow as Window | null)?.__STORYBOOK_PREVIEW__?.currentRender,
      );
      const endedRenders = renders.flatMap((render) =>
        render?.phase && ended.includes(render.phase)
          ? [{ id: render.id, phase: render.phase }]
          : [],
      );
      return renders.length > 0 && endedRenders.length === renders.length && endedRenders;
    },
    done,
    { timeout, polling: 250 },
  );
  const stories = (await renders.jsonValue()) as { id: string; phase: string }[];
  return stories.map(({ id, phase }) => ({ id, phase, reports: [] }));
}

/**
 * The status of the play function of the story that is selected, as the
 * Interactions panel of the manager shows it: `PASS` or `FAIL`.
 */
export async function interactionsStatus(page: Page): Promise<string> {
  const tab = page.getByRole("tab", { name: /Interactions/ });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  const status = page
    .locator("#storybook-panel-root")
    .getByText(/^(PASS|FAIL)$/i)
    .first();
  await status.waitFor({ timeout: 10_000 }).catch(() => {});
  return (await status.textContent().catch(() => null))?.toUpperCase() ?? "no status";
}
