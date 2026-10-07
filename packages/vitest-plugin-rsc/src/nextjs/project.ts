import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { init as initCjsLexer, parse as parseCjs } from "cjs-module-lexer";
import querystring from "node:querystring";
import { stripVTControlCharacters } from "node:util";
import { compileFunction } from "node:vm";
import type { AppLoaderOptions } from "next/dist/build/webpack/loaders/next-app-loader/index.js";
import { parseAst, transformWithOxc } from "vite";
import { rscFlightCodec, type FlightEntry } from "./flight.ts";

// The one file that calls the build code of the project's own `next`. The
// routes, the route entries, the compile-time constants and the alias tables
// are what `next build` computes. What the plugin assumes about them, and
// about the runtime it runs them on, is checked here, so that another Next
// fails when a run starts, with its version and what changed.

/** The layers Next compiles an App Router app into, each with its own React. */
export type NextLayer = "rsc" | "ssr" | "browser";

export type NextRoute = {
  /** What serves the route: a `page.tsx` with its layouts, or a `route.ts`. */
  kind: "page" | "route";
  /** App page name, e.g. `/notes/[id]/page` or `/api/notes/[id]/route`. */
  page: string;
  /** Routable pathname, e.g. `/notes/[id]`. */
  pathname: string;
  /** `private-next-app-dir/...`, or an absolute path for Next's builtin pages. */
  pagePath: string;
  /** The pages of the route: `page`, and those of its parallel routes. */
  appPaths: string[];
};

/** A route of a node, see `NextProject.componentRoutes`. */
export type ComponentRoute = {
  kind: "page";
  /**
   * Its page name, e.g. `/notes/[id]/page`, from which Next takes its params
   * and the tags of its path. `revalidatePath("/notes/[id]", "page")` expires
   * the cached reads with those tags. A page of the app can have the same
   * name.
   */
  page: string;
  /** Routable pathname, e.g. `/notes/[id]`. */
  pathname: string;
  /** What its modules are listed by, which no page of the app has as its name. */
  component: string;
};

export type NextProject = {
  root: string;
  appDir: string;
  /** Directory of the installed `next` package. */
  nextDir: string;
  /** Version of the installed `next` package. */
  version: string;
  routes: NextRoute[];
  /**
   * The routes `renderServer(<Node />, { url })` renders a node in: one for
   * each pathname of the app, so that a URL has the params of the app's route,
   * and one for `/`, for a node without a url or with a URL of no route.
   */
  componentRoutes: ComponentRoute[];
  /** The metadata files of the app, like `app/icon.png`, which are not served yet. */
  metadataFiles: string[];
  /** The resolved `next.config`, as far as it serializes. */
  config: Record<string, unknown>;
  /** Next's compile-time constants per layer, as code strings. */
  defines: Record<NextLayer, Record<string, string>>;
  /** Next's compiler aliases per layer, in webpack's notation: `$` ends an exact match. */
  aliases: Record<NextLayer, Record<string, string | false>>;
  /**
   * The exports of each entry of the Flight codec that the rsc layer imports
   * as `react-server-dom-webpack/<entry>`.
   */
  flightExports: Record<FlightEntry, string[]>;
  /**
   * The rsc-layer module of a route, from Next's app loader, with this
   * package's runtime where Next's code names its bundler. For a page: its
   * loader tree and `entry-base`. For a route handler: its route module.
   *
   * For a route of a node: Next's page template around a loader tree that has
   * the segments of the pathname, and the node as its page. Nothing of the app.
   */
  loadAppPageEntry(
    route: NextRoute | ComponentRoute,
  ): Promise<{ code: string; watchFiles: string[] }>;
  /**
   * Next's edge `handler(Request)` of a route. `userland` is what it serves:
   * for a route handler the specifier of its route module, for a page an
   * expression for its rsc-layer module, which lives in another environment.
   */
  loadEdgeEntry(route: NextRoute | ComponentRoute, userland: string): Promise<string>;
  /**
   * Next's SWC transform of a module of the app, for a layer. Nothing for a
   * client module in the rsc layer: Vite RSC turns it into references.
   */
  compile(code: string, file: string, layer: NextLayer): Promise<Compiled | undefined>;
  /** Whether Next's build imports a file as an image: `next-image-loader`. */
  isImage(file: string): boolean;
  /** The module of an image: what `next-image-loader` makes of the file. */
  loadImage(file: string): Promise<string>;
  /**
   * A call of a `next/font` function, by the import the SWC transform turns it
   * into: the CSS of the font, and what the call returns.
   */
  loadFont(request: string): Promise<{ css: string; exports: Record<string, unknown> }>;
  /** A file the loaders emitted for the browser, by the path the browser asks for. */
  readEmittedFile(pathname: string): { body: Buffer; contentType: string } | undefined;
  /**
   * Answers a request for `/_next/image` with Next's image optimizer, as
   * `next start` does, and resolves with whether it was one. `serveFile`
   * answers the request for an image of the app.
   */
  optimizeImage(
    request: IncomingMessage,
    response: ServerResponse,
    serveFile: ServeFile,
  ): Promise<boolean>;
};

export type Compiled = { code: string; map?: string };

/** Answers a request the way the server does: what Next calls for an image of the app. */
export type ServeFile = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

// What Next's webpack loaders use of their context. Each loader here is
// called the way webpack calls it.
type LoaderContext = {
  getOptions(): unknown;
  async(): (error: Error | null, ...result: unknown[]) => void;
  currentTraceSpan: TraceSpan;
  resourcePath: string;
  resourceQuery: string;
  context: string;
  rootContext: string;
  emitFile(name: string, content: Buffer): void;
  emitWarning(warning: Error): void;
  emitError(error: Error): void;
  addDependency(file: string): void;
  resolve(
    directory: string,
    request: string,
    callback: (error: Error | null, file?: string) => void,
  ): void;
  getResolve(): () => Promise<never>;
  fs: typeof fs;
  utils: { contextify(context: string, request: string): string };
  sourceMap: boolean;
};
type TraceSpan = {
  traceChild(): TraceSpan;
  traceFn<T>(fn: () => T): T;
  traceAsyncFn<T>(fn: () => T): T;
  setAttribute(): void;
};
type Loader = (this: LoaderContext, ...input: unknown[]) => unknown;

// What next-app-loader uses of webpack's loader context.
type AppLoaderContext = {
  getOptions(): AppLoaderOptions;
  _module: { buildInfo: Record<string, unknown> };
  _compilation: object;
  _compiler: { context: string };
  addDependency(file: string): void;
  addMissingDependency(file: string): void;
  addContextDependency(dir: string): void;
};

// Next runs a compiled `next.config.ts` as a module without a filename, so
// Node looks up a relative import of the config, like `./env/server.ts`, from
// the working directory. For `next build` that is the project. Vitest loads
// the projects of a workspace in one process, so they take turns to have it.
const workingDirectory = process.cwd();
let directoryQueue: Promise<unknown> = Promise.resolve();

