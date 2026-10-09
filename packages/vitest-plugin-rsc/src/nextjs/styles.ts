import { createHash } from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { getPluginApi } from "@vitejs/plugin-rsc/plugin";
import {
  isCSSRequest,
  normalizePath,
  parseAst,
  send,
  version as viteVersion,
  type DevEnvironment,
  type EnvironmentModuleNode,
  type Plugin,
  type ViteDevServer,
} from "vite";
import type { BrowserCommandContext } from "vitest/node";
import { hostModulePrefix } from "../host-module.ts";
import { clientReferencesId, cssBuildDirPlaceholder, toBuildDir } from "./build.ts";
import { liveModulePrefix } from "./client-ids.ts";
import type { ComponentRoute, NextLayer, NextProject, NextRoute } from "./project.ts";
import { componentPagePath } from "./project/entries.ts";
import {
  builtStylesheetsFile,
  stylesheetsCommand,
  stylesheetsPath,
  type BuiltStylesheets,
  type Stylesheets,
} from "./styles-command.ts";

// The CSS of the app, the way Next brings it to a page: as the stylesheets of
// the segment that imports them.
//
// Next's build lists the CSS files of every layout, page and boundary of a
// route: what that file imports, its Client Components included. That list is
// `entryCSSFiles` of the client reference manifest, and Next's renderer puts
// a `<link rel="stylesheet">` for each of them next to the segment. So a
// stylesheet belongs to a page, and goes with it.
//
// Vite does it another way: a module that imports CSS puts it in a `<style>`
// when it loads, once for the browser. That stays for the CSS a test file imports
// itself. For the CSS of the app, this file is the part of Next's build:
//
//   - An import of CSS in the code of the app gets a query, `?next-linked`.
//   - The module of such an import puts nothing in the document. It exports
//     the class names of a CSS module, as Vite's module for a server does.
//   - The list of a segment is read off Vite's module graphs, before Next
//     renders the route: see `stylesheetsOf()`.
//   - The dev server serves a stylesheet where Next links it, under
//     `/_next/static/css/`: the CSS Vite makes of the file, so with PostCSS
//     and with the class names its module exports.
//   - A static build has each stylesheet in a file of its own there, and the
//     lists of every route in a file next to the layers: see
//     `createBuiltStylesheets()`.

const linkedQuery = "next-linked";
const linkedRE = new RegExp(`[?&]${linkedQuery}\\b`);
// What Vite marks a request for the CSS itself with, and not for its module.
const directRE = /[?&]direct\b/;
// What Vite's build leaves out of the CSS of a chunk, which it adds for the
// stylesheet of a `?url` import: the plugin makes the file of it itself.
const transformOnly = "transform-only";

/** The id of a stylesheet that Next links, of the id of its file, in a build or not. */
export const linked = (id: string, build = false) =>
  `${id}${id.includes("?") ? "&" : "?"}${linkedQuery}${build ? `&${transformOnly}` : ""}`;
const isLinked = (id: string) => linkedRE.test(id);

// An import that names a module of JavaScript, which is no stylesheet.
const isScriptRequest = (source: string) => /\.[cm]?[jt]sx?$/.test(source);

// A module of code, as Vite tells one from a file that it serves as it is
// (its `isJSRequest()`): one of a language that compiles to JavaScript, or one
// without an extension, like a virtual module. Also `.cjs` and `.cts`, which
// Vite leaves out, and a page of the app, like `page.md` with `md` in
// `pageExtensions`.
const codeExtensionRE = /^(?:[cm]?[jt]sx?|vue|marko|svelte|astro|imba|mdx)$/;
export function isCode(id: string, pageExtensions: string[]): boolean {
  const file = id.split("?")[0]!;
  const extension = /\.([^./]+)$/.exec(file)?.[1];
  return (
    extension === undefined ||
    codeExtensionRE.test(extension) ||
    pageExtensions.some((pageExtension) => file.endsWith(`.${pageExtension}`))
  );
}

// Where Next's build puts the CSS of an app, under `/_next/`.
const directory = "static/css";

