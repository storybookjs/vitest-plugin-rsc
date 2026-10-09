import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ViteFinal } from "@storybook/builder-vite";
import {
  getAddonNames,
  getFrameworkName,
  loadMainConfig,
  loadPreviewOrConfigFile,
  normalizeStories,
} from "storybook/internal/common";
import type { PresetProperty } from "storybook/internal/types";
import type { FrameworkOptions } from "./types.ts";
import type { Plugin } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { layerEnvironments, vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";

// The preset: how Storybook builds the preview with vitest-plugin-rsc. The
// framework is little more than the plugin, with Storybook as its host: the
// preview is the rsc layer, as a test file is under Vitest. A story is what a
// test renders, and `renderToCanvas()` is `renderServer()`: see render.tsx.

const frameworkDir = path.dirname(fileURLToPath(new URL(".", import.meta.url)));

export const core: PresetProperty<"core"> = {
  builder: import.meta.resolve("@storybook/builder-vite"),
};

// `storybook build` has to build with Vite's app builder, which builds the
// three layers of the app. `@storybook/builder-vite` calls Vite's `build()`,
// which builds one environment. storybookjs/storybook#36690 adds a feature
// flag to it, off by default, that builds as `vite build` does:
//
//   if (options.features?.viteAppBuilder) {
//     await (await createBuilder(finalConfig, null)).buildApp();
//   } else {
//     await viteBuild(finalConfig);
//   }
//
// Until a release has it, this repository patches `@storybook/builder-vite`
// with that change (patches/@storybook__builder-vite@10.6.1.patch). The
// framework turns the flag on, and types.ts types it. With `null`, a config
// without a `builder` still builds one environment: a config whose plugins
// ask for the app builder, like this plugin, builds all of them.
export const features: PresetProperty<"features"> = async (existing) => ({
  ...existing,
  viteAppBuilder: true,
});

export const previewAnnotations: PresetProperty<"previewAnnotations"> = async (input = []) => [
  ...input,
  fileURLToPath(import.meta.resolve("@storybook/nextjs-vite-rsc/entry-preview")),
];

// Storybook's own plugins are for its preview, which is the `client`
// environment: the rsc layer. The other two layers are the app's, and the
// mocker runtime or the globals of the preview do not go in them. The plugin
// keeps the plugins of the host there: see `host.plugins`. But for the one
// that compiles an MDX file: a docs page is code of the browser layer too,
// see docs/addon-docs.ts.
const storybookPlugins = [/^storybook:(?!mdx-plugin$)/, /^vite:storybook-/];

// `@storybook/addon-docs` aliases `react` and `react-dom` to the project's,
// for every module of every environment, so that its docs pages and the
// stories have one React. Here each layer of the app has the React that Next
// gives it, which such an alias would take away. So the aliases go: the docs
// page has the React of the browser layer, see docs/addon-docs.ts.
const reactAliases = new Set(["react", "react-dom", "react-dom/server"]);
const withoutReactAliases: Plugin = {
  name: "nextjs-vite-rsc:without-react-aliases",
  config: {
    order: "post",
    handler(config) {
      const alias = config.resolve?.alias;
      if (Array.isArray(alias)) {
        config.resolve!.alias = alias.filter(
          ({ find }: { find: unknown }) => typeof find !== "string" || !reactAliases.has(find),
        );
      } else if (alias) {
        for (const name of reactAliases) delete (alias as Record<string, string>)[name];
      }
    },
  },
};

// `@storybook/addon-docs` also has the preview pre-bundle the docs page, with
// React DOM. The preview is the rsc layer, which never loads them: the
// browser layer pre-bundles the docs page itself.
const docsDependencies = /^(@storybook\/addon-docs|react-dom\/client)([\s/]|$)/;
const withoutDocsDependencies: Plugin = {
  name: "nextjs-vite-rsc:without-docs-dependencies",
  config: {
    order: "post",
    handler(config) {
      const include = config.optimizeDeps?.include;
      if (include)
        config.optimizeDeps!.include = include.filter((name) => !docsDependencies.test(name));
    },
  },
};

// The modules of Storybook that render with React DOM: the docs page, and
// the parts of Storybook it renders with. The browser layer loads them
// itself, with its own React, and not from the preview, which is the rsc
// layer: see docs/addon-docs.ts.
const docsPackages = [
  "@storybook/addon-docs",
  "storybook/theming",
  "storybook/internal/theming",
  "storybook/internal/components",
  "storybook/manager-api",
  "storybook/internal/manager-api",
  "storybook/internal/router",
];

// In the preview, `@storybook/addon-docs` and its preview annotations are
// docs/addon-docs.ts: the docs page renders in the browser layer.
function docsInTheBrowserLayer(root: string): Plugin {
  const project = createRequire(path.join(root, "package.json"));
  const files = new Set(
    ["@storybook/addon-docs", "@storybook/addon-docs/preview"].flatMap((name) => {
      try {
        return [normalize(project.resolve(name))];
      } catch {
        return [];
      }
    }),
  );
  const standIn = fileURLToPath(new URL("./docs/addon-docs.ts", import.meta.url));
  return {
    name: "nextjs-vite-rsc:docs-in-the-browser-layer",
    enforce: "pre",
    applyToEnvironment: (environment) => environment.name === layerEnvironments.rsc,
    resolveId(source) {
      const isDocs =
        source === "@storybook/addon-docs" ||
        source === "@storybook/addon-docs/preview" ||
        files.has(normalize(source));
      return isDocs ? standIn : undefined;
    },
  };
}

// The packages of Storybook that run in the preview: its own, the framework,
// and the addons of the project, which are not all of Storybook's scope. What
// they depend on is the host's too, but for the plugin: see `host.packages`.
async function storybookPackages(options: Parameters<ViteFinal>[1]): Promise<string[]> {
  const main = await loadMainConfig({ configDir: options.configDir });
  const names = [await getFrameworkName(options), ...getAddonNames(main)].map((name) =>
    // A name can be the path of a package, as `getAbsolutePath()` gives it.
    normalize(name).replace(/^.*\/node_modules\//, ""),
  );
  // Not a local addon, which is a file of the project.
  const packages = names.flatMap((name) => /^(@[^/]+\/)?[^./][^/]*/.exec(name)?.[0] ?? []);
  return ["storybook", ...new Set(packages)];
}

const normalize = (name: string) => name.split(path.sep).join("/");

// What the preview needs to know of the project, for the files that render a
// story: see render.tsx. The files that render around every story,
// `.storybook/preview`, whose decorators are the project's, by their path
// from the root. And where Storybook names a story file from, its working
// directory, which can be another one than the root, like the root of a
// monorepo: the two, from the directory both are in.
const projectId = "virtual:@storybook/nextjs-vite-rsc/project";
function project(configDir: string): Plugin {
  let code = "";
  return {
    name: "nextjs-vite-rsc:project",
    configResolved(config) {
      const preview = loadPreviewOrConfigFile({ configDir });
      const previewFiles = preview ? [`./${normalize(path.relative(config.root, preview))}`] : [];
      const toWorkingDir = normalize(path.relative(config.root, process.cwd()))
        .split("/")
        .filter(Boolean);
      const up = toWorkingDir.filter((part) => part === "..").length;
      const root = normalize(config.root).split("/").filter(Boolean);
      const workingDir = { root: root.slice(root.length - up), cwd: toWorkingDir.slice(up) };
      code =
        `export const previewFiles = ${JSON.stringify(previewFiles)};\n` +
        `export const workingDir = ${JSON.stringify(workingDir)};\n`;
    },
    resolveId: (source) => (source === projectId ? `\0${projectId}` : undefined),
    load: (id) => (id === `\0${projectId}` ? code : undefined),
  };
}

// The MDX files of the stories: docs pages, which are files of a UI of the
// host, see docs/addon-docs.ts. Every MDX file in the directory of an entry
// of `stories` whose files can be MDX.
async function docsFiles(options: Parameters<ViteFinal>[1]): Promise<string[]> {
  const stories = await options.presets.apply("stories", [], options);
  const workingDir = process.cwd();
  return normalizeStories(stories, { configDir: options.configDir, workingDir }).flatMap(
    ({ directory, files }) =>
      files.includes("mdx")
        ? [path.posix.join(normalize(path.resolve(workingDir, directory)), "**/*.mdx")]
        : [],
  );
}

// The file of the framework that creates the renderer of the docs pages.
const docsRendererFile = fileURLToPath(new URL("./docs/docs-renderer.tsx", import.meta.url));

export const viteFinal: ViteFinal = async (config, options) => {
  const root = config.root ?? process.cwd();
  const packages = await storybookPackages(options);
  const docs = packages.includes("@storybook/addon-docs");
  const mdxFiles = docs ? await docsFiles(options) : [];
  return {
    ...config,
    optimizeDeps: {
      ...config.optimizeDeps,
      // The framework is a module of the host, not a dependency to pre-bundle.
      // In CSF Next every story file imports `.storybook/preview`, which
      // imports the framework, so the dependency scan finds it. Pre-bundled, its
      // file with `"use client"` would be a chunk of the bundle and no longer a
      // module of the browser layer (storybookjs/storybook#32650,
      // vitejs/vite-plugin-react#906).
      exclude: [...(config.optimizeDeps?.exclude ?? []), "@storybook/nextjs-vite-rsc"],
    },
    environments: {
      ...config.environments,
      // What the docs page imports, before a docs page asks for it.
      ...(docs && {
        [layerEnvironments.browser]: {
          optimizeDeps: {
            include: [
              "@storybook/addon-docs",
              "@storybook/addon-docs/blocks",
              "@storybook/addon-docs > @mdx-js/react",
            ],
          },
        },
      }),
    },
    plugins: [
      ...(config.plugins ?? []),
      withoutReactAliases,
      ...(docs ? [docsInTheBrowserLayer(root), withoutDocsDependencies] : []),
      project(options.configDir),
      vitestPluginRSC(),
      vitestPluginNext({
        browserModules: ((await options.presets.apply("frameworkOptions")) as FrameworkOptions)
          ?.browserModules,
        host: {
          // What a test file and a setup file are to Vitest.
          files: ["**/*.stories.*", `${options.configDir}/**`, `${frameworkDir}/**`],
          packages,
          ui: { packages: docsPackages, files: [...mdxFiles, docsRendererFile] },
          plugins: storybookPlugins,
        },
      }),
    ],
  };
};
