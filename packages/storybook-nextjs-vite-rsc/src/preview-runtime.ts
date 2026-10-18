import { createRequire } from "node:module";
import path from "node:path";
import { normalizePath, type Plugin } from "vite";

// Storybook's preview runtime: its `setup()` sets the globals that
// Storybook's Vite builder turns an import of `storybook/test`, and of the
// other packages of the preview, into. The builder imports the runtime by its
// path, and calls `setup()`, ahead of such an import in every module it
// rewrites, also in a story file with `"use client"`, which the browser layer
// evaluates. There the module runner would evaluate a second runtime, which
// sets the globals to its own modules: spies of a `storybook/test` that the
// Actions panel does not listen to. The page has set the globals, with the
// preview, before any story file loads: in the browser layer the runtime is
// a `setup()` that does nothing.

const id = "\0storybook-nextjs-vite-rsc/preview-runtime";

export function previewRuntimePlugin(): Plugin {
  // Where the builder has it from: the `storybook` that it resolves.
  const builder = createRequire(import.meta.resolve("@storybook/builder-vite"));
  const file = normalizePath(
    path.join(path.dirname(builder.resolve("storybook/package.json")), "dist/preview/runtime.js"),
  );
  return {
    name: "storybook-nextjs-vite-rsc:preview-runtime",
    enforce: "pre",
    // Not the preview, the rsc layer, which is Vite's `client` environment.
    applyToEnvironment: (environment) => environment.name !== "client",
    resolveId: (source) => (normalizePath(source) === file ? id : undefined),
    load: (loaded) => (loaded === id ? "export function setup() {}" : undefined),
  };
}