// The names a declaration binds, like `{ a, b: [c] }` of a `const`.
function boundNames(node: unknown, names: Set<string>): void {
  if (!node || typeof node !== "object") return;
  const { type } = node as { type?: string };
  if (type === "Identifier") names.add((node as { name: string }).name);
  else if (type === "ImportDeclaration") {
    for (const { local } of (node as { specifiers: { local: unknown }[] }).specifiers) {
      boundNames(local, names);
    }
  } else if (type === "VariableDeclaration") {
    for (const { id } of (node as { declarations: { id: unknown }[] }).declarations) {
      boundNames(id, names);
    }
  } else if (type === "FunctionDeclaration" || type === "ClassDeclaration") {
    boundNames((node as { id: unknown }).id, names);
  } else {
    for (const key of ["properties", "elements", "value", "argument", "left"]) {
      for (const part of [(node as Record<string, unknown>)[key]].flat()) boundNames(part, names);
    }
  }
}

// The names that the code of a node refers to, as an identifier, and whether
// it reads `import.meta`.
function identifiersOf(node: unknown, names: Set<string>): boolean {
  if (!node || typeof node !== "object") return false;
  const { type } = node as { type?: string };
  if (type === "Identifier") names.add((node as { name: string }).name);
  let meta = type === "MetaProperty";
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") meta = identifiersOf(value, names) || meta;
  }
  return meta;
}

/**
 * The exports of Vite's module for a stylesheet, without the code that puts
 * the CSS in the document.
 *
 * Vite's module for a client (`vite:css-post`) puts the CSS in a `<style>`,
 * and has the class names of a CSS module as its exports, as Vite documents
 * them. Its module for a server is those exports, with the constants they
 * are made of: one for a class name that is no name of a variable, like
 * `switch`. So the exports are kept, with the statements they use, and the
 * rest is not. That holds as long as what they use is not the code of the
 * `<style>`: an import, or `import.meta`.
 */
export function exportsOfStylesheet(code: string, id: string): string {
  const body = parseAst(code).body;
  const isExport = (node: (typeof body)[number]) =>
    (node.type === "ExportNamedDeclaration" && !node.source) ||
    node.type === "ExportDefaultDeclaration";
  // The statement that declares a name, for those that are no export.
  const declaredBy = new Map<string, (typeof body)[number]>();
  for (const node of body) {
    if (isExport(node)) continue;
    const names = new Set<string>();
    boundNames(node, names);
    for (const name of names) declaredBy.set(name, node);
  }

  let other: string | undefined;
  const kept = new Set(body.filter(isExport));
  // What is added is visited too.
  for (const node of kept) {
    const used = new Set<string>();
    const meta = identifiersOf(node, used);
    if (meta) other = code.slice(node.start, node.end);
    for (const name of used) {
      const declaration = declaredBy.get(name);
      if (!declaration || kept.has(declaration)) continue;
      if (declaration.type === "ImportDeclaration") other = name;
      else kept.add(declaration);
    }
  }
  for (const node of body) {
    if (node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") {
      if (!kept.has(node)) other = code.slice(node.start, node.end);
    }
  }
  if (other !== undefined) {
    throw new Error(
      `vitest-plugin-rsc: vite@${viteVersion} differs from the Vite this plugin was written ` +
        `for: the exports of its module for the stylesheet ${id} need more than the class ` +
        `names (\`${other}\`). Use a version of vitest-plugin-rsc that supports vite@${viteVersion}.`,
    );
  }
  // A stylesheet that is no CSS module exports nothing.
  const exports = body.filter((node) => kept.has(node));
  return exports.length > 0
    ? exports.map((node) => code.slice(node.start, node.end)).join("\n")
    : "export {}";
}

type Layer = "rsc" | "browser";
type PageRoute = NextRoute | ComponentRoute;

