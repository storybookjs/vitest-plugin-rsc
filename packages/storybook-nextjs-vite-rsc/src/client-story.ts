import { applyHooks, composeConfigs } from "storybook/preview-api";
import type {
  DecoratorFunction,
  LegacyStoryFn,
  ModuleExports,
  ModuleImportFn,
  RenderContext,
} from "storybook/internal/types";
import { preview, previewFile } from "virtual:@storybook/nextjs-vite-rsc/project";
import { loadClientModule } from "vitest-plugin-rsc/nextjs/testing-library";
import type { NextjsRscRenderer } from "./index.ts";
import { isPageStory, render } from "./server-story.ts";

// A story file with `"use client"` is a client boundary, as in React: its
// stories are client stories, which render in the browser layer, as React
// renders a Client Component, without Next's app or router. The preview
// imports the file in the rsc layer, where it is a client reference module;
// the plugin evaluated the file itself in the browser layer, and
// `loadClientModule()` gives those exports. They are components of the
// browser layer's React, which the canvas renders (client-canvas.tsx).

type Canvas = typeof import("./client-canvas.tsx");
// A decorator as the preview has it, wrapped for Storybook's hooks.
type Decorator = DecoratorFunction<NextjsRscRenderer> & { originalFn?: unknown };

// What a client story renders with, all of the browser layer: the canvas,
// and the decorators of the preview file as the layer evaluated it when the
// story file loaded, where the story file's components import the same
// modules of the app: the twins of the rsc layer's.
export type ClientStory = { canvas: Canvas; twins: Decorator[] };

// The exports of the story files with `"use client"`, by identity: a story
// is a client story when its export is one of them.
const clientStories = new WeakMap<object, ClientStory>();
// The story files with `"use client"` that loaded, by their module, which
// `loadClientModule()` gives the same object for each time.
const loaded = new WeakSet<ModuleExports>();

/** What a story of a file with `"use client"` renders with; none for a server story. */
export const clientStoryOf = (context: object): ClientStory | undefined =>
  clientStories.get(moduleExportOf(context));

// The context of a story has its export, which Storybook's types leave out.
const moduleExportOf = (context: object): object =>
  (context as { moduleExport?: object }).moduleExport ?? {};

let loading: Promise<Canvas> | undefined;

// The canvas, once, before the first client story is prepared.
function loadCanvas(): Promise<Canvas> {
  loading ??= import("./client-canvas.tsx")
    .then((reference) => loadClientModule(reference))
    .catch((error: unknown) => {
      // A fix gets another try.
      loading = undefined;
      // The plugin's message names its options, which the framework sets.
      throw new Error(
        `@storybook/nextjs-vite-rsc could not load its canvas in the browser layer, which ` +
          `renders the stories of files with "use client". This is a bug of the framework: ` +
          `please report it, with the error it caused.`,
        { cause: error },
      );
    });
  return loading;
}

// The preview file, as the browser layer evaluates it now.
async function browserPreview({ loadPreview }: Canvas): Promise<object> {
  try {
    return await loadPreview();
  } catch (error) {
    throw new Error(
      `${previewFile ?? "The preview file"} is evaluated in the browser layer too, for the ` +
        `stories of files with "use client", and it failed there. A module without a ` +
        `directive is evaluated in both layers, as in Next, so what it imports has to load ` +
        `in a browser: move setup that is only for the server into a decorator of the ` +
        `server stories.`,
      { cause: error },
    );
  }
}

/**
 * The exports of a story file: for a file with `"use client"` the ones of the
 * browser layer, the same object for the same module, as Storybook's store
 * needs. Storybook's `experimental_loadStoryFile`.
 */
export async function loadStoryFile(
  path: string,
  importFn: ModuleImportFn,
): Promise<ModuleExports> {
  const imported = await importFn(path);
  const references = referencesOf(imported);
  const exports = await loadClientModule(references);
  if (exports === references) return imported;
  // Storybook loads the file for every story it prepares. A module that
  // loaded before keeps its twins, which its components were evaluated with.
  if (loaded.has(exports)) return exports;
  const canvas = await loadCanvas();
  const client: ClientStory = { canvas, twins: previewDecoratorsOf(await browserPreview(canvas)) };
  for (const value of Object.values(exports)) {
    if (typeof value === "object" ? value !== null : typeof value === "function") {
      clientStories.set(value, client);
    }
  }
  loaded.add(exports);
  return exports;
}

