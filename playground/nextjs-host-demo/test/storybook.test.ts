import { fileURLToPath } from "node:url";
import type { Frame, Page } from "playwright";
import { afterAll, beforeAll, expect } from "vitest";
import { createProject, type DevServer } from "../../test-helpers/host.ts";
import {
  openStory,
  rendered,
  runStory,
  storyRun,
  test,
  updateArgs,
  type StoryRun,
} from "../../test-helpers/storybook.ts";

// Storybook with @storybook/nextjs-vite-rsc, a host of the plugin: see
// ../.storybook and ../stories. `storybook dev` of the project, driven in the
// manager as a user does.

const root = fileURLToPath(new URL("../", import.meta.url));

let site: DevServer | undefined;

beforeAll(async () => {
  site = await createProject(root, { env: { STORYBOOK_DISABLE_TELEMETRY: "1" } }).serve(
    (port) => ["storybook", "dev", "--port", String(port), "--ci", "--exact-port"],
    { timeout: 120_000 },
  );
});

afterAll(() => site?.close());

const passed: StoryRun = { phase: "finished", reports: [], interactions: "PASS" };

// The canvas of the story, in the manager.
const inCanvas = (canvas: Frame) => canvas.locator("#storybook-root");

test("a server story renders in a request of the app, in the project's decorator", async ({
  page,
}) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  expect(await storyRun(page, canvas, "greeting--default")).toEqual(passed);
  // The project's decorator, a Client Component, with the CSS of the preview file.
  const theme = inCanvas(canvas).getByTestId("theme");
  await expect.poll(() => theme.getAttribute("data-theme")).toBe("storybook");
  await expect
    .poll(() => theme.evaluate((element) => getComputedStyle(element).outlineStyle))
    .toBe("dashed");
  // The CSS module of the component, linked as the route's.
  const greeting = inCanvas(canvas).getByTestId("greeting");
  await expect.poll(() => greeting.isVisible()).toBe(true);
});

test("a client story renders in the browser layer, with fn() for play and Actions", async ({
  page,
}) => {
  const canvas = await openStory(page, site!.url, "press-button--pressed");
  expect(await storyRun(page, canvas, "press-button--pressed")).toEqual(passed);
  const button = inCanvas(canvas).getByRole("button", { name: "Press: 1" });
  // The meta's decorator in the project's, both of the browser layer.
  const frame = inCanvas(canvas).getByTestId("theme").getByTestId("meta-decorator");
  await expect.poll(() => frame.getByRole("button").count()).toBe(1);
  // The CSS module of the component, and the CSS of the story file.
  await expect
    .poll(() => button.evaluate((element) => getComputedStyle(element).color))
    .toBe("rgb(0, 0, 255)");
  await expect
    .poll(() => frame.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(240, 240, 240)");
  // The spy of the args is one that the Actions panel listens to: its call
  // in play is the panel's one action.
  await page.getByRole("tab", { name: /Actions/ }).click();
  await expect
    .poll(() => page.locator("#storybook-panel-root").innerText())
    .toContain("onPress: []");
});

test("a page story and a Server Action", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "home--home");
  expect(await storyRun(page, canvas, "home--home")).toEqual(passed);
  // The page owns the `<body>`, with the app's style. Selecting the story
  // again leaves it as it is, but for Storybook's class of its main mode,
  // which none of Storybook's layouts styles on its own.
  // The classes as a set: Storybook adds them in an order of its timing.
  const body = () =>
    canvas.evaluate(() => ({
      classes: [...document.body.classList].sort().join(" "),
      margin: getComputedStyle(document.body).margin,
      root: !!document.getElementById("storybook-root"),
    }));
  expect(await body()).toEqual({ classes: "", margin: "32px", root: false });
  await page.evaluate(() =>
    (
      window as { __STORYBOOK_ADDONS_CHANNEL__?: { emit(...args: unknown[]): void } }
    ).__STORYBOOK_ADDONS_CHANNEL__!.emit("setCurrentStory", {
      storyId: "home--home",
      viewMode: "story",
    }),
  );
  await expect.poll(async () => (await body()).classes).toBe("sb-show-main");
  expect(await body()).toMatchObject({ margin: "32px", root: false });
  // A story after the page has Storybook's document, its classes and root.
  expect(await runStory(page, canvas, "greeting--server-action")).toEqual(passed);
  expect(await body()).toEqual({
    classes: "sb-main-padded sb-show-main",
    margin: "0px",
    root: true,
  });
});

