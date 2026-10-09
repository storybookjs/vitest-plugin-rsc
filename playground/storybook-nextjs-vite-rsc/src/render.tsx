import type { ReactNode } from "react";
import { defaultDecorateStory } from "storybook/preview-api";
import { previewFiles, workingDir } from "virtual:@storybook/nextjs-vite-rsc/project";
import { clientFileOf, setNodeFiles } from "vitest-plugin-rsc/nextjs/internal";
import { cleanup, clientNode, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { storyOf } from "./csf-next.ts";
import {
  canvasIsThePage,
  screenFollowsTheBody,
  storyIndexFromThePreview,
} from "./storybook-internals.ts";
import type { NextJsParameters } from "./types.ts";

// The renderer. The preview is the rsc layer of the app: a story file is
// server code, as a test file is under Vitest. So a story renders the way a
// test renders: `renderServer()` asks the Next.js server in the browser for a
// page, and Next's own client hydrates it in the canvas.
//
// A story file with `"use client"` is code of the browser layer, as it is in
// Next. Its story renders in the browser, on a page of its own: see
// client-story.tsx.

type StoryContext = {
  id: string;
  component?: unknown;
  /** `fileName` is the story file, from Storybook's working directory: `./stories/a.stories.tsx`. */
  parameters: NextJsParameters & { fileName?: string };
  globals: Record<string, unknown>;
  originalStoryFn: unknown;
  /** What the story file exports for the story. */
  moduleExport: unknown;
  /** Aborted when Storybook leaves the story while it renders. */
  abortSignal: AbortSignal;
};

type RenderContext = {
  storyContext: StoryContext;
  storyFn: () => ReactNode;
  showMain(): void;
  /** `false` when Storybook renders the story that is there again, with other args. */
  forceRemount: boolean;
};

/** A story without a component and without a `render` is the page at its URL. */
export function render(args: Record<string, unknown>, context: StoryContext): ReactNode {
  const Component = context.component as ((props: object) => ReactNode) | undefined;
  if (!Component) throw pageWithoutUrl(context.id);
  return <Component {...args} />;
}

// For a client story the server renders the project's decorators around it,
// and the browser the decorators of the story and of its meta, which are in
// the story file: see client-story.tsx. `definePreview()` makes this decorator
// the innermost one of the project, right outside the ones of the story file:
// Storybook applies the decorators of a later file of the project inside the
// ones of an earlier file, and of one file in the order they are listed: not
// with `features.legacyDecoratorFileOrder`, which is not supported. For a
// client story it renders what the server has in their place.
const clientStorySlot = Symbol.for("@storybook/nextjs-vite-rsc/client-story");
let projectHasBoundary = false;

/** @internal The innermost decorator of the project, see `definePreview()`. */
export function clientStoryBoundary(): (Story: () => ReactNode, context: object) => ReactNode {
  projectHasBoundary = true;
  return (Story, context) =>
    clientStorySlot in context ? (
      (context as Record<symbol, ReactNode>)[clientStorySlot]
    ) : (
      <Story />
    );
}

// The project's decorators, as a wrapper of `renderServer()` around a client
// story: the story with its decorators, which stop at the boundary above. A
// preview of CSF 3 has none, and its decorators are not around a client
// story.
function serverDecorators(storyContext: StoryContext, storyFn: () => ReactNode) {
  if (!projectHasBoundary) return {};
  return {
    wrapper: function ServerDecorators({ children }: { children: ReactNode }) {
      (storyContext as unknown as Record<symbol, ReactNode>)[clientStorySlot] = children;
      return storyFn();
    },
  };
}

// A story file by its path from the root, as the plugin knows a file of the
// host. Storybook names it from its working directory, which can be another
// directory, like the root of a monorepo: `./apps/web/src/a.stories.tsx` is
// `./src/a.stories.tsx` for the root `apps/web`.
function fromRoot(fileName: string): string {
  const parts = [...workingDir.cwd];
  for (const part of fileName.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && parts.length > 0 && parts.at(-1) !== "..") parts.pop();
    else parts.push(part);
  }
  let common = 0;
  while (common < workingDir.root.length && workingDir.root[common] === parts[common]) common++;
  return [".", ...workingDir.root.slice(common).map(() => ".."), ...parts.slice(common)].join("/");
}

// What the URL of the iframe is to Storybook, which the page of the app
// changes while a story is there. Read once the first story renders, as the
// rest of the setup: importing the framework does nothing to the document.
let previewPath: string | undefined;
function setUp(): string {
  if (previewPath === undefined) {
    previewPath = window.location.pathname;
    screenFollowsTheBody();
    storyIndexFromThePreview(previewPath);
  }
  return previewPath;
}

// The story on the canvas, with what it was rendered with, and how to render
// it again in place. A page of the app is not rendered again in place.
let current: { key: string; rerender(ui: ReactNode): Promise<void> } | undefined;
// How many renders have started: the last one is the one that counts.
let renders = 0;

