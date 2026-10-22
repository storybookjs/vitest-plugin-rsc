import type { ReactRenderer } from "@storybook/react";
import type { BeforeEach, ProjectAnnotations } from "storybook/internal/types";
import { fn } from "storybook/test";
import { keepHostDocument, linkStylesheetsOf } from "vitest-plugin-rsc/nextjs/client-components";
import { hostFilesOf } from "./host-files.ts";

// The annotations of the project's preview, its first addon: a client story
// renders as `@storybook/react` renders it, with the stylesheets of its file
// while Storybook shows it, as a server story has those of its file on its
// node (`hostFiles` of `renderServer()`), and a page those of its route. The
// plugin links them as the host uses the file, with `linkStylesheetsOf()`,
// for as long as the story's signal says. Not as Storybook loads the file,
// which it also does for a story that it does not show, as the manager
// preloads it. A client story has the browser's own `fetch`, cookies and
// storage: no browser context of the app is open while it renders.

// Where a link or a form of a client story navigated, as the Actions panel
// shows it. Without Next's router, Next's `<Link>` leaves the navigation to
// the browser, which would load another document in place of the preview:
// the preview stays, as `@storybook/nextjs-vite` keeps it with a mock of
// the router.
const navigation = fn().mockName("navigation");
const navigated = (url: URL) => navigation(url.href);

/**
 * Before a client story: the preview stays when a link or a form of it would
 * load another document, and it has the stylesheets of its file, until the
 * render ends. The preview aborts the story's signal when it leaves the
 * story, also while they load: left while they load, it rejects with the
 * signal's reason, which Storybook takes as the end of the render: it
 * reports nothing, and runs the cleanups of the hooks before this one. A
 * render that another one of the same story replaces, and a portable story,
 * as under Storybook's Vitest addon, abort no signal: they run the cleanup
 * this hook returns. A docs page shows its client stories inline, each a
 * use of its own, so one that goes takes nothing that another one shows.
 */
export const beforeEach: BeforeEach<ReactRenderer> = async ({ parameters, abortSignal }) => {
  // Once for a render: new args run `beforeEach` again with its signal.
  if (renders.has(abortSignal)) return;
  renders.add(abortSignal);
  const release = keepHostDocument(navigated);
  abortSignal.addEventListener("abort", release, { once: true });
  const files = hostFilesOf(parameters);
  if (files) await linkStylesheetsOf(files, { signal: abortSignal });
  return release;
};

// The signal of each render of a client story.
const renders = new WeakSet<AbortSignal>();

export const annotations: ProjectAnnotations<ReactRenderer> = { beforeEach };
