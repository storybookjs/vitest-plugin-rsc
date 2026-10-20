import { fileURLToPath } from "node:url";
import type { Frame, Page } from "playwright";
import { afterAll, beforeAll, expect } from "vitest";
import { createProject, type DevServer } from "../../test-helpers/host.ts";
import {
  openDocs,
  openStory,
  rendered,
  runStory,
  selectDocs,
  storyInDocs,
  storyRun,
  stylesInOrder,
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

test("a server story renders in a request of the app, in the server preview's decorator", async ({
  page,
}) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  expect(await storyRun(page, canvas, "greeting--default")).toEqual(passed);
  // The decorator of preview.server.tsx, a Client Component, with the CSS
  // that preview imports.
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
  // The meta's decorator in the one of preview.tsx, both of the browser layer.
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
  // preview.tsx is evaluated once: the project's preview and the one that a
  // story file imports have one component of `parameters.docs`.
  const once = await canvas.evaluate(async () => {
    type Annotations = { parameters: { docs: { components: { blockquote: unknown } } } };
    const store = (
      window.__STORYBOOK_PREVIEW__ as unknown as {
        storyStore: {
          projectAnnotations: Annotations;
          loadCSFFileByStoryId(id: string): Promise<{ projectAnnotations: Annotations }>;
        };
      }
    ).storyStore;
    const file = await store.loadCSFFileByStoryId("press-button--pressed");
    const { blockquote } = store.projectAnnotations.parameters.docs.components;
    return file.projectAnnotations.parameters.docs.components.blockquote === blockquote;
  });
  expect(once).toBe(true);
  // A story that sets its own args with Storybook's `useArgs()`.
  expect(await runStory(page, canvas, "press-button--renames-itself")).toEqual(passed);
});

// The document of the preview: Storybook's, or the one of a page, which owns
// it. The classes as a set: Storybook adds them in an order of its timing.
const body = (canvas: Frame) =>
  canvas.evaluate(() => ({
    classes: [...document.body.classList].sort().join(" "),
    margin: getComputedStyle(document.body).margin,
    root: document.getElementById("storybook-root")?.tagName,
  }));

// A page owns the `<body>`, with the app's style, without Storybook's
// classes.
const atPage = { classes: "", margin: "32px", root: "BODY" };
const atComponent = { classes: "sb-main-padded sb-show-main", margin: "0px", root: "DIV" };

// Both previews import a11y, and Storybook's runtime is in both layers: the
// browser layer has the page's instance of each, which listens to the
// channel once. A second instance would run a11y twice for the panel's
// rerun, and add a second root of highlights.
test("the runtime and an addon that both previews import listen once", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "press-button--pressed");
  expect(await storyRun(page, canvas, "press-button--pressed")).toEqual(passed);
  expect(await runStory(page, canvas, "greeting--default")).toEqual(passed);
  const events = ["storybook/a11y/manual", "storybook/highlight/add"];
  const listeners = await canvas.evaluate(
    (names) => names.map((name) => window.__STORYBOOK_PREVIEW__.channel.listenerCount(name)),
    events,
  );
  expect(listeners).toEqual([1, 1]);
});

// Storybook's addons that work on the DOM, of every preview, for a server
// story: their decorators run with Storybook's hooks on the preview's
// document, where the story is.
test("a11y, backgrounds, outline, measure and viewport on a server story", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  // a11y's `afterEach` checked the story's document.
  await page.getByRole("tab", { name: /Accessibility/ }).click();
  await expect
    .poll(() => page.locator("#storybook-panel-root").innerText(), { timeout: 30_000 })
    .toMatch(/Passes/);
  await canvas.evaluate(() =>
    window.__STORYBOOK_PREVIEW__.channel.emit("updateGlobals", {
      globals: {
        backgrounds: { value: "dark" },
        outline: true,
        measureEnabled: true,
        viewport: { value: "mobile1", isRotated: false },
      },
    }),
  );
  await expect.poll(() => canvas.locator("style#addon-backgrounds-color").count()).toBe(1);
  await expect.poll(() => canvas.locator("style#addon-outline").count()).toBe(1);
  await expect.poll(() => canvas.locator("canvas#storybook-addon-measure").count()).toBe(1);
  const iframe = page.locator("#storybook-preview-iframe");
  await expect.poll(() => iframe.evaluate((element) => element.clientWidth)).toBe(320);
  expect(await inCanvas(canvas).getByText("Hello from Storybook").count()).toBe(1);
});

