import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect } from "vitest";
import { createProject, serveFiles, test, type Site } from "../../test-helpers/host.ts";
import {
  openStory,
  rendered,
  runDocs,
  runStory,
  storyIndex,
  type StoryRun,
} from "../../test-helpers/storybook.ts";

// The Storybook of the app, on the framework of
// playground/storybook-nextjs-vite-rsc: every story with `storybook dev`, and
// in a static build of `storybook build`. A story renders, with what the page
// logs, and its play function passes: the flows of the tests of the app.

const root = fileURLToPath(new URL("../", import.meta.url));
const { run, serve } = createProject(root);

// A story that did not go well, with what went wrong.
type Failure = StoryRun & { errors: string[] };

function checkStories(site: () => Site) {
  test(
    "every story renders, and its play function passes",
    { timeout: 30 * 60_000 },
    async ({ page, errors }) => {
      const stories = (await storyIndex(site().url)).filter((entry) => entry.type === "story");
      expect(stories.length, "the stories and the tests of stories").toBeGreaterThan(60);

      // One preview for all of them, as in a session. The one that opens
      // first renders again at the end: Storybook does not render the story
      // that is selected again.
      const [first, ...others] = stories;
      // A dev server pre-bundles what the preview imports once it first
      // asks, and has the page load again: what that page asked for before
      // it did is not there.
      await rendered(await openStory(page, site().url, first!.id), first!.id).catch(() => {});
      errors.list.length = 0;
      const canvas = await openStory(page, site().url, first!.id);
      await rendered(canvas, first!.id);
      expect(errors.list.splice(0), "the errors of loading Storybook").toEqual([]);

      const failures: Failure[] = [];
      for (const story of [...others, first!]) {
        const result = await runStory(page, canvas, story.id);
        // Not a request that a page load stopped, like a stylesheet of the
        // page that a link left.
        const found = errors.list.splice(0).filter((error) => !error.endsWith("net::ERR_ABORTED"));
        const passed =
          result.phase === "finished" &&
          result.reports.length === 0 &&
          found.length === 0 &&
          (result.interactions === undefined || result.interactions === "PASS");
        if (!passed) failures.push({ ...result, errors: found });
      }
      expect(failures, "the stories that did not render or play").toEqual([]);
    },
  );

  test("a docs page of autodocs shows each story in an iframe", async ({ page, errors }) => {
    const docs = (await storyIndex(site().url)).filter((entry) => entry.type === "docs");
    const ids = docs.map((entry) => entry.id).sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(["ui-badge--docs", "ui-button--docs", "ui-card--docs", "ui-field--docs"]);
    for (const entry of docs) {
      const stories = await runDocs(page, site().url, entry.id);
      expect(stories.length, `the stories of ${entry.id}`).toBeGreaterThan(0);
      expect(
        stories.filter((story) => story.phase !== "finished"),
        `the stories of ${entry.id} that did not render`,
      ).toEqual([]);
    }
    expect(errors.list.splice(0), "the errors of the docs pages").toEqual([]);
  });
}

describe("storybook dev", () => {
  let site: Site;
  beforeAll(async () => {
    site = await serve(
      (port) => ["storybook", "dev", `--port=${port}`, "--exact-port", "--no-open", "--ci"],
      { ready: "index.json" },
    );
  });
  afterAll(() => site?.close());

  checkStories(() => site);
});

// `storybook build` builds with Vite's app builder: see the patch of
// `@storybook/builder-vite` in patches/.
describe("storybook build", () => {
  let site: Site;
  beforeAll(async () => {
    await run("storybook", "build", "--quiet");
    site = await serveFiles(path.join(root, "storybook-static"));
  });
  afterAll(() => site?.close());

  checkStories(() => site);
});
