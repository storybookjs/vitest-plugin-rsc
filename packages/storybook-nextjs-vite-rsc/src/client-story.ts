import type { ReactRenderer } from "@storybook/react";
import type { BeforeEach, ProjectAnnotations } from "storybook/internal/types";
import { linkStylesheetsOf } from "vitest-plugin-rsc/nextjs/client-components";
import { hostFilesOf } from "./host-files.ts";

// The annotations of the project's preview, its first addon: a client story
// renders as `@storybook/react` renders it, and while Storybook shows it, it
// has what a server story has in its page: the page's storage, empty as the
// story starts, and the stylesheets of its file, as a server story has those
// of its file on its node (`hostFiles` of `renderServer()`), and a page those
// of its route. The plugin links the stylesheets as the host uses the file,
// with `linkStylesheetsOf()`, for as long as the story's signal says. Not as
// Storybook loads the file, which it also does for a story that it does not
// show, as the manager preloads it.

/**
 * Before a client story: the page's `localStorage` and `sessionStorage`,
 * empty as the story starts, after its loaders, as in a new browser context.
 * New args render the story again with its signal, on the page it has, and
 * keep them; a remount is a new signal. A docs page is one page: its inline
 * client stories share the storage, which the first of them empties.
 * Only while Storybook shows the story: under Vitest the test is the context,
 * whose storage the plugin's `cleanup()` emptied before the test seeded it.
 */
export const storage: BeforeEach<ReactRenderer> = ({ parameters, abortSignal }) => {
  if (!hostFilesOf(parameters.fileName as string)) return;
  // Synchronous, so two stories that a docs page starts at once see each
  // other. An aborted signal would never leave the set.
  if (abortSignal.aborted || shown.has(abortSignal)) return;
  // The page's storage: client-components installed it as it evaluated, so
  // the browser's own is never cleared.
  if (shown.size === 0) {
    localStorage.clear();
    sessionStorage.clear();
  }
  shown.add(abortSignal);
  abortSignal.addEventListener("abort", () => shown.delete(abortSignal), { once: true });
};

// The signal of each render of a client story that Storybook shows: one in
// a story's view, one for each inline story of a docs page.
const shown = new Set<AbortSignal>();

/**
 * Before a client story: the stylesheets of its file, until Storybook leaves
 * the story and aborts its signal, also while they load. Left while they
 * load, it rejects with the signal's reason, which Storybook takes as the
 * end of the render: it reports nothing, and runs the cleanups of the hooks
 * before this one. A docs page shows its client stories inline, each a use
 * of its own, so one that goes takes nothing that another one shows.
 */
export const stylesheets: BeforeEach<ReactRenderer> = async ({ parameters, abortSignal }) => {
  const files = hostFilesOf(parameters.fileName as string);
  // Once for a render: new args run `beforeEach` again with its signal.
  if (!files || uses.has(abortSignal)) return;
  uses.add(abortSignal);
  await linkStylesheetsOf(files, { signal: abortSignal });
};

// The signal of each render of a client story that links its stylesheets.
const uses = new WeakSet<AbortSignal>();

export const annotations: ProjectAnnotations<ReactRenderer> = {
  beforeEach: [storage, stylesheets],
};