function inDirectory<T>(directory: string, load: () => Promise<T>): Promise<T> {
  const result = directoryQueue.then(async () => {
    process.chdir(directory);
    try {
      return await load();
    } finally {
      process.chdir(workingDirectory);
    }
  });
  directoryQueue = result.catch(() => {});
  return result;
}

// An exported name: an identifier or a string.
function nameOf(node: object): string {
  return "name" in node ? String(node.name) : "value" in node ? String(node.value) : "";
}

// An import of an ES module of Next by its path, which leaves out `.js`.
function resolveImport(file: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".") && !path.isAbsolute(specifier)) return;
  const base = path.resolve(path.dirname(file), specifier);
  return [base, `${base}.js`, path.join(base, "index.js")].find((candidate) =>
    fs.statSync(candidate, { throwIfNoEntry: false })?.isFile(),
  );
}

/** An export of an ES module: the code that declares it, and the function, if it is one. */
type Declared = { code: string; params?: object[] };

/**
 * The declaration of an export of an ES module: also when it is exported apart
 * from its declaration, or comes from another module with `export ... from`
 * or `export *`. Empty for one whose declaration is not found, like an import
 * that is exported again. `undefined` when the module has no such export.
 */
function declarationOf(file: string, name: string, seen = new Set<string>()): Declared | undefined {
  if (seen.has(file)) return;
  seen.add(file);
  const code = fs.readFileSync(file, "utf8");
  const declared = new Map<string, Declared>();
  const exported = new Map<string, string>();
  const stars: string[] = [];
  for (const node of parseAst(code).body) {
    const isExport = node.type === "ExportNamedDeclaration";
    const declaration = isExport ? node.declaration : node;
    if (declaration?.type === "VariableDeclaration") {
      for (const declarator of declaration.declarations) {
        if (declarator.id.type !== "Identifier") continue;
        const { init } = declarator;
        declared.set(declarator.id.name, {
          code: code.slice(declarator.start, declarator.end),
          params: init && "params" in init ? init.params : undefined,
        });
        if (isExport) exported.set(declarator.id.name, declarator.id.name);
      }
    } else if (
      (declaration?.type === "FunctionDeclaration" || declaration?.type === "ClassDeclaration") &&
      declaration.id
    ) {
      declared.set(declaration.id.name, {
        code: code.slice(declaration.start, declaration.end),
        params: "params" in declaration ? declaration.params : undefined,
      });
      if (isExport) exported.set(declaration.id.name, declaration.id.name);
    }
    if (isExport) {
      for (const specifier of node.specifiers) {
        if (nameOf(specifier.exported) !== name) continue;
        if (!node.source) exported.set(name, nameOf(specifier.local));
        else {
          const from = resolveImport(file, node.source.value);
          return (from && declarationOf(from, nameOf(specifier.local))) || { code: "" };
        }
      }
    } else if (node.type === "ExportAllDeclaration" && !node.exported) {
      stars.push(node.source.value);
    }
  }
  const local = exported.get(name);
  if (local !== undefined) return declared.get(local) ?? { code: "" };
  for (const star of stars) {
    const from = resolveImport(file, star);
    const found = from && declarationOf(from, name, seen);
    if (found) return found;
  }
}

// The keys of the options object that a function takes, however it reads them:
// in its parameter, or off the parameter in its body.
function optionKeys({ code, params = [] }: Declared): string[] {
  const [param] = params as { type: string; name?: string; properties?: object[] }[];
  if (param?.type === "ObjectPattern") {
    return param.properties!.flatMap((property) =>
      "key" in property && property.key ? [nameOf(property.key)] : [],
    );
  }
  if (param?.type !== "Identifier") return [];
  const options = param.name!;
  return [
    ...Array.from(code.matchAll(new RegExp(`\\b${options}\\.(\\w+)`, "g")), (match) => match[1]!),
    ...Array.from(code.matchAll(new RegExp(`\\{([^}]*)\\}\\s*=\\s*${options}\\b`, "g")), (match) =>
      match[1]!.split(",").map((part) => part.split(":")[0]!.trim()),
    ).flat(),
  ];
}

// The root segment of the routes of a node: see `loadComponentPageEntry()`.
// The parentheses make it a route group for Next, so it never shows in a
// pathname.
const componentRoot = "(vitest-plugin-rsc)";
// The exports of a module of the app, without what they are: `undefined`.
async function exportStubs(code: string, file: string): Promise<string> {
  const compiled = await transformWithOxc(code, file, { sourcemap: false });
  const names = new Set<string>();
  const stars: string[] = [];
  // The names a pattern binds, like `{ a, b: [c] }`.
  const bound = (pattern: object | null): void => {
    if (!pattern || !("type" in pattern)) return;
    if (pattern.type === "Identifier") names.add(nameOf(pattern));
    for (const key of ["properties", "elements", "value", "argument", "left"] as const) {
      const child = (pattern as Record<string, unknown>)[key];
      for (const part of [child].flat()) if (typeof part === "object") bound(part);
    }
  };
  for (const node of parseAst(compiled.code).body) {
    if (node.type === "ExportDefaultDeclaration") names.add("default");
    else if (node.type === "ExportAllDeclaration") {
      if (node.exported) names.add(nameOf(node.exported));
      // Its names are in the other module, which this one has to load for them.
      else stars.push(`export * from ${JSON.stringify(node.source.value)};\n`);
    } else if (node.type === "ExportNamedDeclaration") {
      for (const specifier of node.specifiers) names.add(nameOf(specifier.exported));
      const { declaration } = node;
      if (declaration?.type === "VariableDeclaration") {
        for (const { id } of declaration.declarations) bound(id);
      } else if (declaration && "id" in declaration && declaration.id) {
        names.add(nameOf(declaration.id));
      }
    }
  }
  const named = [...names].filter((name) => /^[\w$]+$/.test(name) && name !== "default");
  return (
    (named.length > 0
      ? `const _ = undefined;\nexport { ${named.map((name) => `_ as ${name}`).join(", ")} };\n`
      : "") +
    (names.has("default") ? "export default undefined;\n" : "") +
    stars.join("")
  );
}

// The source files whose TypeScript and JSX Vite compiles: not a `.js` file.
const compiledByVite = /\.(?:m?ts|[jt]sx)$/;

