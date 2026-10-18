import { expect, test, vi } from "vitest";
import { hostFilesOf } from "./server-story.ts";

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
