import type { Page } from "playwright";
import { expect } from "vitest";
import { stylesInOrder } from "../../test-helpers/storybook.ts";

// What the Storybook tests of the project share, with its dev server
// (storybook.test.ts) and with its static build
// (../build-test/storybook-build.test.ts): the CSS of each entry of the
// sidebar, whatever entry was shown before it in the one document.

// The rule of each stylesheet that a file of the project imports: preview.css
// of both previews, preview.server.css of preview.server.tsx alone, and
// press-button.stories.css of the client story file.
const theme = '[data-testid="theme"]';
const server = '[data-testid="server-decorator"]';
const frame = ".story-frame";

/**
 * Shows the entries one after the other, forwards and backwards, and expects
 * the same CSS of each entry both ways: a client story has that of its file,
 * which imports preview.tsx, a server story that of preview.server.tsx, its
 * story file and its node, also in the layouts of the app, a page that of
 * its route alone, and a docs page that of its inline client stories. A
 * file that the document loads without showing its story, like the server
 * story file that an MDX `<Canvas id>` names, brings nothing. Each rule
 * once: a stylesheet of a file also in Vite's `<style>` would show twice.
 */
export async function expectEachEntryHasItsOwnCss(page: Page, url: string) {
  const forwards = await stylesInOrder(page, url, [
    "press-button--pressed",
    "greeting--default",
    "home--home",
    "press-button--labelled",
    "greeting--in-layouts",
    "introduction--docs",
    "press-button--docs",
  ]);
  // Not quite the reverse: the MDX page first, in a document that has loaded
  // nothing yet.
  const backwards = await stylesInOrder(page, url, [
    "introduction--docs",
    "press-button--docs",
    "greeting--in-layouts",
    "press-button--labelled",
    "home--home",
    "greeting--default",
    "press-button--pressed",
  ]);
  expect(backwards).toEqual(forwards);
  for (const [entry, rules] of Object.entries(forwards)) {
    expect(rules, entry).toEqual([...new Set(rules)]);
  }
  const has = (entry: string) =>
    [theme, server, frame].filter((selector) => forwards[entry]!.includes(selector));
  expect(Object.fromEntries(Object.keys(forwards).map((entry) => [entry, has(entry)]))).toEqual({
    "press-button--pressed": [theme, frame],
    "greeting--default": [theme, server],
    "home--home": [],
    "press-button--labelled": [theme, frame],
    "greeting--in-layouts": [theme, server],
    "introduction--docs": [theme, frame],
    "press-button--docs": [theme, frame],
  });
}