test("a story in the layouts, and one whose beforeEach sets a cookie", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "greeting--in-layouts");
  expect(await storyRun(page, canvas, "greeting--in-layouts")).toEqual(passed);
  expect(await runStory(page, canvas, "greeting--seeded")).toEqual(passed);
  expect(await runStory(page, canvas, "home--home")).toEqual(passed);
});

test("from a server story to a client story, to another, and back", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  expect(await runStory(page, canvas, "press-button--pressed")).toEqual(passed);
  expect(await runStory(page, canvas, "press-button--labelled")).toEqual({
    phase: "finished",
    reports: [],
  });
  await expect
    .poll(() => inCanvas(canvas).getByRole("button", { name: "Labelled: 0" }).count())
    .toBe(1);
  expect(await runStory(page, canvas, "greeting--server-action")).toEqual(passed);
  expect(await runStory(page, canvas, "home--home")).toEqual(passed);
  expect(await runStory(page, canvas, "press-button--labelled")).toEqual({
    phase: "finished",
    reports: [],
  });
  // The preview is at its own URL again, where Storybook fetches its index,
  // with the story that is selected, also after a reload.
  const atStory = () => {
    const url = new URL(canvas.url());
    return `${url.pathname}?id=${url.searchParams.get("id")}`;
  };
  expect(atStory()).toBe("/iframe.html?id=press-button--labelled");
  await canvas.evaluate(() => location.reload());
  expect(await rendered(canvas, "press-button--labelled")).toBe("finished");
  expect(atStory()).toBe("/iframe.html?id=press-button--labelled");
});

test("new args: a server story loads its page again, a client story keeps its state", async ({
  page,
}) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  await updateArgs(canvas, "greeting--default", { name: "Controls" });
  await expect
    .poll(() => inCanvas(canvas).getByText("Hello from Controls").count(), { timeout: 30_000 })
    .toBe(1);
  await runStory(page, canvas, "press-button--labelled");
  await inCanvas(canvas).getByRole("button", { name: "Labelled: 0" }).click();
  await updateArgs(canvas, "press-button--labelled", { label: "Renamed" });
  await expect
    .poll(() => inCanvas(canvas).getByRole("button", { name: "Renamed: 1" }).count())
    .toBe(1);
});

// A story that does what only the other kind of story can: the message that
// Storybook shows for it. The page logs the error too, which the test takes
// from `errors`, so that the end of the test checks the stories after it.
async function misuse(page: Page, canvas: Frame, story: string, errors: { list: string[] }) {
  await runStory(page, canvas, story);
  const message = (await canvas.locator("#error-message").textContent()) ?? "";
  expect(errors.list.splice(0), `what the page logged of ${story}`).not.toEqual([]);
  return message;
}

test("misuse says what to do instead", async ({ page, errors }) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  expect(await misuse(page, canvas, "misuse--hook-on-server", errors)).toContain(
    'Add the "use client" directive',
  );
  expect(await misuse(page, canvas, "misuse--function-arg", errors)).toContain(
    "is a function, like fn() of storybook/test",
  );
  expect(await misuse(page, canvas, "misuse--throws-in-layouts", errors)).toContain(
    "The story failed in the layouts",
  );
  expect(await misuse(page, canvas, "misuse--page-without-url", errors)).toContain(
    "so it is a page of the app, which needs a URL",
  );
  expect(await misuse(page, canvas, "misuse--page-in-layouts", errors)).toContain(
    "`layouts` is for a component",
  );
  // An exception of `play`, which Storybook shows in the Interactions panel.
  const mounted = await runStory(page, canvas, "misuse--mount-on-page");
  expect(mounted.reports.join("\n")).toContain("which has nothing to mount");
  errors.list.splice(0);
  expect(await misuse(page, canvas, "misuse-client--async-render", errors)).toContain(
    "is an async Client Component",
  );
  expect(await misuse(page, canvas, "misuse-client--page", errors)).toContain(
    'its file has "use client": a page renders on the server',
  );
  // And the stories after them render as before.
  expect(await runStory(page, canvas, "press-button--pressed")).toEqual(passed);
  expect(await rendered(canvas, "press-button--pressed")).toBe("finished");
});
