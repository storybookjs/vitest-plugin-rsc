import type { ReactNode } from "react";
import type {
  DecoratorApplicator,
  LegacyStoryFn,
  RenderToCanvas,
  StoryContext,
} from "storybook/internal/types";
import { defaultDecorateStory } from "storybook/preview-api";
import type { NextjsRscRenderer } from "./index.ts";
import {
  clientStoryOf,
  decorateClientStory,
  loadStoryFile,
  renderClientStory,
} from "./client-story.ts";
import { docsRenderer, docsStoryByKind, loadDocsFile, serverStoryInline } from "./docs.ts";
import {
  beforeEach,
  isPageStory,
  layoutOfDocument,
  nothingToMount,
  render,
  renderServerStory,
} from "./server-story.ts";

// The annotations of the framework, in place of the ones of
// `@storybook/react` that render (see preset.ts). Each picks
// the kind of the story, a server story (server-story.ts) or a client story
// (client-story.ts), or of the file, a story file or a docs page (docs.ts).
// The preview runs in the rsc layer, with the browser's globals, as a test
// file does.

export { beforeEach, render };

export const parameters = { renderer: "react", docs: { renderer: docsRenderer } };

export const argTypesEnhancers = [docsStoryByKind, layoutOfDocument];

// `@storybook/react`'s: `mount(<Story />)` in `play` renders that element.
export const mount =
  (context: StoryContext<NextjsRscRenderer>) =>
  async (ui?: ReactNode): Promise<StoryContext<NextjsRscRenderer>["canvas"]> => {
    if (ui != null) {
      // A client story has no page: it renders `ui`, as `@storybook/react` does.
      if (isPageStory(context) && !clientStoryOf(context)) throw nothingToMount(context.id);
      context.originalStoryFn = () => ui;
    }
    await context.renderToCanvas();
    return context.canvas;
  };

export const experimental_loadStoryFile: typeof loadStoryFile = (path, importFn) =>
  path.endsWith(".mdx") ? loadDocsFile(path, importFn) : loadStoryFile(path, importFn);

// Storybook decorates a story once it is prepared, without its context, and
// calls the result with the context of each render. A server story without
// React elements around each step: the story and its decorators run inside
// the request as one Server Component, and the context is no prop that
// Flight would send.
export const applyDecorators: DecoratorApplicator<NextjsRscRenderer> = (storyFn, decorators) => {
  let server: LegacyStoryFn<NextjsRscRenderer> | undefined;
  let client: LegacyStoryFn<NextjsRscRenderer> | undefined;
  return (context) => {
    const clientStory = clientStoryOf(context);
    return clientStory
      ? (client ??= decorateClientStory(storyFn, decorators, clientStory))(context)
      : (server ??= defaultDecorateStory(storyFn, decorators))(context);
  };
};

export const renderToCanvas: RenderToCanvas<NextjsRscRenderer> = (context, canvasElement) => {
  const clientStory = clientStoryOf(context.storyContext);
  if (clientStory) return renderClientStory(context, canvasElement, clientStory);
  // Inline on a docs page, in its document: a server story has a page.
  if (context.storyContext.viewMode === "docs") throw serverStoryInline(context.id);
  return renderServerStory(context, canvasElement);
};
