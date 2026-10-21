import type { Locator, Page } from "playwright";
import { expect } from "vitest";
import {
  openDocs,
  openStory,
  runStory,
  selectDocs,
  updateArgs,
  type StoryRun,
} from "../../test-helpers/storybook.ts";

// What the Storybook tests of the project share, with its dev server
// (storybook.test.ts) and with its static build
// (../build-test/storybook-build.test.ts): the storage of a client story,
// the page's, which is empty as the story starts, as in a new browser
// context. The browser's own is the manager's, and keeps its items.

const finished: StoryRun = { phase: "finished", reports: [] };
const passed: StoryRun = { ...finished, interactions: "PASS" };

// What the button of a story of ../stories/storage.stories.tsx says.
const said = (button: Locator) => button.textContent();

// An item in the browser's storage, as the manager has its own there, before
// the manager opens: written in a document of the origin that loads nothing,
// Storybook's index. It stays there, whatever the stories do.
async function managerItem(page: Page, url: string): Promise<() => Promise<void>> {
  await page.goto(new URL("index.json", url).href);
  await page.evaluate(() => localStorage.setItem("visitor", "Manager"));
  return async () => {
    expect(await page.evaluate(() => localStorage.getItem("visitor"))).toBe("Manager");
  };
}

/**
 * Opens a client story first, then one after a server story, after another
 * client story, with new args and remounted: each starts with the page's
 * storage empty, and new args keep it.
 */
export async function expectEachClientStoryHasAnEmptyStorage(page: Page, url: string) {
  const managerKeepsItsItem = await managerItem(page, url);
  const canvas = await openStory(page, url, "storage--reads");
  const button = canvas.locator("#storybook-root").getByRole("button");
  await expect.poll(() => said(button)).toBe("Visitor: none");
  // The page's, not the browser's: `Storage.prototype`'s own methods throw
  // for it.
  const pages = await canvas.evaluate(() => {
    try {
      Storage.prototype.key.call(localStorage, 0);
      return false;
    } catch {
      return true;
    }
  });
  expect(pages).toBe(true);
  await managerKeepsItsItem();

  // A server story file loads the plugin's other entry, which installs no
  // storage of its own: the document has one.
  await canvas.evaluate(() => Object.assign(window, { __storage: localStorage }));
  expect(await runStory(page, canvas, "home--home")).toEqual(passed);
  expect(
    await canvas.evaluate(() => localStorage === (window as { __storage?: Storage }).__storage),
  ).toBe(true);
  expect(await runStory(page, canvas, "storage--reads")).toEqual(finished);
  await expect.poll(() => said(button)).toBe("Visitor: none");

  expect(await runStory(page, canvas, "storage--writes")).toEqual(finished);
  await expect.poll(() => said(button)).toBe("Visitor: Grace");
  expect(await runStory(page, canvas, "storage--reads")).toEqual(finished);
  await expect.poll(() => said(button)).toBe("Visitor: none");

  // New args render the story again on its page, with its state and its
  // storage.
  await canvas.evaluate(() => localStorage.setItem("visitor", "Ada"));
  await button.click();
  await expect.poll(() => said(button)).toBe("Visitor: Ada");
  await updateArgs(canvas, "storage--reads", { label: "Renamed" });
  await expect.poll(() => said(button)).toBe("Renamed: Ada");
  expect(await canvas.evaluate(() => localStorage.getItem("visitor"))).toBe("Ada");
  // A remount is a new page.
  await canvas.evaluate(() =>
    window.__STORYBOOK_PREVIEW__.channel.emit("forceRemount", { storyId: "storage--reads" }),
  );
  // The storage only: whether a remount keeps the args is the host's.
  await expect.poll(() => said(button)).toMatch(/: none$/);
  expect(await canvas.evaluate(() => localStorage.length)).toBe(0);
  await managerKeepsItsItem();
}

/**
 * Opens the docs page of ../stories/storage.mdx, whose two client stories
 * share the page's storage, then another docs page and back: each docs page
 * starts with it empty.
 */
export async function expectADocsPageHasOneStorage(page: Page, url: string) {
  const managerKeepsItsItem = await managerItem(page, url);
  const canvas = await openDocs(page, url, "storage--docs");
  const docs = canvas.locator("#storybook-docs");
  const reads = docs.locator("#story--storage--reads").getByRole("button");
  const writes = docs.locator("#story--storage--writes").getByRole("button");
  await expect.poll(() => said(writes)).toBe("Visitor: Grace");
  // What `Writes` stored, whichever story rendered first.
  await reads.click();
  await expect.poll(() => said(reads)).toBe("Visitor: Grace");

  // A docs page of client stories alone, inline: no iframe that is still
  // loading as the test leaves it.
  await selectDocs(canvas, "press-button--docs");
  await expect.poll(() => docs.getByRole("button", { name: "Press: 0" }).count()).toBe(2);
  expect(await canvas.evaluate(() => localStorage.getItem("visitor"))).toBe(null);
  await canvas.evaluate(() => localStorage.setItem("left", "press-button"));

  await selectDocs(canvas, "storage--docs");
  await expect.poll(() => said(writes)).toBe("Visitor: Grace");
  expect(await canvas.evaluate(() => localStorage.getItem("left"))).toBe(null);
  await managerKeepsItsItem();
}