// The module of the framework that renders a client story, as the browser
// layer imports it. It has `"use client"`, so importing it here loads it in
// the browser layer: only once there is a client story.
let clientStory: Promise<{ module: string; name: string }> | undefined;
const loadClientStory = () =>
  (clientStory ??= import("./client-story.tsx").then(({ ClientStory }) => {
    const found = clientFileOf(ClientStory);
    if (!found) throw new Error("client-story.tsx is not a file of the host");
    return found;
  }));

type ClientStoryOf = { module: string; name: string; test?: string };

// The story file of a client story, and the story in it: what `clientNode()`
// renders. In CSF 3 the story is what the file exports. In CSF Next the file
// exports what `meta.story()` made, and Storybook has the input of that, or
// of one of its `.test()`s.
function clientStoryOf(context: StoryContext): ClientStoryOf | undefined {
  const file = clientFileOf(context.moduleExport);
  if (file) return file;
  const registered = storyOf(context.moduleExport);
  const story = registered && clientFileOf(registered.story);
  return story && { module: story.module, name: story.name, test: registered.test };
}

// Storybook aborts the render of a story that is left while it renders, and
// then waits a few tasks for the render to stop before it tears the story
// down. A render that has not stopped by then gets a reload of the preview,
// and Storybook waits for the reload. The URL of the preview is the page's by
// then, so the plugin loads the app's page at that URL instead, and the
// preview stops there. A page load takes longer than those few tasks, so the
// render stops as soon as it is aborted, and the teardown leaves the page
// that may still be loading.
function untilAborted(rendering: Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = () => resolve();
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) resolve();
    // Nobody waits for a render that was aborted: it fails once the page it
    // loads is left.
    rendering.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

export async function renderToCanvas(
  context: RenderContext,
  canvasElement: HTMLElement,
): Promise<() => Promise<void>> {
  const path = setUp();
  await untilAborted(renderStory(context, canvasElement), context.storyContext.abortSignal);
  return async () => {
    current = undefined;
    await cleanup();
    // Storybook names the story in the query of the iframe's URL, also while
    // the page of a story was there.
    if (window.location.pathname !== path) {
      window.history.replaceState(null, "", path + window.location.search);
    }
  };
}

async function renderStory(
  { storyContext, storyFn, showMain, forceRemount }: RenderContext,
  canvasElement: HTMLElement,
): Promise<void> {
  const nextjs = storyContext.parameters.nextjs ?? {};
  const { url, headers, layouts, proxy } = nextjs;
  // Storybook has left the story, or renders it again: with other args while
  // its play function runs, Storybook does not wait for this render.
  const { abortSignal: signal } = storyContext;
  const ticket = ++renders;
  const superseded = () => signal.aborted || ticket !== renders;
  // What the story throws when the server renders it, in this render.
  const thrown = renderOnTheServer(storyContext);
  // The story file of a client story, and the story in it.
  const file = clientStoryOf(storyContext);
  const isPage = !storyContext.component && storyContext.originalStoryFn === render;
  if (isPage) assertPage(storyContext, file);
  const story = async (): Promise<ReactNode> => {
    if (!file) {
      // The story and its decorators are Server Components: they run in the
      // request of the page, where `headers()` and `cookies()` are.
      const Story = () => storyFn();
      return <Story />;
    }
    // The context is passed as it is, not through Flight: a spy in the args
    // is the one the play function asserts on.
    const { module, name } = await loadClientStory();
    return clientNode(module, name, {
      file: file.module,
      name: file.name,
      test: file.test,
      context: () => storyContext,
    });
  };

  // Storybook renders the story again when its args change, or the globals.
  // It renders again in place, with the state of its Client Components, as
  // long as what it renders in stays: the request of `parameters.nextjs`, and
  // for a client story the globals, which the project's decorators around it
  // get on the server. Those render once per page, so a project decorator of
  // a client story that reads the args has the ones the page loaded with.
  const key = JSON.stringify([storyContext.id, nextjs, file ? storyContext.globals : null]);
  const shown = current;
  if (!forceRemount && shown?.key === key) {
    try {
      // Also while an earlier rerender is under way: each one resolves once
      // the page has its node, or a later one.
      await shown.rerender(await story());
      if (superseded()) return;
      if (thrown.error !== undefined) return showServerError(thrown.error);
      if (layouts === true) canvasIsThePage(storyContext);
      showMain();
      return;
    } catch {
      // The page no longer has the story, like after an error: it renders
      // anew, unless a render after this one does.
      if (current === shown) current = undefined;
      if (superseded()) return;
      if (thrown.error !== undefined) return showServerError(thrown.error);
    }
  }

  current = undefined;
  // A story before this one that was not torn down, and what it left.
  await cleanup();
  if (superseded()) return;
  // A page has the `<body>` of the document, which React hydrates. Storybook
  // sets its classes on the body when it shows a story, so that comes first:
  // in between, React would find a class the server did not render.
  const ownsDocument = isPage || layouts === true;
  if (ownsDocument) showMain();
  try {
    if (isPage) {
      await renderServer({ url: url!, headers, proxy });
    } else {
      const node = await story();
      if (superseded()) return;
      // The story has the CSS of what the preview and its story file import,
      // as a test has that of the setup files and its test file. Not that of
      // another story file.
      const { fileName } = storyContext.parameters;
      setNodeFiles([...previewFiles, ...(fileName ? [fromRoot(fileName)] : [])]);
      const { rerender } = await renderServer(node, {
        url,
        headers,
        proxy,
        ...(file && serverDecorators(storyContext, storyFn)),
        ...(layouts ? { layouts } : { container: canvasElement }),
      });
      if (!superseded()) current = { key, rerender };
    }
  } catch (error) {
    // A render after this one left the page that this one loaded.
    if (superseded()) return;
    throw thrown.error ?? error;
  }
  if (superseded()) return;
  if (thrown.error !== undefined) return showServerError(thrown.error);
  if (ownsDocument) canvasIsThePage(storyContext);
  else showMain();
}

