import type {
  ArgTypesEnhancer,
  DocsRenderFunction,
  ModuleExports,
  ModuleImportFn,
  Parameters,
} from "storybook/internal/types";
import { loadClientModule } from "vitest-plugin-rsc/nextjs/testing-library";
import type { NextjsRscRenderer } from "./index.ts";
import { isClientStoryFile, loadCanvas } from "./client-story.ts";

// The docs pages of `@storybook/addon-docs`, which render in the browser
// layer, on Next's browser React: the docs page, its blocks, an MDX file and
// a client story, inline. A server story renders in a page of the app, which
// has a document of its own: on a docs page it is Storybook's iframe of the
// story. See docs-plugin.ts for the MDX files.

/**
 * `parameters.docs.renderer`: the renderer of the browser layer
 * (client-canvas.tsx). A component of `parameters.docs`, like `page` or one of
 * `components`, of a file with `"use client"`, is a client reference in the
 * rsc layer, which renders as its export of the browser layer (the plugin's).
 */
export async function docsRenderer(): Promise<{
  render: DocsRenderFunction<NextjsRscRenderer>;
  unmount: (element: HTMLElement) => void;
}> {
  const canvas = await loadCanvas();
  return canvas.createDocsRenderer();
}

/**
 * How a docs page shows a story, by its kind, when the story does not say:
 * a client story inline, a server story in an iframe of its own, high enough
 * for a component, as it renders in a page of the app. An enhancer, which
 * Storybook calls as it prepares the story, with its own parameters. The
 * `inline` of Storybook is a boolean of the parameters, not a function of the
 * story, and a story that is prepared has no export yet: the kind is the one
 * of its file, by its importPath.
 */
export const docsStoryByKind: ArgTypesEnhancer<NextjsRscRenderer> = (context) => {
  const { parameters } = context;
  const docs = (parameters.docs ?? {}) as Parameters;
  // A new object: Storybook combines parameters by reference, so the one of
  // the meta or the project is that of other stories too.
  parameters.docs = {
    ...docs,
    story: isClientStoryFile(parameters.fileName)
      ? { inline: true, ...docs.story }
      : { inline: false, iframeHeight: "320px", ...docs.story },
  };
  return context.argTypes;
};

/** For a server story that a docs page renders inline. */
export const serverStoryInline = (id: string): Error =>
  new Error(
    `The story ${id} renders on the server, in a page of the app, which a docs page shows in ` +
      `an iframe: remove \`inline: true\` of \`parameters.docs.story\` or of ` +
      `\`<Canvas story={{ inline: true }} />\`, or put the story in a file with "use client".`,
  );

/**
 * An MDX file, as Storybook's `experimental_loadStoryFile`: a file with
 * `"use client"` (docs-plugin.ts), whose exports are the browser layer's.
 */
export async function loadDocsFile(path: string, importFn: ModuleImportFn): Promise<ModuleExports> {
  try {
    return await loadClientModule(await importFn(path));
  } catch (error) {
    throw new Error(
      `${path} could not load in the browser, where a docs page renders. If it imports server ` +
        `code, show that through a story: <Canvas of={Stories.Name} />.`,
      { cause: error },
    );
  }
}
