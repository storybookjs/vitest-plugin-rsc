import { isPreview, isStory } from "storybook/internal/csf";
import type { ModuleExports, ModuleImportFn } from "storybook/internal/types";
import { loadClientModule } from "vitest-plugin-rsc/nextjs/testing-library";
import { notCsfNext, undeclaredGlobals, wrongFactory } from "./errors.ts";
import { isServerPreview } from "./server.ts";

// The module loader of Storybook's Vite builder: the module that the store
// gets for the preview file and for each story and docs file. The preview is
// the rsc layer, where the module of a file with "use client" is a client
// reference module: the plugin evaluated the file in the browser layer, and
// `loadClientModule()` gives those exports. Any other module as it is.

type Annotations = { globalTypes?: object; initialGlobals?: object };

// The globals that the project's preview declares.
let declared = new Set<string>();

export async function load(importPath: string, importFn: ModuleImportFn): Promise<ModuleExports> {
  const imported = await importFn(importPath);
  const exports = await loadClientModule(imported);
  if (importPath.endsWith(".mdx")) return exports;
  const client = exports !== imported;
  if (isPreview(exports.default)) {
    // The project's preview: preview.tsx, with "use client".
    if (!client || isServerPreview(exports.default)) throw wrongFactory(importPath, client);
    declared = new Set(globalsOf(exports.default.composed));
    return exports;
  }
  const story = Object.values(exports).find((value) => isStory(value));
  if (!story) throw notCsfNext(importPath);
  const { preview } = story.meta;
  if (isServerPreview(preview) === client) throw wrongFactory(importPath, client);
  const undeclared = globalsOf(preview.composed).filter((key) => !declared.has(key));
  if (undeclared.length > 0) throw undeclaredGlobals(importPath, undeclared);
  return exports;
}

const globalsOf = ({ globalTypes, initialGlobals }: Annotations) => [
  ...Object.keys(globalTypes ?? {}),
  ...Object.keys(initialGlobals ?? {}),
];
