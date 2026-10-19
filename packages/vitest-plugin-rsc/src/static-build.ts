import fs from "node:fs";
import path from "node:path";
import { getPluginApi } from "@vitejs/plugin-rsc/plugin";
import { moduleRunnerTransform, type Plugin, type Rolldown, type ViteBuilder } from "vite";
import { clientReferencesId } from "./built-layers.ts";
import {
  builtHostModuleUrl,
  hostModulePrefix,
  hostModulesId,
  hostModuleSpecifier,
  isHostModule,
} from "./host-module.ts";

// A static build of the app: its layers as files of a site, with no dev
// server next to the browser. `vite build` makes it, and so does a host that
// builds with Vite's app builder, `createBuilder()` and `buildApp()`. Vite's
// `build()` builds one environment, which is not enough: see `buildStart`.
//
// The rsc layer shares its environment with the host, so it is the host's
// build: its HTML, with its scripts. The other layers run through a module
// runner (utils.ts), so that a page load gets a module graph of its own: the
// browser layer, and with Next.js the ssr layer (nextjs/static-build.ts).
// They are built like any environment, and then every chunk is rewritten into
// the format a module runner evaluates. Those of a layer are one file, by the
// id of each, which a tab fetches once where it asks a dev server for every
// module: see built-layers.ts. Its other files, like CSS, are files of the
// build.
//
// A dev server finds a module by the id a Flight payload has for it. A build
// has to have those modules in it, under those ids, so the order matters:
//
//   1. the rsc layer, only to find the Client Components
//   2. the browser layer, only to find the modules with Server Actions that
//      a Client Component imports and no Server Component does
//   3. the rsc layer, which gives each Client Component the id it has in a
//      Flight payload
//   4. the browser layer and any other, with the modules of those ids
//
// The first two cut every module down to its imports, so they are quick.
// Their ids are not the ones of step 3: Vite RSC names a module of a package
// by how it was imported, which it only knows of all of them afterwards.
// Step 2 also finds the modules of the page that the browser layer imports,
// which step 3 gives the page's own instance of: see host-module.ts.

/** What the page imports for the layers that were built: see utils.ts. */
const layersId = "virtual:vitest-plugin-rsc/layers";
/** For the rsc layer: the modules with Server Actions. */
const serverReferencesId = "virtual:vitest-plugin-rsc/server-references";
/** Where the layers of the module runner are, in the directory of the build. */
const layersDir = "vitest-plugin-rsc";
/**
 * The file with every module of a layer. Not named after its content: the
 * build of the host, which says where it is, comes before the layer's, which
 * needs the ids that the host's build gives. So it is a file, like the
 * `index.html` of the host, that a site serves without a long cache.
 */
const modulesFile = "modules.json";

// A build can be served from any path, so a file of it names another one by
// the way from itself. These stand in for the way from a file of the build to
// the directory of the build, until the file has its place: in JavaScript, and
// in CSS, as a URL that Vite leaves as it is.
const buildDirPlaceholder = "__VITEST_PLUGIN_RSC_BUILD_DIR__";
export const cssBuildDirPlaceholder = "//vitest-plugin-rsc-build-dir";
export const toBuildDir = (fileName: string) =>
  `${path.posix.relative(path.posix.dirname(fileName), "") || "."}/`;

/**
 * The code of a module, or the CSS, that names files of the build by their
 * path from its directory, like `/_next/static/media/logo.png`: with a URL
 * that is right wherever the build is served.
 */
export function withBuiltFiles(code: string, pathnames: string[], language: "js" | "css"): string {
  if (pathnames.length === 0) return code;
  if (language === "css") {
    // In one pass, the longest first: a path that starts with another path
    // is replaced once, as itself.
    const paths = [...pathnames].sort((a, b) => b.length - a.length);
    const pattern = new RegExp(
      paths.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
      "g",
    );
    return code.replace(pattern, (pathname) => cssBuildDirPlaceholder + pathname);
  }
  for (const pathname of pathnames) {
    code = code.replaceAll(
      JSON.stringify(pathname),
      `new URL(${buildDirPlaceholder} + ${JSON.stringify(pathname.slice(1))}, import.meta.url).href`,
    );
  }
  return code;
}

