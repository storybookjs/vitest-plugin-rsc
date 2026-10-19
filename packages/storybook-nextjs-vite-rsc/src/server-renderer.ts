import { createElement, type ReactNode } from "react";
import type {
  ArgsStoryFn,
  ArgTypesEnhancer,
  BeforeEach,
  ProjectAnnotations,
  RenderToCanvas,
  StoryContext,
} from "storybook/internal/types";
import { configure, getConfig, within } from "storybook/test";
import {
  cleanup,
  renderServer,
  type RenderComponentResult,
  type RenderServerResult,
} from "vitest-plugin-rsc/nextjs/testing-library";
import { nothingToMount, pageInLayouts, pageWithoutUrl, serverStoryInline } from "./errors.ts";
import type { NextjsParameters, NextjsServerRenderer } from "./server.ts";

// How a server story renders: the way a test renders with the plugin.
// `renderServer()` has Next render the story on a route of its own, in the
// request of a page, with its cookies and Server Actions, and Next's client
// hydrates it in the canvas. The story's `render` and its decorators are
// Server Components there, which may be async. These are the annotations of
// the server preview, its first addon.

type Context = StoryContext<NextjsServerRenderer>;

const nextjsOf = (context: { parameters: object }) =>
  (context.parameters as NextjsParameters).nextjs ?? {};

/**
 * The component with its args. A story without a `component` that renders
 * with this is a page of the app.
 */
export const render: ArgsStoryFn<NextjsServerRenderer> = (args, context) => {
  if (!context.component) throw pageWithoutUrl(context.id);
  return createElement(context.component, args);
};

const isPage = (context: Context) => !context.component && context.originalStoryFn === render;

// The pages that are open, by the canvas of the story that opened them: a
// render with other args renders the story again on that page.
const opened = new WeakMap<HTMLElement, RenderServerResult | RenderComponentResult>();

export const renderToCanvas: RenderToCanvas<NextjsServerRenderer> = async (
  { storyContext: context, storyFn, showMain, forceRemount },
  canvasElement,
) => {
  const { id, abortSignal: signal } = context;
  const { url, headers, proxy, layouts } = nextjsOf(context);
  if (context.viewMode === "docs") throw serverStoryInline(id);
  const page = isPage(context);
  if (page && !url) throw pageWithoutUrl(id);
  if (page && layouts) throw pageInLayouts(id);
  // A page, and a component in the layouts, own the document, so `play`
  // looks in all of it: in `<html>`, which stays as pages come and go.
  if (page || layouts) {
    const html = document.documentElement;
    Object.assign(context, { canvasElement: html, canvas: within(html) });
  }
  const node = page
    ? undefined
    : createElement(function Story() {
        return storyFn() as ReactNode;
      });
  const open = opened.get(canvasElement);
  try {
    if (node && open && "rerender" in open && !forceRemount) {
      // New args or globals: the node again, in place, without a page load.
      await open.rerender(node);
    } else {
      const result = node
        ? await renderServer(node, {
            url,
            headers,
            proxy,
            signal,
            hostFiles: [fromRoot(context.parameters.fileName as string)],
            ...(layouts ? { layouts } : { container: canvasElement }),
          })
        : await renderServer({ url, headers, proxy, signal });
      opened.set(canvasElement, result);
      if (result.errors.length > 0) throw result.errors[0];
    }
  } catch (error) {
    // Storybook left the story: the page is left with it.
    if (signal.aborted) return;
    throw error;
  }
  showMain();
};

// `@storybook/react`'s: `mount(<Story />)` in `play` renders that element.
export const mount = (context: Context) => async (ui?: ReactNode) => {
  if (ui != null) {
    if (isPage(context)) throw nothingToMount(context.id);
    context.originalStoryFn = () => ui;
  }
  await context.renderToCanvas();
  return context.canvas;
};

/**
 * Before the story's own `beforeEach`, as the plugin's setup does before a
 * test: `cleanup()`, so what the story's hooks set is there for its render,
 * but for a render with new args, which keeps the page. Testing Library
 * without the `act` of the browser layer's React, which `@storybook/react`
 * configured: a page has a React of its own. What it returns runs as
 * Storybook tears the story down, also after an aborted render.
 */
export const beforeEach: BeforeEach<NextjsServerRenderer> = async ({ canvasElement }) => {
  const { eventWrapper, asyncWrapper, unstable_advanceTimersWrapper } = getConfig();
  const run = <T>(callback: () => T) => callback();
  configure({ eventWrapper: run, asyncWrapper: run, unstable_advanceTimersWrapper: run });
  if (!opened.has(canvasElement)) await cleanup();
  const { pathname } = window.location;
  return async () => {
    configure({ eventWrapper, asyncWrapper, unstable_advanceTimersWrapper });
    opened.delete(canvasElement);
    // Leaving puts back the URL of when the page opened. Storybook writes
    // the URL of what it shows next while the page is open, at its own
    // path: that one stays.
    const at = window.location;
    await cleanup({ url: at.pathname === pathname ? at.href : undefined });
  };
};

/**
 * `layout: "none"` for a story that owns the document, whose `<body>` is the
 * app's: in the layouts, or a page, which has a URL and no component. An
 * enhancer sees no `render`, so a story of a `render` at a URL is counted too.
 */
const layoutOfDocument: ArgTypesEnhancer<NextjsServerRenderer> = (context) => {
  const { url, layouts } = nextjsOf(context);
  if (layouts || (url && !context.component)) context.parameters.layout = "none";
  return context.argTypes;
};

// A story file from the root of the project. Storybook names it from its
// working directory, which the preset gives from the root.
function fromRoot(fileName: string): string {
  const file: string[] = [];
  for (const part of `${import.meta.env.STORYBOOK_NEXTJS_RSC_WORKING_DIR}/${fileName}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && file.length > 0 && file.at(-1) !== "..") file.pop();
    else file.push(part);
  }
  return file.join("/");
}

export const annotations: ProjectAnnotations<NextjsServerRenderer> = {
  render,
  renderToCanvas,
  mount,
  beforeEach,
  argTypesEnhancers: [layoutOfDocument],
  parameters: {
    renderer: "react",
    // A server story renders in a page of the app, which a docs page shows
    // in an iframe.
    docs: { story: { inline: false, iframeHeight: "320px" } },
  },
};
