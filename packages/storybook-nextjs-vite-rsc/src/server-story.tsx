import { createElement, type ReactNode } from "react";
import type { ArgsStoryFn, RenderContext, StoryContext } from "storybook/internal/types";
import { within } from "storybook/test";
import { previewFile, root, workingDir } from "virtual:@storybook/nextjs-vite-rsc/project";
import {
  cleanup,
  renderServer,
  type RenderComponentOptions,
  type RenderServerResult,
} from "vitest-plugin-rsc/nextjs/testing-library";
import type { NextjsParameters, NextjsRscRenderer } from "./index.ts";

// A story file without `"use client"` is server code, as a file of the app is
// in Next: its stories are server stories. A story renders the way a test
// renders with the plugin: `renderServer()` has Next render it on a route of
// its own, in the request of a page, with its cookies and Server Actions, and
// Next's client hydrates it in the canvas. Its `render` and its decorators
// are Server Components, which may be async.

type Context = StoryContext<NextjsRscRenderer> & { parameters: NextjsParameters };

/**
 * `@storybook/react`'s `render`, of the framework, so that a story without a
 * `render` and a `component` is known: the page of the app at its URL.
 */
export const render: ArgsStoryFn<NextjsRscRenderer> = (args, context) => {
  const Component = context.component;
  if (!Component) throw pageWithoutUrl(context.id);
  return createElement(Component, args);
};

/** Whether a story is a page of the app: no `component`, no `render`. */
export const isPageStory = (context: StoryContext<NextjsRscRenderer>): boolean =>
  !context.component && context.originalStoryFn === render;

const pageWithoutUrl = (id: string) =>
  new Error(
    `The story ${id} has no component and no render, so it is a page of the app, which needs ` +
      `a URL: add \`parameters: { nextjs: { url: "/notes" } }\` with the path of the page. For ` +
      `a story of a component, give it a \`component\` or a \`render\`.`,
  );

// The path of the preview, which the page of a story moves away from.
// Storybook names the story in the query.
const previewPath = window.location.pathname;

// What a server story was rendered with, and what `renderServer()` gave.
type Rendered = {
  id: string;
  nextjs: string;
  /** The node, or none for a page. */
  node: ReactNode | undefined;
  options: RenderComponentOptions;
  result: RenderServerResult;
  /** A page, or a story in the layouts: Next's document in place of the preview's. */
  ownsDocument: boolean;
};

// The story on the canvas: the one that counts. A render after it, or an
// abort, ends a render.
let shown: Rendered | undefined;

/** Renders a server story with `renderServer()`. */
export async function renderServerStory(
  { storyContext, storyFn, showMain, forceRemount }: RenderContext<NextjsRscRenderer>,
  canvasElement: HTMLElement,
): Promise<() => Promise<void>> {
  const context = storyContext as Context;
  const { url, headers, proxy, layouts } = context.parameters.nextjs ?? {};
  const page = isPageStory(context);
  if (page && !url) throw pageWithoutUrl(context.id);
  const node = page
    ? undefined
    : createElement(function Story(): ReactNode {
        return storyFn() as ReactNode;
      });
  const options: RenderComponentOptions = page
    ? { url, headers, proxy }
    : {
        url,
        headers,
        proxy,
        hostFiles: hostFilesOf(context.parameters.fileName as string | undefined),
        ...(layouts ? { layouts } : { container: canvasElement }),
      };
  const nextjs = JSON.stringify(context.parameters.nextjs ?? {});
  const before = shown;
  const again = !forceRemount && before?.id === context.id && before.nextjs === nextjs;
  // A page and the layouts have the document's `<body>`, which React
  // hydrates: Storybook's classes on it come first.
  const ownsDocument = page || layouts === true;
  const rendered: Rendered = {
    id: context.id,
    nextjs,
    node,
    options,
    result: undefined!,
    ownsDocument,
  };
  shown = rendered;
  const superseded = () => shown !== rendered || context.abortSignal.aborted;
  const rendering = (async () => {
    // What the story, a decorator or Flight threw on the server: Next shows
    // its error page in place of the story, and the page reports the error,
    // which Storybook shows instead.
    const reported: unknown[] = [];
    const report = (event: ErrorEvent) => {
      event.preventDefault();
      reported.push(event.error);
    };
    window.addEventListener("error", report);
    try {
      rendered.result = again
        ? await renderAgain(before, rendered, showMain, ownsDocument)
        : await renderAnew(rendered, showMain, ownsDocument);
      if (superseded()) return;
      const { status } = rendered.result.response;
      if (reported.length > 0 || status >= 500) {
        // Next's error document has taken the preview's place.
        await cleanup();
        throw reported[0] ?? new Error(`The server answered ${status} for the story.`);
      }
    } catch (error) {
      if (superseded()) return;
      throw explainServerError(reported[0] ?? error, context.id);
    } finally {
      window.removeEventListener("error", report);
    }
    if (!ownsDocument) return showMain();
    // `play` looks in the page, which is the document.
    Object.assign(context, { canvasElement: document.body, canvas: within(document.body) });
  })();
  await untilAborted(rendering, context.abortSignal);
  return () => leave(rendered);
}

