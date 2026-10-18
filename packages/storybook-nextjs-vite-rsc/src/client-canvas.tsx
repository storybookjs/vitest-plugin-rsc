"use client";

// The canvas of a client story: the one way to the browser layer's React. A
// file with `"use client"`, so the preview, which is the rsc layer, has a
// client reference module of it, and the plugin evaluates the file itself in
// the browser layer (`loadClientModule()`). What it exports is of that layer:
// `@storybook/react`'s renderer, with its error boundary, `act` and remount,
// on the browser layer's `react-dom`, and the preview file as that layer
// evaluates it, where its `"use client"` components are components and not
// references.
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
 * The preview file of the browser layer as it is now. The layer evaluates
 * the modules of the app again after a change, the preview file among them,
 * where the canvas, which loads once, would keep what it imported first.
 */
export const loadPreview = async (): Promise<Record<string, unknown>> =>
  (await import("virtual:@storybook/nextjs-vite-rsc/project")).preview;