// user-event marks the document on its first use, with two capture
// listeners, and leaving a page takes back what was set on the document
// while it was open: marked first while a page is open, every page would add
// two listeners more. Storybook's loader of `context.userEvent` sets it up
// before each render, so before the first page.
test("user-event prepares the document once, for every page", async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<unknown>();
    const { addEventListener, removeEventListener } = EventTarget.prototype;
    const isFocus = (target: EventTarget, type: string, options: unknown) =>
      target === document && type === "focus" && (options as { capture?: boolean })?.capture;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (isFocus(this, type, options)) listeners.add(listener);
      addEventListener.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      if (isFocus(this, type, options)) listeners.delete(listener);
      removeEventListener.call(this, type, listener, options);
    };
    Object.assign(window, { focusListeners: () => listeners.size });
  });
  const canvas = await openStory(page, site!.url, "home--home");
  expect(await storyRun(page, canvas, "home--home")).toEqual(passed);
  expect(await runStory(page, canvas, "greeting--server-action")).toEqual(passed);
  expect(await runStory(page, canvas, "home--home")).toEqual(passed);
  const focusListeners = await canvas.evaluate(() =>
    (window as { focusListeners?: () => number }).focusListeners!(),
  );
  expect(focusListeners).toBe(1);
});

test("a page story and a Server Action", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "home--home");
  expect(await storyRun(page, canvas, "home--home")).toEqual(passed);
  expect(await body(canvas)).toEqual(atPage);
  // Selecting the story again leaves it as it is: Storybook adds nothing to
  // the `<body>` of a story that owns the document.
  const unchanged = canvas.evaluate(
    () =>
      new Promise((resolve) =>
        (
          window as { __STORYBOOK_ADDONS_CHANNEL__?: { once(...args: unknown[]): void } }
        ).__STORYBOOK_ADDONS_CHANNEL__!.once("storyUnchanged", resolve),
      ),
  );
  await page.evaluate(() =>
    (
      window as { __STORYBOOK_ADDONS_CHANNEL__?: { emit(...args: unknown[]): void } }
    ).__STORYBOOK_ADDONS_CHANNEL__!.emit("setCurrentStory", {
      storyId: "home--home",
      viewMode: "story",
    }),
  );
  await unchanged;
  expect(await body(canvas)).toEqual(atPage);
  // A story after the page has Storybook's document, its classes and root.
  expect(await runStory(page, canvas, "greeting--server-action")).toEqual(passed);
  expect(await body(canvas)).toEqual(atComponent);
});

test("a page, a client story and a page again, each without the one before", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "home--home");
  const home = canvas.getByRole("heading", { name: "Home" });
  const button = canvas.getByRole("button", { name: /^Press: / });
  expect(await home.isVisible()).toBe(true);
  expect(await runStory(page, canvas, "press-button--pressed")).toEqual(passed);
  expect(await body(canvas)).toEqual(atComponent);
  expect(await home.count()).toBe(0);
  expect(await inCanvas(canvas).getByRole("button", { name: "Press: 1" }).isVisible()).toBe(true);
  expect(await runStory(page, canvas, "home--home")).toEqual(passed);
  expect(await body(canvas)).toEqual(atPage);
  expect(await button.count()).toBe(0);
  expect(await home.isVisible()).toBe(true);
});

// Next renders the document of its not-found page anew, and React removes
// what else is in its `<body>`: Storybook puts its error display there as
// it shows an error.
test("a page whose play fails on Next's not-found page shows Storybook's error", async ({
  page,
  errors,
}) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  const run = await runStory(page, canvas, "misuse--play-fails-on-not-found");
  expect(run.reports.join("\n")).toContain("The play failed on the not-found page");
  const message = canvas.locator("#error-message");
  await expect.poll(() => message.isVisible()).toBe(true);
  expect(await message.textContent()).toContain("The play failed on the not-found page");
  expect(await canvas.getByText("This page could not be found.").count()).toBe(1);
  errors.list.splice(0);
  // And the story after it renders without it.
  expect(await runStory(page, canvas, "home--home")).toEqual(passed);
  expect(await canvas.locator(".sb-errordisplay").count()).toBe(0);
  expect(await body(canvas)).toEqual(atPage);
});

