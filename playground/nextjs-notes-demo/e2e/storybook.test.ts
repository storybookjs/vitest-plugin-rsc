import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect } from "vitest";
import { createProject, type DevServer } from "../../test-helpers/host.ts";
import {
  openStory,
  rendered,
  runStory,
  storyRun,
  test,
  updateArgs,
} from "../../test-helpers/storybook.ts";
import { atStory, body, passed, renderEveryDocsPage, runEveryStory } from "./stories.ts";

// `storybook dev` of the notes demo, driven in the manager as a user does:
// see ../.storybook, the page stories next to each `page.tsx` and the stories
// of components/.

const root = fileURLToPath(new URL("../", import.meta.url));

let site: DevServer | undefined;

beforeAll(async () => {
  site = await createProject(root, { env: { STORYBOOK_DISABLE_TELEMETRY: "1" } }).serve(
    (port) => ["storybook", "dev", "--port", String(port), "--ci", "--exact-port"],
    { timeout: 120_000 },
  );
});

afterAll(() => site?.close());

test("every story renders and plays, at its own URL", async ({ page, errors }) => {
  await runEveryStory(page, site!.url, errors);
});

// A page has the document of the app, with its `<body>`. A server story has
// Storybook's, at the URL of its request. A client story after them has
// Storybook's document and URL back: its root, the classes of its layout,
// and the URL of the story, where a reload lands.
test("from a page to a component and back", async ({ page }) => {
  const atPage = { classes: [], root: "BODY" };
  const atComponent = { classes: ["sb-main-padded", "sb-show-main"], root: "DIV" };
  const path = () => new URL(canvas.url()).pathname;
  const canvas = await openStory(page, site!.url, "app-notes-page--with-notes");
  expect(await body(canvas)).toEqual(atPage);
  expect(path()).toBe("/notes");
  expect(await runStory(page, canvas, "components-ui-button--pressed")).toEqual(passed);
  expect(await body(canvas)).toEqual(atComponent);
  expect(atStory(canvas)).toBe("/iframe.html?id=components-ui-button--pressed");
  expect(await runStory(page, canvas, "app-page--signed-in")).toEqual(passed);
  expect(await body(canvas)).toEqual(atPage);
  expect(path()).toBe("/");
  expect(await runStory(page, canvas, "components-flash-cookie-probe--from-request")).toEqual(
    passed,
  );
  expect(await body(canvas)).toEqual(atComponent);
  expect(path()).toBe("/");
  expect(await runStory(page, canvas, "components-submit-button--pending")).toEqual(passed);
  expect(await body(canvas)).toEqual(atComponent);
  expect(atStory(canvas)).toBe("/iframe.html?id=components-submit-button--pending");
  await canvas.evaluate(() => location.reload());
  expect(await rendered(canvas, "components-submit-button--pending")).toBe("finished");
  expect(atStory(canvas)).toBe("/iframe.html?id=components-submit-button--pending");
});

test("a new count in Controls seeds the database again and loads the page", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "app-notes-page--with-notes");
  await updateArgs(canvas, "app-notes-page--with-notes", { count: 12 });
  await expect.poll(() => canvas.getByText("12 notes · 2 favorited").count()).toBe(1);
  await expect.poll(() => canvas.getByRole("heading", { level: 2 }).count()).toBe(12);
  expect(await storyRun(page, canvas, "app-notes-page--with-notes")).toEqual(passed);
});

test("every docs page shows its stories: a client story inline, a server story in an iframe", async ({
  page,
  errors,
}) => {
  await renderEveryDocsPage(page, site!.url, errors);
});
