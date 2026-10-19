import type {
  ArgTypesEnhancer,
  DocsRenderFunction,
  ModuleExports,
  ModuleImportFn,
  Parameters,
} from "storybook/internal/types";
import { composeConfigs } from "storybook/preview-api";
import { preview } from "virtual:@storybook/nextjs-vite-rsc/project";
import { loadClientModule } from "vitest-plugin-rsc/nextjs/testing-library";
import type { NextjsRscRenderer } from "./index.ts";
import { browserPreview, isClientStoryFile, loadCanvas } from "./client-story.ts";

// The docs pages of `@storybook/addon-docs`, which render in the browser
// layer, on Next's browser React: the docs page, its blocks, an MDX file and
// a client story, inline. A server story renders in a page of the app, which
// has a document of its own: on a docs page it is Storybook's iframe of the
// story. See docs-plugin.ts for the MDX files.

/** `parameters.docs.renderer`: the renderer of the browser layer (client-canvas.tsx). */
export async function docsRenderer(): Promise<{
  render: DocsRenderFunction<NextjsRscRenderer>;
  unmount: (element: HTMLElement) => void;
}> {
  const canvas = await loadCanvas();
  const renderer = await canvas.createDocsRenderer();
  return {
    render: async (context, docsParameter, element) =>
      renderer.render(context, withTwins(docsParameter, await browserPreview(canvas)), element),
    unmount: (element) => renderer.unmount(element),
  };
}

// The docs parameters that are a component: the page and its container.
// `components`, what renders the elements of an MDX file, has one for each.
const componentParameters = ["page", "container"] as const;

// The docs parameters with the components of the preview file as the browser
// layer evaluated it, in the place of the rsc layer's, as a client story has
// the preview file's decorators: by their identity. A component of a story
// file without `"use client"` is a reference there, which no layer renders.
function withTwins(docs: Parameters, browser: object): Parameters {
  const ofRsc = docsOf(preview);
  const ofBrowser = docsOf(browser);
  const twin = (value: unknown, rsc: unknown, other: unknown) =>
    value !== undefined && value === rsc ? other : value;
  const result: Parameters = { ...docs };
  for (const name of componentParameters) {
    if (docs[name] === undefined) continue;
    result[name] = twin(docs[name], ofRsc[name], ofBrowser[name]);
    if (isClientReference(result[name])) throw referenceInDocs(`docs.${name}`);
  }
  if (docs.components) {
    result.components = Object.fromEntries(
      Object.entries(docs.components as Record<string, unknown>).map(([name, value]) => {
        const component = twin(value, ofRsc.components?.[name], ofBrowser.components?.[name]);
        if (isClientReference(component)) throw referenceInDocs(`docs.components.${name}`);
        return [name, component];
      }),
    );
  }
  return result;
}

const docsOf = (module: object): Parameters =>
  (composeConfigs([module]).parameters?.docs as Parameters | undefined) ?? {};

const isClientReference = (value: unknown): boolean =>
  typeof value === "function" &&
  (value as { $$typeof?: symbol }).$$typeof === Symbol.for("react.client.reference");

const referenceInDocs = (parameter: string) =>
  new Error(
    `parameters.${parameter} is a component of a file with "use client" that a story file ` +
      `without the directive imports, a server story file, where it is a reference: set it ` +
      `in .storybook/preview, or in a story file with "use client".`,
  );

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
