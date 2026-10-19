import type {
  DecoratorFunction,
  LegacyStoryFn,
  ModuleExports,
  ModuleImportFn,
  RenderContext,
} from "storybook/internal/types";
import { defaultDecorateStory } from "storybook/preview-api";
import { loadClientModule } from "vitest-plugin-rsc/nextjs/testing-library";
import type { NextjsRscRenderer } from "./index.ts";
import { isPageStory, serverStoryFiles } from "./server-story.ts";

// A story file with `"use client"` is a client boundary, as in React: its
// stories are client stories, which render in the browser layer, as React
// renders a Client Component, without Next's app or router. The preview
// imports the file in the rsc layer, where it is a client reference module;
// the plugin evaluated the file itself in the browser layer, and
// `loadClientModule()` gives those exports. The canvas renders a client
// story with the browser layer's React DOM (client-canvas.tsx).
//
// The preview file is server code, evaluated once, in the rsc layer, as a
// layout of Next is. Its decorators decorate a client story from there: the
// browser layer's React calls them as it renders the story, and renders the
// elements they return, a client reference among them, like a provider of
// a file with `"use client"`, as its export of the browser layer (the
// plugin's). So a decorator of the preview file is a synchronous function
// that returns elements, and what has state or context is a component of a
// file with `"use client"` that it renders.

type Canvas = typeof import("./client-canvas.tsx");
// A decorator as the preview has it, wrapped for Storybook's hooks.
type Decorator = DecoratorFunction<NextjsRscRenderer> & { originalFn?: unknown };

// The exports of the story files with `"use client"`, by identity: a story
// is a client story when its export is one of them.
const clientStories = new WeakSet<object>();
// The same files, by the importPath that Storybook loaded them with, which is
// the `parameters.fileName` of their stories: a story that is prepared has
// no export of its own yet (docs.ts).
const clientFiles = new Set<string>();

/** Whether the story file of `parameters.fileName` has `"use client"`, as it loaded last. */
export const isClientStoryFile = (importPath: unknown): boolean =>
  typeof importPath === "string" && clientFiles.has(importPath);

/** Whether a story is of a file with `"use client"`. */
export const isClientStory = (context: object): boolean =>
  clientStories.has((context as { moduleExport?: object }).moduleExport ?? {});

let loading: Promise<Canvas> | undefined;

/** The canvas, once, before the first client story is prepared or docs page renders. */
export function loadCanvas(): Promise<Canvas> {
  loading ??= import("./client-canvas.tsx")
    .then((reference) => loadClientModule(reference))
    .catch((error: unknown) => {
      // A fix gets another try.
      loading = undefined;
      // The plugin's message names its options, which the framework sets.
      throw new Error(
        `@storybook/nextjs-vite-rsc could not load its canvas in the browser layer, which ` +
          `renders the stories of files with "use client" and the docs pages. This is a bug of ` +
          `the framework: please report it, with the error it caused.`,
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
  if (exports === references) {
    clientFiles.delete(path);
    serverStoryFiles.set(path, imported);
    return imported;
  }
  serverStoryFiles.delete(path);
  clientFiles.add(path);
  for (const value of Object.values(exports)) {
    if (typeof value === "object" ? value !== null : typeof value === "function") {
      clientStories.add(value);
    }
  }
  await loadCanvas();
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

/**
 * A story with its decorators, as Storybook decorates it, each held to what
 * a decorator is: a function that returns elements, synchronously for a
 * client story, which the browser layer's React calls it for as it renders.
 */
export function decorateStory(
  storyFn: LegacyStoryFn<NextjsRscRenderer>,
  decorators: Decorator[],
): LegacyStoryFn<NextjsRscRenderer> {
  return defaultDecorateStory(storyFn, decorators.map(checked));
}

function checked(decorator: Decorator): Decorator {
  return (story, context) => {
    if (isClientReference(decorator.originalFn)) throw decoratorError("reference", context.id);
    if (!isClientStory(context)) return decorator(story, context);
    let result;
    try {
      result = decorator(story, context);
    } catch (error) {
      throw isServerHookError(error) ? decoratorError("hook", context.id, error) : error;
    }
    if (isThenable(result)) {
      // A rejection that nothing waits for would be another error of the story.
      result.then(undefined, () => {});
      throw decoratorError("promise", context.id);
    }
    return result;
  };
}

const isClientReference = (value: unknown): boolean =>
  typeof value === "function" &&
  (value as { $$typeof?: symbol }).$$typeof === Symbol.for("react.client.reference");

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === "function";

// A hook of React in server code, like a decorator of the preview file: one
// that the rsc layer's React, the server's, does not have, like `useState`,
// or one that it has, like `useMemo`, called while no React of that layer
// renders. Not a hook of a client story's own decorator, which the browser
// layer's React calls as it renders, nor one of Storybook's.
const isServerHookError = (error: unknown): boolean =>
  error instanceof TypeError &&
  /\buse[A-Z]?\w*\)? is not a function|\(reading 'use[A-Z]?\w*'\)/.test(error.message);

// What a decorator did that it cannot, and what to do instead.
const misuses = {
  promise: (id: string) => [
    `A decorator of the client story ${id} returned a promise.`,
    `An async decorator, or one that reads the request, like cookies(), is for a server ` +
      `story, which renders in a request: put it in the meta of a story file without ` +
      `"use client".`,
  ],
  hook: (id: string) => [
    `A decorator of the client story ${id} called a hook of React, in server code.`,
    `Call the hook in such a component, and render that in the decorator: ` +
      `(Story) => <Provider><Story /></Provider>. Storybook's hooks, like useArgs() and ` +
      `useGlobals(), work in a decorator.`,
  ],
  reference: (id: string) => [
    `A decorator of the story ${id} is a component of a file with "use client", which ` +
      `server code, like the preview file, has as a reference.`,
    `Render it in a decorator: (Story) => <Provider><Story /></Provider>.`,
  ],
};

/**
 * A decorator that did what it cannot, with the rule. The decorators of the
 * preview file are server code, evaluated once, on the server, also for a
 * client story.
 */
export function decoratorError(misuse: keyof typeof misuses, id: string, cause?: unknown): Error {
  const [what, instead] = misuses[misuse](id);
  const error = new Error(
    `${what} A decorator is a synchronous function that returns elements, which the browser ` +
      `renders for a client story. Those of the preview file are server code: what has ` +
      `state or context is a component of a file with "use client" that a decorator ` +
      `renders. ${instead}`,
    { cause },
  );
  error.name = "DecoratorError";
  return error;
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
  const canvas = await loadCanvas();
  return canvas.renderToCanvas(context, canvasElement);
}
