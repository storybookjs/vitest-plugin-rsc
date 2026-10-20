import type { ReactRenderer } from "@storybook/react";
import type { BeforeEach, ProjectAnnotations } from "storybook/internal/types";
import { linkStylesheetsOf } from "vitest-plugin-rsc/nextjs/client-components";
import { hostFilesOf } from "./host-files.ts";

// The annotations of the project's preview, its first addon: a client story
// renders as `@storybook/react` renders it, with the stylesheets of its file
// while Storybook shows it, as a server story has those of its page. The
// plugin links them as the host uses the file, with `linkStylesheetsOf()`,
// for as long as the story's signal says. Not as Storybook loads the file,
// which it also does for a story that it does not show, as the manager
// preloads it.

/**
 * Before a client story: the stylesheets of its file, until Storybook leaves
 * the story and aborts its signal, also while they load. Left while they
 * load, it rejects with the signal's reason, which Storybook takes as the
 * end of the render: it reports nothing, and runs the cleanups of the hooks
 * before this one. A docs page shows its client stories inline, each a use
 * of its own, so one that goes takes nothing that another one shows.
 */
export const beforeEach: BeforeEach<ReactRenderer> = async ({ parameters, abortSignal }) => {
  const files = hostFilesOf(parameters.fileName as string);
  // Once for a render: new args run `beforeEach` again with its signal.
  if (!files || uses.has(abortSignal)) return;
  uses.add(abortSignal);
  await linkStylesheetsOf(files, { signal: abortSignal });
};

// The signal of each render of a client story that links its stylesheets.
const uses = new WeakSet<AbortSignal>();

export const annotations: ProjectAnnotations<ReactRenderer> = { beforeEach };
