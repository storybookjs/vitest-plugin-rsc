import type { ReactNode } from "react";
import { applyHooks, defaultDecorateStory } from "storybook/preview-api";
import { clientFileOf } from "vitest-plugin-rsc/nextjs/internal";
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
};

type StoryContext = {
  id: string;
  component?: (props: any) => ReactNode;
  parameters: { nextjs?: NextjsParameters };
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

// What the URL of the iframe is to Storybook: the page of the app changes it
// while a story is there.
const previewPath = window.location.pathname;

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
const abortOf = (signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener("abort", () => resolve(), { once: true });
  });

export async function renderToCanvas(
  context: RenderContext,
  canvasElement: HTMLElement,
): Promise<() => Promise<void>> {
  const rendering = renderStory(context, canvasElement);
  // Nobody waits for a render that was aborted: it fails once the page it
  // loads is left.
  rendering.catch(() => {});
  await Promise.race([rendering, abortOf(context.storyContext.abortSignal)]);
  return async () => {
    await cleanup();
    // Storybook names the story in the query of the iframe's URL, also while
    // the page of a story was there.
    if (window.location.pathname !== previewPath) {
      window.history.replaceState(null, "", previewPath + window.location.search);
    }
  };
}

async function renderStory(
  { storyContext, storyFn, showMain }: RenderContext,
  canvasElement: HTMLElement,
): Promise<void> {
  const { url, headers, layouts } = storyContext.parameters.nextjs ?? {};
  const isPage = !storyContext.component && storyContext.originalStoryFn === render;
  // The story file of a client story, and the story in it.
  const file = isPage ? undefined : clientFileOf(storyContext.moduleExport);
  // Set once Storybook has left the story.
  const { abortSignal: signal } = storyContext;
  // A story before this one that was not torn down, and what it left.
  await cleanup();
  if (signal.aborted) return;
  // A page has the `<body>` of the document, which React hydrates. Storybook
  // sets its classes on the body when it shows a story, so that comes first:
  // in between, React would find a class the server did not render.
  const ownsDocument = isPage || layouts === true;
  if (ownsDocument) showMain();
  const where = layouts ? { layouts } : { container: canvasElement };
  if (isPage) {
    if (!url) throw nothingToRender(storyContext.id);
    await renderServer({ url, headers });
  } else if (file) {
    // The context is passed as it is, not through Flight: a spy in the args
    // is the one the play function asserts on.
    const { module, name } = await loadClientStory();
    if (signal.aborted) return;
    const story = clientNode(module, name, {
      file: file.module,
      name: file.name,
      context: () => storyContext,
    });
    await renderServer(story, {
      url,
      headers,
      wrapper: projectDecorators(storyContext),
      ...where,
    });
  } else {
    // The story and its decorators are Server Components: they run in the
    // request of the page, where `headers()` and `cookies()` are.
    const Story = () => storyFn();
    await renderServer(<Story />, { url, headers, ...where });
  }
  if (!ownsDocument && !signal.aborted) showMain();
}
