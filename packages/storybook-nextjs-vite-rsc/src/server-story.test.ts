import { expect, test, vi } from "vitest";
import { hostFilesOf, layoutOfDocument, rootOfDocument, serverStoryFiles } from "./server-story.ts";

// Where the project is, as the virtual module has it: from the directory
// that the root and Storybook's working directory are both in.
const project = vi.hoisted(() => ({ root: "", workingDir: "" }));
vi.mock("virtual:@storybook/nextjs-vite-rsc/project", () => ({
  previewFile: ".storybook/preview.tsx",
  get root() {
    return project.root;
  },
  get workingDir() {
    return project.workingDir;
  },
}));
vi.mock("vitest-plugin-rsc/nextjs/testing-library", () => ({}));

// Storybook names a story file from its working directory, the plugin takes
// a file of the host from the root of the project.
test("a story file from the root, with Storybook at the root of a monorepo", () => {
  Object.assign(project, { root: "apps/web", workingDir: "" });
  expect(hostFilesOf("./apps/web/stories/x.stories.tsx")).toEqual([
    ".storybook/preview.tsx",
    "stories/x.stories.tsx",
  ]);
});

test("a story file outside the root, with Storybook at the root", () => {
  Object.assign(project, { root: "apps/web", workingDir: "apps/web" });
  expect(hostFilesOf("../shared/x.stories.tsx")).toEqual([
    ".storybook/preview.tsx",
    "../shared/x.stories.tsx",
  ]);
});

// What Storybook gives the enhancer of a story of the file: its parameters
// and the meta's component, not its render.
function layoutOf(file: Record<string, unknown>, name: string, parameters = {}) {
  serverStoryFiles.set("./x.stories.tsx", file);
  const context = {
    id: `x--${name}`,
    componentId: "x",
    component: (file.default as { component?: unknown }).component,
    parameters: { fileName: "./x.stories.tsx", ...parameters },
    argTypes: {},
  };
  layoutOfDocument(context as unknown as Parameters<typeof layoutOfDocument>[0]);
  return (context.parameters as { layout?: string }).layout;
}

test("a story that owns the document has no layout of Storybook's", () => {
  const Component = () => null;
  // A page: no component, no render, also when the story says otherwise.
  expect(layoutOf({ default: {}, Home: {} }, "home")).toBe("none");
  expect(layoutOf({ default: {}, InLayouts: {} }, "in-layouts", { layout: "padded" })).toBe("none");
  // A component in the layouts.
  expect(
    layoutOf({ default: { component: Component }, Story: {} }, "story", {
      nextjs: { layouts: true },
    }),
  ).toBe("none");
  // A node: a component, or a render of the story or its meta.
  expect(layoutOf({ default: { component: Component }, Story: {} }, "story")).toBeUndefined();
  expect(layoutOf({ default: {}, Story: { render: () => null } }, "story")).toBeUndefined();
  expect(layoutOf({ default: { render: () => null }, Story: {} }, "story")).toBeUndefined();
  expect(layoutOf({ default: {}, Story: () => null }, "story")).toBeUndefined();
  // A test of a story of CSF Next, as its story.
  expect(layoutOf({ default: {}, Home: {} }, "home:renders")).toBe("none");
  expect(layoutOf({ default: {}, Story: { render: () => null } }, "story:renders")).toBeUndefined();
});

// The `<body>` of a story that owns the document is its root, marked as
// Storybook's, unless it has an id of the app's, which it keeps.
test("the body of a story that owns the document is its root", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const body = { id: "" } as HTMLElement;
  expect(rootOfDocument("home--home", body)).toBe(body);
  expect(body.id).toBe("storybook-root");
  expect(warn).not.toHaveBeenCalled();
  const app = { id: "app" } as HTMLElement;
  expect(rootOfDocument("app--home", app)).toBe(app);
  expect(rootOfDocument("app--home", app)).toBe(app);
  expect(app.id).toBe("app");
  // Once per story.
  expect(warn).toHaveBeenCalledOnce();
  expect(warn.mock.calls[0]![0]).toContain(
    'app--home owns the document, and its <body> keeps the app\'s id "app"',
  );
  warn.mockRestore();
});