// Next's templates carry Turbopack-only import attributes. They mean nothing
// to Vite and are a syntax error in a browser.
function stripTurbopackTransitions(code: string): string {
  return code.replace(/\s+with\s*\{\s*['"]turbopack-transition['"]\s*:\s*['"][^'"]*['"]\s*\}/g, "");
}

export async function loadNextProject(
  root: string,
  require: NodeJS.Require = createRequire(path.join(root, "package.json")),
): Promise<NextProject> {
  const nextDir = path.dirname(require.resolve("next/package.json"));
  const { version } = require("next/package.json") as { version: string };
  const [major = 0, minor = 0] = version.split(".").map(Number);
  // 16.4 is where Next's request stores became one per realm, which is what
  // lets the layers run as separate module graphs.
  if (major < 16 || (major === 16 && minor < 4)) {
    throw new Error(`vitest-plugin-rsc/nextjs needs next@16.4 or later, found next@${version}.`);
  }
  const fail = (what: string, cause?: unknown): never => {
    throw new Error(
      `vitest-plugin-rsc: next@${version} differs from the Next.js this plugin was written for: ` +
        `${what}. Use a version of vitest-plugin-rsc that supports next@${version}.`,
      { cause },
    );
  };
  // A module of Next's build. An export that is gone fails where it is read.
  const load = <T extends object>(file: string): T => {
    let loaded: T;
    try {
      loaded = require(`next/dist/${file}.js`) as T;
    } catch (error) {
      return fail(`next/dist/${file}.js does not load (${(error as Error).message})`, error);
    }
    return new Proxy(loaded, {
      get: (target, name) =>
        target[name as keyof T] !== undefined
          ? target[name as keyof T]
          : fail(`next/dist/${file}.js has no export \`${String(name)}\``),
    });
  };
  // A piece of the code Next generates that is replaced for Vite.
  const replace = (code: string, piece: string | RegExp, replacement: string, where: string) => {
    const replaced = code.replace(piece, replacement);
    return replaced === code ? fail(`${where} has no \`${piece}\` to replace`) : replaced;
  };

  const loadConfig = load<typeof import("next/dist/server/config.js")>("server/config").default;
  const { PHASE_PRODUCTION_BUILD } =
    load<typeof import("next/dist/shared/lib/constants.js")>("shared/lib/constants");
  const { APP_DIR_ALIAS } = load<typeof import("next/dist/lib/constants.js")>("lib/constants");
  const { findPagesDir } =
    load<typeof import("next/dist/lib/find-pages-dir.js")>("lib/find-pages-dir");
  const { discoverRoutes } =
    load<typeof import("next/dist/build/route-discovery.js")>("build/route-discovery");
  const { normalizeCatchAllRoutes } = load<
    typeof import("next/dist/build/normalize-catchall-routes.js")
  >("build/normalize-catchall-routes");
  const { normalizeAppPath, compareAppPaths, selectAppPageEntry } = load<
    typeof import("next/dist/shared/lib/router/utils/app-paths.js")
  >("shared/lib/router/utils/app-paths");
  const { isAppRouteRoute } =
    load<typeof import("next/dist/lib/is-app-route-route.js")>("lib/is-app-route-route");
  const { isAppPageRoute } =
    load<typeof import("next/dist/lib/is-app-page-route.js")>("lib/is-app-page-route");
  const { findMissingCanonicalInterceptionRoutes } = load<
    typeof import("next/dist/shared/lib/router/utils/interception-routes.js")
  >("shared/lib/router/utils/interception-routes");
  const { MissingCanonicalInterceptionRoutesError } = load<
    typeof import("next/dist/shared/lib/errors/missing-canonical-interception-routes-error.js")
  >("shared/lib/errors/missing-canonical-interception-routes-error");
  const { IncompatibleParallelRouteSlotsError } = load<
    typeof import("next/dist/shared/lib/errors/incompatible-parallel-route-slots-error.js")
  >("shared/lib/errors/incompatible-parallel-route-slots-error");
  const { UnmatchedAppPagesError } = load<
    typeof import("next/dist/shared/lib/errors/unmatched-app-pages-error.js")
  >("shared/lib/errors/unmatched-app-pages-error");
  const { isMetadataRouteFile, DEFAULT_METADATA_ROUTE_EXTENSIONS } = load<
    typeof import("next/dist/lib/metadata/is-metadata-route.js")
  >("lib/metadata/is-metadata-route");
  const { generateBuildId } =
    load<typeof import("next/dist/build/generate-build-id.js")>("build/generate-build-id");
  const { getDefineEnv } = load<typeof import("next/dist/build/define-env.js")>("build/define-env");
  const { SUPPORTED_NATIVE_MODULES } = load<
    typeof import("next/dist/build/webpack/plugins/middleware-plugin.js")
  >("build/webpack/plugins/middleware-plugin");
  const compilerAliases = load<typeof import("next/dist/build/create-compiler-aliases.js")>(
    "build/create-compiler-aliases",
  );
  const { needsExperimentalReact } = load<
    typeof import("next/dist/lib/needs-experimental-react.js")
  >("lib/needs-experimental-react");
  const { loadEntrypoint } =
    load<typeof import("next/dist/build/load-entrypoint.js")>("build/load-entrypoint");
  const nextAppLoader = load<
    typeof import("next/dist/build/webpack/loaders/next-app-loader/index.js")
  >("build/webpack/loaders/next-app-loader/index").default as unknown as (
    this: AppLoaderContext,
  ) => Promise<string>;
  const { IncrementalCache } = load<
    typeof import("next/dist/server/lib/incremental-cache/index.js")
  >("server/lib/incremental-cache/index");
  const swc = load<typeof import("next/dist/build/swc/index.js")>("build/swc/index");
  const { getLoaderSWCOptions } =
    load<typeof import("next/dist/build/swc/options.js")>("build/swc/options");
  const { WEBPACK_LAYERS } = load<typeof import("next/dist/lib/constants.js")>("lib/constants");
  const { COMPILER_NAMES } =
    load<typeof import("next/dist/shared/lib/constants.js")>("shared/lib/constants");
  const loadJsConfig =
    load<typeof import("next/dist/build/load-jsconfig.js")>("build/load-jsconfig").default;
  const { getRSCModuleInformation } = load<
    typeof import("next/dist/build/analysis/get-page-static-info.js")
  >("build/analysis/get-page-static-info");
  const { nextImageLoaderRegex } =
    load<typeof import("next/dist/build/webpack-config.js")>("build/webpack-config");
  const nextImageLoader = load<
    typeof import("next/dist/build/webpack/loaders/next-image-loader/index.js")
  >("build/webpack/loaders/next-image-loader/index").default as unknown as Loader;
  const { getNextFontLoader } = load<
    typeof import("next/dist/build/webpack/config/blocks/css/loaders/next-font.js")
  >("build/webpack/config/blocks/css/loaders/next-font");
  const nextFontLoader = load<
    typeof import("next/dist/build/webpack/loaders/next-font-loader/index.js")
  >("build/webpack/loaders/next-font-loader/index").default as unknown as Loader;
  const imageOptimizer =
    load<typeof import("next/dist/server/image-optimizer.js")>("server/image-optimizer");
  const { getContentType, getExtension } =
    load<typeof import("next/dist/server/serve-static.js")>("server/serve-static");

  // The app is served the way a deployment serves it: production Next on its
  // edge runtime. React itself stays a development build, see plugin.ts.
  const config = await inDirectory(root, () =>
    loadConfig(PHASE_PRODUCTION_BUILD, root, { silent: true }),
  );
  const { appDir } = findPagesDir(root);
  if (!appDir) {
    throw new Error(`vitest-plugin-rsc: no \`app\` directory found in ${root}`);
  }
  const { pageExtensions } = config;
  const distDir = path.join(root, config.distDir);

  const discovered = await discoverRoutes({
    appDir,
    pagesDir: undefined,
    pageExtensions,
    isDev: false,
    baseDir: root,
    isSrcDir: path.basename(path.dirname(appDir)) === "src",
  });
  const mappedAppPages =
    discovered.mappedAppPages ?? fail("`discoverRoutes()` returns no `mappedAppPages`");
  // The routes, the way `createEntrypoints` of `next build` lists them. A
  // route is every page with the same pathname: `/dashboard/page` and the
  // parallel `/dashboard/@stats/page` are one route.
  const appPathsPerRoute: Record<string, string[]> = {};
  for (const page of Object.keys(mappedAppPages)) {
    (appPathsPerRoute[normalizeAppPath(page)] ??= []).push(page);
  }
  // Next's type of the config leaves this option out.
  const { strictRouteMatching: strict } = config.experimental as { strictRouteMatching?: boolean };
  const strictRouteMatching = strict || undefined;
  // Adds a catch-all page to the routes it also matches, and drops the routes
  // that can never render.
  const { unmatchedAppPages, incompatibleParallelRouteSlots } = normalizeCatchAllRoutes(
    appPathsPerRoute,
    { strictRouteMatching, defaultAppPaths: Object.keys(discovered.mappedAppDefaults ?? {}) },
  );
  // What `createEntrypoints` of `next build` rejects, with its errors.
  const pagePathsPerRoute = Object.fromEntries(
    Object.entries(appPathsPerRoute).flatMap(([pathname, appPaths]) => {
      const pages = appPaths.filter(isAppPageRoute);
      return pages.length > 0 ? [[pathname, pages]] : [];
    }),
  );
  const routeErrors = [
    ...(strictRouteMatching && findMissingCanonicalInterceptionRoutes(pagePathsPerRoute).length > 0
      ? [
          new MissingCanonicalInterceptionRoutesError(
            findMissingCanonicalInterceptionRoutes(pagePathsPerRoute),
          ),
        ]
      : []),
    ...(incompatibleParallelRouteSlots.length > 0
      ? [
          new IncompatibleParallelRouteSlotsError(
            incompatibleParallelRouteSlots.map((slot) => ({
              ...slot,
              layoutFile: path.relative(root, path.join(appDir, slot.layoutPath, "layout")),
            })),
          ),
        ]
      : []),
    ...(unmatchedAppPages.length > 0 ? [new UnmatchedAppPagesError(unmatchedAppPages)] : []),
  ];
  if (routeErrors.length > 0) {
    throw new Error(
      `vitest-plugin-rsc: \`next build\` fails on the routes of this app.\n\n` +
        routeErrors.map((error) => error.message).join("\n\n"),
    );
  }
  // Next also lists metadata files like `sitemap.ts` and `icon.png` as app
  // routes. Those need its metadata loaders and are not served yet.
  const fileOf = (appPath: string) => mappedAppPages[appPath]!.slice(APP_DIR_ALIAS.length);
  const isMetadataFile = (appPath: string) =>
    isAppRouteRoute(appPath) &&
    isMetadataRouteFile(fileOf(appPath), DEFAULT_METADATA_ROUTE_EXTENSIONS, true);
  const isRouteHandler = (appPath: string) => isAppRouteRoute(appPath) && !isMetadataFile(appPath);
  const metadataFiles = Object.keys(mappedAppPages)
    .filter(isMetadataFile)
    .map((appPath) =>
      path
        .relative(root, path.join(appDir, fileOf(appPath)))
        .split(path.sep)
        .join("/"),
    )
    .sort();
  const routes: NextRoute[] = [];
  for (const [pathname, appPaths] of Object.entries(appPathsPerRoute)) {
    appPaths.sort(compareAppPaths);
    const page = selectAppPageEntry(pathname, appPaths);
    const pagePath = mappedAppPages[page]!;
    // A route's own files: a catch-all page of a slot is listed with every
    // route it also matches, like a route handler's.
    const own = appPaths.filter((appPath) => normalizeAppPath(appPath) === pathname);
    const pages = own.filter((appPath) => appPath.endsWith("/page"));
    const handlers = own.filter(isRouteHandler);
    // `next build` fails on this too.
    if (pages.length > 0 && handlers.length > 0) {
      throw new Error(
        `vitest-plugin-rsc: ${pathname} is both a page and a route handler ` +
          `(${pages.join(", ")} and ${handlers.join(", ")}). A path can only be one of them.`,
      );
    }
    // What the route is, is what Next builds for it: the file it selects.
    const kind = page.endsWith("/page") ? "page" : isRouteHandler(page) ? "route" : undefined;
    if (kind) routes.push({ kind, page, pathname, appPaths, pagePath });
  }

  const buildId = await generateBuildId(config.generateBuildId, () => "vitest");
  // The environment variables Next's build gives every edge function. A build
  // makes up the keys; here they are the same on every run, so that the
  // pre-bundled dependencies they are compiled into stay cached.
  const edgeEnvironment = {
    __NEXT_BUILD_ID: buildId,
    __NEXT_PREVIEW_MODE_ID: "vitest-preview-mode-id",
    __NEXT_PREVIEW_MODE_SIGNING_KEY: "vitest-preview-mode-signing-key",
    __NEXT_PREVIEW_MODE_ENCRYPTION_KEY: "vitest-preview-mode-encryption-key".padEnd(64, "0"),
  };

  const definesFor = (layer: NextLayer) => {
    const defines = getDefineEnv({
      isTurbopack: false,
      config,
      dev: false,
      distDir,
      projectPath: root,
      fetchCacheKeyPrefix: config.experimental.fetchCacheKeyPrefix,
      hasRewrites: false,
      isClient: layer === "browser",
      isEdgeServer: layer !== "browser",
      isNodeServer: false,
      clientRouterFilters: undefined,
      middlewareMatchers: undefined,
      rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
    });
    // Next's own modules pick their edge build with it, like `module.compiled`.
    if (layer !== "browser" && defines["process.env.NEXT_RUNTIME"] !== '"edge"') {
      fail("`getDefineEnv()` does not define `process.env.NEXT_RUNTIME` as `edge`");
    }
    return {
      ...(layer !== "browser" &&
        Object.fromEntries(
          Object.entries(edgeEnvironment).map(([name, value]) => [
            `process.env.${name}`,
            JSON.stringify(value),
          ]),
        )),
      // Code strings; an option that is not set is undefined.
      ...Object.fromEntries(
        Object.entries(defines).filter((entry) => typeof entry[1] === "string"),
      ),
    };
  };

  // The tables Next gives webpack: the base one of a compilation, and on top of
  // it the ones its module rules apply per layer.
  const aliasesFor = (layer: NextLayer) => {
    const aliases: Record<string, string | false> = {
      "@opentelemetry/api$": "next/dist/compiled/@opentelemetry/api",
    };
    // The Node modules an edge runtime provides. A browser tab has none of
    // them, so use the polyfills Next ships for its own client bundles.
    for (const name of SUPPORTED_NATIVE_MODULES) {
      if (name === "async_hooks") continue;
      aliases[`${name}$`] = aliases[`node:${name}$`] = `next/dist/compiled/${name}`;
    }
    const base = compilerAliases.createWebpackAliases({
      distDir,
      isClient: layer === "browser",
      isEdgeServer: layer !== "browser",
      dev: false,
      config,
      pagesDir: undefined,
      appDir,
      dir: root,
      reactProductionProfiling: false,
    });
    for (const [key, target] of Object.entries(base)) {
      // An array is a list of candidates: the user's file, then a fallback.
      aliases[key] = Array.isArray(target)
        ? (target.find((candidate) =>
            ["", ...pageExtensions.map((extension) => `.${extension}`)].some(
              (extension) => path.isAbsolute(candidate) && fs.existsSync(candidate + extension),
            ),
          ) ?? false)
        : target;
    }
    // The App Router does not run on the `react` of the project. Next brings
    // its own React, a different build of it per layer. The last two tables
    // are keyed by the public entry file, e.g. `<next>/link.js`.
    Object.assign(
      aliases,
      compilerAliases.createServerOnlyClientOnlyAliases(layer === "rsc"),
      compilerAliases.createVendoredReactAliases(
        needsExperimentalReact(config) ? "-experimental" : "",
        {
          layer: layer === "browser" ? "app-pages-browser" : layer,
          isBrowser: layer === "browser",
          isEdgeServer: layer !== "browser",
          reactProductionProfiling: false,
        },
      ),
      compilerAliases.createNextApiEsmAliases(),
      compilerAliases.createAppRouterApiAliases(layer === "rsc"),
    );
    // The plugin finds Next's Flight codec next to this one.
    if (typeof aliases["react-server-dom-webpack/server$"] !== "string") {
      fail("the alias tables have no `react-server-dom-webpack/server$`");
    }
    return aliases;
  };

  // cache.ts makes Next's cache in the tab with these options. They have to
  // give it Next's own handler, or nothing is cached and nothing says so.
  const preview = { previewModeId: "", previewModeSigningKey: "", previewModeEncryptionKey: "" };
  const cache = new IncrementalCache({
    fs: {} as never,
    serverDistDir: "/",
    dev: false,
    requestHeaders: {},
    fetchCacheKeyPrefix: "prefix",
    previewProps: preview,
    prerenderManifest: { version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [], preview },
  });
  if (!cache.cacheHandler || cache.fetchCacheKeyPrefix !== "prefix") {
    fail("`IncrementalCache` no longer takes `fs`, `serverDistDir` and `fetchCacheKeyPrefix`");
  }

  // What the modules of this package in the tab assume about Next's runtime,
  // where a Next that differs would not fail, or not with a message that says
  // why. (A static import of a name that is gone fails when its module links,
  // naming it.) The runtime runs in the tab, so here its files are read, not
  // loaded.
  const runtimeFile = (file: string) => {
    const id = `next/dist/esm/${file}.js`;
    let resolved: string;
    let code: string;
    try {
      resolved = require.resolve(id);
      code = fs.readFileSync(resolved, "utf8");
    } catch (error) {
      return fail(`${id} is not there`, error);
    }
    return {
      export: (name: string) =>
        declarationOf(resolved, name) ?? fail(`${id} has no export \`${name}\``),
      contains: (...pieces: string[]) => {
        for (const piece of pieces) if (!code.includes(piece)) fail(`${id} has no \`${piece}\``);
      },
    };
  };

  // client.tsx imports Next's client entry once the page is there.
  const appIndex = runtimeFile("client/app-index");
  appIndex.export("hydrate");
  // It knows that the app has hydrated from Next's own e2e hook, which the
  // plugin turns on with this define.
  appIndex.contains("process.env.__NEXT_TEST_MODE", "__NEXT_HYDRATED_CB");
  // The route of a node has Next's own boundaries at its root, the ones
  // next-app-loader gives a root that has none: the global error page, which
  // Next's renderer throws without, and the pages for `notFound()`,
  // `forbidden()` and `unauthorized()`.
  const builtinBoundaries = Object.fromEntries(
    ["global-error", "not-found", "forbidden", "unauthorized"].map((name) => {
      const file = `next/dist/client/components/builtin/${name}.js`;
      try {
        require.resolve(file);
      } catch (error) {
        fail(`${file} is not there`, error);
      }
      return [name, file];
    }),
  );
  // It finds the root Next hydrates by the document it is for, and gives a
  // node its container in its place.
  appIndex.contains(
    "const appElement = document",
    "ReactDOMClient.hydrateRoot(appElement",
    "ReactDOMClient.createRoot(appElement",
  );
  // A node renders on a route whose root segment is not the app's, and that
  // has no root layout. Next's router leaves the node with a page load for a
  // page of the app when all of this holds: it compares the root segments of
  // the two trees directly, so the trees do not match at the root; it asks
  // there whether the new tree is in a root layout, which a tree of the app
  // is; and it takes the two for different root layouts.
  runtimeFile("client/components/segment-cache/cache").contains(
    "currentTree.segment === nextTree.segment",
  );
  runtimeFile("client/components/render-tree").contains(
    "doesRouteStructureMatch(",
    "PrefetchHint.IsRootLayoutOrAbove",
    "isNavigatingToNewRootLayout(",
  );
  // It hands Next the bootstrap script as the one that is running.
  runtimeFile("client/asset-prefix").contains("document.currentScript", "/_next/");
  // The shim in plugin.ts reads these, and replaces the functions for Vite
  // RSC's ids.
  const serverReferenceInfo = runtimeFile("shared/lib/server-reference-info");
  for (const name of [
    "SERVER_REFERENCE_ID_LENGTH",
    "mightBeServerReferenceId",
    "extractInfoFromServerReferenceId",
  ]) {
    serverReferenceInfo.export(name);
  }
  // ssr.ts provides the manifests of a build: as the globals an edge function
  // reads them from, and for each request.
  runtimeFile("server/route-modules/route-module").contains(
    "self.__BUILD_MANIFEST",
    "self.__SERVER_FILES_MANIFEST",
    "self.__RSC_MANIFEST",
  );
  const setManifests = runtimeFile("server/app-render/manifests-singleton").export(
    "setManifestsSingleton",
  );
  // Unless its declaration is in a module that is not read here.
  const manifestKeys = optionKeys(setManifests);
  for (const key of ["page", "clientReferenceManifest", "serverActionsManifest"]) {
    if (setManifests.code && !manifestKeys.includes(key)) {
      fail(`\`setManifestsSingleton()\` takes no \`${key}\``);
    }
  }

  const aliases = {
    rsc: aliasesFor("rsc"),
    ssr: aliasesFor("ssr"),
    browser: aliasesFor("browser"),
  };

  // The Flight codec of the rsc layer is CommonJS. Its exports, the way Node
  // finds them for an `import` of it. Of a `module.exports = require()` in
  // each branch the lexer gives the last: the development build, which is the
  // one that runs here.
  await initCjsLexer();
  const exportsOf = (file: string): string[] => {
    const { exports, reexports } = parseCjs(fs.readFileSync(file, "utf8"));
    const requireFrom = createRequire(file);
    return [
      ...exports.filter((name) => name !== "__esModule"),
      ...reexports.flatMap((reexport) => exportsOf(requireFrom.resolve(reexport))),
    ];
  };
  const flightExports = {} as Record<FlightEntry, string[]>;
  for (const entry of Object.keys(rscFlightCodec) as FlightEntry[]) {
    const specifier = `react-server-dom-webpack/${entry}`;
    const target = aliases.rsc[`${specifier}$`];
    if (typeof target !== "string") return fail(`the alias tables have no \`${specifier}$\``);
    try {
      flightExports[entry] = [...new Set(exportsOf(require.resolve(target)))];
    } catch (error) {
      return fail(`${target} cannot be read (${(error as Error).message})`, error);
    }
  }

  // The route entry of a page binds Next's renderer to its bundler: its module
  // loader, and a runtime that also holds the request handler for Node.js.
  // Here both are this package's: rsc.ts, app-page-entrypoint.ts.
  const bindPageEntry = (code: string, where: string) => {
    code = replace(code, /\b__webpack_require__\b/g, "__next_require__", where);
    code = replace(
      code,
      /(["'])next\/dist\/build\/templates\/app-page-runtime\1/,
      `"vitest-plugin-rsc/nextjs/app-page-entrypoint"`,
      where,
    );
    return `import { requireModule as __next_require__ } from "vitest-plugin-rsc/nextjs/rsc";\n${code}`;
  };

  async function loadComponentPageEntry({ page, pathname }: ComponentRoute): Promise<string> {
    // A loader tree the way Next's app loader writes one: a segment, its
    // slots, its modules, and the static segments next to it, which only
    // a build knows. It has a segment for each one of the pathname, so
    // that Next finds the params of the URL, and the node as its page.
    //
    // Not from Next's app loader, which reads a directory of files and exits
    // the process for a page without a root layout.
    //
    // No layout: Next's renderer does not need one. The modules besides the
    // page are Next's own boundaries, see `builtinBoundaries`.
    //
    // The root segment is not the app's `""`. Next's router compares the
    // root segments of two routes directly, and takes a difference for
    // another root layout. So a navigation from the node to a page of the
    // app is a page load, which renders the app's root layout, and not a
    // client-side one into the container.
    const segment = (name: string, children: string, modules = "{}") =>
      `[${JSON.stringify(name)}, ${children}, ${modules}, null]`;
    let tree = `["__PAGE__", {}, { page: [__next_component__, "vitest-plugin-rsc/component"] }]`;
    for (const name of pathname.split("/").filter(Boolean).reverse()) {
      tree = segment(name, `{ children: ${tree} }`);
    }
    const boundaries = Object.entries(builtinBoundaries).map(
      ([name, file]) =>
        `${JSON.stringify(name)}: [() => import(${JSON.stringify(file)}), ${JSON.stringify(file)}]`,
    );
    tree = segment(componentRoot, `{ children: ${tree} }`, `{ ${boundaries.join(", ")} }`);
    let code: string;
    try {
      code = await loadEntrypoint(
        "app-page",
        { VAR_DEFINITION_PAGE: page, VAR_DEFINITION_PATHNAME: pathname },
        {
          tree,
          // What next-app-loader injects.
          __next_app_require__: "__webpack_require__",
          __next_app_load_chunk__: "() => Promise.resolve()",
        },
      );
    } catch (error) {
      return fail(
        `the app-page template does not take the injections of next-app-loader ` +
          `(${(error as Error).message})`,
        error,
      );
    }
    return (
      `import { loadComponent as __next_component__ } from "vitest-plugin-rsc/nextjs/rsc";\n` +
      bindPageEntry(stripTurbopackTransitions(code), "the app-page template")
    );
  }

  // Next's SWC transform, with the options next-swc-loader gives it for a
  // module of the app in a layer.
  await swc.loadBindings(config.experimental.useWasmBinary);
  const { jsConfig } = await loadJsConfig(root, config);
  const bundleLayers = {
    rsc: WEBPACK_LAYERS.reactServerComponents,
    ssr: WEBPACK_LAYERS.serverSideRendering,
    browser: WEBPACK_LAYERS.appPagesBrowser,
  };
  const swcOptions = (file: string, layer: NextLayer) => {
    const {
      // "use server" and "use cache": Vite RSC compiles server functions.
      serverActions: _serverActions,
      // An optimization of a bundle, like `modularizeImports` and
      // `optimizePackageImports` below. They import a package by other paths
      // than the app does, and Vite pre-bundles what the app imports.
      cjsRequireOptimizer: _cjsRequireOptimizer,
      // The targets, Node.js or the browsers: the tab runs the code as it is.
      env: _env,
      ...options
    } = getLoaderSWCOptions({
      filename: file,
      development: false,
      isServer: layer !== "browser",
      pagesDir: undefined,
      appDir,
      isPageFile: false,
      isCacheComponents: config.cacheComponents,
      hasReactRefresh: false,
      configDir: root,
      modularizeImports: undefined,
      optimizePackageImports: undefined,
      swcPlugins: config.experimental.swcPlugins,
      compilerOptions: config.compiler,
      jsConfig,
      supportedBrowsers: undefined,
      swcCacheDir: path.join(distDir, "cache", "swc"),
      relativeFilePathFromRoot: path.relative(root, file),
      serverComponents: true,
      serverReferenceHashSalt: "",
      bundleLayer: bundleLayers[layer],
      esm: true,
      cacheHandlers: config.cacheHandlers,
      useCacheEnabled: config.experimental.useCache,
      taintEnabled: config.experimental.taint,
      pageExtensions,
    }) as Record<string, unknown> & {
      jsc: { transform: Record<string, unknown>; experimental: object };
    };
    // `typeof window` and `process.env.NODE_ENV` are defines here, see
    // plugin.ts and server-code.ts.
    const {
      optimizer: _optimizer,
      regenerator: _regenerator,
      react,
      ...transform
    } = options.jsc.transform;
    return {
      ...options,
      jsc: {
        ...options.jsc,
        target: "esnext",
        // Not imports of `@swc/helpers`, which is Next's dependency.
        externalHelpers: false,
        // For webpack's parser, which reads `assert`.
        experimental: { ...options.jsc.experimental, emitAssertForImportAttributes: false },
        transform: {
          ...transform,
          // Vite compiles JSX as it does without this plugin, for React's
          // development runtime. Not in a `.js` file, which Next takes JSX
          // in too.
          react: compiledByVite.test(file) ? { ...(react as object), runtime: "preserve" } : react,
        },
      },
      filename: file,
      sourceFileName: file,
      sourceMaps: true,
    };
  };
  const compile = async (code: string, file: string, layer: NextLayer) => {
    const options = swcOptions(file, layer);
    let output: Compiled;
    try {
      output = await swc.transform(code, options);
    } catch (error) {
      // What `next build` stops at, like a client hook in a Server Component.
      // The module throws Next's error when it loads, as in webpack's
      // development build, so that the test gets it: a module that does not
      // compile only tells a browser that its import failed. It has no
      // imports, which would run first, apart from an `export *`, and it
      // keeps its exports, for the modules that import it to link.
      const exports = await exportStubs(code, file).catch(() => Promise.reject(error));
      const message = stripVTControlCharacters((error as Error).message ?? String(error)).trim();
      return { code: `throw new Error(${JSON.stringify(message)});\n${exports}` };
    }
    // In the rsc layer Next turns a client module into its own proxy. Vite
    // RSC makes the references from the source, which it has to parse: where
    // Vite does not compile the JSX, from the module as the other layers get it.
    if (layer === "rsc" && getRSCModuleInformation(output.code, true).type === "client") {
      if (compiledByVite.test(file)) return;
      return swc.transform(code, { ...options, serverComponents: undefined });
    }
    return output;
  };
  // What the plugin relies on of the transform.
  const fontCall = await compile(
    `import { Inter } from "next/font/google";\nexport const inter = Inter({});\n`,
    path.join(appDir, "layout.js"),
    "rsc",
  );
  if (!fontCall?.code.includes("next/font/google/target.css?")) {
    fail("the SWC transform no longer turns a call of a `next/font` function into an import");
  }
  if (await compile(`"use client";\nexport const a = 1;\n`, path.join(appDir, "a.ts"), "rsc")) {
    fail('the SWC transform no longer marks a `"use client"` module of the rsc layer');
  }

  // Calls a webpack loader of Next for one module.
  const emitted = new Map<string, Buffer>();
  const span: TraceSpan = {
    traceChild: () => span,
    traceFn: (fn) => fn(),
    traceAsyncFn: (fn) => fn(),
    setAttribute: () => {},
  };
  const runLoader = (
    loader: Loader,
    options: unknown,
    resource: string,
    ...input: unknown[]
  ): Promise<unknown[]> =>
    new Promise((resolve, reject) => {
      const queryAt = resource.indexOf("?");
      const resourcePath = queryAt < 0 ? resource : resource.slice(0, queryAt);
      // A loader either calls back, or returns its result, as a promise or not.
      let callsBack = false;
      const context: LoaderContext = {
        getOptions: () => options,
        async: () => {
          callsBack = true;
          return (error, ...result) => (error ? reject(error) : resolve(result));
        },
        currentTraceSpan: span,
        resourcePath,
        resourceQuery: queryAt < 0 ? "" : resource.slice(queryAt),
        context: path.dirname(resourcePath),
        rootContext: root,
        // Where the browser finds it: under `/_next/`.
        emitFile: (name, content) => emitted.set(name.replace(/^\//, ""), content),
        emitWarning: (warning) => console.warn(warning),
        emitError: reject,
        addDependency: () => {},
        resolve: (directory, request, callback) => {
          const file = path.resolve(directory, request);
          if (fs.existsSync(file)) callback(null, file);
          else callback(new Error(`Can't resolve '${request}' in '${directory}'`));
        },
        getResolve: () => () => Promise.reject(new Error("Not resolved by vitest-plugin-rsc")),
        fs,
        utils: { contextify: (_context, request) => request },
        sourceMap: false,
      };
      Promise.resolve(loader.call(context, ...input)).then(
        (result) => callsBack || resolve([result]),
        reject,
      );
    });

  // next/font: next-font-loader runs the font loader of `@next/font`, and
  // css-loader makes a module of its CSS, as Next's rule for the font does.
  const resolve = (id: string) => {
    try {
      return require.resolve(id);
    } catch (error) {
      return fail(`${id} is not there`, error);
    }
  };
  // Next's own postcss, which is not a dependency of the app.
  let postcss: unknown;
  try {
    postcss = createRequire(path.join(nextDir, "package.json"))("postcss");
  } catch (error) {
    fail("it no longer depends on `postcss`", error);
  }
  const fontLoaders = (["google", "local"] as const).map((name) => {
    const target = resolve(`next/font/${name}/target.css`);
    const loaders = getNextFontLoader(
      {
        hasAppDir: true,
        isClient: true,
        isServer: false,
        // As `next dev` loads them: without the network, a font of Google
        // Fonts is its fallback font, and Next logs why.
        isDevelopment: true,
        assetPrefix: config.assetPrefix,
        deploymentId: config.deploymentId,
        experimental: config.experimental,
      } as Parameters<typeof getNextFontLoader>[0],
      async () => ({ postcss }),
      resolve(`next/dist/compiled/@next/font/${name}/loader`),
    ) as { loader?: string; options?: unknown }[];
    const cssLoader = loaders.find((entry) => entry.loader?.includes("css-loader"));
    const fontLoader = loaders.find((entry) => entry.loader === "next-font-loader");
    if (!cssLoader?.loader || !fontLoader) {
      fail("`getNextFontLoader()` no longer uses css-loader and next-font-loader");
    }
    return {
      prefix: `next/font/${name}/target.css?`,
      target,
      cssLoader: require(cssLoader!.loader!).default as Loader,
      cssOptions: cssLoader!.options,
      fontOptions: fontLoader!.options,
    };
  });
  const fonts = new Map<string, Promise<{ css: string; exports: Record<string, unknown> }>>();
  const loadFont = async (request: string) => {
    const font = fontLoaders.find((candidate) => request.startsWith(candidate.prefix))!;
    const resource = font.target + request.slice(font.prefix.length - 1);
    const [css, map, meta] = await runLoader(nextFontLoader, font.fontOptions, resource);
    const [code] = await runLoader(font.cssLoader, font.cssOptions, resource, css, map, meta);
    // The CommonJS module css-loader makes: a list of the CSS of the module,
    // with what it exports as `locals`.
    const cssModule = { id: resource, exports: {} as unknown };
    compileFunction(code as string, ["module", "exports", "require"])(
      cssModule,
      cssModule.exports,
      require,
    );
    const list = cssModule.exports as unknown[] & { locals?: Record<string, unknown> };
    if (!Array.isArray(list) || !list.locals) {
      fail("css-loader no longer makes a list of CSS with `locals` of a `next/font` call");
    }
    return { css: String(list), exports: list.locals! };
  };

  // Where the browser asks for the files the loaders emit. An asset prefix
  // with an origin is another server.
  const emittedPath = `${config.assetPrefix.startsWith("/") ? config.assetPrefix : ""}/_next/`;
  const { images } = config;

  // next-app-loader keys its per-build caches on the compilation object.
  const compilation = {};

  return {
    root,
    appDir,
    nextDir,
    version,
    routes,
    // Not for Next's own pages, `/_not-found` and `/_global-error`.
    componentRoutes: [...new Set(["/", ...routes.map((route) => route.pathname)])]
      .filter((pathname) => !/^\/_(not-found|global-error)$/.test(pathname))
      .map((pathname) => ({
        kind: "page",
        page: `${pathname === "/" ? "" : pathname}/page`,
        pathname,
        component: `${componentRoot}${pathname}`,
      })),
    metadataFiles,
    config: JSON.parse(JSON.stringify(config)),
    defines: { rsc: definesFor("rsc"), ssr: definesFor("ssr"), browser: definesFor("browser") },
    aliases,
    flightExports,
    async loadAppPageEntry(route) {
      if ("component" in route)
        return { code: await loadComponentPageEntry(route), watchFiles: [] };
      const watchFiles = new Set<string>();
      const context: AppLoaderContext = {
        // What `createEntrypoints` of `next build` passes.
        getOptions: () => ({
          name: `app${route.page}`,
          page: route.page,
          pagePath: route.pagePath,
          appDir,
          appPaths: route.appPaths,
          allNormalizedAppPaths: Object.keys(appPathsPerRoute),
          pageExtensions,
          rootDir: root,
          basePath: config.basePath,
          assetPrefix: config.assetPrefix,
          // Loader options are a query string for webpack, where an option
          // that is not set is empty. The template of a route handler needs
          // a value to inject.
          nextConfigOutput: config.output ?? ("" as never),
          preferredRegion: undefined,
          middlewareConfig: Buffer.from("{}").toString("base64"),
          isGlobalNotFoundEnabled: config.experimental.globalNotFound || undefined,
          explicitParallelRouteChildren:
            config.experimental.explicitParallelRouteChildren || undefined,
          strictRouteMatching,
          // Every route here is the one entry `next build` keeps for its pathname.
          isFinalRouteMatcher: strictRouteMatching,
        }),
        _module: { buildInfo: {} },
        _compilation: compilation,
        _compiler: { context: root },
        addDependency: (file) => watchFiles.add(file),
        addMissingDependency: (file) => watchFiles.add(file),
        // Vite takes a watched file for an import of the module, and a
        // directory is not one.
        addContextDependency: () => {},
      };
      let code = stripTurbopackTransitions(await nextAppLoader.call(context));
      const where = "the output of next-app-loader";
      if (route.kind === "route") {
        // Next's template loads `route.ts` when the first request comes in,
        // with the `require` of its bundler. Here that is `import()`: Next
        // waits for a module that loads asynchronously.
        code = replace(code, /(\buserland: \(\)\s*=>\s*)require\(/, "$1import(", where);
      } else {
        code = bindPageEntry(code, where);
      }
      return { code, watchFiles: [...watchFiles].filter((file) => fs.existsSync(file)) };
    },
    async loadEdgeEntry(route, userland) {
      // The two templates name the same injection differently.
      const [template, registration] =
        route.kind === "page"
          ? (["edge-ssr-app", "cacheHandlerRegistration"] as const)
          : (["edge-app-route", "edgeCacheHandlersRegistration"] as const);
      const placeholder = "vitest-plugin-rsc/next-userland";
      const code = stripTurbopackTransitions(
        await loadEntrypoint(
          template,
          { VAR_USERLAND: route.kind === "page" ? placeholder : userland, VAR_PAGE: route.page },
          { cacheHandlerImports: "\n", [registration]: "\n" },
          { incrementalCacheHandler: null },
        ),
      );
      return route.kind === "page"
        ? replace(
            code,
            `import * as pageMod from ${JSON.stringify(placeholder)};`,
            `const pageMod = ${userland};`,
            "the edge-ssr-app template",
          )
        : code;
    },
    compile,
    isImage: (file) => !images.disableStaticImages && nextImageLoaderRegex.test(file),
    async loadImage(file) {
      const options = {
        isDev: false,
        compilerType: COMPILER_NAMES.client,
        assetPrefix: config.assetPrefix,
        basePath: config.basePath,
        outputHashSalt: (config as { outputHashSalt?: string }).outputHashSalt,
      };
      const [code] = await runLoader(
        nextImageLoader,
        options,
        file,
        await fs.promises.readFile(file),
      );
      if (typeof code !== "string" || !code.startsWith("export default {")) {
        fail("next-image-loader no longer exports the data of an image");
      }
      return code as string;
    },
    loadFont(request) {
      let font = fonts.get(request);
      if (!font) {
        fonts.set(request, (font = loadFont(request)));
        // A font that failed may load the next time, like a download.
        font.catch(() => fonts.delete(request));
      }
      return font;
    },
    readEmittedFile(pathname) {
      if (!pathname.startsWith(emittedPath)) return;
      const name = pathname.slice(emittedPath.length);
      const body = emitted.get(name);
      if (!body) return;
      return { body, contentType: getContentType(path.extname(name).slice(1)) ?? "" };
    },
    // What `handleNextImageRequest` of Next's server does, without its cache.
    async optimizeImage(request, response, serveFile) {
      const url = new URL(request.url!, "http://n");
      if (url.pathname !== images.path) return false;
      if (images.loader !== "default" || images.unoptimized) {
        response.statusCode = 404;
        response.end();
        return true;
      }
      const { ImageOptimizerCache, ImageError } = imageOptimizer;
      const query = querystring.parse(url.search.slice(1));
      const params = ImageOptimizerCache.validateParams(request, query, config, false);
      if ("errorMessage" in params) {
        response.statusCode = 400;
        response.end(params.errorMessage);
        return true;
      }
      try {
        const upstream = params.isAbsolute
          ? await imageOptimizer.fetchExternalImage(
              params.href,
              images.dangerouslyAllowLocalIP,
              images.maximumResponseBody,
              images.maximumRedirects,
            )
          : await imageOptimizer.fetchInternalImage(
              params.href,
              request,
              response,
              images.maximumResponseBody,
              serveFile,
            );
        const { buffer, contentType, maxAge, etag } = await imageOptimizer.imageOptimizer(
          upstream,
          params,
          config,
          { isDev: false },
        );
        imageOptimizer.sendResponse(
          request,
          response,
          params.href,
          getExtension(contentType!)!,
          buffer,
          etag,
          params.isStatic,
          "MISS",
          images,
          maxAge,
          // Not for the browser to keep: a test run may follow with another image.
          true,
        );
      } catch (error) {
        if (!(error instanceof ImageError)) throw error;
        response.statusCode = error.statusCode;
        response.end(error.message);
      }
      return true;
    },
  };
}
