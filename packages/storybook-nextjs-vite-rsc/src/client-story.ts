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
import { isPageStory } from "./server-story.tsx";

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

// The exports of the story files with `"use client"`, by identity: a story
// is a client story when its export is one of them. With the decorators of
// the preview file as the browser layer evaluated it when the story file
// loaded, where the story file's components import the same modules of the
// app.
const clientExports = new WeakMap<object, Decorator[]>();

/** Whether a story is one of a file with `"use client"`. */
export const isClientStory = (context: object): boolean =>
  clientExports.has(moduleExportOf(context));

// The context of a story has its export, which Storybook's types leave out.
const moduleExportOf = (context: object): object =>
  (context as { moduleExport?: object }).moduleExport ?? {};

let canvas: Canvas | undefined;
let loading: Promise<Canvas> | undefined;

// The canvas, once, before the first client story is prepared. The preview
// file is evaluated with it in the browser layer.
function loadCanvas(): Promise<Canvas> {
  loading ??= import("./client-canvas.tsx")
    .then((reference) => loadClientModule(reference))
    .then((loaded) => (canvas = loaded))
    .catch((error: unknown) => {
      // A fix of the preview file gets another try.
      loading = undefined;
      throw new Error(
        `${previewFile ?? "The preview file"} is evaluated in the browser layer too, for the ` +
          `stories of files with "use client", and it failed there. A module without a ` +
          `directive is evaluated in both layers, as in Next, so what it imports has to load ` +
          `in a browser: move setup that is only for the server into a decorator of the ` +
          `server stories.`,
        { cause: error },
      );
    });
  return loading;
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
  const decorators = previewDecoratorsOf(await (await loadCanvas()).loadPreview());
  for (const value of Object.values(exports)) {
    if (typeof value === "object" ? value !== null : typeof value === "function") {
      clientExports.set(value, decorators);
    }
  }
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

// The decorators of an evaluation of the preview file, wrapped for
// Storybook's hooks, as the preview gets each decorator, with the original as
// `originalFn`. Storybook has no export for that wrapper but `applyHooks()`.
const decoratorsOf = new WeakMap<object, Decorator[]>();
function previewDecoratorsOf(preview: object): Decorator[] {
  let decorators = decoratorsOf.get(preview);
  if (!decorators) {
    applyHooks<NextjsRscRenderer>((_, hooked) => {
      decorators = hooked;
      return () => undefined;
    })(() => undefined, composeConfigs([preview]).decorators as Decorator[]);
    decoratorsOf.set(preview, decorators!);
  }
  return decorators!;
}

/**
 * The decorators of a client story, all of the browser layer: the story's and
 * its meta's, from the file, those of Storybook and its addons, which are
 * one instance for both layers, and the preview file's as the browser layer
 * evaluated it, around them, in place of the rsc layer's.
 */
export function decorateClientStory(
  storyFn: LegacyStoryFn<NextjsRscRenderer>,
  decorators: Decorator[],
  context: object,
): LegacyStoryFn<NextjsRscRenderer> {
  const ofRsc = new Set(previewDecoratorsOf(preview).map((decorator) => decorator.originalFn));
  const own = decorators.filter((decorator) => !ofRsc.has(decorator.originalFn));
  return canvas!.applyDecorators(
    storyFn as never,
    [...own, ...clientExports.get(moduleExportOf(context))!] as never,
  ) as LegacyStoryFn<NextjsRscRenderer>;
}

/** Renders a client story with `@storybook/react`'s renderer of the browser layer. */
export async function renderClientStory(
  context: RenderContext<NextjsRscRenderer>,
  canvasElement: HTMLElement,
) {
  const { storyContext } = context;
  if (isPageStory(storyContext)) {
    throw new Error(
      `The story ${storyContext.id} has no component and no render, which makes it a page of ` +
        `the app, and its file has "use client": a page renders on the server. Move it to a ` +
        `story file without the directive, or give it a component.`,
    );
  }
  return canvas!.renderToCanvas(context as never, canvasElement);
}