// Misuse that would otherwise fail somewhere else, each with what to do.

const pageWithoutUrl = (id: string) =>
  new Error(
    `The story ${id} has no component and no render function, so it is a page of the app, ` +
      `which needs a URL to open: add \`parameters: { nextjs: { url: "/notes" } }\`, with the ` +
      `path of the page. For a story of a component, give it a \`component\` or a \`render\`.`,
  );

function assertPage(context: StoryContext, file: ClientStoryOf | undefined) {
  const { id } = context;
  if (file) {
    throw new Error(
      `The story ${id} is a page of the app, but its story file has "use client": a page ` +
        `renders on the server, and a story of a file with "use client" in the browser. Move ` +
        `the page story to a story file without the directive, or give it a component.`,
    );
  }
  const { url, layouts } = context.parameters.nextjs ?? {};
  if (!url) throw pageWithoutUrl(id);
  if (layouts !== undefined) {
    throw new Error(
      `The story ${id} is a page of the app, which renders in its layouts already: ` +
        `\`parameters.nextjs.layouts\` is for a story of a component. Remove it.`,
    );
  }
}

type StoryFn = (context: StoryContext) => ReactNode;

/**
 * Decorates the story as Storybook does, with what the story renders on the
 * server explained when it calls a hook there: see `explainServerErrors()`.
 */
export const applyDecorators = (storyFn: StoryFn, decorators: never[]): StoryFn =>
  (defaultDecorateStory as unknown as (story: StoryFn, decorators: never[]) => StoryFn)(
    (context) => explainServerErrors(() => storyFn(context), context),
    decorators,
  );

// What a story's render function threw when the server rendered it, for each
// render of a story: on the context of that render, which the decorators get
// a copy of. The page shows Next's error page in its place; Storybook shows
// the error itself, as for a story that renders in the browser. An error of
// a component, which React renders later, or of a decorator, is Next's to
// show.
const thrownSlot = Symbol.for("@storybook/nextjs-vite-rsc/thrown");
type Thrown = { error?: unknown };

function renderOnTheServer(context: StoryContext): Thrown {
  const thrown: Thrown = {};
  (context as unknown as Record<symbol, Thrown>)[thrownSlot] = thrown;
  return thrown;
}

// Storybook shows an error in the document of the preview, which the page of
// the story took: it leaves that page first.
async function showServerError(error: unknown): Promise<never> {
  current = undefined;
  await cleanup();
  throw error;
}

// A story of a file without `"use client"` renders on the server, where React
// has no hooks with state: they are not a function there.
const serverHook = /\b(use[A-Z]\w*)\b[^\n]* is not a function/;

function explainServerErrors(storyFn: () => ReactNode, context: StoryContext): ReactNode {
  const { id } = context;
  const explain = (error: unknown) => {
    const thrown = (context as unknown as Record<symbol, Thrown | undefined>)[thrownSlot];
    const result = explained(error);
    if (thrown) thrown.error = result;
    return result;
  };
  const explained = (error: unknown) => {
    const hook = serverHook.exec(error instanceof Error ? error.message : "")?.[1];
    if (!hook) return error;
    return new Error(
      `The story ${id} calls ${hook}() on the server. A story file without "use client" is ` +
        `server code, as a file of the app is in Next: its components and its render ` +
        `function are Server Components. Add "use client" at the top of the story file to ` +
        `render its stories in the browser, or move ${hook}() into a Client Component.`,
      { cause: error },
    );
  };
  try {
    const result = storyFn();
    return result instanceof Promise
      ? (result.catch((error: unknown) => {
          throw explain(error);
        }) as unknown as ReactNode)
      : result;
  } catch (error) {
    throw explain(error);
  }
}