export type StylesOptions = {
  getProject(): NextProject;
  /** The Vite environment of each layer. */
  environments: Record<NextLayer, string>;
  /**
   * Whether a file is server code in the rsc layer, which has the test files
   * too: the app's, and that of the packages it imports.
   */
  isServerCode(file: string): boolean;
  /**
   * Whether a file is the host's: a test file or a setup file of Vitest, or a
   * file of another host, like a story. What it imports is not the app's: in
   * the rsc layer it is no server code, and in the layer of the browser it is
   * a file with `"use client"`.
   */
  isHostFile(file: string): boolean;
  /** The page routes, by the name of their modules. */
  pageRoutes(): Map<string, PageRoute>;
  /**
   * The files of the host with `"use client"` that a static build has in the
   * layer of the browser, which render a node there: see build.ts.
   */
  builtClientFiles(): string[];
  /** The ids of the modules that list the routes: what leads from a test file to every route. */
  lists: string[];
};

export type Styles = {
  plugins: Plugin[];
  /** What a static build has of the stylesheets, once it is built, by its path in the build. */
  builtFiles(): { pathname: string; body: Uint8Array }[];
};

export function createStyles(options: StylesOptions): Styles {
  const { getProject, environments } = options;
  const layers = new Map(Object.entries(environments).map(([layer, name]) => [name, layer]));
  const lists = new Set(options.lists);
  // The stylesheets the browser was told of, by their path under `/_next/`: the id
  // of their module. The dev server serves these, and no other file.
  const stylesheetIds = new Map<string, string>();

  // The path of a stylesheet under `/_next/`, which is in the HTML of a page:
  // the URL Vite has for the file, so from the root of the project. A
  // stylesheet that is no file, like the CSS of a font, is named by a hash,
  // as Next's build names a CSS file.
  function serveAt(stylesheet: EnvironmentModuleNode): string {
    const url = stylesheet.url.split("?")[0]!;
    const name = url.startsWith("/")
      ? url
      : `/${createHash("sha1").update(url).digest("hex").slice(0, 16)}.css`;
    stylesheetIds.set(directory + name, stylesheet.id!);
    return directory + name;
  }
  // The files of the segments of a route, once per route. A layout that is
  // added later is found by a run that starts after it, as with the routes.
  const segmentFiles = new Map<PageRoute, Promise<string[]>>();
  function segmentFilesOf(route: PageRoute): Promise<string[]> {
    let files = segmentFiles.get(route);
    if (!files) {
      files = getProject()
        .loadRouteEntry(route)
        .then((entry) => entry.segmentFiles);
      segmentFiles.set(route, files);
      files.catch(() => segmentFiles.delete(route));
    }
    return files;
  }

  // What a module loaded as, by its layer and URL, and the invalidation of
  // the module it was loaded after. Some modules never have a result of their
  // own in Vite's graph, like a module that fails to compile: these are
  // loaded once, and not for every request. Until Vite invalidates the
  // module, or a file changes for one that failed.
  const loads = new Map<
    string,
    { module: Promise<EnvironmentModuleNode | undefined>; invalidated: number | undefined }
  >();

  // What Next's build does for the client entry of a segment file
  // (`FlightClientEntryPlugin`): it follows the imports of the file in the
  // rsc layer, takes the CSS it finds, and goes on from a Client Component in
  // the layer of the browser. A build has the whole graph. Vite's is there
  // for what was loaded, so the modules are transformed here first, which the
  // browser asks for right after.
  function reach(vite: ViteDevServer) {
    const references = getPluginApi(vite.config)?.manager.clientReferenceMetaMap;
    if (!references) {
      throw new Error(
        "vitest-plugin-rsc: vitestPluginNext() needs vitestPluginRSC() before it in the plugins.",
      );
    }
    const graphs: Record<Layer, DevEnvironment> = {
      rsc: vite.environments[environments.rsc]!,
      browser: vite.environments[environments.browser]!,
    };
    // A Client Component: its module in the rsc layer, which is a reference
    // without imports, and its module in the layer of the browser.
    const clientModules = new Map<EnvironmentModuleNode, EnvironmentModuleNode>();
    const followed = new Set<EnvironmentModuleNode>();
    const { pageExtensions = [] } = getProject().config as { pageExtensions?: string[] };

    // A module that fails to compile says so when the browser loads it. One
    // that cannot be found is the plugin's mistake, and says so here.
    async function load(layer: Layer, url: string): Promise<EnvironmentModuleNode | undefined> {
      // Vite RSC names a Client Component of a package by a URL of Vite's,
      // `/@id/__x00__…`, which Vite's own server unwraps before it loads it.
      if (url.startsWith("/@id/")) url = url.slice("/@id/".length).replace("__x00__", "\0");
      const key = `${layer}:${url}`;
      let loaded = loads.get(key);
      const node = await loaded?.module;
      if (node && node.lastInvalidationTimestamp !== loaded!.invalidated) loaded = undefined;
      if (!loaded) {
        const loading = graphs[layer]
          .transformRequest(url)
          .then(() => graphs[layer].moduleGraph.getModuleByUrl(url))
          .catch((error: { code?: string }) => {
            if (error?.code === "ERR_LOAD_URL") {
              vite.config.logger.warnOnce(
                `vitest-plugin-rsc: the CSS of ${url} is not linked: ${String(error)}`,
              );
            }
            return undefined;
          });
        loaded = { module: loading, invalidated: undefined };
        const entry = loaded;
        void loading.then((found) => (entry.invalidated = found?.lastInvalidationTimestamp));
        loads.set(key, loaded);
      }
      return loaded.module;
    }

    // A module of the page, which a file of the host with `"use client"`
    // imports in the layer of the browser, is the host's: see ../host-module.ts.
    // The server does not load it, nor what it imports.
    const isEnd = (id: string) => lists.has(id) || id.startsWith(hostModulePrefix);

    /** Has Vite's graphs know what `node` imports, as far as it goes. */
    async function follow(layer: Layer, node: EnvironmentModuleNode): Promise<void> {
      if (followed.has(node) || !node.id || isEnd(node.id)) return;
      followed.add(node);
      const reference = layer === "rsc" ? references![node.id] : undefined;
      if (reference) {
        const client = await load("browser", reference.importId);
        if (!client) return;
        clientModules.set(node, client);
        return follow("browser", client);
      }
      await Promise.all(
        Array.from(node.importedModules, async (imported) => {
          // Without an id it is a file that is only watched.
          if (!imported.id || isCSSRequest(imported.id)) return;
          // A file that is no code has no stylesheet to find, like an image
          // or the `.wasm` of a package that loads it with `new URL(…,
          // import.meta.url)`, which Vite adds to the imports of the module.
          // Compiling one as a module, which can be megabytes of binary data,
          // holds up the dev server for seconds.
          if (!isCode(imported.id, pageExtensions)) return;
          const loaded = imported.transformResult ? imported : await load(layer, imported.url);
          if (loaded) await follow(layer, loaded);
        }),
      );
    }

    /** The stylesheets that `start` reaches, in the order of the imports. */
    function collect(start: EnvironmentModuleNode[]): string[] {
      const paths = new Set<string>();
      const seen = new Set<EnvironmentModuleNode>();
      const visit = (node: EnvironmentModuleNode): void => {
        if (seen.has(node) || !node.id || isEnd(node.id)) return;
        seen.add(node);
        const client = clientModules.get(node);
        if (client) return visit(client);
        for (const imported of node.importedModules) {
          if (!imported.id) continue;
          if (isLinked(imported.id)) paths.add(serveAt(imported));
          else if (!isCSSRequest(imported.id)) visit(imported);
        }
      };
      start.forEach(visit);
      return [...paths];
    }

    return { load, follow, collect };
  }

  /**
   * The stylesheets of a route, per file of a segment: see `Stylesheets`. The
   * node of a test is the page of its route, and no file: its stylesheets are
   * those of the files that render it, which `isNodeFile` says. Those are in
   * the rsc layer, and in the layer of the browser with `"use client"`. With
   * `layouts: true` the layouts of the app around it have their own.
   */
  async function stylesheetsOf(
    vite: ViteDevServer,
    isNodeFile: (file: string) => boolean,
    entry: string,
    inline: boolean,
  ): Promise<Stylesheets> {
    const route = options.pageRoutes().get(entry);
    if (!route) return {};
    const { load, follow, collect } = reach(vite);
    const starts = new Map<string, { layer: Layer; node: EnvironmentModuleNode }[]>();

    await Promise.all(
      (await segmentFilesOf(route)).map(async (file) => {
        const node = await load("rsc", file);
        // As Next looks it up: `getLinkAndScriptTags()`.
        if (node) starts.set(file.replace(/\.[^.]+$/, ""), [{ layer: "rsc", node }]);
      }),
    );
    if ("component" in route) {
      const layers = ["rsc", "browser"] as const;
      const nodeModules = layers.flatMap((layer) =>
        Array.from(vite.environments[environments[layer]]!.moduleGraph.idToModuleMap.values())
          .filter((node) => node.file && isNodeFile(node.file))
          .map((node) => ({ layer, node })),
      );
      starts.set(componentPagePath, nodeModules);
    }

    await Promise.all([...starts.values()].flat().map(({ layer, node }) => follow(layer, node)));
    // Next puts the CSS in the page itself, in a `<style>`, where the app asks
    // for it. Its build does so for `next start`, which this is, and Next
    // does for a page load, which `inline` says this is.
    const { experimental } = getProject().config as { experimental?: { inlineCss?: boolean } };
    const contentOf = async (path: string) =>
      inline && experimental?.inlineCss ? (await cssOf(vite, path))?.code : undefined;
    // Also a file without any: it may have had some before an edit.
    return Object.fromEntries(
      await Promise.all(
        Array.from(starts, async ([file, start]) => [
          file,
          await Promise.all(
            collect(start.map(({ node }) => node)).map(async (path) => ({
              path,
              content: await contentOf(path),
            })),
          ),
        ]),
      ),
    );
  }

  // Under Vitest the node of a test is rendered by its test file, with the
  // setup files before it. Vitest says which test file asks.
  function fromVitest(
    { project, testPath }: BrowserCommandContext,
    entry: string,
    inline: boolean,
  ) {
    const files = new Set(
      [...project.config.setupFiles, ...(testPath ? [testPath] : [])].map((file) =>
        normalizePath(file),
      ),
    );
    return stylesheetsOf(project.vite, (file) => files.has(file), entry, inline);
  }

  // Another host does not say which of its files renders a node. Those that
  // it has loaded do, like the story files that Storybook has loaded: what a
  // test file and the setup files are to Vitest.
  function fromHost(vite: ViteDevServer, entry: string, inline: boolean) {
    return stylesheetsOf(vite, options.isHostFile, entry, inline);
  }

  // The CSS of a stylesheet that Next links, by its path under `/_next/`: the
  // CSS Vite makes of the file, the same one its module is made of, so with
  // the class names that module exports.
  async function cssOf(server: ViteDevServer, path: string) {
    const id = stylesheetIds.get(path);
    return id ? server.environments[environments.rsc]!.transformRequest(`${id}&direct`) : null;
  }

  // The stylesheet Next links.
  async function serve(
    server: ViteDevServer,
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> {
    const { assetPath } = getProject();
    const { pathname, searchParams } = new URL(request.url!, "http://n");
    // The stylesheets of a route, for the page of another host.
    if (pathname === stylesheetsPath) {
      const entry = searchParams.get("entry");
      if (!entry) return false;
      const stylesheets = await fromHost(server, entry, searchParams.get("inline") === "true");
      response.setHeader("content-type", "application/json");
      response.setHeader("cache-control", "no-cache");
      response.end(JSON.stringify(stylesheets));
      return true;
    }
    if (!pathname.startsWith(`${assetPath}${directory}/`)) return false;
    let path: string;
    try {
      // Next encodes the path segment by segment.
      path = pathname.slice(assetPath.length).split("/").map(decodeURIComponent).join("/");
    } catch {
      // Not a path that Next made.
      return false;
    }
    const css = await cssOf(server, path);
    if (!css) return false;
    send(request, response, css.code, "css", {
      etag: css.etag,
      cacheControl: "no-cache",
      headers: server.config.server.headers,
      map: css.map,
    });
    return true;
  }

  const built = createBuiltStylesheets(options, segmentFilesOf);

  const plugins: Plugin[] = [
    {
      name: "vitest-plugin-rsc:next-styles",
      enforce: "pre",
      // How a plugin gives the browser a command of its own, in Vitest's config.
      config: () => ({ test: { browser: { commands: { [stylesheetsCommand]: fromVitest } } } }),
      configureServer(vite) {
        // A load that failed may not after a change. One that did is
        // reloaded when Vite invalidates its module.
        vite.watcher.on("all", () => {
          for (const [key, loaded] of loads) {
            void loaded.module.then((node) => {
              if (!node && loads.get(key) === loaded) loads.delete(key);
            });
          }
        });
        vite.middlewares.use(async (request, response, next) => {
          let served: boolean;
          try {
            served = await serve(vite, request, response);
          } catch (error) {
            // As Next's server answers a request that failed. Vite would
            // answer it with the error overlay of a module.
            vite.config.logger.error(`vitest-plugin-rsc: ${request.url} failed. ${String(error)}`);
            response.statusCode = 500;
            response.end("Internal Server Error");
            return;
          }
          if (!served) next();
        });
      },
      async resolveId(source, importer, resolveOptions) {
        const layer = layers.get(this.environment.name);
        // With a query it is Vite's: `?inline`, `?url`, `?raw`. Whether it is
        // a stylesheet is clear once it is resolved: a package can be one,
        // like `@fontsource/inter`, and so can an alias.
        if (!layer || !importer || source.includes("?") || isScriptRequest(source)) return;
        // The rsc layer shares its environment with the test: the CSS a test
        // file imports stays the browser's. In the other two every module is the
        // app's, but for a file of the host with `"use client"`.
        const file = importer.split("?")[0]!;
        if (layer === "rsc" ? !options.isServerCode(file) : options.isHostFile(file)) return;
        const resolved = await this.resolve(source, importer, {
          ...resolveOptions,
          skipSelf: true,
        });
        if (!resolved || resolved.external || resolved.id.includes("?")) return resolved;
        if (!isCSSRequest(resolved.id)) return resolved;
        return { ...resolved, id: linked(resolved.id, this.environment.mode === "build") };
      },
    },
    {
      name: "vitest-plugin-rsc:next-styles-module",
      // After Vite has made the module of the stylesheet.
      enforce: "post",
      applyToEnvironment: (environment) => layers.has(environment.name),
      transform(code, id) {
        if (!isLinked(id) || directRE.test(id)) return;
        return { code: exportsOfStylesheet(code, id), map: { mappings: "" } };
      },
    },
    built.plugin,
  ];
  return { plugins, builtFiles: built.files };
}

type Manager = NonNullable<ReturnType<typeof getPluginApi>>["manager"];

// What Vite's CSS plugin leaves in the CSS of a build for a file it names,
// until the file has its name: one the build emits, and one of `public/`.
const builtAssetRE = /__VITE_ASSET__([\w$]+)__/g;
const publicAssetRE = /__VITE_PUBLIC_ASSET__([a-z\d]{8})__/g;
// How Vite's build names a file of `public/` there: the first characters of
// the SHA-256 of its URL.
const publicAssetHash = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 8);

