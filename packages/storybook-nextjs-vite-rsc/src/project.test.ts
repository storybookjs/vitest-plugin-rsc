import type { EnvironmentModuleNode, HotUpdateOptions } from "vite";
import { expect, test, vi } from "vitest";
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
      'import * as preview from "/home/me/repo/apps/web/.storybook/preview.tsx";',
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

// A change that reaches the preview file loads the preview again: Storybook
// and the canvas would have two evaluations of the file otherwise.
function hotUpdate(...modules: Partial<EnvironmentModuleNode>[]) {
  const previewFile = "/repo/.storybook/preview.tsx";
  const plugin = projectPlugin({ root: "/repo", workingDir: "/repo", previewFile });
  const send = vi.fn();
  const environment = { name: "client", hot: { send } };
  const handler = plugin.hotUpdate as unknown as (
    this: { environment: typeof environment },
    options: Partial<HotUpdateOptions>,
  ) => unknown;
  const returned = handler.call({ environment }, { modules } as Partial<HotUpdateOptions>);
  return { reloads: send.mock.calls.length > 0, returned };
}

test("a change under the preview file loads the preview again, but for a stylesheet", () => {
  const preview = { file: "/repo/.storybook/preview.tsx", importers: new Set() };
  const theme = { file: "/repo/app/theme.tsx", importers: new Set([preview]) };
  expect(hotUpdate(theme as never)).toEqual({ reloads: true, returned: [] });
  // `preview.css`: Vite swaps it in place.
  const css = { file: "/repo/.storybook/preview.css", isSelfAccepting: true };
  expect(hotUpdate({ ...css, importers: new Set([preview]) } as never).reloads).toBe(false);
  // A CSS module has exports, which the file that imports it reads.
  const cssModule = {
    file: "/repo/.storybook/preview.module.css",
    isSelfAccepting: false,
    importers: new Set([preview]),
  };
  expect(hotUpdate(cssModule as never).reloads).toBe(true);
});
