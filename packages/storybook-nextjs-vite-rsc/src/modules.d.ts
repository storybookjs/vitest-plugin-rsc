// The types of modules that come without their own.

// The virtual module of project.ts.
declare module "virtual:@storybook/nextjs-vite-rsc/project" {
  /** The preview file, from the root of the project. */
  export const previewFile: string | undefined;
  /** The root of the project, from the directory it shares with `workingDir`. */
  export const root: string;
  /** Where Storybook names the story files from, from that same directory. */
  export const workingDir: string;
}

// The virtual module of docs-plugin.ts: the `DocsRenderer` of
// `@storybook/addon-docs`, if the project has it.
declare module "virtual:@storybook/nextjs-vite-rsc/addon-docs" {
  export const DocsRenderer: typeof import("@storybook/addon-docs").DocsRenderer | undefined;
}

// The annotation of `@storybook/react` that the canvas of a client story
// takes, which the package has no types for.
declare module "@storybook/react/entry-preview" {
  import type { ReactRenderer } from "@storybook/react";
  import type { RenderToCanvas } from "storybook/internal/types";

  export const renderToCanvas: RenderToCanvas<ReactRenderer>;
}