// The layout of the story that the preview renders, as Storybook prepared it.
const layout = (canvas: Frame) =>
  canvas.evaluate(() => window.__STORYBOOK_PREVIEW__.currentRender?.story?.parameters.layout);

test("a story in the layouts, and one whose beforeEach sets a cookie", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "greeting--in-layouts");
  expect(await storyRun(page, canvas, "greeting--in-layouts")).toEqual(passed);
  // A story that owns the document has the layout "document", and its
  // `<body>` is its root.
  expect(await layout(canvas)).toBe("document");
  expect((await body(canvas)).root).toBe("BODY");
  expect(await runStory(page, canvas, "greeting--seeded")).toEqual(passed);
  expect(await layout(canvas)).toBeUndefined();
  expect(await runStory(page, canvas, "home--home")).toEqual(passed);
  expect(await layout(canvas)).toBe("document");
});

// A server story of a component is a node: the document and its URL are
// the preview's, so a reload loads the preview again, at the story. Not
// the app's page at the node's URL, which for a story is `/`, the home page.
test("a reload at a server story of a component shows the story again", async ({ page }) => {
  // Without the layouts, and in them, where the node's route owns the body.
  for (const story of ["greeting--default", "greeting--in-layouts"]) {
    const canvas = await openStory(page, site!.url, story);
    await canvas.evaluate(() => ((window as { before?: true }).before = true));
    await canvas.evaluate(() => location.reload());
    // A new document: the browser loaded the preview again.
    await canvas.waitForFunction(() => !(window as { before?: true }).before, null, {
      timeout: 30_000,
    });
    expect(await rendered(canvas, story)).toBe("finished");
    const body = canvas.locator("body");
    await expect
      .poll(() => body.getByText("Hello from Storybook").count(), { message: story })
      .toBe(1);
    expect(await body.getByText("Hello from the page").count(), story).toBe(0);
  }
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

// A story has the CSS of its own file and of its route, whatever story ran
// before it: a client story that of its file, which imports preview.tsx and
// press-button.stories.css, a server story that of preview.server.tsx and
// its node, and a page that of its route alone.
test("a story has the CSS of its file and its route, in any order of the stories", async ({
  page,
}) => {
  const stories = ["press-button--pressed", "greeting--default", "home--home"];
  // The server stories after a client story, and before one.
  const forwards = await stylesInOrder(page, site!.url, [...stories, "press-button--labelled"]);
  const backwards = await stylesInOrder(page, site!.url, [
    "home--home",
    "greeting--default",
    "press-button--labelled",
    "press-button--pressed",
  ]);
  expect(backwards).toEqual(forwards);
  const has = (story: string, selector: string) =>
    forwards[story]!.some((rule) => rule.startsWith(`${selector} {`));
  expect(stories.map((story) => has(story, ".story-frame"))).toEqual([true, false, false]);
  expect(stories.map((story) => has(story, '[data-testid="theme"]'))).toEqual([true, true, false]);
});

test("new args: a server story renders again in place, a client story keeps its state", async ({
  page,
}) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  // The story's Client Component, with a state of its own.
  await inCanvas(canvas).getByRole("button", { name: "Count: 0" }).click();
  await canvas.evaluate(() => Object.assign(window, { __marked: true }));
  await updateArgs(canvas, "greeting--default", { name: "Controls" });
  await expect
    .poll(() => inCanvas(canvas).getByText("Hello from Controls").count(), { timeout: 30_000 })
    .toBe(1);
  // In the document it was in, without a page load: the Client Component
  // has its state.
  expect(await inCanvas(canvas).getByRole("button", { name: "Count: 1" }).count()).toBe(1);
  expect(await canvas.evaluate(() => "__marked" in window)).toBe(true);
  // A page: new args are inputs of its `beforeEach`, so a new page load.
  expect(await runStory(page, canvas, "home--home")).toEqual(passed);
  await updateArgs(canvas, "home--home", { visitor: "Grace" });
  await expect
    .poll(() => canvas.evaluate(() => localStorage.getItem("visitor")), { timeout: 30_000 })
    .toBe("Grace");
  await expect.poll(() => canvas.getByRole("button", { name: "Count: 0" }).count()).toBe(1);
  await runStory(page, canvas, "press-button--labelled");
  // Left, the page puts the preview at the story that is selected.
  expect(new URL(canvas.url()).searchParams.get("id")).toBe("press-button--labelled");
  await inCanvas(canvas).getByRole("button", { name: "Labelled: 0" }).click();
  await updateArgs(canvas, "press-button--labelled", { label: "Renamed" });
  await expect
    .poll(() => inCanvas(canvas).getByRole("button", { name: "Renamed: 1" }).count())
    .toBe(1);
});

// What React reported as the story rendered again shows in Storybook's
// error display, as on its first render, over the page that stays.
test("an error of a server story after new args shows, as on its first render", async ({
  page,
  errors,
}) => {
  const canvas = await openStory(page, site!.url, "misuse--fails-after-new-args");
  await expect.poll(() => inCanvas(canvas).getByText("Not failed yet").count()).toBe(1);
  await updateArgs(canvas, "misuse--fails-after-new-args", { fail: true });
  const message = canvas.locator("#error-message");
  await expect.poll(() => message.isVisible(), { timeout: 30_000 }).toBe(true);
  expect(await message.textContent()).toContain("The story failed after new args");
  errors.list.splice(0);
  // Args that do not fail render the story again, on a page of its own.
  await updateArgs(canvas, "misuse--fails-after-new-args", { fail: false });
  await expect
    .poll(() => inCanvas(canvas).getByText("Not failed yet").count(), { timeout: 30_000 })
    .toBe(1);
  await expect.poll(() => message.isVisible()).toBe(false);
});

// Storybook aborts the render of a story that is left before it ends. A page
// that is loading stops, and shows nowhere: not over the story after it, and
// not by a reload of the preview.
test("a page left while it loads leaves no render and no reload", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  await canvas.evaluate(() => Object.assign(window, { __marked: true }));
  await canvas.evaluate(() =>
    window.__STORYBOOK_PREVIEW__.channel.emit("selectStory", {
      storyId: "home--home",
      viewMode: "story",
    }),
  );
  await canvas.waitForFunction(
    () => {
      const render = window.__STORYBOOK_PREVIEW__.currentRender;
      return render?.id === "home--home" && render.phase === "rendering";
    },
    null,
    { polling: "raf" },
  );
  expect(await runStory(page, canvas, "greeting--server-action")).toEqual(passed);
  expect(await canvas.evaluate(() => "__marked" in window)).toBe(true);
  // Long enough for the page, which loads in about a second here.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  expect(await canvas.getByRole("heading", { name: "Home" }).count()).toBe(0);
  expect(await body(canvas)).toEqual(atComponent);
  expect(await rendered(canvas, "greeting--server-action")).toBe("finished");
});