// The modules a Flight payload can refer to, by the id it has for them. In
// the order of the ids: the map has them in the order they were compiled,
// which differs from build to build.
function referenceList(references: { referenceKey: string; importId: string }[]): string {
  const lines = [...references]
    .sort((a, b) => (a.referenceKey < b.referenceKey ? -1 : 1))
    .map(
      ({ referenceKey, importId }) =>
        `  ${JSON.stringify(referenceKey)}: () => import(${JSON.stringify(importId)}),`,
    );
  return `export default {\n${lines.join("\n")}\n};\n`;
}

/** The layers of a static build that run through a module runner, and what else it has. */
export type StaticBuildLayers = {
  /**
   * What the page imports to start each layer that runs through a module
   * runner, by its environment: the browser layer, and any other. A
   * framework's replace the ones of `vitestPluginRSC()`, so they have the
   * browser layer too.
   */
  entries: Record<string, string>;
  /**
   * The directives of a framework's own files that a bundler would warn
   * about, like Next's `use turbopack`. Not Vite RSC's: those are references
   * by then.
   */
  directives?: string[];
  /**
   * Whether every layer runs its modules in the order of their imports, as
   * with a dev server, also those of two chunks: a bundler keeps that order
   * within a chunk only. Next's server needs it: its platform has to be there
   * before a module of it runs (nextjs/globals.ts).
   */
  strictExecutionOrder?: boolean;
  /** Files of the build that another plugin made, by the path the browser asks for. */
  files?(): { pathname: string; body: Uint8Array }[];
};

// Where the plugin of a framework, like `vitestPluginNext()`, gives the
// static build of `vitestPluginRSC()` its own layers, in its `config` hook:
// see `withStaticBuild()`. The static build reads them after every other
// `config` hook. There is one build of an app, so one plugin builds it.
const staticBuildKey = "vitestPluginRscStaticBuild";

/** The config with which a framework's plugin builds its own layers: see `staticBuild()`. */
export function withStaticBuild(layers: StaticBuildLayers): Record<string, unknown> {
  return { [staticBuildKey]: layers };
}

export type StaticBuildOptions = {
  /** The Vite environment of the rsc layer, which the host shares. */
  rsc: string;
  /**
   * The Vite environment of the browser layer: a file that a module of a
   * layer names by its URL, like its CSS, is where this layer has it.
   */
  browser: string;
  /** The layers without a framework that gives its own. */
  layers: StaticBuildLayers;
};

// Vite RSC's API for a framework that builds the environments itself, with
// `vitePluginRscMinimal()`: what it found, and `isScanBuild`, which tells its
// plugins that a build only looks, as Vite RSC's own `buildApp()` and its
// examples of one of a framework's set it.
type Manager = NonNullable<ReturnType<typeof getPluginApi>>["manager"];

/** What `moduleRunnerTransform()` makes of `import.meta`. */
const importMeta = "__vite_ssr_import_meta__";

