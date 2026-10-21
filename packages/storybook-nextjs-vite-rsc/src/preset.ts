import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasVitePlugins, type ViteFinal } from "@storybook/builder-vite";
import { normalizeStories } from "storybook/internal/common";
import { globalsNameReferenceMap } from "storybook/internal/preview/globals";
import type { Options, PresetProperty, PreviewAnnotation } from "storybook/internal/types";
import { normalizePath } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import { pluginTwice } from "./errors.ts";
import type { FrameworkOptions } from "./index.ts";

// The preset: Storybook's Vite builder and React renderer, with
// vitest-plugin-rsc, whose host Storybook is, as Vitest is: the preview is
// the rsc layer, a story file what a test file is.

export const core: PresetProperty<"core"> = {
  builder: import.meta.resolve("@storybook/builder-vite"),
  renderer: import.meta.resolve("@storybook/react/preset"),
};

// `storybook build` builds every layer of the app, with Vite's app builder.
export const features: PresetProperty<"features"> = async (existing) => ({
  ...existing,
  viteAppBuilder: true,
});

// What the store gets for each file: load.ts, next to this file.
export const experimental_moduleLoader = normalizePath(
  fileURLToPath(new URL(`./load${path.extname(import.meta.url)}`, import.meta.url)),
);

// preview.ts, next to this file, first.
export const previewAnnotations: PresetProperty<"previewAnnotations"> = async (entries = []) => [
  normalizePath(
    fileURLToPath(new URL(`./preview${path.extname(import.meta.url)}`, import.meta.url)),
  ),
  ...entries,
];

// Each layer's React by its name, which each environment resolves with its
// own conditions: `react-server` in the rsc layer.
export const resolvedReact = async (existing: object) => ({
  ...existing,
  react: "react",
  reactDom: "react-dom",
});

type MdxLoaderOptions = { mdxCompileOptions?: { recmaPlugins?: unknown[] } };

// An MDX file is a docs page, which renders in the browser: a file with
// "use client", as the compiler writes it first.
export const mdxLoaderOptions = async (options: MdxLoaderOptions) => ({
  ...options,
  mdxCompileOptions: {
    ...options.mdxCompileOptions,
    recmaPlugins: [...(options.mdxCompileOptions?.recmaPlugins ?? []), recmaUseClient],
  },
});

const recmaUseClient = () => (program: { body: unknown[] }) => {
  program.body.unshift({
    type: "ExpressionStatement",
    expression: { type: "Literal", value: "use client" },
    directive: "use client",
  });
};

// The directory of the story files' names, from the root of the project
// (server-renderer.ts).
export const env: PresetProperty<"env"> = async (existing, options) => ({
  ...existing,
  STORYBOOK_NEXTJS_RSC_WORKING_DIR: path.posix.relative(
    normalizePath(path.resolve(options.configDir, "..")),
    normalizePath(process.cwd()),
  ),
});

// The framework's own files, in `src` or `dist`. A RegExp: a glob would read
// characters of the path as syntax.
const frameworkDir = normalizePath(fileURLToPath(new URL(".", import.meta.url)));
const frameworkFiles = new RegExp(`^${frameworkDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

// Storybook's packages of the preview that are no global of its builder,
// one instance in both layers (`hostOf()`).
const runtimePackages = [
  "storybook/internal/csf",
  "storybook/internal/instrumenter",
  "storybook/open-service",
];

// Pre-bundled before the first story. They are imported from modules that
// are pre-bundled themselves, which Vite's scan of the story files does not
// read: it would find them as the first story loads, and reload the preview,
// at the URL of a page that a server story has open. Storybook concatenates
// this list with those of the other presets.
export const optimizeViteDeps = runtimePackages;

export const viteFinal: ViteFinal = async (config, options) => {
  const plugins = config.plugins ?? [];
  if (
    await hasVitePlugins(
      plugins,
      vitestPluginRSC().map(({ name }) => name),
    )
  ) {
    throw pluginTwice();
  }
  const { build, browserModules } =
    (await options.presets.apply<FrameworkOptions | undefined>("frameworkOptions")) ?? {};
  const host = await hostOf(options);
  return {
    ...config,
    plugins: [...plugins, vitestPluginRSC(), vitestPluginNext({ build, browserModules, host })],
  };
};

// Storybook's files: the story files, `.storybook/` and the framework. Its
// packages: the React-free preview runtime and the registered addons, one
// instance in the preview and in the browser layer, where a client story's
// `fn()` is the spy that the Actions panel shows. What is bound to a React,
// like `storybook/theming`, the renderer and the docs blocks, stays each
// layer's own.
async function hostOf(options: Options) {
  const root = path.resolve(options.configDir, "..");
  const stories = normalizeStories(await options.presets.apply("stories", [], options), {
    configDir: options.configDir,
    workingDir: process.cwd(),
  });
  const annotations = await options.presets.apply<PreviewAnnotation[]>("previewAnnotations", []);
  return {
    files: [
      // `./` for the root itself: a pattern that starts with `**` is not
      // relative to the root, it matches a file anywhere.
      ...stories.map(
        ({ directory, files }) =>
          `${normalizePath(path.relative(root, path.resolve(directory))) || "."}/${files}`,
      ),
      path.posix.join(normalizePath(path.relative(root, options.configDir)), "**"),
      frameworkFiles,
    ],
    packages: [
      ...Object.keys(globalsNameReferenceMap),
      ...runtimePackages,
      ...new Set(annotations.flatMap(addonOf)),
    ],
  };
}

// The package of an addon, from the preview entry that a preset registers
// by its path in `node_modules`, like `@storybook/addon-a11y/dist/preview.js`.
// All of the package is one instance, the root that a preview imports and the
// entry alike. Not a package that depends on React, whose preview may render
// with it, like addon-docs's docs page: that one is each layer's own.
function addonOf(entry: PreviewAnnotation): string[] {
  if (typeof entry === "string") return [];
  const bare = normalizePath(entry.bare);
  const absolute = normalizePath(entry.absolute);
  if (!absolute.endsWith(`/${bare}`)) return [];
  const name = /^(?:@[^/]+\/)?[^/]+/.exec(bare)![0];
  const dir = absolute.slice(0, absolute.length - bare.length) + name;
  const { dependencies, peerDependencies } = JSON.parse(
    fs.readFileSync(path.join(dir, "package.json"), "utf8"),
  ) as { dependencies?: object; peerDependencies?: object };
  return "react" in { ...dependencies, ...peerDependencies } ? [] : [name];
}