// Storybook's CSF plugin adds the order of the stories to a story file,
// `__namedExportsOrder`, after Vite RSC made it a client reference module: a
// value of its own, which no reference module has. The module without it,
// the same object for the same module.
const withoutOrder = new WeakMap<ModuleExports, ModuleExports>();
function referencesOf(module: ModuleExports): ModuleExports {
  let references = withoutOrder.get(module);
  if (!references) {
    const { __namedExportsOrder, ...rest } = module;
    withoutOrder.set(module, (references = rest));
  }
  return references;
}

// The decorators of an evaluation of the preview file in the browser layer,
// wrapped for Storybook's hooks, as the preview wraps each decorator, with
// the original as `originalFn`. Storybook has no export for that wrapper but
// `applyHooks()`.
const decoratorsOf = new WeakMap<object, Decorator[]>();
function previewDecoratorsOf(preview: object): Decorator[] {
  let decorators = decoratorsOf.get(preview);
  if (!decorators) {
    let wrapped: Decorator[] = [];
    applyHooks<NextjsRscRenderer>((_, hooked) => {
      wrapped = hooked;
      return () => undefined;
    })(() => undefined, composeConfigs([preview]).decorators as Decorator[]);
    decoratorsOf.set(preview, (decorators = wrapped));
  }
  return decorators;
}

/**
 * A client story, all of the browser layer: the story, with the browser
 * layer's `render` of `@storybook/react` for one without its own, and its
 * decorators. Those of the story and its meta, from the file, those of
 * Storybook and its addons, which are one instance for both layers, and the
 * preview file's as the browser layer evaluated it, in the place of the rsc
 * layer's: the run of them inside the addons' ones, as Storybook orders them.
 */
export function decorateClientStory(
  storyFn: LegacyStoryFn<NextjsRscRenderer>,
  decorators: Decorator[],
  { canvas, twins }: ClientStory,
): LegacyStoryFn<NextjsRscRenderer> {
  const ofRsc = (composeConfigs([preview]).decorators ?? []) as unknown[];
  const at = decorators.findIndex((_, start) =>
    ofRsc.every((decorator, index) => decorators[start + index]?.originalFn === decorator),
  );
  if (ofRsc.length > 0 && at < 0) warnWithoutPreview();
  const own =
    ofRsc.length > 0 && at >= 0
      ? [...decorators.slice(0, at), ...twins, ...decorators.slice(at + ofRsc.length)]
      : [...decorators, ...twins];
  const story: LegacyStoryFn<NextjsRscRenderer> = (context) =>
    context.originalStoryFn === render ? canvas.render(context.args, context) : storyFn(context);
  return canvas.applyDecorators(story, own) as LegacyStoryFn<NextjsRscRenderer>;
}

let warned = false;
// Storybook decorates every story with the preview file's decorators: one
// without them has its decorators from elsewhere, which the framework does
// not know.
function warnWithoutPreview() {
  if (warned) return;
  warned = true;
  console.warn(
    `@storybook/nextjs-vite-rsc: a client story has decorators without those of ` +
      `${previewFile ?? "the preview file"}, so it gets the browser layer's after its own.`,
  );
}

/** Renders a client story with `@storybook/react`'s renderer of the browser layer. */
export async function renderClientStory(
  context: RenderContext<NextjsRscRenderer>,
  canvasElement: HTMLElement,
  { canvas }: ClientStory,
) {
  const { storyContext } = context;
  if (isPageStory(storyContext)) {
    throw new Error(
      `The story ${storyContext.id} has no component and no render, which makes it a page of ` +
        `the app, and its file has "use client": a page renders on the server. Move it to a ` +
        `story file without the directive, or give it a component.`,
    );
  }
  return canvas.renderToCanvas(context, canvasElement);
}
