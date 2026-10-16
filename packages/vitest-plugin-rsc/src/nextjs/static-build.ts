import fs from "node:fs";
import path from "node:path";
import { getPluginApi } from "@vitejs/plugin-rsc/plugin";
import { moduleRunnerTransform, type Plugin, type Rolldown, type ViteBuilder } from "vite";

// A static build of the app: the three layers as files of a site, with no dev
// server next to the browser. `vite build` makes it, and so does a host that
// builds with Vite's app builder, `createBuilder()` and `buildApp()`. Vite's
// `build()` builds one environment, which is not enough: see `buildStart`.
//
// The rsc layer shares its environment with the host, so it is the host's
// build: its HTML, with its scripts. The other two run through a module
// runner (../utils.ts), so that a page load gets a module graph of its own.
// They are built like any environment, and then every chunk is rewritten into
// the format a module runner evaluates. Those of a layer are one file, by the
// id of each, which a tab fetches once where it asks a dev server for every
// module: see ../built-layers.ts. Its other files, like CSS, are files of the
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
//   4. the browser layer and the ssr layer, with the modules of those ids
//
// The first two cut every module down to its imports, so they are quick.
// Their ids are not the ones of step 3: Vite RSC names a module of a package
// by how it was imported, which it only knows of all of them afterwards.

/** What the page imports for the layers that were built: see ../utils.ts. */
const layersId = "virtual:vitest-plugin-rsc/layers";
/** For the ssr and the browser layer: the modules a Flight payload can refer to. */
export const clientReferencesId = "virtual:vitest-plugin-rsc/next-client-references";
/** For the rsc layer: the modules with Server Actions. */
const serverReferencesId = "virtual:vitest-plugin-rsc/next-server-references";
/** Where the layers of the module runner are, in the directory of the build. */
const layersDir = "vitest-plugin-rsc";
/**
 * The one entry of a layer. A module of a layer is no file of the build, but
 * its id is the path it would have: the file it names by its URL, like its
 * CSS, is named from there.
 */
const entryFile = "entry.js";
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
  for (const pathname of pathnames) {
    code =
      language === "css"
        ? code.replaceAll(pathname, cssBuildDirPlaceholder + pathname)
        : code.replaceAll(
            JSON.stringify(pathname),
            `new URL(${buildDirPlaceholder} + ${JSON.stringify(pathname.slice(1))}, import.meta.url).href`,
          );
  }
  return code;
}

export type StaticBuildOptions = {
  /** The Vite environment of each layer. */
  environments: { rsc: string; ssr: string; browser: string };
  /** What the page imports to start the layers that run through a module runner. */
  entries: { ssr: string; browser: string };
  /** The files Next's loaders made for the browser, by the path it asks for. */
  emittedFiles(): { pathname: string; body: Uint8Array }[];
};

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

