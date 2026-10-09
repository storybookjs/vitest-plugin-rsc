import { definePreviewAddon } from "storybook/internal/csf";
import { importForHost } from "vitest-plugin-rsc/nextjs/internal";
import { tagsExcludedFromDocs } from "../storybook-internals.ts";
import { createDocsRenderer } from "./docs-renderer.tsx";

// What `@storybook/addon-docs` and `@storybook/addon-docs/preview` are in the
// preview: see the preset. The preview is the rsc layer of the app, where
// React is its react-server build, which has no React DOM, and the docs page
// is a UI of React DOM. So it is code of the browser layer: docs-renderer.tsx
// is one of the files of `host.ui.files` of vitest-plugin-rsc, and so is an
// MDX file. In the preview their exports are stand-ins, which
// `importForHost()` turns into the exports of a module graph that lives as
// long as the document, not the one of a page of the app, which a page load
// of a story replaces. There the React is the browser layer's, and what the
// docs page imports of Storybook's preview, like `storybook/preview-api`, is
// the preview's own.
//
// The parameters are the ones of `@storybook/addon-docs/preview`, with that
// renderer.

type Story = { tags?: string[]; parameters: { docs?: { disable?: boolean } } };
type Renderer = Pick<Awaited<ReturnType<typeof createDocsRenderer>>, "render" | "unmount">;

async function docsRendererOfTheBrowserLayer(): Promise<Renderer> {
  const renderer = await (await importForHost(createDocsRenderer))();
  // Storybook takes `render` off the renderer. The page and the container of
  // the docs parameters are the browser layer's too: the page of an MDX file,
  // or an export of a file with `"use client"`.
  return {
    render: async (context, { page, container, ...docsParameter }, element) =>
      renderer.render(
        context,
        {
          ...docsParameter,
          page: await importForHost(page),
          container: await importForHost(container),
        },
        element,
      ),
    unmount: (element) => renderer.unmount(element),
  };
}

let renderer: Promise<Renderer> | undefined;

function docsRenderer(): Promise<Renderer> {
  if (!renderer) {
    renderer = docsRendererOfTheBrowserLayer();
    // One that failed to load, like on a dev server that was restarting, is
    // loaded anew for the next docs page.
    renderer.catch(() => (renderer = undefined));
  }
  return renderer;
}

const excludeTags = tagsExcludedFromDocs();

export const parameters = {
  docs: {
    renderer: docsRenderer,
    stories: {
      filter: (story: Story) =>
        !(story.tags ?? []).some((tag) => excludeTags.has(tag)) && !story.parameters.docs?.disable,
    },
  },
};

/** `addonDocs()` of CSF Next. */
export default () => definePreviewAddon({ parameters });

/**
 * The docs page renders in the browser layer, which has `DocsRenderer`: not
 * the preview, which is the rsc layer.
 */
export class DocsRenderer {
  constructor() {
    throw new Error(
      "@storybook/nextjs-vite-rsc: DocsRenderer of @storybook/addon-docs renders with React " +
        "DOM, which the preview, the rsc layer of the app, does not have. The framework renders " +
        "the docs pages in the browser layer itself: leave `parameters.docs.renderer` as it is.",
    );
  }
}
