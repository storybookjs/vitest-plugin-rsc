import type { ReactRenderer } from "@storybook/react";
import type { BeforeEach, ProjectAnnotations } from "storybook/internal/types";
import { cleanup, linkStylesheetsOf } from "vitest-plugin-rsc/nextjs/testing-library";
import { hostFilesOf } from "./host-files.ts";

// The annotations of the project's preview, its first addon: a client story
// renders as `@storybook/react` renders it, with the stylesheets of its file
// while Storybook shows it, as a server story has those of its page. The
// plugin links them as the host uses the file, with `linkStylesheetsOf()`,
// and `cleanup()` unlinks them. Not as Storybook loads the file, which it
// also does for a story that it does not show, as the manager preloads it.

/**
 * Before a client story: the stylesheets of its file, until Storybook leaves
 * the story. A docs page shows its client stories inline, each with its own,
 * and a story twice, the primary one, with one each.
 */
export const beforeEach: BeforeEach<ReactRenderer> = async ({ parameters }) => {
  const files = hostFilesOf(parameters.fileName as string);
  if (!files) return;
  await linkStylesheetsOf(files);
  return () => cleanup();
};

export const annotations: ProjectAnnotations<ReactRenderer> = { beforeEach };