/**
 * The stylesheets of a static build, which has no dev server to ask. So the
 * build does what Next's build does: it writes each stylesheet into a file of
 * its own under `/_next/static/css/`, and the stylesheets of every page route
 * into a file next to the layers, which the page reads (`builtStylesheetsOf()`
 * in styles-command.ts).
 *
 * The CSS is what Vite's CSS plugin compiles the file into, with the files it
 * names by the way from the stylesheet. Vite leaves a stylesheet that Next
 * links out of the CSS of its chunks, see `linked()`: it is on the pages that
 * link it, and only there. The lists are read off the module graphs of the
 * build, as `reach()` reads them off the dev server's: the rsc layer for the
 * files of the segments and the files of the host, which render a node, and
 * the layer of the browser for the Client Components, which is built after it.
 */
function createBuiltStylesheets(
  options: StylesOptions,
  segmentFilesOf: (route: PageRoute) => Promise<string[]>,
) {
  const { environments, getProject } = options;
  const lists = new Set(options.lists);
  const layerOf = (environment: string): Layer | undefined =>
    environment === environments.rsc
      ? "rsc"
      : environment === environments.browser
        ? "browser"
        : undefined;
  let manager: Manager | undefined;
  let publicDir: string | false = false;
  const key = (layer: Layer, id: string) => `${layer}\0${id}`;
  // What Vite's CSS plugin compiled each stylesheet into, and the file of it
  // in the build, by layer and id.
  const compiled = new Map<string, string>();
  const files = new Map<string, string>();
  // What each segment of a page route reaches in the rsc layer: a stylesheet,
  // or a Client Component, by the id the layer of the browser imports it by.
  // The node of a route of a node also has what the files of the host with
  // `"use client"` reach.
  type Reached = { stylesheet: string } | { client: string } | { clientFiles: true };
  const routes = new Map<string, Map<string, Reached[]>>();
  // And the stylesheets each Client Component reaches in the layer of the
  // browser, and the client files of the host.
  const clients = new Map<string, string[]>();
  let clientFiles: string[] = [];

  // The URL of each file of `public/`, by the name Vite's build gives it.
  let publicFiles: Map<string, string> | undefined;
  const publicUrl = (hash: string) => {
    if (!publicFiles) {
      publicFiles = new Map();
      const files = publicDir ? fs.readdirSync(publicDir, { recursive: true }) : [];
      for (const file of files) {
        const url = `/${normalizePath(String(file))}`;
        publicFiles.set(publicAssetHash(url), url);
      }
    }
    return publicFiles.get(hash);
  };

  type Context = {
    getModuleInfo(
      id: string,
    ): { importedIds: readonly string[]; dynamicallyImportedIds: readonly string[] } | null;
  };
  // The stylesheets that `starts` reach in the graph of a build, in the order
  // of the imports, and the Client Components, where the rsc layer has them.
  function reachIn(
    context: Context,
    starts: string[],
    references: Manager["clientReferenceMetaMap"] = {},
  ): Reached[] {
    const reached: Reached[] = [];
    const seen = new Set<string>();
    const visit = (id: string): void => {
      if (seen.has(id) || lists.has(id) || id.startsWith(hostModulePrefix)) return;
      seen.add(id);
      const reference = references[id];
      if (reference) {
        reached.push({ client: reference.importId });
        return;
      }
      const info = context.getModuleInfo(id);
      if (!info) return;
      for (const imported of [...info.importedIds, ...info.dynamicallyImportedIds]) {
        if (isLinked(imported)) reached.push({ stylesheet: imported });
        else if (!isCSSRequest(imported)) visit(imported);
      }
    };
    starts.forEach(visit);
    return reached;
  }

  const plugin: Plugin = {
    name: "vitest-plugin-rsc:next-styles-build",
    apply: "build",
    configResolved(config) {
      manager = getPluginApi(config)?.manager;
      publicDir = config.publicDir || false;
    },
    buildStart() {
      const layer = layerOf(this.environment.name);
      if (!layer || manager?.isScanBuild) return;
      for (const map of [compiled, files]) {
        for (const id of map.keys()) if (id.startsWith(key(layer, ""))) map.delete(id);
      }
      if (layer === "rsc") routes.clear();
      else {
        clients.clear();
        clientFiles = [];
      }
    },
    // Between Vite's two CSS plugins: the CSS, and not yet the module.
    transform(code, id) {
      const layer = layerOf(this.environment.name);
      if (!layer || manager?.isScanBuild || !isLinked(id) || directRE.test(id)) return;
      compiled.set(key(layer, id), code);
    },
    async buildEnd(error) {
      const layer = layerOf(this.environment.name);
      if (error || !layer || !manager || manager.isScanBuild) return;
      if (layer === "rsc") {
        const hostFiles = [...this.getModuleIds()].filter(
          (id) => !id.startsWith("\0") && options.isHostFile(id.split("?")[0]!),
        );
        for (const [entry, route] of options.pageRoutes()) {
          const segments = new Map<string, Reached[]>();
          for (const file of await segmentFilesOf(route)) {
            // Vite has a module by the real path of its file.
            let id = normalizePath(file);
            if (!this.getModuleInfo(id) && fs.existsSync(file)) {
              id = normalizePath(fs.realpathSync(file));
            }
            const reached = reachIn(this, [id], manager.clientReferenceMetaMap);
            // As Next looks it up: `getLinkAndScriptTags()`.
            segments.set(file.replace(/\.[^.]+$/, ""), reached);
          }
          if ("component" in route) {
            const reached = reachIn(this, hostFiles, manager.clientReferenceMetaMap);
            segments.set(componentPagePath, [...reached, { clientFiles: true }]);
          }
          routes.set(entry, segments);
        }
        return;
      }
      const stylesheetsOf = (reached: Reached[]) =>
        reached.flatMap((item) => ("stylesheet" in item ? [item.stylesheet] : []));
      // A client file imports the modules in between by the file each has in
      // the build, and those import what the file imports: see client-files.ts.
      const files = [
        ...options.builtClientFiles().map((file) => normalizePath(file)),
        ...[...this.getModuleIds()].filter((id) => id.startsWith(liveModulePrefix)),
      ];
      clientFiles = stylesheetsOf(reachIn(this, files));
      // The Client Components that a route reaches, as the list of every
      // reference imports them: see build.ts.
      const importer = `\0${clientReferencesId}`;
      for (const segments of routes.values()) {
        for (const reached of [...segments.values()].flat()) {
          if (!("client" in reached) || clients.has(reached.client)) continue;
          const resolved = await this.resolve(reached.client, importer);
          clients.set(reached.client, resolved ? stylesheetsOf(reachIn(this, [resolved.id])) : []);
        }
      }
    },
    generateBundle() {
      const layer = layerOf(this.environment.name);
      if (!layer || manager?.isScanBuild) return;
      const directory = `${getProject().assetPath.slice(1)}static/css/`;
      // The way from a stylesheet to the directory of the build.
      const toRoot = toBuildDir(`${directory}stylesheet.css`);
      for (const [id, css] of compiled) {
        if (!id.startsWith(key(layer, ""))) continue;
        const source = css
          .replace(builtAssetRE, (_, reference: string) => toRoot + this.getFileName(reference))
          .replace(publicAssetRE, (placeholder, hash: string) => {
            const url = publicUrl(hash);
            return url ? toRoot + url.slice(1) : placeholder;
          })
          .replaceAll(`${cssBuildDirPlaceholder}/`, toRoot);
        // Named after the file, and what is in it, as Next's build names one.
        // The CSS of a font is no file.
        const file = id.slice(key(layer, "").length).split("?")[0]!;
        const name = file.startsWith("\0") ? "font" : path.basename(file).replace(/\.[^.]*$/, "");
        const hash = createHash("sha256").update(source).digest("hex").slice(0, 8);
        const fileName = `${directory}${name.replace(/[^\w.-]+/g, "_")}-${hash}.css`;
        this.emitFile({ type: "asset", fileName, source });
        files.set(id, fileName);
      }
    },
  };

  /** The stylesheets of every page route, by the files of the build. */
  function builtFiles(): { pathname: string; body: Uint8Array }[] {
    if (routes.size === 0) return [];
    const built: BuiltStylesheets = { assetPath: getProject().assetPath, routes: {} };
    for (const [entry, segments] of routes) {
      built.routes[entry] = Object.fromEntries(
        Array.from(segments, ([segment, reached]) => {
          const ids = reached.flatMap((item) =>
            "stylesheet" in item
              ? [key("rsc", item.stylesheet)]
              : ("client" in item ? (clients.get(item.client) ?? []) : clientFiles).map((id) =>
                  key("browser", id),
                ),
          );
          return [segment, [...new Set(ids.flatMap((id) => files.get(id) ?? []))]];
        }),
      );
    }
    return [{ pathname: `/${builtStylesheetsFile}`, body: Buffer.from(JSON.stringify(built)) }];
  }

  return { plugin, files: builtFiles };
}
