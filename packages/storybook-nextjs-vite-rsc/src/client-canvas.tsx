"use client";

// The canvas of a client story and of a docs page: the one way to the browser
// layer's React. A file with `"use client"`, so the preview, which is the rsc
// layer, has a client reference module of it, and the plugin evaluates the
// file itself in the browser layer (`loadClientModule()`). What it exports is
// of that layer: `@storybook/react`'s renderer, with its error boundary,
// `act` and remount, on the browser layer's `react-dom`, and the preview file
// as that layer evaluates it, where its `"use client"` components are
// components and not references.
import type { DocsRenderer } from "@storybook/addon-docs";
import * as react from "@storybook/react/entry-preview";
import type { ArgsStoryFn, DecoratorApplicator, RenderToCanvas } from "storybook/internal/types";
import type { NextjsRscRenderer } from "./index.ts";

// Typed for the framework's renderer: they render a client story, whose
// component is one of the browser layer's React.
export const render = react.render as unknown as ArgsStoryFn<NextjsRscRenderer>;
export const renderToCanvas = react.renderToCanvas as unknown as RenderToCanvas<NextjsRscRenderer>;
export const applyDecorators =
  react.applyDecorators as unknown as DecoratorApplicator<NextjsRscRenderer>;

/**
 * The preview file as the browser layer has it: the page's instance, a file
 * of the host without a directive (vitest-plugin-rsc), which is the
 * preview's own after a change too: the document loads again.
 */
export const loadPreview = async (): Promise<Record<string, unknown>> =>
  (await import("virtual:@storybook/nextjs-vite-rsc/project")).preview;

/**
 * The renderer of a docs page of `@storybook/addon-docs`, of the browser
 * layer: the docs page, its blocks and the MDX files render on its React.
 * Loaded with the first docs page, not with every client story.
 */
export async function createDocsRenderer(): Promise<DocsRenderer<NextjsRscRenderer>> {
  const { DocsRenderer } = await import("virtual:@storybook/nextjs-vite-rsc/addon-docs");
  if (!DocsRenderer) {
    throw new Error(
      "A docs page renders with @storybook/addon-docs, which the project does not have: " +
        "install it, and add it to the addons of .storybook/main.ts.",
    );
  }
  return new DocsRenderer<NextjsRscRenderer>();
}