export function nextStaticBuild(options: StaticBuildOptions): Plugin {
  const { rsc, ssr, browser } = options.environments;
  const entryOf: Record<string, string> = {
    [ssr]: options.entries.ssr,
    [browser]: options.entries.browser,
  };
  // Set once the config is resolved, which is before anything is built.
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

  const environment = (builder: ViteBuilder, name: string) => {
    const found = builder.environments[name];
    if (!found) throw new Error(`vitest-plugin-rsc: the build has no environment "${name}"`);
    return found;
  };

  return {
    name: "vitest-plugin-rsc:next-static-build",
    enforce: "pre",
    config(userConfig, { command }) {
      if (command !== "build") return;
      // A change would build one environment again, outside `buildApp()`.
      if (userConfig.build?.watch) {
        throw new Error(
          "vitest-plugin-rsc: a static build of the app cannot watch. Build it again instead " +
            "of `vite build --watch`.",
        );
      }
      // The config's own, which this one replaces: it gets what is left.
      const userOnwarn = userConfig.build?.rolldownOptions?.onwarn;
      const layer = (name: string) => ({
        build: {
          copyPublicDir: false,
          // The chunks are evaluated by a module runner, not loaded as scripts.
          modulePreload: false as const,
          // Named from the directory of the host's build, where they end up:
          // Vite writes the URL of a file, like the CSS of a chunk, from its
          // name and the base.
          assetsDir: `${layersDir}/${name}/assets`,
          rolldownOptions: {
            input: { entry: entryOf[name]! },
            output: {
              entryFileNames: `${layersDir}/${name}/${entryFile}`,
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
        build: {
          rolldownOptions: {
            // A layer runs its modules in the order of their imports, as it
            // does with a dev server. The server's platform has to be there
            // before a module of Next's server runs (globals.ts), and a
            // bundler keeps that order within a chunk, not between chunks.
            output: { strictExecutionOrder: true },
            onwarn(warning, warn) {
              // A directive is what Vite RSC has made a reference of by then,
              // or one that Next's own files have for Turbopack.
              const isDirective =
                warning.code === "MODULE_LEVEL_DIRECTIVE" &&
                /\buse (client|server|turbopack)\b/.test(warning.message);
              // A build that only looks is left with the imports of a module,
              // also the ones that are no path until the code runs. It is
              // thrown away, so what it cannot find it can leave out.
              const isUnresolvedInScan =
                manager.isScanBuild && warning.code === "UNRESOLVED_IMPORT";
              // The lists of references import a module to find it by its id,
              // not to split it off: Next's entry has some of them as well.
              // Not when the app imports the module that way too.
              const importers =
                warning.code === "INEFFECTIVE_DYNAMIC_IMPORT" &&
                / is dynamically imported by (.+?) but also statically imported by /.exec(
                  warning.message,
                )?.[1];
              const isListedReference =
                !!importers &&
                importers
                  .split(", ")
                  .every(
                    (id) => id.endsWith(clientReferencesId) || id.endsWith(serverReferencesId),
                  );
              if (isDirective || isUnresolvedInScan || isListedReference) return;
              if (userOnwarn) userOnwarn(warning, warn);
              else warn(warning);
            },
          },
        },
        environments: {
          [browser]: layer(browser),
          // The CSS of a Client Component is the browser layer's to load.
          [ssr]: { build: { ...layer(ssr).build, cssCodeSplit: false } },
        },
      };
    },
    configResolved(resolved) {
      const api = getPluginApi(resolved);
      if (!api) throw new Error("vitest-plugin-rsc: vitestPluginNext() needs vitestPluginRSC().");
      manager = api.manager;
      if (resolved.command !== "build") return;
      // The layers are built somewhere of their own, and copied from there.
      // Not in the directory of the host's build, which they would empty.
      // Set here, where no plugin of the host changes it anymore: a host can
      // give every environment the directory of its own build.
      for (const name of [ssr, browser]) {
        const layer = resolved.environments[name]?.build;
        if (!layer) continue;
        layer.outDir = path.join(resolved.root, "node_modules/.vitest-plugin-rsc", name);
        layer.emptyOutDir = true;
      }
    },
    // Steps 1 to 4, and the files of the layers in the directory of the
    // host's build.
    async buildApp(builder) {
      const build = (name: string) => builder.build(environment(builder, name));
      const scanned = [rsc, browser].map((name) => environment(builder, name).config.build);
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
          for (const scan of scanned) scan.write = true;
        }

        // Step 3.
        await build(rsc);

        // Step 4.
        await build(browser);
        await build(ssr);

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
        // What Next's loaders made for the browser, fonts and images, by the
        // path it asks for, and the stylesheets of the routes.
        for (const { pathname, body } of options.emittedFiles()) write(pathname, body);
      } finally {
        buildingApp = false;
      }
    },
    buildStart() {
      if (this.environment.mode !== "build") return;
      // Outside the plugin's `buildApp()`, like with Vite's `build()`, only
      // the environment of the host is built: a site without the other
      // layers, which would fail when it is opened.
      if (this.environment.name === rsc && !buildingApp) {
        throw new Error(
          "vitest-plugin-rsc: the app is built outside the plugin's `buildApp()`, which builds " +
            "its three layers. Vite's `build()` does that: it builds one environment. Build " +
            "with Vite's app builder: `vite build`, or " +
            "`await (await createBuilder(config, null)).buildApp()`.",
        );
      }
    },
    resolveId(source) {
      if (source === clientReferencesId || source === serverReferencesId) return `\0${source}`;
      // A dev server has none: see ../index.ts.
      if (source === layersId && this.environment.mode === "build") return `\0${layersId}/built`;
    },
    load(id) {
      const isBuild = this.environment.mode === "build";
      if (id === `\0${clientReferencesId}`) {
        if (!isBuild) return "export default undefined;";
        const references = Object.values(manager.clientReferenceMetaMap).map(
          (meta) =>
            `  ${JSON.stringify(meta.referenceKey)}: () => import(${JSON.stringify(meta.importId)}),`,
        );
        return `export default {\n${references.join("\n")}\n};\n`;
      }
      if (id === `\0${serverReferencesId}`) {
        if (!isBuild) return "export default undefined;";
        const references = [...manager.serverReferences.metaMap.values()].map(
          (meta) =>
            `  ${JSON.stringify(meta.referenceKey)}: () => import(${JSON.stringify(meta.importId)}),`,
        );
        return `export default {\n${references.join("\n")}\n};\n`;
      }
      if (id === `\0${layersId}/built`) {
        // A file of a layer is named from the directory of the build.
        const layers = [ssr, browser].map(
          (name) =>
            `  ${JSON.stringify(name)}: { base: directory, entries: ${JSON.stringify({
              [entryOf[name]!]: `${layersDir}/${name}/${entryFile}`,
            })}, modules: ${JSON.stringify(`${layersDir}/${name}/${modulesFile}`)} },`,
        );
        return (
          `const directory = new URL(${buildDirPlaceholder}, import.meta.url).href;\n` +
          `export default {\n${layers.join("\n")}\n};\n`
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
        if (manager.isScanBuild) return;
        // Where the directory of the build is, from a file of CSS.
        for (const output of Object.values(bundle)) {
          if (output.type !== "asset" || typeof output.source !== "string") continue;
          output.source = output.source.replaceAll(
            `${cssBuildDirPlaceholder}/`,
            toBuildDir(output.fileName),
          );
        }
        if (name !== ssr && name !== browser) return;
        const modules = new Map<string, Promise<string>>();
        const files = new Map<string, string | Uint8Array>();
        for (const output of Object.values(bundle)) {
          if (output.type === "chunk") {
            const rewritten = toRunnerModule(output);
            // One that fails does so where it is written.
            rewritten.catch(() => {});
            modules.set(`/${output.fileName}`, rewritten);
          }
          // The CSS is the browser layer's. A file of the ssr layer is one the
          // browser layer has too, when a module of both names it.
          else if (name === browser || !output.fileName.endsWith(".css")) {
            files.set(output.fileName, output.source);
          }
        }
        built.set(name, { modules, files });
      },
    },
  };
}