// The manager selecting the story that renders once more makes Storybook
// show its main view while the render runs, as a save of a page story's file
// does: Storybook adds nothing to the `<body>` of a story that owns the
// document, so React hydrates the HTML of the page as the server sent it.
// The page's stylesheets come late here, so that the selection always comes
// during the load.
test("a page that loads keeps its own <body> when its story is selected again", async ({
  page,
  errors,
}) => {
  const canvas = await openStory(page, site!.url, "home--home");
  await page.route(/\.css(\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
  });
  const manager = (event: string, payload?: object) =>
    page.evaluate(
      ({ event, payload }) =>
        (
          window as unknown as {
            __STORYBOOK_ADDONS_CHANNEL__: { emit(event: string, payload?: object): void };
          }
        ).__STORYBOOK_ADDONS_CHANNEL__.emit(event, payload),
      { event, payload },
    );
  await manager("forceReRender");
  // The page's `<body>` is in the document, not yet the story's root, its
  // stylesheets on their way.
  await canvas.waitForFunction(() => document.body.id !== "storybook-root", null, {
    polling: 10,
  });
  await manager("setCurrentStory", { storyId: "home--home", viewMode: "story" });
  expect(await rendered(canvas, "home--home")).toBe("finished");
  await new Promise((resolve) => setTimeout(resolve, 2000));
  expect(errors.list.splice(0), "the errors of the page").toEqual([]);
});

