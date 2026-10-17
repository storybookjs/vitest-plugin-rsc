import { expect, test } from "vitest";
import { projectModuleId, projectPlugin, type Project } from "./project.ts";

function projectModule(project: Project): string {
  const plugin = projectPlugin(project);
  const id = (plugin.resolveId as (source: string) => string)(projectModuleId);
  return (plugin.load as (id: string) => string)(id);
}

// The preview file is an import, which the build resolves; the directories
// are no path of the machine: a static build is a site to serve anywhere.
test("the preview file, and the directories from the one they are both in", () => {
  // Storybook runs at the root of a monorepo, the app is a package of it.
  const code = projectModule({
    root: "/home/me/repo/apps/web",
    workingDir: "/home/me/repo",
    previewFile: "/home/me/repo/apps/web/.storybook/preview.tsx",
  });
  expect(code).toBe(
    [
      'import * as evaluated from "/home/me/repo/apps/web/.storybook/preview.tsx";',
      "let preview = evaluated;",
      'import.meta.hot?.accept("/home/me/repo/apps/web/.storybook/preview.tsx", (next) => { if (next) preview = next; });',
      "export { preview };",
      'export const previewFile = ".storybook/preview.tsx";',
      'export const root = "apps/web";',
      'export const workingDir = "";',
    ].join("\n"),
  );
});

test("a project without a preview file", () => {
  const code = projectModule({ root: "/repo", workingDir: "/repo", previewFile: undefined });
  expect(code).toContain("const preview = {};");
  expect(code).toContain("export const previewFile = undefined;");
});
