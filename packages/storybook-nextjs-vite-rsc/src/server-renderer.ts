import { createElement, type ReactNode } from "react";
import type {
  ArgsStoryFn,
  BeforeEach,
  ProjectAnnotations,
  RenderToCanvas,
  StoryContext,
  StoryId,
} from "storybook/internal/types";
import {
  cleanup,
  newBrowserContext,
  renderServer,
  type RenderComponentResult,
  type RenderServerResult,
} from "vitest-plugin-rsc/nextjs/testing-library";
import { nothingToMount, pageWithoutUrl, serverStoryInline } from "./errors.ts";
import { hostFilesOf } from "./host-files.ts";
import type { NextjsParameters, NextjsServerRenderer } from "./server.ts";

// The annotations of the server preview, its first addon: a server story
// renders as a test renders with the plugin. `renderServer()` has Next
// render it on a route of its own, in the request of a page, and Next's
// client hydrates it in the canvas. Its `render` and decorators are Server
// Components there, which may be async.

type Context = StoryContext<NextjsServerRenderer>;

export const nextjsOf = (annotations: { parameters?: object }) =>
  (annotations.parameters as NextjsParameters | undefined)?.nextjs ?? {};

/** The component with its args. */
export const render: ArgsStoryFn<NextjsServerRenderer> = (args, context) => {
  if (!context.component) throw pageWithoutUrl(context.id);
  return createElement(context.component, args);
};

/** A story without a component that renders with `render` is the page at its URL. */
export const isPage = (component: unknown, storyFn: unknown): boolean =>
  !component && storyFn === render;

// The page that each story has open: new args render the story again on it.
const opened = new Map<StoryId, RenderServerResult | RenderComponentResult>();

export const renderToCanvas: RenderToCanvas<NextjsServerRenderer> = async (
  { storyContext: context, storyFn, showMain, forceRemount },
  canvasElement,
) => {
  const { id, abortSignal: signal } = context;
  const { url, headers, proxy, layouts } = nextjsOf(context);
  if (context.viewMode === "docs") throw serverStoryInline(id);
  const page = isPage(context.component, context.originalStoryFn);
  if (page && !url) throw pageWithoutUrl(id);
  const node = page
    ? undefined
    : createElement(function Story() {
        return storyFn() as ReactNode;
      });
  let open = opened.get(id);
  // New args or globals render in place, without a page load, on a page that
  // reported no error: one with an error, like Next's error page in the
  // node's place, opens anew.
  if (node && open && "rerender" in open && open.errors.length === 0 && !forceRemount) {
    await open.rerender(node);
  } else {
    open = node
      ? await renderServer(node, {
          url,
          headers,
          proxy,
          signal,
          hostFiles: hostFilesOf(context.parameters.fileName as string | undefined),
          ...(layouts ? { layouts } : { container: canvasElement }),
        })
      : await renderServer({ url, headers, proxy, signal });
    opened.set(id, open);
  }
  // A story that owns the document has its `<body>` as its canvas, which
  // Storybook's preview gives it. A portable story, as under Vitest, renders
  // in a container of its own, which the page took the place of.
  if (context.parameters.layout === "document") context.canvasElement = document.body;
  // The page reports to one list of errors while it is open.
  if (open.errors.length > 0) throw open.errors[0];
  // Storybook's preparing block stays over the document until the story
  // rendered, a page with its stylesheets, as for any renderer.
  showMain();
};

// `@storybook/react`'s: `mount(<Story />)` in `play` renders that element.
export const mount = (context: Context) => async (ui?: ReactNode) => {
  if (ui != null) {
    if (isPage(context.component, context.originalStoryFn)) throw nothingToMount(context.id);
    context.originalStoryFn = () => ui;
  }
  await context.renderToCanvas();
  return context.canvas;
};

/**
 * Before the story's own `beforeEach`, as the plugin's setup before a test:
 * a new browser context of the app, so that what the story's `beforeEach`
 * stores or sets is its page's. Once for the page: a render with new args
 * keeps it. What it returns runs when Storybook leaves or remounts the
 * story, however far its render got: `cleanup()` closes the context, and the
 * document has the browser's own APIs again. Seed in `beforeEach`, not in a
 * loader: the first render's loaders run before this, with those.
 */
export const beforeEach: BeforeEach<NextjsServerRenderer> = async ({ id }) => {
  if (opened.has(id)) return;
  await newBrowserContext();
  return async () => {
    opened.delete(id);
    // The URL goes back to the one the page found; Storybook writes the URL
    // of the story it selects next after this teardown.
    await cleanup();
  };
};

export const annotations: ProjectAnnotations<NextjsServerRenderer> = {
  render,
  renderToCanvas,
  mount,
  beforeEach,
  parameters: {
    renderer: "react",
    // A docs page shows a server story's page in an iframe.
    docs: { story: { inline: false } },
  },
};
