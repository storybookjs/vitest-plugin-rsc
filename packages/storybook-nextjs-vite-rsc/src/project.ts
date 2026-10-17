import path from "node:path";
import { normalizePath, type EnvironmentModuleNode, type Plugin } from "vite";

// What the preview knows of the project, as a virtual module: the preview
// file of `.storybook/`, and where Storybook names a story file from. Both
// layers import it: the rsc layer, which is the preview, and the browser
// layer, through the canvas of the client stories (client-canvas.tsx). So the
// preview file is evaluated in both, as a module without a directive that a
// Server Component and a Client Component both import is in Next.
//
// In the rsc layer its exports are the ones Storybook has: a client story
// tells the decorators of the preview file apart by their identity. Storybook
// loads the preview again after a change of the file, and so does the module
// after a change of a module that the file imports: one importer that took
// the change in place would have another evaluation of the file than the
// other.

export const projectModuleId = "virtual:@storybook/nextjs-vite-rsc/project";

export type Project = {
  /** The root of the Vite project. */
  root: string;
  /** Where Storybook runs, which it names the story files from. */
  workingDir: string;
  /** `.storybook/preview.tsx`, if the project has one. */
  previewFile: string | undefined;
};

export function projectPlugin({ root, workingDir, previewFile }: Project): Plugin {
  root = normalizePath(root);
  workingDir = normalizePath(workingDir);
  // The two directories from the one they are both in, so the module has no
  // path of the machine: a static build is a site to serve anywhere.
  const base = commonDir(root, workingDir);
  const preview = previewFile && normalizePath(previewFile);
  const code = [
    preview ? `import * as preview from ${JSON.stringify(preview)};` : "const preview = {};",
    "export { preview };",
    `export const previewFile = ${JSON.stringify(preview && path.posix.relative(root, preview))};`,
    `export const root = ${JSON.stringify(path.posix.relative(base, root))};`,
    `export const workingDir = ${JSON.stringify(path.posix.relative(base, workingDir))};`,
  ].join("\n");
  return {
    name: "storybook-nextjs-vite-rsc:project",
    resolveId: (source) => (source === projectModuleId ? `\0${projectModuleId}` : undefined),
    load: (id) => (id === `\0${projectModuleId}` ? code : undefined),
    hotUpdate({ modules }) {
      // The rsc layer is Vite's `client` environment: the preview.
      if (this.environment.name !== "client" || !preview) return;
      if (!modules.some((module) => isOrIsImportedBy(module, preview))) return;
      this.environment.hot.send({ type: "full-reload" });
      return [];
    },
  };
}

// Whether a module is the file, or one that the file imports, also through
// other modules.
function isOrIsImportedBy(module: EnvironmentModuleNode, file: string): boolean {
  const seen = new Set([module]);
  for (const node of seen) {
    if (node.file === file) return true;
    for (const importer of node.importers) seen.add(importer);
  }
  return false;
}

function commonDir(a: string, b: string): string {
  const parts = a.split("/");
  const other = b.split("/");
  let common = 0;
  while (common < parts.length && parts[common] === other[common]) common++;
  return parts.slice(0, common).join("/") || "/";
}