async function leave(rendered: Rendered): Promise<void> {
  if (shown === rendered) shown = undefined;
  await cleanup();
  if (window.location.pathname !== previewPath) {
    window.history.replaceState(null, "", previewPath + window.location.search);
  }
}

/**
 * Leaves the page of a story that owns the document, as its teardown does.
 * After a change of the story or the preview file Storybook renders the
 * story again without a teardown, in its own elements of the document, which
 * the page has taken.
 */
export async function leaveDocument(): Promise<void> {
  if (shown?.ownsDocument) await leave(shown);
}

// A new page load for the story: `cleanup()` leaves the story before, also
// this one with other args.
async function renderAnew(
  { node, options }: Rendered,
  showMain: () => void,
  ownsDocument: boolean,
): Promise<RenderServerResult> {
  await cleanup();
  if (ownsDocument) showMain();
  return node === undefined ? renderServer(options) : renderServer(node, options);
}

// The same story with other args, in the same request. SB-2258 renders it
// again in the page of `before`, which keeps its state; a page load until then.
function renderAgain(
  _before: Rendered,
  rendered: Rendered,
  showMain: () => void,
  ownsDocument: boolean,
): Promise<RenderServerResult> {
  return renderAnew(rendered, showMain, ownsDocument);
}

// The preview file and the story's file: their stylesheets are the story's,
// as a test has those of its setup files and its own.
function hostFilesOf(fileName: string | undefined): string[] {
  return [previewFile, fileName && fromRoot(fileName)].filter((file) => !!file) as string[];
}

// A story file from the root of the project. Storybook names it from its
// working directory, which can be another one, like the root of a monorepo.
function fromRoot(fileName: string): string {
  const file: string[] = [];
  for (const part of [...workingDir.split("/"), ...fileName.split("/")]) {
    if (part === "" || part === ".") continue;
    if (part === "..") file.pop();
    else file.push(part);
  }
  const rootParts = root.split("/").filter(Boolean);
  let common = 0;
  while (common < rootParts.length && rootParts[common] === file[common]) common++;
  return [...rootParts.slice(common).map(() => ".."), ...file.slice(common)].join("/");
}

// Storybook aborts the render of a story it leaves, waits a few tasks for it
// to end, and reloads the preview otherwise, at a URL that is the page's by
// then. A page load takes longer: the render ends at the abort, and the
// teardown leaves the page that may still load.
function untilAborted(rendering: Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
    rendering.then(resolve, reject);
  });
}

// Flight cannot send a function to a Client Component, and React says so
// without a word of where the function came from: an arg of the story, most
// often a spy of `fn()`.
function explainServerError(error: unknown, id: string): unknown {
  const message = error instanceof Error ? error.message : "";
  if (
    !/(?:Functions|Event handlers) cannot be passed (?:directly )?to Client Component/.test(message)
  ) {
    return error;
  }
  return new Error(
    `An arg of the story ${id} is a function, like fn() of storybook/test, which a Client ` +
      `Component cannot get from the server. Put the story in a story file with "use client", ` +
      `whose stories render in the browser and get their args as they are.`,
    { cause: error },
  );
}
