import path from "node:path";
import { normalizePath, type Plugin } from "vite";

// What the preview knows of the project, as a virtual module: the preview
// file of `.storybook/`, and where Storybook names a story file from. Both
// layers import it: the rsc layer, which is the preview, and the browser
// layer, through the canvas of the client stories (client-canvas.tsx). So the
// preview file is evaluated in both, as a module without a directive that a
// Server Component and a Client Component both import is in Next.
//
// In the rsc layer its exports are the ones Storybook has, as a client story
// tells the decorators of the preview file by their identity. Storybook takes
// a change of the file in place, and so does the module: an importer of the
// file that took it again would import it at another URL after a reload,
// which is another evaluation of it.

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
    ...(preview
      ? [
          `import * as evaluated from ${JSON.stringify(preview)};`,
          "let preview = evaluated;",
          `import.meta.hot?.accept(${JSON.stringify(preview)}, (next) => { if (next) preview = next; });`,
        ]
      : ["const preview = {};"]),
    "export { preview };",
    `export const previewFile = ${JSON.stringify(preview && path.posix.relative(root, preview))};`,
    `export const root = ${JSON.stringify(path.posix.relative(base, root))};`,
    `export const workingDir = ${JSON.stringify(path.posix.relative(base, workingDir))};`,
  ].join("\n");
  return {
    name: "storybook-nextjs-vite-rsc:project",
    resolveId: (source) => (source === projectModuleId ? `\0${projectModuleId}` : undefined),
    load: (id) => (id === `\0${projectModuleId}` ? code : undefined),
  };
}

function commonDir(a: string, b: string): string {
  const parts = a.split("/");
  const other = b.split("/");
  let common = 0;
  while (common < parts.length && parts[common] === other[common]) common++;
  return parts.slice(0, common).join("/") || "/";
}
