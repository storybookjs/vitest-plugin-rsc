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
  decorateClientStory,
  isClientStory,
  loadStoryFile,
  renderClientStory,
} from "./client-story.ts";
import { leaveDocument, render, renderServerStory } from "./server-story.tsx";

// The annotations of the framework, in place of the ones of
// `@storybook/react` that render (see preset.ts). Each picks
// the kind of the story, a server story (server-story.tsx) or a client story
// (client-story.ts). The preview runs in the rsc layer, with the browser's
// globals, as a test file does.

export { render };

export const parameters = { renderer: "react" };

// `@storybook/react`'s: `mount(<Story />)` in `play` renders that element.
export const mount =
  (context: StoryContext<NextjsRscRenderer>) =>
  async (ui?: ReactNode): Promise<StoryContext<NextjsRscRenderer>["canvas"]> => {
    if (ui != null) context.originalStoryFn = () => ui;
    await context.renderToCanvas();
    return context.canvas;
  };

export const experimental_loadStoryFile = loadStoryFile;

// What a `beforeEach` returns Storybook runs as a story is torn down, also
// for a render of the story again after a change, which keeps what the story
// rendered, and before that render.
export const beforeEach = () => leaveDocument;

// Storybook decorates a story once it is prepared, without its context, and
// calls the result with the context of each render. A server story without
// React elements around each step: the story and its decorators run inside
// the request as one Server Component, and the context is no prop that
// Flight would send.
export const applyDecorators: DecoratorApplicator<NextjsRscRenderer> = (storyFn, decorators) => {
  let server: LegacyStoryFn<NextjsRscRenderer> | undefined;
  let client: LegacyStoryFn<NextjsRscRenderer> | undefined;
  return (context) =>
    isClientStory(context)
      ? (client ??= decorateClientStory(storyFn, decorators, context))(context)
      : (server ??= defaultDecorateStory(storyFn, decorators))(context);
};

export const renderToCanvas: RenderToCanvas<NextjsRscRenderer> = (context, canvasElement) =>
  isClientStory(context.storyContext)
    ? renderClientStory(context, canvasElement)
    : renderServerStory(context, canvasElement);
