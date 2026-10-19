import { createElement, type ReactNode } from "react";
import { isStory, storyNameFromExport, toId } from "storybook/internal/csf";
import type {
  ArgsStoryFn,
  ArgTypesEnhancer,
  ModuleExports,
  RenderContext,
  StoryContext,
  StoryContextForEnhancers,
} from "storybook/internal/types";
import { within } from "storybook/test";
import { previewFile, root, workingDir } from "virtual:@storybook/nextjs-vite-rsc/project";
import {
  cleanup,
  renderServer,
  type RenderComponentOptions,
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

// The story files without `"use client"`, as they loaded last, by the
// importPath that Storybook loaded them with, which is the
// `parameters.fileName` of their stories (client-story.ts).
export const serverStoryFiles = new Map<string, ModuleExports>();

/**
 * `parameters.layout` of a story that owns the document, a page or a
 * component in the layouts: `"none"`, whatever the story says, as Storybook's
 * layouts are classes of a `<body>` that is the app's. An enhancer, which
 * Storybook calls as it prepares the story, with its parameters and the
 * meta's component, but not its render: whether it is a page is read from
 * its file.
 */
export const layoutOfDocument: ArgTypesEnhancer<NextjsRscRenderer> = (context) => {
  const { parameters } = context;
  const { layouts } = (parameters as NextjsParameters).nextjs ?? {};
  if (layouts === true || isPageInFile(context)) parameters.layout = "none";
  return context.argTypes;
};

// `isPageStory()` of a story that is not prepared yet: no component, and no
// render of the story or its meta.
function isPageInFile({
  id,
  componentId,
  component,
  parameters,
}: StoryContextForEnhancers<NextjsRscRenderer>): boolean {
  const file = serverStoryFiles.get(parameters.fileName as string);
  if (component || !file) return false;
  const { default: meta, __namedExportsOrder, ...stories } = file;
  for (const [name, value] of Object.entries(stories)) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) continue;
    // A story of CSF Next has its annotations and those of its meta as `input`.
    const story = isStory(value) ? value.input : value;
    const storyId = story.parameters?.__id ?? toId(componentId, storyNameFromExport(name));
    if (storyId !== id) continue;
    const ofMeta = isStory(value) ? value.meta.input : meta;
    return typeof story === "object" && !story.render && !ofMeta?.render;
  }
  return false;
}

const pageInLayouts = (id: string) =>
  new Error(
    `The story ${id} is a page, which renders in its layouts already; \`layouts\` is for a ` +
      `component. Remove it.`,
  );

/** For `mount(ui)` in the `play` of a page story. */
export const nothingToMount = (id: string): Error =>
  new Error(
    `The story ${id} is a page, which has nothing to mount: call \`mount()\` without ` +
      `arguments, or give the story a component.`,
  );

const pageWithoutUrl = (id: string) =>
  new Error(
    `The story ${id} has no component and no render, so it is a page of the app, which needs ` +
      `a URL: add \`parameters: { nextjs: { url: "/notes" } }\` with the path of the page. For ` +
      `a story of a component, give it a \`component\` or a \`render\`.`,
  );

/** Renders a server story with `renderServer()`. */
export async function renderServerStory(
  { storyContext, storyFn, showMain }: RenderContext<NextjsRscRenderer>,
  canvasElement: HTMLElement,
): Promise<void> {
  const context = storyContext as Context;
  const { url, headers, proxy, layouts } = context.parameters.nextjs ?? {};
  const page = isPageStory(context);
  if (page && !url) throw pageWithoutUrl(context.id);
  if (page && layouts) throw pageInLayouts(context.id);
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
  // A page, and a component in the layouts, own the document, so `play`
  // looks in all of it: in `<html>`, which stays as pages come and go, each
  // with a `<body>` of its own.
  const ownsDocument = page || layouts === true;
  if (ownsDocument) {
    const html = document.documentElement;
    Object.assign(context, { canvasElement: html, canvas: within(html) });
  }
  const { abortSignal } = context;
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
      // The page's `<body>` is the app's, which React hydrates. Storybook
      // shows that it prepares a story with a block that it puts in the
      // `<body>` there is, after a moment: in the page's, as it loads,
      // where hydration fails on it. So it shows the story before.
      if (ownsDocument) showMain();
      // Every render is a new page load, also with other args: the
      // framework's `beforeEach` has left the page before.
      const result = await (node === undefined
        ? renderServer(options)
        : renderServer(node, options));
      if (abortSignal.aborted) return;
      const { status } = result.response;
      if (reported.length > 0 || status >= 500) {
        throw reported[0] ?? new Error(`The server answered ${status} for the story.`);
      }
    } catch (error) {
      if (abortSignal.aborted) return;
      throw explainServerError(reported[0] ?? error, context);
    } finally {
      window.removeEventListener("error", report);
    }
    if (!ownsDocument) showMain();
  })();
  await untilAborted(rendering, abortSignal);
}

// `cleanup()` leaves the page, and puts back the preview's URL of when the
// page opened. Storybook writes the URL of the next story while the page is
// open, before it tears this one down, and a URL written then goes with the
// page: written again, the preview is at the story that is selected, also
// for a reload. Not a query of the page, after a change of the story file.
async function leave(): Promise<void> {
  const selection = new URLSearchParams(location.search);
  await cleanup();
  if (selection.has("id") && selection.has("viewMode")) {
    history.replaceState(history.state, "", `${location.pathname}?${selection}`);
  }
}

/**
 * The framework's `beforeEach`, the first hook of the project: `cleanup()`, as
 * before a test, before the story's own `beforeEach`, whose cookies and
 * storage are then there for the render. It runs for every render of a
 * story, also with other args, and leaves the page of the render before.
 * Storybook runs what it returns as it tears the story down, after it has
 * aborted the render: it leaves the page, also one that is still loading.
 */
export async function beforeEach(): Promise<() => Promise<void>> {
  await leave();
  return leave;
}

/**
 * The preview file and the story's file: their stylesheets are the story's,
 * as a test has those of its setup files and its own.
 */
export function hostFilesOf(fileName: string | undefined): string[] {
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
// to end, and loads the preview again otherwise. A page load takes longer:
// the render ends at the abort, and the cleanup of the framework's
// `beforeEach`, which Storybook runs next, leaves the page that may still
// load.
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
function explainServerError(error: unknown, { id, args }: Context): unknown {
  const message = error instanceof Error ? error.message : "";
  if (
    !/(?:Functions|Event handlers) cannot be passed (?:directly )?to Client Component/.test(
      message,
    ) ||
    !Object.values(args).some((arg) => typeof arg === "function")
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
