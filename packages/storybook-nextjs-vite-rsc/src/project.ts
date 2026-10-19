import path from "node:path";
import { normalizePath, type Plugin } from "vite";

// What the preview knows of the project, as a virtual module: where the
// preview file is, and where Storybook names a story file from. Paths, not
// the preview file itself, which Storybook imports: the preview file is
// server code, evaluated once, in the rsc layer, as a layout of Next is, also
// for a client story, whose decorators of the preview file are the ones that
// Storybook has (client-story.ts).
//
// The browser layer never evaluates the preview file: a file with
// `"use client"` that imports it, like a story file of CSF Next, which has
// its meta from `preview.meta()`, fails with a message that says so.

const browser = "react_client";

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
    `export const previewFile = ${JSON.stringify(preview && path.posix.relative(root, preview))};`,
    `export const root = ${JSON.stringify(path.posix.relative(base, root))};`,
    `export const workingDir = ${JSON.stringify(path.posix.relative(base, workingDir))};`,
  ].join("\n");
  return {
    name: "storybook-nextjs-vite-rsc:project",
    resolveId: (source) => (source === projectModuleId ? `\0${projectModuleId}` : undefined),
    load(id) {
      if (id === `\0${projectModuleId}`) return code;
      if (this.environment.name !== browser || !preview) return;
      if (normalizePath(id.replace(/\?.*$/, "")) !== preview) return;
      // A dev server has the importers in its module graph, a build in Rollup's.
      const importers =
        this.environment.mode === "dev"
          ? [...(this.environment.moduleGraph.getModuleById(id)?.importers ?? [])].map(
              (importer) => importer.file ?? importer.id ?? "",
            )
          : [...(this.getModuleInfo(id)?.importers ?? [])];
      this.error(previewInBrowser(path.posix.relative(root, preview), importers));
    },
  };
}

/** For an import of the preview file in the browser layer. */
export function previewInBrowser(previewFile: string, importers: readonly string[]): string {
  const by = importers.map((file) => path.basename(file)).join(", ") || "a module";
  return (
    `${previewFile} is server code, which the preview evaluates once, on the server, and ` +
    `${by} imports it in the browser, where a file with "use client" and what it imports ` +
    `run. A story file with "use client" is CSF 3: its meta is its default export, ` +
    `\`export default { component }\`, not \`preview.meta()\` of CSF Next, and the ` +
    `decorators of the preview file decorate its stories from the server.`
  );
}

function commonDir(a: string, b: string): string {
  const parts = a.split("/");
  const other = b.split("/");
  let common = 0;
  while (common < parts.length && parts[common] === other[common]) common++;
  return parts.slice(0, common).join("/") || "/";
}
