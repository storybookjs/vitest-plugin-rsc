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

// Next to this file, in `src` or `dist`.
const ownFile = (name: string) =>
  normalizePath(
    fileURLToPath(new URL(`./${name}${path.extname(import.meta.url)}`, import.meta.url)),
  );

// What the store gets for each file: load.ts.
export const experimental_moduleLoader = ownFile("load");

// The React of each layer: by its name, which each environment resolves
// with its own conditions, `react-server` in the rsc layer.
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

type Program = { body: unknown[] };
const recmaUseClient = () => (program: Program) => {
  program.body.unshift({
    type: "ExpressionStatement",
    expression: { type: "Literal", value: "use client" },
    directive: "use client",
  });
};

// Where Storybook names the story files from, from the root of the project,
// for the stylesheets of a story file (server-renderer.ts).
export const env: PresetProperty<"env"> = async (existing, options) => ({
  ...existing,
  STORYBOOK_NEXTJS_RSC_WORKING_DIR: path.posix.relative(
    normalizePath(path.resolve(options.configDir, "..")),
    normalizePath(process.cwd()),
  ),
});

// The directory of the framework's own files, in `src` or `dist`. A RegExp:
// the path of a package can have characters that a glob reads as syntax.
const frameworkDir = normalizePath(fileURLToPath(new URL(".", import.meta.url)));
const frameworkFiles = new RegExp(`^${frameworkDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);

export const viteFinal: ViteFinal = async (config, options) => {
  if (
    await hasVitePlugins(
      config.plugins ?? [],
      vitestPluginRSC().map((plugin) => plugin.name),
    )
  ) {
    throw pluginTwice();
  }
  const { build, browserModules } =
    (await options.presets.apply<FrameworkOptions | undefined>("frameworkOptions")) ?? {};
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      vitestPluginRSC(),
      vitestPluginNext({ build, browserModules, host: await hostOf(options) }),
    ],
  };
};

// Storybook is the host: the story files, `.storybook/` and the framework
// are its files. Storybook's React-free preview runtime and the addons that
// the presets register are its packages, one instance in the preview and in
// the browser layer, where a client story's `fn()` is the spy the Actions
// panel shows. What is bound to a React, like `storybook/theming`, the
// renderer and the docs blocks, stays the layer's own.
async function hostOf(options: Options) {
  const root = path.resolve(options.configDir, "..");
  const stories = normalizeStories(await options.presets.apply("stories", [], options), {
    configDir: options.configDir,
    workingDir: process.cwd(),
  });
  const annotations = await options.presets.apply<PreviewAnnotation[]>("previewAnnotations", []);
  return {
    files: [
      ...stories.map(({ directory, files }) =>
        path.posix.join(normalizePath(path.relative(root, path.resolve(directory))), files),
      ),
      path.posix.join(normalizePath(path.relative(root, options.configDir)), "**"),
      frameworkFiles,
    ],
    packages: [
      ...Object.keys(globalsNameReferenceMap),
      "storybook/internal/csf",
      "storybook/internal/instrumenter",
      "storybook/open-service",
      ...new Set(annotations.flatMap(addonOf)),
    ],
  };
}

// The package of an addon, by the preview entry that a preset registers:
// `{ bare, absolute }` for a file in `node_modules`, whose `bare` is its
// path there, like `@storybook/addon-a11y/dist/preview.js`. The package is
// every module of it, so the root that a preview imports, `import a11y from
// "@storybook/addon-a11y"`, and the entry that it imports are one instance,
// whose listeners of the channel are there once. Not a package that depends
// on React: its preview may render with React, like addon-docs's docs page
// or the renderer's stories, and that React is the layer's own. Such an
// addon is evaluated in each layer that imports it.
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
