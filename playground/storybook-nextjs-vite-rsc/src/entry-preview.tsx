import type { ReactNode } from "react";
import { applyHooks, defaultDecorateStory } from "storybook/preview-api";
import { previewFiles, workingDir } from "virtual:@storybook/nextjs-vite-rsc/project";
import { clientFileOf, setNodeFiles } from "vitest-plugin-rsc/nextjs/internal";
import { cleanup, clientNode, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// The renderer. The preview is the rsc layer of the app: a story file is
// server code, as a test file is under Vitest. So a story renders the way a
// test renders: `renderServer()` asks the Next.js server in the browser for a
// page, and Next's own client hydrates it in the canvas.
//
// A story file with `"use client"` is code of the browser layer, as it is in
// Next. Its story renders in the browser, on a page of its own: see
// client-story.tsx.

export const parameters = { renderer: "nextjs-rsc" };

export type NextjsParameters = {
  /** The URL of the request. Defaults to `/`. */
  url?: string;
  /** Headers of the request, next to the ones a browser sends. */
  headers?: Record<string, string>;
  /** Renders the story in the layouts of the app's route for `url`. */
  layouts?: boolean;
  /**
   * Whether the server in front of the app takes the request: `proxy.ts`, and
   * the redirects, rewrites and headers of `next.config`. As for
   * `renderServer()`, it defaults to `true` for a page of the app, and to
   * `false` for a story of a component.
   */
  proxy?: boolean;
};

type StoryContext = {
  id: string;
  component?: (props: any) => ReactNode;
  /** `fileName` is the story file, from Storybook's working directory: `./stories/a.stories.tsx`. */
  parameters: { nextjs?: NextjsParameters; fileName?: string };
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

type Decorator = (story: () => ReactNode, context: StoryContext) => ReactNode;
type Decorate = (story: () => ReactNode, decorators: Decorator[]) => (c: StoryContext) => ReactNode;

const nothingToRender = (id: string) =>
  new Error(
    `Unable to render story ${id}: give it a component, a render function, or ` +
      `\`parameters.nextjs.url\` to open a page of the app.`,
  );

/** A story without a component and without a `render` is the page at its URL. */
export function render(args: Record<string, unknown>, context: StoryContext): ReactNode {
  const { id, component: Component } = context;
  if (!Component) throw nothingToRender(id);
  return <Component {...args} />;
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

// What the URL of the iframe is to Storybook: the page of the app changes it
// while a story is there.
const previewPath = window.location.pathname;

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

// The decorators of the project, from `.storybook/preview` and the addons.
// For a client story they are what the server renders around it: Server
// Components, in the request of the page. The decorators of the story and of
// its meta are in the story file, which is the browser layer's.
function projectDecorators(context: StoryContext) {
  const { projectAnnotations } = (
    globalThis as unknown as {
      __STORYBOOK_PREVIEW__: {
        storyStoreValue: {
          projectAnnotations: { decorators?: Decorator[]; applyDecorators?: Decorate };
        };
      };
    }
  ).__STORYBOOK_PREVIEW__.storyStoreValue;
  const { decorators = [], applyDecorators = defaultDecorateStory as unknown as Decorate } =
    projectAnnotations;
  const decorate = (applyHooks as unknown as (decorate: Decorate) => Decorate)(applyDecorators);
  return function Decorated({ children }: { children: ReactNode }) {
    return decorate(() => children, decorators)(context);
  };
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
  await untilAborted(renderStory(context, canvasElement), context.storyContext.abortSignal);
  return async () => {
    current = undefined;
    await cleanup();
    // Storybook names the story in the query of the iframe's URL, also while
    // the page of a story was there.
    if (window.location.pathname !== previewPath) {
      window.history.replaceState(null, "", previewPath + window.location.search);
    }
  };
}

async function renderStory(
  { storyContext, storyFn, showMain, forceRemount }: RenderContext,
  canvasElement: HTMLElement,
): Promise<void> {
  const nextjs = storyContext.parameters.nextjs ?? {};
  const { url, headers, layouts, proxy } = nextjs;
  const isPage = !storyContext.component && storyContext.originalStoryFn === render;
  // The story file of a client story, and the story in it.
  const file = isPage ? undefined : clientFileOf(storyContext.moduleExport);
  // Storybook has left the story, or renders it again: with other args while
  // its play function runs, Storybook does not wait for this render.
  const { abortSignal: signal } = storyContext;
  const ticket = ++renders;
  const superseded = () => signal.aborted || ticket !== renders;
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
      if (!signal.aborted) showMain();
      return;
    } catch {
      // The page no longer has the story, like after an error: it renders
      // anew, unless a render after this one does.
      if (current === shown) current = undefined;
      if (superseded()) return;
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
      if (!url) throw nothingToRender(storyContext.id);
      await renderServer({ url, headers, proxy });
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
        ...(file && { wrapper: projectDecorators(storyContext) }),
        ...(layouts ? { layouts } : { container: canvasElement }),
      });
      if (!superseded()) current = { key, rerender };
    }
  } catch (error) {
    // A render after this one left the page that this one loaded.
    if (superseded()) return;
    throw error;
  }
  if (!ownsDocument && !superseded()) showMain();
}
