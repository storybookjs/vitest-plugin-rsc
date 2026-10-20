import type { ReactRenderer } from "@storybook/react";
import type { BeforeEach, ProjectAnnotations } from "storybook/internal/types";
import { cleanup, linkStylesheetsOf } from "vitest-plugin-rsc/nextjs/testing-library";

// The annotations of the project's preview, its first addon: a client story
// renders as `@storybook/react` renders it, with the stylesheets of its file
// while Storybook shows it, as a server story has those of its page. The
// plugin links them as the host uses the file, with `linkStylesheetsOf()`,
// and `cleanup()` unlinks them. One instance in both layers, a package of
// the host (preset.ts): the preview runs these annotations in the browser
// layer, and load.ts names the module of each file in the rsc layer, which
// `linkStylesheetsOf()` takes. Not as Storybook loads a file, which it also
// does for a story that it does not show, as the manager preloads it.

// The module of the rsc layer for each file with "use client" that Storybook
// loaded, by its import path: Storybook's `parameters.fileName`.
const clientModules = new Map<string, object>();

/** Names the module of the rsc layer that Storybook loaded for a file with "use client". */
export function loadedClientModule(importPath: string, module: object): void {
  clientModules.set(importPath, module);
}

/**
 * Before a client story: the stylesheets of its file, until Storybook leaves
 * the story. A docs page shows its client stories inline, each with its own.
 */
export const beforeEach: BeforeEach<ReactRenderer> = async ({ parameters }) => {
  const loaded = clientModules.get(parameters.fileName as string);
  if (loaded) await linkStylesheetsOf(loaded);
  return () => cleanup();
};

export const annotations: ProjectAnnotations<ReactRenderer> = { beforeEach };
