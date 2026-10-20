import type { Frame, Page } from "playwright";
import { test as hostTest, type PageErrors } from "./host.ts";

// What the node tests of a Storybook share: the canvas of a story in the
// manager, and a story that renders and plays there, with what Storybook
// says of it. See storybook-framework.ts for the build of the framework.

type Channel = {
  emit(event: string, payload: object): void;
  on(event: string, listener: (...args: never[]) => void): void;
  listenerCount(event: string): number;
};

type Preview = {
  channel: Channel;
  currentRender?: {
    id: string;
    phase?: string;
    story?: { playFunction?: unknown; parameters: { layout?: string } };
  };
};

declare global {
  interface Window {
    __STORYBOOK_PREVIEW__: Preview;
    /** What Storybook reported of each story: see `recordReports()`. */
    __storyReports?: Record<string, string[]>;
  }
}

/**
 * `test` of host.ts, for a page with Storybook's manager. The manager's
 * stores of statuses, test providers and the checklist follow a leader in
 * Storybook's server, and ask it for its state over the dev server's
 * websocket as the manager loads. A follower gives up after one second with
 * `SB_MANAGER_UNIVERSAL-STORE_0001` (UniversalStoreFollowerTimeoutError), a
 * rejection that nothing handles, and ignores the answer that comes later.
 * On a slow machine the server answers later than that while Vite
 * transforms the modules of a preview that has not loaded before, as it
 * does for the first test of a file. That is the manager's timeout of its
 * own stores, not an error of the preview, which talks to the manager over
 * the window.
 */
export const test = hostTest.extend(
  "errors",
  async (): Promise<PageErrors> => ({
    list: [],
    ignore: [/^pageerror: SB_MANAGER_UNIVERSAL-STORE_0001 \(UniversalStoreFollowerTimeoutError\)/],
  }),
);

/**
 * The CSS of the document of each story of `order`, which the manager at
 * `url` opens one after the other: the rules of the stylesheets in its
 * `<head>`, each once, as a sorted list. What styles a story, whichever
 * element brought it: Vite's `<style>`, or a `<link>`. A rule by its
 * selector: a build minifies the CSS of the host's chunks, and not the
 * same way as a stylesheet of the app.
 */
export async function stylesInOrder(
  page: Page,
  url: string,
  order: string[],
): Promise<Record<string, string[]>> {
  const styles = (canvas: Frame) =>
    canvas.evaluate(() => {
      const rules = [...document.styleSheets]
        // Those that apply: not one switched off, or of another medium.
        .filter(
          (sheet) =>
            !sheet.disabled &&
            document.head.contains(sheet.ownerNode) &&
            (sheet.media.length === 0 || matchMedia(sheet.media.mediaText).matches),
        )
        .flatMap((sheet) => [...sheet.cssRules])
        .map((rule) => (rule instanceof CSSStyleRule ? rule.selectorText : rule.cssText));
      return [...new Set(rules)].sort();
    });
  const canvas = await openStory(page, url, order[0]!);
  const seen: Record<string, string[]> = { [order[0]!]: await styles(canvas) };
  for (const story of order.slice(1)) {
    const { phase } = await runStory(page, canvas, story);
    if (phase !== "finished") throw new Error(`${story} ended ${phase}`);
    seen[story] = await styles(canvas);
  }
  return seen;
}

/** The canvas of the manager at `url`, with a story open, as a user opens it. */
export async function openStory(page: Page, url: string, story: string): Promise<Frame> {
  await page.goto(`${url}?path=/story/${story}`);
  const iframe = await page.locator("#storybook-preview-iframe").elementHandle();
  const canvas = (await iframe!.contentFrame())!;
  await rendered(canvas, story);
  return canvas;
}

/** The canvas of the manager at `url`, with a docs page open, once it has its content. */
export async function openDocs(page: Page, url: string, docs: string): Promise<Frame> {
  await page.goto(`${url}?path=/docs/${docs}`);
  const iframe = await page.locator("#storybook-preview-iframe").elementHandle();
  const canvas = (await iframe!.contentFrame())!;
  await docsShown(canvas, docs);
  return canvas;
}

/**
 * Resolves once the docs page is the one in the preview, and it shows its
 * content, not the content of the last one: see `selectDocs()`.
 */
export async function docsShown(canvas: Frame, docs: string, timeout = 90_000): Promise<void> {
  await canvas.waitForFunction(
    (id) => {
      const content = document.querySelector("#storybook-docs");
      return (
        window.__STORYBOOK_PREVIEW__?.currentRender?.id === id &&
        !!content?.textContent &&
        !content.querySelector("[data-last-docs]")
      );
    },
    docs,
    { timeout, polling: 100 },
  );
}

/**
 * Selects a docs page in the manager that is open, as a click in the sidebar
 * does. Storybook makes the next docs page the current render before it
 * removes the content of the last one, so that content is marked first.
 */
export async function selectDocs(canvas: Frame, docs: string): Promise<void> {
  await canvas.evaluate((storyId) => {
    for (const element of document.querySelectorAll("#storybook-docs > *")) {
      element.setAttribute("data-last-docs", "");
    }
    window.__STORYBOOK_PREVIEW__.channel.emit("selectStory", { storyId, viewMode: "docs" });
  }, docs);
  await docsShown(canvas, docs);
}

/**
 * The preview of a story that a docs page shows in an iframe, once its
 * render has ended: a server story, which renders in a page of the app.
 * The docs page asks its iframes, which have its origin, so an iframe that
 * it replaces, as it renders again, is not the one waited on.
 */
export async function storyInDocs(canvas: Frame, story: string, timeout = 90_000): Promise<Frame> {
  const iframe = await canvas.waitForFunction(
    ({ id, ended }) =>
      [...document.querySelectorAll<HTMLIFrameElement>("#storybook-docs iframe")].find((iframe) => {
        const render = (iframe.contentWindow as Window | null)?.__STORYBOOK_PREVIEW__
          ?.currentRender;
        return render?.id === id && ended.includes(render.phase!);
      }),
    { id: story, ended: done },
    { timeout, polling: 100 },
  );
  return (await iframe.asElement()!.contentFrame())!;
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
