import type { Frame, Page } from "playwright";

// What the node tests of a Storybook share: the canvas of a story in the
// manager, and a story that renders and plays there, with what Storybook
// says of it. See storybook-framework.ts for the build of the framework.

type Channel = {
  emit(event: string, payload: object): void;
  on(event: string, listener: (...args: never[]) => void): void;
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

/** The canvas of the manager at `url`, with a story open, as a user opens it. */
export async function openStory(page: Page, url: string, story: string): Promise<Frame> {
  await page.goto(`${url}?path=/story/${story}`);
  const iframe = await page.locator("#storybook-preview-iframe").elementHandle();
  const canvas = (await iframe!.contentFrame())!;
  await rendered(canvas, story);
  return canvas;
}

// The phases a render of Storybook ends in.
const done = ["finished", "errored", "aborted"];

/** Resolves with its phase once the story is the one in the preview, and its render has ended. */
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

// Has the preview keep what Storybook reports of the story it renders: an
// exception of its render or of its play function, and an error it shows.
async function recordReports(canvas: Frame): Promise<void> {
  await canvas.evaluate(() => {
    if (window.__storyReports) return;
    const reports: Record<string, string[]> = (window.__storyReports = {});
    const preview = window.__STORYBOOK_PREVIEW__;
    const describe = (error: unknown) =>
      String(
        (error as { message?: string; description?: string })?.message ??
          (error as { description?: string })?.description ??
          error,
      );
    for (const event of [
      "storyThrewException",
      "storyErrored",
      "storyMissing",
      "playFunctionThrewException",
      "unhandledErrorsWhilePlaying",
    ]) {
      preview.channel.on(event, (...payload: unknown[]) => {
        const id = preview.currentRender?.id ?? "";
        const errors = Array.isArray(payload[0]) ? payload[0] : payload.slice(0, 1);
        (reports[id] ??= []).push(...errors.map((error) => `${event}: ${describe(error)}`));
      });
    }
  });
}

/** How a story went. */
export type StoryRun = {
  /** The phase its render ended in: `finished` when all went well. */
  phase: string;
  /** What Storybook reported: exceptions, errors it showed. */
  reports: string[];
  /** The status of the Interactions panel, for a story with a play function. */
  interactions?: string;
};

/**
 * Selects a story in the manager that is open, as a click in the sidebar
 * does, which renders it and runs its play function: resolves with how that
 * went. Not the story that is selected, which Storybook would not render
 * again.
 */
export async function runStory(page: Page, canvas: Frame, story: string): Promise<StoryRun> {
  await recordReports(canvas);
  await canvas.evaluate((storyId) => {
    delete window.__storyReports![storyId];
    window.__STORYBOOK_PREVIEW__.channel.emit("selectStory", { storyId, viewMode: "story" });
  }, story);
  return storyRun(page, canvas, story);
}

/** How the story that the manager has open went, once its render has ended. */
export async function storyRun(page: Page, canvas: Frame, story: string): Promise<StoryRun> {
  await recordReports(canvas);
  const phase = await rendered(canvas, story).catch(
    (error: Error) => `not ended: ${error.message.split("\n")[0]}`,
  );
  // The panels show the story once the manager has it selected.
  await page.waitForURL((url) => url.searchParams.get("path") === `/story/${story}`);
  const { reports, hasPlay } = await canvas.evaluate((storyId) => {
    const render = window.__STORYBOOK_PREVIEW__.currentRender;
    return {
      reports: window.__storyReports![storyId] ?? [],
      hasPlay: render?.id === storyId && !!render.story?.playFunction,
    };
  }, story);
  return { phase, reports, interactions: hasPlay ? await interactionsStatus(page) : undefined };
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

/** Changes the args of the story that is open, as the Controls panel does. */
export async function updateArgs(
  canvas: Frame,
  story: string,
  updatedArgs: Record<string, unknown>,
): Promise<void> {
  await canvas.evaluate(
    ({ storyId, updatedArgs }) =>
      window.__STORYBOOK_PREVIEW__.channel.emit("updateStoryArgs", { storyId, updatedArgs }),
    { storyId: story, updatedArgs },
  );
}
