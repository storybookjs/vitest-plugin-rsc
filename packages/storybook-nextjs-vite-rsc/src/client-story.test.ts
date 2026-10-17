import type { DecoratorFunction, ModuleExports } from "storybook/internal/types";
import { applyHooks, defaultDecorateStory, HooksContext } from "storybook/preview-api";
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

// The preview file, as each layer evaluates it.
const { rscTheme, browserTheme, changedTheme } = vi.hoisted(() => ({
  rscTheme: named("rsc-theme"),
  browserTheme: named("browser-theme"),
  changedTheme: named("changed-theme"),
}));
vi.mock("virtual:@storybook/nextjs-vite-rsc/project", () => ({
  preview: { decorators: [rscTheme] },
  previewFile: ".storybook/preview.tsx",
  root: "",
  workingDir: "",
}));
// The browser layer's preview file, which it evaluates again after a change.
const browserPreview = vi.hoisted(() => ({ current: { decorators: [browserTheme] } }));
vi.mock("./client-canvas.tsx", () => {
  const reference = {};
  browserModules.set(reference, {
    applyDecorators: defaultDecorateStory,
    loadPreview: async () => browserPreview.current,
  });
  return { default: reference };
});
// What renders a server story is of a browser.
vi.mock("./server-story.tsx", () => ({
  render: () => null,
  isPageStory: () => false,
  leaveDocument: async () => {},
}));

// A story file: what the rsc layer imports, with the order of the stories
// that Storybook's CSF plugin adds, and what Storybook's store gets.
function storyFile(exports: ModuleExports) {
  const imported = { ...exports, __namedExportsOrder: Object.keys(exports) };
  return () => experimental_loadStoryFile("./stories/button.stories.tsx", async () => imported);
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
function decorated(moduleExport: object, decorators: DecoratorFunction[]) {
  const story = applyHooks(applyDecorators as never)(() => "story", decorators);
  return story({ moduleExport, hooks: new HooksContext() } as never);
}

test("a client story has the decorators of the preview file as the browser layer evaluated them", async () => {
  const meta = { title: "Button" };
  const Pressed = { args: {} };
  browserModules.set(meta, { default: meta, Pressed });
  await storyFile({ default: meta, Pressed: {} })();
  // Storybook's order: the story's, the meta's, the preview file's, and
  // those of an addon, which are one instance for both layers.
  const decorators = [named("story"), named("meta"), rscTheme, named("addon")];
  expect(decorated(Pressed, decorators)).toBe("browser-theme(addon(meta(story(story))))");
});

test("a server story has the decorators of the preview file as the rsc layer evaluated them", () => {
  expect(decorated({}, [named("story"), rscTheme])).toBe("rsc-theme(story(story))");
});

test("a story file that loads after a change has the preview file of the browser layer then", async () => {
  const meta = { title: "Button" };
  const Before = { args: {} };
  browserModules.set(meta, { default: meta, Before });
  await storyFile({ default: meta, Before: {} })();
  // The story file and the preview file changed, and the layer evaluated the
  // modules of the app again.
  browserPreview.current = { decorators: [changedTheme] };
  const changed = { title: "Button" };
  const After = { args: {} };
  browserModules.set(changed, { default: changed, After });
  await storyFile({ default: changed, After: {} })();
  expect(decorated(After, [rscTheme])).toBe("changed-theme(story)");
  // A story of before has the components of before.
  expect(decorated(Before, [rscTheme])).toBe("browser-theme(story)");
  browserPreview.current = { decorators: [browserTheme] };
});
