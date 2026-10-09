import { registry } from "./registry.ts";

// `vitest-plugin-rsc/nextjs/internal`: not public API. What the code the
// plugin generates and the Storybook framework of the playground need. It
// changes with the plugin.

/**
 * @internal Loads a file with `"use client"` in the browser layer: the
 * module of the rsc layer for such a file calls it. See client-graph.ts.
 */
export { loadClientFile, unloadClientFile } from "./client-graph.ts";

/**
 * @internal What an export of a file of the browser layer is in a module
 * graph that lives as long as the document: for a UI of the host that renders
 * with React DOM, like the docs pages of Storybook. See client-graph.ts.
 */
export { importForHost } from "./client-graph.ts";

/** @internal Where an export of a file of the browser layer is from. */
export type ClientExport = {
  /** What the browser layer imports the file by, which `clientNode()` takes. */
  module: string;
  /** The name of the export. */
  name: string;
};

/**
 * @internal The file of the host that an export is of, when that file is
 * code of the browser layer: a file with `"use client"`, or a file of
 * `host.ui.files`. Nothing for a value of another module.
 */
export function clientFileOf(value: unknown): ClientExport | undefined {
  const isObject = (typeof value === "object" && value !== null) || typeof value === "function";
  return isObject ? registry.clientExports.get(value) : undefined;
}

/**
 * @internal Says which files of the host render the nodes that
 * `renderServer()` opens from now on, the outer ones first, like the preview
 * and a story file: each a path from the root of the project, which a static
 * build knows them by. A node has the stylesheets of what they import. See
 * `nodeFiles()` in registry.ts.
 */
export function setNodeFiles(files: string[]): void {
  registry.nodeFiles = () => files;
}

/**
 * @internal What the module of the rsc layer for a file of `host.ui.files`
 * exports: a stand-in for each export of the file, which `clientFileOf()`
 * and `importForHost()` know. The file itself is not loaded.
 */
export function referToUiFile(module: string, names: string[]): Record<string, unknown> {
  const load = {};
  return Object.fromEntries(
    names.map((name) => {
      const standIn = () => {
        throw new Error(
          `vitest-plugin-rsc: ${name} of ${module} is code of the browser layer, which the rsc ` +
            `layer only refers to. Get it with importForHost().`,
        );
      };
      Object.defineProperty(standIn, "name", { value: name });
      registry.clientExports.set(standIn, { module, name, load });
      return [name, standIn];
    }),
  );
}