// Storybook's preparing block stays over the preview until the story
// rendered, a page with its stylesheets, as for any renderer: while the page
// loads, the block is in the document, and after it, the block is gone and
// the page has its style. The page's stylesheets come late here, so that the
// load takes a while.
test("a page loads under Storybook's preparing block", async ({ page }) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  expect(await rendered(canvas, "greeting--default")).toBe("finished");
  let loading!: () => void;
  const stylesheets = new Promise<void>((resolve) => (loading = resolve));
  await page.route(/\.css(\?|$)/, async (route) => {
    loading();
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await canvas.evaluate(() =>
    window.__STORYBOOK_PREVIEW__.channel.emit("selectStory", {
      storyId: "home--home",
      viewMode: "story",
    }),
  );
  const preparing = () =>
    canvas.evaluate(() => !!document.querySelector('sb-preview[data-mode="preparing-story"]'));
  // The page loads its stylesheets; Storybook shows the block after a delay
  // of its own.
  await stylesheets;
  await expect.poll(preparing, { timeout: 1000 }).toBe(true);
  expect(await rendered(canvas, "home--home")).toBe("finished");
  expect(await preparing()).toBe(false);
  expect(await body(canvas)).toEqual(atPage);
});

// A story that does what only the other kind of story can: the message that
// Storybook shows for it. The page logs the error too, which the test takes
// from `errors`, so that the end of the test checks the stories after it.
async function misuse(page: Page, canvas: Frame, story: string, errors: { list: string[] }) {
  await runStory(page, canvas, story);
  const error = canvas.locator("#error-message");
  await expect.poll(() => error.isVisible(), { message: story }).toBe(true);
  const message = (await error.textContent()) ?? "";
  expect(errors.list.splice(0), `what the page logged of ${story}`).not.toEqual([]);
  return message;
}

// A story whose file does not load: Storybook shows the error of the
// loader, without a render of the story, and logs it. The story is selected
// once: the error of the story before it is still on the canvas, so the
// error is the story's once it names the rule, and its log is the one that
// carries the same message.
async function notLoaded(
  canvas: Frame,
  story: string,
  message: string,
  errors: { list: string[] },
) {
  await canvas.evaluate((storyId) => {
    window.__STORYBOOK_PREVIEW__.channel.emit("selectStory", { storyId, viewMode: "story" });
  }, story);
  const error = canvas.locator("#error-message");
  await expect
    .poll(async () => ((await error.isVisible()) ? await error.textContent() : ""), {
      message: story,
      timeout: 60_000,
    })
    .toContain(message);
  await expect
    .poll(() => errors.list.some((logged) => logged.includes(message)), {
      message: `what the page logged of ${story}`,
    })
    .toBe(true);
  errors.list.splice(0);
}

test("misuse says what to do instead", async ({ page, errors }) => {
  const canvas = await openStory(page, site!.url, "greeting--default");
  expect(await misuse(page, canvas, "misuse--hook-on-server", errors)).toContain(
    'Add the "use client" directive',
  );
  // React's own error: a function arg that reaches a Client Component.
  expect(await misuse(page, canvas, "misuse--function-arg", errors)).toContain(
    "Event handlers cannot be passed to Client Component props",
  );
  expect(await misuse(page, canvas, "misuse--throws-in-layouts", errors)).toContain(
    "The story failed in the layouts",
  );
  expect(await misuse(page, canvas, "misuse--page-without-url", errors)).toContain(
    "so it is a page of the app, which needs a URL",
  );
  // An exception of `play`, which Storybook shows in the Interactions panel.
  const mounted = await runStory(page, canvas, "misuse--mount-on-page");
  expect(mounted.reports.join("\n")).toContain("which has nothing to mount");
  errors.list.splice(0);
  expect(await misuse(page, canvas, "misuse-client--async-render", errors)).toContain(
    "is an async Client Component",
  );
  // A story file that the framework does not load: the error of the loader.
  for (const [story, message] of [
    ["misuse-csf3--not-csf-next", "has no story of meta.story()"],
    ["misuse-factory--wrong-factory", 'has "use client", so its stories render in the browser'],
    // Server code gets the client reference of preview.tsx, which has no
    // `meta`: the file throws while it evaluates, before the loader can
    // name the rule, so the error is JavaScript's.
    ["misuse-server-file--client-preview", "preview.meta is not a function"],
    ["misuse-before-all--before-all", "defineServerPreview() got a beforeAll"],
    ["misuse-globals--globals", "globals are declared in preview.tsx"],
  ]) {
    await notLoaded(canvas, story!, message!, errors);
  }
  // And the stories after them render as before.
  expect(await runStory(page, canvas, "press-button--pressed")).toEqual(passed);
  expect(await rendered(canvas, "press-button--pressed")).toBe("finished");
});

// The content of a docs page.
const inDocs = (canvas: Frame) => canvas.locator("#storybook-docs");

test("an MDX page: a server story in an iframe, a client story inline", async ({ page }) => {
  const canvas = await openDocs(page, site!.url, "introduction--docs");
  // The server story, in Storybook's iframe of the story.
  const server = await storyInDocs(canvas, "greeting--default");
  expect(await server.getByText("Hello from Storybook").count()).toBe(1);
  expect(await server.getByTestId("server-decorator").getAttribute("data-agent")).toBe("read");
  // The client story in the docs page, in the meta's and the project's
  // decorators, of the browser layer, with the CSS of its story file.
  const frame = inDocs(canvas).getByTestId("theme").getByTestId("meta-decorator");
  const button = frame.getByRole("button", { name: "Press: 0" });
  await expect.poll(() => button.getAttribute("data-theme")).toBe("storybook");
  await expect
    .poll(() => frame.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe("rgb(240, 240, 240)");
  await button.click();
  await expect.poll(() => frame.getByRole("button", { name: "Press: 1" }).count()).toBe(1);
  // One MDXProvider: the docs page's anchors of the headings, and the
  // project's component of `parameters.docs.components`, the browser layer's,
  // with the theme of the docs page from Storybook's theming.
  expect(await inDocs(canvas).locator('h2 a[href="#a-server-story"]').count()).toBe(1);
  const blockquote = inDocs(canvas).getByTestId("docs-blockquote");
  expect(await blockquote.getAttribute("data-theme-base")).toBe("light");
});

test("autodocs: a client story file's stories inline, a server story file's in iframes", async ({
  page,
}) => {
  const canvas = await openDocs(page, site!.url, "press-button--docs");
  expect(await inDocs(canvas).locator("iframe").count()).toBe(0);
  const primary = inDocs(canvas).getByRole("button", { name: "Press: 0" }).first();
  await primary.click();
  // A new value from Controls renders the inline story again in place, with
  // the state it has.
  await updateArgs(canvas, "press-button--pressed", { label: "Renamed" });
  await expect
    .poll(() => inDocs(canvas).getByRole("button", { name: "Renamed: 1" }).count())
    .toBe(1);
  // The args table, from the component's docgen, which Storybook's server
  // reads.
  const argsTable = inDocs(canvas).locator("table");
  await expect
    .poll(() => argsTable.getByText("onPress", { exact: true }).count(), { timeout: 30_000 })
    .toBe(1);
  await selectDocs(canvas, "greeting--docs");
  // Every story of the file once, the primary too, each in a page of its
  // own. One that owns the document is as high as a small phone's screen.
  const primaryFrame = await storyInDocs(canvas, "greeting--default");
  const inLayouts = await (await storyInDocs(canvas, "greeting--in-layouts")).frameElement();
  await storyInDocs(canvas, "greeting--server-action");
  expect(await inDocs(canvas).locator("iframe").count()).toBe(3);
  expect(await primaryFrame.getByText("Hello from Storybook").count()).toBe(1);
  const height = (element: Node) => (element as Element).getBoundingClientRect().height;
  expect(await inLayouts.evaluate(height)).toBe(667);
  await expect
    .poll(() => argsTable.getByText("name", { exact: true }).count(), { timeout: 30_000 })
    .toBe(1);
});

test("from a docs page to a story, and back", async ({ page }) => {
  const canvas = await openDocs(page, site!.url, "introduction--docs");
  await storyInDocs(canvas, "greeting--default");
  expect(await runStory(page, canvas, "greeting--default")).toEqual(passed);
  expect(await runStory(page, canvas, "press-button--pressed")).toEqual(passed);
  await selectDocs(canvas, "introduction--docs");
  await storyInDocs(canvas, "greeting--default");
  await expect.poll(() => inDocs(canvas).getByRole("button", { name: "Press: 0" }).count()).toBe(1);
  expect(await runStory(page, canvas, "home--home")).toEqual(passed);
});

test("a server story inline on a docs page says what to do instead", async ({ page, errors }) => {
  const canvas = await openDocs(page, site!.url, "misuse--docs");
  // In the box of that story, and the rest of the page renders.
  await expect
    .poll(() => inDocs(canvas).innerText())
    .toContain("The story misuse--inline-on-docs renders on the server");
  expect(await inDocs(canvas).getByRole("heading", { name: "Misuse" }).count()).toBe(1);
  errors.list.splice(0);
});
