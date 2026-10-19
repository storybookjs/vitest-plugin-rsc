import type { Parameters } from "storybook/internal/types";
import { expect, test, vi } from "vitest";
import {
  argTypesEnhancers,
  experimental_loadStoryFile,
  parameters,
  renderToCanvas,
} from "./preview.ts";

// The two layers, as in client-story.test.ts: the browser module of a
// reference module is the one of its default export.
const { browserModules, loadClientModule } = vi.hoisted(() => {
  const browserModules = new Map<unknown, object>();
  return {
    browserModules,
    loadClientModule: vi.fn(
      async (module: { default?: unknown }) => browserModules.get(module.default) ?? module,
    ),
  };
});
vi.mock("vitest-plugin-rsc/nextjs/testing-library", () => ({ loadClientModule }));

// The components of the docs pages of the preview file, as each layer
// evaluated it: in the rsc layer one of a file with "use client" is a
// reference.
const { rsc, browser } = vi.hoisted(() => {
  const reference = (name: string) =>
    Object.assign(() => name, { $$typeof: Symbol.for("react.client.reference") });
  return {
    rsc: { container: reference("container"), blockquote: reference("blockquote") },
    browser: { container: () => "container", blockquote: () => "blockquote" },
  };
});
vi.mock("virtual:@storybook/nextjs-vite-rsc/project", () => ({
  preview: {
    parameters: { docs: { container: rsc.container, components: { blockquote: rsc.blockquote } } },
  },
  previewFile: ".storybook/preview.tsx",
  root: "",
  workingDir: "",
}));
// The canvas, with the docs renderer of the browser layer, which records
// what it rendered with.
const rendered = vi.hoisted(() => [] as Parameters[]);
vi.mock("./client-canvas.tsx", () => {
  const reference = {};
  browserModules.set(reference, {
    loadPreview: async () => ({
      parameters: {
        docs: { container: browser.container, components: { blockquote: browser.blockquote } },
      },
    }),
    createDocsRenderer: async () => ({
      render: async (_context: unknown, docs: Parameters) => void rendered.push(docs),
      unmount: () => {},
    }),
  });
  return { default: reference };
});
vi.mock("./server-story.ts", () => ({
  render: () => null,
  isPageStory: () => false,
  renderServerStory: async () => {},
  layoutOfDocument: ({ argTypes }: { argTypes: object }) => argTypes,
  serverStoryFiles: new Map(),
}));

type Enhancer = (context: { parameters: Parameters; argTypes: object }) => object;
const docsStoryByKind = (argTypesEnhancers as unknown as Enhancer[])[0]!;

// Storybook's store loads a story file of each kind.
async function loadStoryFiles() {
  await experimental_loadStoryFile("./stories/greeting.stories.tsx", async () => ({
    default: {},
  }));
  const meta = {};
  browserModules.set(meta, { default: meta, Pressed: {} });
  await experimental_loadStoryFile("./stories/button.stories.tsx", async () => ({
    default: meta,
  }));
}

test("a docs page shows a client story inline, a server story in an iframe", async () => {
  await loadStoryFiles();
  const enhanced = (fileName: string, docs?: Parameters) => {
    const parameters: Parameters = { fileName, docs };
    docsStoryByKind({ parameters, argTypes: {} });
    return parameters.docs;
  };
  expect(enhanced("./stories/button.stories.tsx")).toEqual({ story: { inline: true } });
  expect(enhanced("./stories/greeting.stories.tsx")).toEqual({
    story: { inline: false, iframeHeight: "320px" },
  });
  // What the story, its meta or the project says wins, and the object of
  // the meta, which other stories have too, stays as it is.
  const ofMeta = { story: { inline: false }, source: { type: "code" } };
  expect(enhanced("./stories/button.stories.tsx", ofMeta)).toEqual(ofMeta);
  expect(enhanced("./stories/button.stories.tsx", ofMeta)).not.toBe(ofMeta);
  expect(enhanced("./stories/greeting.stories.tsx", { story: { iframeHeight: "200px" } })).toEqual({
    story: { inline: false, iframeHeight: "200px" },
  });
});

test("a server story inline on a docs page says what to do instead", async () => {
  const context = {
    id: "greeting--default",
    storyContext: { moduleExport: {}, viewMode: "docs" },
  };
  expect(() => renderToCanvas(context as never, {} as HTMLElement)).toThrow(
    "The story greeting--default renders on the server, in a page of the app, which a docs " +
      "page shows in an iframe: remove `inline: true` of `parameters.docs.story` or of " +
      '`<Canvas story={{ inline: true }} />`, or put the story in a file with "use client".',
  );
});

test("an MDX file is the browser layer's, and one that fails there says why", async () => {
  const content = {};
  const page = { default: () => "MDXContent" };
  browserModules.set(content, page);
  expect(
    await experimental_loadStoryFile("./stories/intro.mdx", async () => ({ default: content })),
  ).toBe(page);
  const failing = experimental_loadStoryFile("./stories/server.mdx", async () => {
    throw new Error("This module cannot be imported from a Client Component module.");
  });
  await expect(failing).rejects.toThrow(
    "./stories/server.mdx could not load in the browser, where a docs page renders. If it " +
      "imports server code, show that through a story: <Canvas of={Stories.Name} />.",
  );
  await expect(failing.catch((error: Error) => Promise.reject(error.cause))).rejects.toThrow(
    "cannot be imported from a Client Component",
  );
});

test("the docs renderer of the browser layer, with the preview file's components of that layer", async () => {
  const renderer = await (
    parameters.docs.renderer as () => Promise<{
      render(context: object, docs: Parameters, element: object): Promise<void>;
    }>
  )();
  const page = () => "page";
  await renderer.render(
    {},
    { container: rsc.container, page, components: { blockquote: rsc.blockquote } },
    {},
  );
  expect(rendered.at(-1)).toEqual({
    container: browser.container,
    page,
    components: { blockquote: browser.blockquote },
  });
  // A component of a file with "use client" that a server story file set
  // is a reference, which no layer renders.
  const other = Object.assign(() => null, { $$typeof: Symbol.for("react.client.reference") });
  await expect(renderer.render({}, { container: other }, {})).rejects.toThrow(
    'parameters.docs.container is a component of a file with "use client" that a story file ' +
      "without the directive imports",
  );
});
