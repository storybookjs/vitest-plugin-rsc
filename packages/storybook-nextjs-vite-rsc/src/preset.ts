import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasVitePlugins, type ViteFinal } from "@storybook/builder-vite";
import {
  getAddonNames,
  loadMainConfig,
  loadPreviewOrConfigFile,
  normalizeStories,
} from "storybook/internal/common";
import type { Options, PresetProperty, PreviewAnnotation } from "storybook/internal/types";
import { normalizePath } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";
import type { FrameworkOptions } from "./index.ts";
import { previewRuntimePlugin } from "./preview-runtime.ts";
import { projectPlugin } from "./project.ts";

// The preset: Storybook's Vite builder and React renderer, with
// vitest-plugin-rsc in the Vite config. Storybook is a host of the plugin, as
// Vitest is: the preview is the rsc layer, a story file what a test file is.

export const core: PresetProperty<"core"> = {
  builder: import.meta.resolve("@storybook/builder-vite"),
  renderer: import.meta.resolve("@storybook/react/preset"),
};

// `storybook build` builds every layer of the app, with Vite's app builder.
export const features: PresetProperty<"features"> = async (existing) => ({
  ...existing,
  viteAppBuilder: true,
});

// `@storybook/react`'s annotations but those that render or decorate: they
// render with `react-dom` and extend `React.Component`, which the rsc layer's
// React, the server's, does not have. The framework's preview renders, after
// the renderer's annotations and before the addons' and the project's, and a
// client story renders with `@storybook/react`'s renderer from the browser
// layer (client-canvas.tsx).
const renderingAnnotations = new Set(
  ["entry-preview", "entry-preview-docs", "entry-preview-rsc"].map((entry) =>
    fileURLToPath(import.meta.resolve(`@storybook/react/${entry}`)),
  ),
);

export const previewAnnotations: PresetProperty<"previewAnnotations"> = async (input = []) => [
  // The one of an addon in `node_modules` is `{ bare, absolute }`, unlike its type.
  ...input.filter((entry: PreviewAnnotation) => !renderingAnnotations.has(absoluteOf(entry))),
  // Next to this file, in `src` or `dist`: Storybook loads the preset of a
  // framework by its build, which the rest of the framework has to match.
  fileURLToPath(new URL(`./preview${path.extname(import.meta.url)}`, import.meta.url)),
];

const absoluteOf = (entry: PreviewAnnotation) =>
  typeof entry === "string" ? entry : entry.absolute;

// The directory of the framework's own files, in `src` or `dist`: files of
// the host, and its canvas has `"use client"`. A RegExp: the path of a
// package can have characters that a glob reads as syntax.
const frameworkDir = normalizePath(fileURLToPath(new URL(".", import.meta.url)));
const frameworkFiles = new RegExp(`^${frameworkDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

export const viteFinal: ViteFinal = async (config, options) => {
  const root = path.resolve(config.root ?? path.join(options.configDir, ".."));
  // The names of the plugin's own plugins.
  const names = vitestPluginRSC().map((plugin) => plugin.name);
  if (await hasVitePlugins(config.plugins ?? [], names)) {
    throw new Error(
      "@storybook/nextjs-vite-rsc adds vitest-plugin-rsc to the Vite config itself, and the " +
        "Vite config of the project has it already. Give Storybook a Vite config without it: " +
        "`framework: { name: '@storybook/nextjs-vite-rsc', options: { builder: { " +
        "viteConfigPath: '.storybook/vite.config.ts' } } }` in .storybook/main.ts.",
    );
  }
  const { build, browserModules } =
    (await options.presets.apply<FrameworkOptions | undefined>("frameworkOptions")) ?? {};
  return {
    ...config,
    optimizeDeps: {
      ...config.optimizeDeps,
      // Pre-bundled, the canvas would be a chunk of a bundle, not a file
      // with `"use client"`.
      exclude: [...(config.optimizeDeps?.exclude ?? []), "@storybook/nextjs-vite-rsc"],
    },
    plugins: [
      ...(config.plugins ?? []),
      vitestPluginRSC(),
      vitestPluginNext({
        build,
        browserModules,
        host: {
          files: [
            ...(await storyFiles(root, options)),
            path.posix.join(normalizePath(path.relative(root, options.configDir)), "**"),
            frameworkFiles,
          ],
          packages: await hostPackages(options),
        },
      }),
      projectPlugin({
        root,
        workingDir: process.cwd(),
        previewFile: loadPreviewOrConfigFile({ configDir: options.configDir }),
      }),
      previewRuntimePlugin(),
    ],
  };
};

// The `stories` of `.storybook/main.ts` as globs from the root.
async function storyFiles(root: string, options: Options): Promise<string[]> {
  const stories = await options.presets.apply("stories", [], options);
  const workingDir = process.cwd();
  return normalizeStories(stories, { configDir: options.configDir, workingDir }).map(
    ({ directory, files }) =>
      path.posix.join(
        normalizePath(path.relative(root, path.resolve(workingDir, directory))),
        files,
      ),
  );
}

// `storybook`, whose `storybook/test` has the spies that `play` and the
// Actions panel read, and the addons of `.storybook/main.ts`: one instance
// for the preview and the browser layer. Not `@storybook/react`: the canvas
// of a client story has its own, with the browser layer's React.
async function hostPackages(options: Options): Promise<string[]> {
  const main = await loadMainConfig({ configDir: options.configDir });
  // A local addon is a file of the project, not a package.
  const addons = getAddonNames(main).flatMap(
    (name) => /^(@[^/]+\/)?[^./][^/]*/.exec(name)?.[0] ?? [],
  );
  return ["storybook", ...new Set(addons)];
}
