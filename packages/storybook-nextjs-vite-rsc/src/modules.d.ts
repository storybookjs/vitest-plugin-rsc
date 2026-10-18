// The types of modules that come without their own.

// The virtual module of project.ts.
declare module "virtual:@storybook/nextjs-vite-rsc/project" {
  /** The exports of `.storybook/preview.tsx`, or none. */
  export const preview: Record<string, unknown>;
  /** The preview file, from the root of the project. */
  export const previewFile: string | undefined;
  /** The root of the project, from the directory it shares with `workingDir`. */
  export const root: string;
  /** Where Storybook names the story files from, from that same directory. */
  export const workingDir: string;
}

// The annotations of `@storybook/react` that the canvas of a client story
// takes, which the package has no types for.
declare module "@storybook/react/entry-preview" {
  import type { ReactRenderer } from "@storybook/react";
  import type { ArgsStoryFn, DecoratorApplicator, RenderToCanvas } from "storybook/internal/types";

  export const render: ArgsStoryFn<ReactRenderer>;
  export const renderToCanvas: RenderToCanvas<ReactRenderer>;
  export const applyDecorators: DecoratorApplicator<ReactRenderer>;
}
