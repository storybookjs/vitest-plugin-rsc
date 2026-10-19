import { expect, test } from "vitest";
import { projectModuleId, projectPlugin, type Project } from "./project.ts";

function projectModule(project: Project): string {
  const plugin = projectPlugin(project);
  const id = (plugin.resolveId as (source: string) => string)(projectModuleId);
  return (plugin.load as (id: string) => string)(id);
}

// No path of the machine: a static build is a site to serve anywhere.
test("the preview file, and the directories from the one they are both in", () => {
  // Storybook runs at the root of a monorepo, the app is a package of it.
  const code = projectModule({
    root: "/home/me/repo/apps/web",
    workingDir: "/home/me/repo",
    previewFile: "/home/me/repo/apps/web/.storybook/preview.tsx",
  });
  expect(code).toBe(
    [
      'export const previewFile = ".storybook/preview.tsx";',
      'export const root = "apps/web";',
      'export const workingDir = "";',
    ].join("\n"),
  );
});

test("a project without a preview file", () => {
  const code = projectModule({ root: "/repo", workingDir: "/repo", previewFile: undefined });
  expect(code).toContain("export const previewFile = undefined;");
});

// The preview file is server code, evaluated in the rsc layer: a file with
// "use client" that imports it, like a story file of CSF Next, would have the
// browser layer evaluate it again.
test("the preview file in the browser layer says that it is server code", () => {
  const plugin = projectPlugin({
    root: "/repo",
    workingDir: "/repo",
    previewFile: "/repo/.storybook/preview.tsx",
  });
  const load = (environment: string, id: string) =>
    (plugin.load as (this: object, id: string) => unknown).call(
      {
        environment: { name: environment, mode: "build" },
        getModuleInfo: () => ({ importers: ["/repo/stories/button.stories.tsx"] }),
        error: (message: string) => {
          throw new Error(message);
        },
      },
      id,
    );
  expect(() => load("react_client", "/repo/.storybook/preview.tsx?v=1")).toThrow(
    ".storybook/preview.tsx is server code, which the preview evaluates once, on the server, " +
      "and button.stories.tsx imports it in the browser",
  );
  expect(() => load("react_client", "/repo/.storybook/preview.tsx")).toThrow(
    'A story file with "use client" is CSF 3',
  );
  // The preview, the rsc layer, which is Vite's `client` environment.
  expect(load("client", "/repo/.storybook/preview.tsx")).toBeUndefined();
  expect(load("react_client", "/repo/stories/button.stories.tsx")).toBeUndefined();
});
