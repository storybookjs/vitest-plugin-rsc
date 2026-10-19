import type { DecoratorFunction, ModuleExports } from "storybook/internal/types";
import { applyHooks, HooksContext, useArgs } from "storybook/preview-api";
import { expect, test, vi } from "vitest";
import { applyDecorators, experimental_loadStoryFile } from "./preview.ts";

// The two layers, as the plugin has them: a module of the rsc layer, and of
// a file with "use client" a module of the browser layer, which
// `loadClientModule()` gives for its reference module. Here the browser
// module of a reference module is the one of its default export.
const { browserModules, loadClientModule, named } = vi.hoisted(() => {
  const browserModules = new Map<unknown, object>();
  return {
    browserModules,
    loadClientModule: vi.fn(
      async (module: { default?: unknown }) => browserModules.get(module.default) ?? module,
    ),
    named:
      (name: string) =>
      (Story: () => unknown): string =>
        `${name}(${String(Story())})`,
  };
});
vi.mock("vitest-plugin-rsc/nextjs/testing-library", () => ({ loadClientModule }));

// Decorators of the preview file, which the rsc layer evaluates, once: one,
// and one that does what a decorator of the preview file cannot in a client
// story, which a parameter turns on, and a component of a file with
// "use client", which the rsc layer has as a reference.
const { theme, reference, misuse } = vi.hoisted(() => {
  const reference = Object.assign(() => "reference", {
    $$typeof: Symbol.for("react.client.reference"),
  });
  const misuse = (Story: () => unknown, { parameters }: { parameters: { misuse?: string } }) => {
    if (parameters.misuse === "async") return Promise.resolve(Story());
    // What the rsc layer's React, the server's, does outside of its render.
    if (parameters.misuse === "hook")
      throw new TypeError("Cannot read properties of null (reading 'useMemo')");
    if (parameters.misuse === "useState")
      throw new TypeError("(0 , __vite__cjsImport0_react.useState) is not a function");
    if (parameters.misuse === "other") throw new TypeError("x is not a function");
    return Story();
  };
  return {
    theme: (Story: () => unknown) => `theme(${String(Story())})`,
    reference,
    misuse,
  };
});
vi.mock("virtual:@storybook/nextjs-vite-rsc/project", () => ({
  previewFile: ".storybook/preview.tsx",
  root: "",
  workingDir: "",
}));
vi.mock("./client-canvas.tsx", () => {
  const canvas = {};
  browserModules.set(canvas, { renderToCanvas: async () => {} });
  return { default: canvas };
});
// What renders a server story is of a browser.
vi.mock("./server-story.ts", () => ({
  render: () => null,
  isPageStory: () => false,
  layoutOfDocument: ({ argTypes }: { argTypes: object }) => argTypes,
  serverStoryFiles: new Map(),
}));

// A story file: what the rsc layer imports, with the order of the stories
// that Storybook's CSF plugin adds, and what Storybook's store gets.
function storyFile(exports: ModuleExports) {
  const imported = { ...exports, __namedExportsOrder: Object.keys(exports) };
  return () => experimental_loadStoryFile("./stories/button.stories.tsx", async () => imported);
}

// A client story's export, of a story file that loaded.
async function clientStory(): Promise<object> {
  const meta = { title: "Button" };
  const Pressed = { args: {} };
  browserModules.set(meta, { default: meta, Pressed });
  await storyFile({ default: meta, Pressed: {} })();
  return Pressed;
}

test("a story file without a directive is the rsc layer's", async () => {
  const exports = { default: { title: "Greeting" }, Default: {} };
  const load = storyFile(exports);
  const imported = await load();
  expect(imported).toMatchObject(exports);
  expect(await load()).toBe(imported);
});

test('a story file with "use client" is the browser layer\'s, the same object each time', async () => {
  const meta = { title: "Button" };
  const browser = { default: { title: "Button" }, Pressed: { args: {} } };
  browserModules.set(meta, browser);
  const load = storyFile({ default: meta, Pressed: {} });
  loadClientModule.mockClear();
  expect(await load()).toBe(browser);
  expect(await load()).toBe(browser);
  // Its reference module, without `__namedExportsOrder`, which no reference
  // module has, and the same object each time.
  const [first, second] = loadClientModule.mock.calls
    .map(([module]) => module)
    .filter((module) => "Pressed" in module);
  expect(Object.keys(first!)).toEqual(["default", "Pressed"]);
  expect(second).toBe(first);
});

// A story decorated and called as Storybook's `prepareStory()` does: with
// the decorators wrapped for Storybook's hooks.
function decorated(moduleExport: object, decorators: DecoratorFunction[], context = {}) {
  const story = applyHooks(applyDecorators as never)(() => "story", decorators);
  return story({
    id: "button--pressed",
    moduleExport,
    parameters: {},
    hooks: new HooksContext(),
    ...context,
  } as never);
}

test("a story of either kind has its decorators in Storybook's order, none of them twice", async () => {
  const Pressed = await clientStory();
  // The story's, the meta's, the preview file's, and those of an addon, as
  // the preview has them.
  const decorators = [named("story"), named("meta"), theme, misuse, named("addon")];
  expect(decorated(Pressed, decorators)).toBe("addon(theme(meta(story(story))))");
  expect(decorated({}, decorators)).toBe("addon(theme(meta(story(story))))");
});

test("Storybook's hooks work in a decorator of a client story", async () => {
  const Pressed = await clientStory();
  const withArgs = (Story: () => unknown) =>
    `${Object.keys(useArgs()[0]).join()}(${String(Story())})`;
  expect(decorated(Pressed, [withArgs], { args: { label: "Press" } })).toBe("label(story)");
});

// The decorator that a story's parameter has misbehave.
const misused = (moduleExport: object, kind: string) => () =>
  decorated(moduleExport, [misuse], { parameters: { misuse: kind } });

test("a decorator that returns a promise fails a client story, not a server story", async () => {
  const Pressed = await clientStory();
  expect(misused(Pressed, "async")).toThrow(
    "A decorator of the client story button--pressed returned a promise. A decorator is a " +
      "synchronous function that returns elements, which the browser renders for a client " +
      "story. Those of the preview file are server code",
  );
  expect(misused(Pressed, "async")).toThrow(expect.objectContaining({ name: "DecoratorError" }));
  await expect(misused({}, "async")()).resolves.toBe("story");
});

test("a decorator that calls a hook of React in server code fails a client story", async () => {
  const Pressed = await clientStory();
  for (const kind of ["hook", "useState"]) {
    expect(misused(Pressed, kind)).toThrow(
      "A decorator of the client story button--pressed called a hook of React, in server code.",
    );
  }
  // Another error of the decorator is its own.
  expect(misused(Pressed, "other")).toThrow(new TypeError("x is not a function"));
});

test('a decorator that is a component of a file with "use client" fails every story', async () => {
  const Pressed = await clientStory();
  for (const moduleExport of [Pressed, {}]) {
    expect(() => decorated(moduleExport, [reference])).toThrow(
      'A decorator of the story button--pressed is a component of a file with "use client"',
    );
  }
});
