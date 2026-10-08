import type { ReactNode } from "react";
import { cleanup, renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

// The renderer. The preview is the rsc layer of the app: a story file is
// server code, as a test file is under Vitest. So a story renders the way a
// test renders: `renderServer()` asks the Next.js server in the browser for a
// page, and Next's own client hydrates it in the canvas.

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
};

type RenderContext = {
  storyContext: StoryContext;
  storyFn: () => ReactNode;
  showMain(): void;
};

/** A story without a component and without a `render` is the page at its URL. */
export function render(args: Record<string, unknown>, context: StoryContext): ReactNode {
  const { id, component: Component } = context;
  if (!Component) {
    throw new Error(
      `Unable to render story ${id}: give it a component, a render function, or ` +
        `\`parameters.nextjs.url\` to open a page of the app.`,
    );
  }
  return <Component {...args} />;
}

// What the URL of the iframe is to Storybook: the page of the app changes it
// while a story is there.
const previewPath = window.location.pathname;

export async function renderToCanvas(
  { storyContext, storyFn, showMain }: RenderContext,
  canvasElement: HTMLElement,
): Promise<() => Promise<void>> {
  const { url, headers, layouts } = storyContext.parameters.nextjs ?? {};
  const isPage = !storyContext.component && storyContext.originalStoryFn === render;
  // A story before this one that was not torn down, and what it left.
  await cleanup();
  // A page has the `<body>` of the document, which React hydrates. Storybook
  // sets its classes on the body when it shows a story, so that comes first:
  // in between, React would find a class the server did not render.
  const ownsDocument = isPage || layouts === true;
  if (ownsDocument) showMain();
  if (isPage) {
    if (!url) render({}, storyContext);
    await renderServer({ url, headers });
  } else {
    // The story and its decorators are Server Components: they run in the
    // request of the page, where `headers()` and `cookies()` are.
    const Story = () => storyFn();
    await renderServer(<Story />, {
      url,
      headers,
      ...(layouts ? { layouts } : { container: canvasElement }),
    });
  }
  if (!ownsDocument) showMain();
  return async () => {
    await cleanup();
    // Storybook names the story in the query of the iframe's URL, also while
    // the page of a story was there.
    if (window.location.pathname !== previewPath) {
      window.history.replaceState(null, "", previewPath + window.location.search);
    }
  };
}