// A module of a build as a module runner takes it. Its imports are by the
// path of the file, from the directory of the build: a runner resolves a
// relative import against what the importer was asked by, which for a build
// is not always a path.
export async function toRunnerModule(
  chunk: Pick<Rolldown.OutputChunk, "fileName" | "code">,
): Promise<string> {
  const id = `/${chunk.fileName}`;
  const transformed = await moduleRunnerTransform(chunk.code, null, id, chunk.code);
  const directory = path.posix.dirname(id);
  const code = (transformed?.code ?? chunk.code).replace(
    /(__vite_ssr_(?:dynamic_)?import__\()(["'])(\.\.?\/[^"']*)\2/g,
    (_match, call: string, _quote: string, specifier: string) =>
      `${call}${JSON.stringify(path.posix.resolve(directory, specifier))}`,
  );
  // A runner has an `import.meta.resolve()` that throws. Vite asks it where
  // the CSS of a chunk is, before it takes the URL of the module for that.
  return code.includes(`${importMeta}.resolve`)
    ? `${importMeta}.resolve = (specifier) => new URL(specifier, ${importMeta}.url).href;\n${code}`
    : code;
}

// The modules of the page that the chunks of a layer import, by the import
// each stands for: externals, see host-module.ts.
function hostModulesOf(bundle: Rolldown.OutputBundle): Set<string> {
  const found = new Set<string>();
  for (const output of Object.values(bundle)) {
    if (output.type !== "chunk") continue;
    for (const id of [...output.imports, ...output.dynamicImports]) {
      if (isHostModule(id)) found.add(hostModuleSpecifier(id));
    }
  }
  return found;
}

// The layers a build has, said in words: the rsc layer and the others.
const countOf = (layers: number) => ["two", "three"][layers - 2] ?? String(layers);

/**
 * The static build of the app, for `vite build`. With a dev server it only
 * says that there is no build: the lists of references and of the layers are
 * `undefined`, and the page asks the server.
 */
export function staticBuild(options: StaticBuildOptions): Plugin {
  const { rsc, browser } = options;
  // The variant's, once the `config` hook has run, which is before anything
  // is built.
  let layers = options.layers;
  const runnerLayers = () => Object.keys(layers.entries);
  // Set once the config is resolved.
  let manager!: Manager;
  // What the builds of the layers that run through a module runner made, by
  // environment: their modules by id, and their other files. A module is
  // there once it is rewritten for the runner, which the build of its layer
  // does not wait for.
  const built = new Map<
    string,
    { modules: Map<string, Promise<string>>; files: Map<string, string | Uint8Array> }
  >();
  // While `buildApp()` builds the environments.
  let buildingApp = false;
  // The modules of the page that the scan of the browser layer found it
  // imports, by the import each stands for: the rsc layer lists them, see
  // `hostModulesId`.
  let hostModules = new Set<string>();
  // The modules that only the lists of references import with `import()`,
  // in the build of the environment that is being built: see `onwarn`.
  let listedOnly = new Set<string>();

  // The entries of a layer, by their names in its input: the module that the
  // page starts the layer with, and in the browser layer the list of its
  // client references, `clientReferencesId`, from which Next's graph of the
  // tab evaluates a file of the host with `"use client"` by its key, see
  // nextjs/client-graph.ts. A module of a layer is no file of the build, but
  // its id is the path it would have, `<name>.js` in the layer's directory:
  // the file it names by its URL, like its CSS, is named from there.
  const inputOf = (name: string): Record<string, string> => ({
    entry: layers.entries[name]!,
    ...(name === browser && { references: clientReferencesId }),
  });

  const environment = (builder: ViteBuilder, name: string) => {
    const found = builder.environments[name];
    if (!found) throw new Error(`vitest-plugin-rsc: the build has no environment "${name}"`);
    return found;
  };

  return {
    name: "vitest-plugin-rsc:static-build",
    enforce: "pre",
    config: {
      // After the hook of a framework's plugin, which gives its own layers.
      order: "post",
      handler(userConfig, { command }) {
        if (command !== "build") return;
        layers =
          (userConfig as Record<string, StaticBuildLayers | undefined>)[staticBuildKey] ??
          options.layers;
        if (!layers.entries[browser]) {
          throw new Error(`vitest-plugin-rsc: a static build has no entry of "${browser}".`);
        }
        // A change would build one environment again, outside `buildApp()`.
        if (userConfig.build?.watch) {
          throw new Error(
            "vitest-plugin-rsc: a static build of the app cannot watch. Build it again instead " +
              "of `vite build --watch`.",
          );
        }
        // The config's own, which this one replaces: it gets what is left.
        const userOnwarn = userConfig.build?.rolldownOptions?.onwarn;
        const userRenderBuiltUrl = userConfig.experimental?.renderBuiltUrl;
        const directives = new RegExp(
          `\\buse (${["client", "server", ...(layers.directives ?? [])].join("|")})\\b`,
        );
        const layer = (name: string) => ({
          build: {
            copyPublicDir: false,
            // The chunks are evaluated by a module runner, not loaded as scripts.
            modulePreload: false as const,
            // Named from the directory of the host's build, where they end up:
            // Vite writes the URL of a file, like the CSS of a chunk, from its
            // name and the base.
            assetsDir: `${layersDir}/${name}/assets`,
            // The CSS of a Client Component is the browser layer's to load,
            // with the chunk of the component: one file of all of it would be
            // loaded by nothing.
            cssCodeSplit: name === browser,
            // Its input is set once the config is resolved: see `inputOf()`.
            rolldownOptions: {
              output: {
                entryFileNames: `${layersDir}/${name}/[name].js`,
                // A file a module names by its URL, like an import with `?url`,
                // where the browser layer has it: the server renders the URL
                // that the browser hydrates.
                assetFileNames: `${layersDir}/${browser}/assets/[name]-[hash][extname]`,
              },
              // The page calls what the entry exports. Vite drops the exports
              // of an entry for a browser, which a script tag cannot read.
              preserveEntrySignatures: "strict" as const,
            },
          },
        });
        return {
          // Vite's app builder, also for `createBuilder(config, null)`, which
          // `vite build` calls. One set of plugins for the environments: what
          // the build of one finds, the build of the next one has.
          builder: { sharedPlugins: true, sharedConfigBuild: true },
          experimental: {
            // A file of the build that CSS names by its URL, by the way from
            // the directory of the build, until the CSS has its place: see
            // `generateBundle`. Vite's way is from where the top-level config
            // puts CSS, with the plugins that the environments share, also
            // for CSS that an environment puts elsewhere. Unless the config's
            // own names the file with a URL of its own.
            renderBuiltUrl(filename, context) {
              const own = userRenderBuiltUrl?.(filename, context);
              if (!buildingApp || context.hostType !== "css" || typeof own === "string") {
                return own;
              }
              return `${cssBuildDirPlaceholder}/${filename}`;
            },
          },
          build: {
            rolldownOptions: {
              ...(layers.strictExecutionOrder && { output: { strictExecutionOrder: true } }),
              onwarn(warning, warn) {
                // A directive is what Vite RSC has made a reference of by then,
                // or one that a framework's own files have for its bundler.
                const isDirective =
                  warning.code === "MODULE_LEVEL_DIRECTIVE" && directives.test(warning.message);
                // A build that only looks is left with the imports of a module,
                // also the ones that are no path until the code runs. It is
                // thrown away, so what it cannot find it can leave out.
                const isUnresolvedInScan =
                  manager.isScanBuild && warning.code === "UNRESOLVED_IMPORT";
                // The lists of references import a module to find it by its id,
                // not to split it off: the modules of the app and of a
                // framework import some of them as well. Not when the app
                // imports the module that way too.
                const isListedReference =
                  warning.code === "INEFFECTIVE_DYNAMIC_IMPORT" &&
                  warning.id !== undefined &&
                  listedOnly.has(warning.id);
                if (isDirective || isUnresolvedInScan || isListedReference) return;
                if (userOnwarn) userOnwarn(warning, warn);
                else warn(warning);
              },
            },
          },
          environments: Object.fromEntries(runnerLayers().map((name) => [name, layer(name)])),
        };
      },
    },
    configResolved(resolved) {
      if (resolved.command !== "build") return;
      const api = getPluginApi(resolved);
      if (!api) throw new Error("vitest-plugin-rsc: a static build needs Vite RSC's plugin.");
      manager = api.manager;
      // The layers are read from their bundles, in `generateBundle`, and
      // written as one file each: see `buildApp()`. Vite writes nothing of
      // them. Set here, where no plugin of the host changes it anymore.
      // Its input, too: Vite merges the config of an environment into the
      // top level's, which has the host's own input, like the pages of a
      // site, and an array or object of those would be the layer's as well.
      for (const name of runnerLayers()) {
        const layer = resolved.environments[name]?.build;
        if (!layer) continue;
        layer.write = false;
        layer.rolldownOptions = { ...layer.rolldownOptions, input: inputOf(name) };
      }
    },
    // Steps 1 to 4, and the files of the layers in the directory of the
    // host's build.
    async buildApp(builder) {
      const build = (name: string) => builder.build(environment(builder, name));
      const scanned = [rsc, browser].map((name) => environment(builder, name).config.build);
      const writes = scanned.map((scan) => scan.write);
      // Not what a build before this one made.
      built.clear();
      hostModules = new Set();
      buildingApp = true;
      try {
        // Steps 1 and 2, which only look: they write nothing, so Vite empties
        // the directory of the host's build, and copies `public/` into it,
        // with step 3.
        manager.isScanBuild = true;
        for (const scan of scanned) scan.write = false;
        try {
          await build(rsc);
          await build(browser);
        } finally {
          manager.isScanBuild = false;
          scanned.forEach((scan, index) => (scan.write = writes[index]!));
        }

        // Step 3.
        await build(rsc);

        // Step 4: the browser layer first, as it has the files of the others.
        for (const name of [browser, ...runnerLayers().filter((name) => name !== browser)]) {
          await build(name);
        }

        // Vite keeps the directory as the config has it, which can be relative
        // to the root.
        const outDir = path.resolve(
          builder.config.root,
          environment(builder, rsc).config.build.outDir,
        );
        const write = (fileName: string, content: string | Uint8Array) => {
          const file = path.join(outDir, fileName);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, content);
        };
        for (const [name, { modules, files }] of built) {
          for (const [fileName, content] of files) write(fileName, content);
          // In the order of their ids, the same in every build.
          const ids = [...modules.keys()].sort();
          const codes = await Promise.all(ids.map((id) => modules.get(id)!));
          write(
            `${layersDir}/${name}/${modulesFile}`,
            JSON.stringify(Object.fromEntries(ids.map((id, index) => [id, codes[index]]))),
          );
        }
        for (const { pathname, body } of layers.files?.() ?? []) write(pathname, body);
      } finally {
        buildingApp = false;
      }
    },
    // Before the bundler warns of an `import()` that splits nothing off,
    // which it does as it makes the chunks.
    buildEnd() {
      if (this.environment.mode !== "build") return;
      const lists = [`\0${clientReferencesId}`, `\0${serverReferencesId}`];
      listedOnly = new Set(
        lists
          .flatMap((list) => this.getModuleInfo(list)?.dynamicallyImportedIds ?? [])
          .filter((id) =>
            (this.getModuleInfo(id)?.dynamicImporters ?? []).every((importer) =>
              lists.includes(importer),
            ),
          ),
      );
    },
    buildStart() {
      if (this.environment.mode !== "build") return;
      // Outside the plugin's `buildApp()`, like with Vite's `build()`, only
      // the environment of the host is built: a site without the other
      // layers, which would fail when it is opened.
      if (this.environment.name === rsc && !buildingApp) {
        throw new Error(
          "vitest-plugin-rsc: the app is built outside the plugin's `buildApp()`, which builds " +
            `its ${countOf(runnerLayers().length + 1)} layers. ` +
            "Vite's `build()` does that: it builds one environment. Build with Vite's app " +
            "builder: `vite build`, or `await (await createBuilder(config, null)).buildApp()`.",
        );
      }
    },
    resolveId(source) {
      if (source === clientReferencesId || source === serverReferencesId) return `\0${source}`;
      if (source === hostModulesId) return `\0${source}`;
      if (source === layersId) {
        return this.environment.mode === "build" ? `\0${layersId}/built` : `\0${layersId}`;
      }
    },
    load(id) {
      const isBuild = this.environment.mode === "build";
      if (id === `\0${clientReferencesId}`) {
        if (!isBuild) return "export default undefined;";
        return referenceList(Object.values(manager.clientReferenceMetaMap));
      }
      if (id === `\0${serverReferencesId}`) {
        if (!isBuild) return "export default undefined;";
        return referenceList([...manager.serverReferences.metaMap.values()]);
      }
      // The modules of the page, for the layers of the module runner, as the
      // host's build has them: one instance with the host's own scripts.
      // Each is `hostModulePrefix` and its import, which the framework that
      // resolves imports to modules of the page loads.
      if (id === `\0${hostModulesId}`) {
        if (!isBuild || this.environment.name !== rsc) return "export default undefined;";
        const lines = [...hostModules]
          .sort()
          .map(
            (specifier) =>
              `  ${JSON.stringify(builtHostModuleUrl(specifier))}: () => ` +
              `import(${JSON.stringify(hostModulePrefix + specifier)}),`,
          );
        return `export default {\n${lines.join("\n")}\n};\n`;
      }
      // A dev server serves the modules of every layer itself.
      if (id === `\0${layersId}`) return "export default undefined;\n";
      if (id === `\0${layersId}/built`) {
        // A file of a layer is named from the directory of the build.
        const entries = runnerLayers()
          .sort()
          .map(
            (name) =>
              `  ${JSON.stringify(name)}: { base: directory, entries: ${JSON.stringify(
                Object.fromEntries(
                  Object.entries(inputOf(name)).map(([input, id]) => [
                    id,
                    `${layersDir}/${name}/${input}.js`,
                  ]),
                ),
              )}, modules: ${JSON.stringify(`${layersDir}/${name}/${modulesFile}`)} },`,
          );
        return (
          `const directory = new URL(${buildDirPlaceholder}, import.meta.url).href;\n` +
          `export default {\n${entries.join("\n")}\n};\n`
        );
      }
    },
    // Where the directory of the build is, from the file that asks.
    renderChunk(code, chunk) {
      if (!code.includes(buildDirPlaceholder)) return;
      return {
        code: code.replaceAll(buildDirPlaceholder, JSON.stringify(toBuildDir(chunk.fileName))),
        map: null,
      };
    },
    generateBundle: {
      // After Vite has written into the chunks what a dynamic import loads.
      order: "post",
      handler(_options, bundle) {
        const { name } = this.environment;
        if (runnerLayers().includes(name)) {
          const imported = hostModulesOf(bundle);
          // The scan of the browser layer, which comes before the rsc layer
          // that lists them. The layer's own build imports what its scan
          // did: a module it imports beyond that is not in the list.
          if (manager.isScanBuild) {
            if (name === browser) hostModules = imported;
          } else {
            const missing = [...imported].find((specifier) => !hostModules.has(specifier));
            if (missing !== undefined) {
              this.error(
                `vitest-plugin-rsc: the ${name} layer imports ${missing} as a module of the ` +
                  `page, as \`host.packages\` of vitestPluginNext() names its package, but the ` +
                  `scan of the browser layer did not find that import, so the host's build has ` +
                  `no instance of it to share. The scan sees every import of the browser layer ` +
                  `that its build does: a plugin that adds this import has to add it in the ` +
                  `scan too.`,
              );
            }
          }
        }
        if (manager.isScanBuild) return;
        // Where the directory of the build is, from a file of CSS.
        for (const output of Object.values(bundle)) {
          if (output.type !== "asset" || typeof output.source !== "string") continue;
          output.source = output.source.replaceAll(
            `${cssBuildDirPlaceholder}/`,
            toBuildDir(output.fileName),
          );
        }
        if (!runnerLayers().includes(name)) return;
        const modules = new Map<string, Promise<string>>();
        const files = new Map<string, string | Uint8Array>();
        for (const output of Object.values(bundle)) {
          if (output.type === "chunk") {
            const rewritten = toRunnerModule(output);
            // One that fails does so where it is written.
            rewritten.catch(() => {});
            modules.set(`/${output.fileName}`, rewritten);
          }
          // The CSS is the browser layer's. A file of another layer is one
          // the browser layer has too, when a module of both names it.
          else if (name === browser || !output.fileName.endsWith(".css")) {
            files.set(output.fileName, output.source);
          }
        }
        built.set(name, { modules, files });
      },
    },
  };
}
