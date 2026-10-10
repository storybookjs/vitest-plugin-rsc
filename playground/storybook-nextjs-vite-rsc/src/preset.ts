import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ViteFinal } from "@storybook/builder-vite";
import { getAddonNames, getFrameworkName, loadMainConfig } from "storybook/internal/common";
import type { PresetProperty } from "storybook/internal/types";
import type { Plugin } from "vite";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext } from "vitest-plugin-rsc/nextjs/plugin";

// The framework is little more than the plugin, with Storybook as its host:
// the preview is the rsc layer, as a test file is under Vitest. A story is
// what a test renders, and `renderToCanvas()` is `renderServer()`.

const frameworkDir = path.dirname(fileURLToPath(new URL(".", import.meta.url)));

// `storybook build` has to build with Vite's app builder, which builds the
// three layers of the app. `@storybook/builder-vite` calls Vite's `build()`,
// which builds one environment, so this repository patches that call
// (patches/@storybook__builder-vite@10.6.1.patch). It is the change to
// upstream to Storybook, an import and this line:
//
//   - await viteBuild(finalConfig)
//   + await (await createBuilder(finalConfig, null)).buildApp()
//
// With `null`, a config without a `builder` still builds one environment.
// Two things change for another framework: the `buildApp` hooks of its
// plugins run, and a config whose plugins ask for the app builder with a
// `builder`, like this plugin, gets it and builds all of its environments.
export const core: PresetProperty<"core"> = {
  builder: import.meta.resolve("@storybook/builder-vite"),
};

export const previewAnnotations: PresetProperty<"previewAnnotations"> = async (input = []) => [
  ...input,
  fileURLToPath(import.meta.resolve("@storybook/nextjs-vite-rsc/entry-preview")),
];

// The source of the plugin, inside its own repository: as the playgrounds of
// Vitest take it.
const sourceConditions = process.execArgv
  .concat((process.env.NODE_OPTIONS ?? "").split(/\s+/))
  .some((argument) => argument.includes("vitest-plugin-rsc-source"))
  ? ["vitest-plugin-rsc-source"]
  : [];

// Storybook's own plugins are for its preview, which is the `client`
// environment. The other two layers are the app's: the mocker runtime and the
// code of the preview do not go in them. Storybook adds some of its plugins
// after the `viteFinal` of a framework, so this looks at the resolved list.
const scoped = new WeakSet<Plugin>();
const previewOnly: Plugin = {
  name: "nextjs-vite-rsc:preview-only",
  configResolved(config) {
    for (const plugin of config.plugins) {
      if (!/storybook/i.test(plugin.name) || scoped.has(plugin)) continue;
      scoped.add(plugin);
      const { applyToEnvironment } = plugin;
      (plugin as Plugin).applyToEnvironment = (environment) =>
        environment.name === "client" && (applyToEnvironment?.(environment) ?? true);
    }
  },
};

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

export const viteFinal: ViteFinal = async (config, options) => ({
  ...config,
  resolve: {
    ...config.resolve,
    conditions: [...(config.resolve?.conditions ?? []), ...sourceConditions],
  },
  plugins: [
    ...(config.plugins ?? []),
    previewOnly,
    vitestPluginRSC(),
    vitestPluginNext({
      host: {
        // What a test file and a setup file are to Vitest.
        files: ["**/*.stories.*", `${options.configDir}/**`, `${frameworkDir}/**`],
        packages: await storybookPackages(options),
      },
    }),
  ],
});
