import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { init as initCjsLexer, parse as parseCjs } from "cjs-module-lexer";
import type { AppLoaderOptions } from "next/dist/build/webpack/loaders/next-app-loader/index.js";
import { parseAst } from "vite";
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

export type NextProject = {
  root: string;
  appDir: string;
  /** Directory of the installed `next` package. */
  nextDir: string;
  /** Version of the installed `next` package. */
  version: string;
  routes: NextRoute[];
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
   */
  loadAppPageEntry(route: NextRoute): Promise<{ code: string; watchFiles: string[] }>;
  /**
   * Next's edge `handler(Request)` of a route. `userland` is what it serves:
   * for a route handler the specifier of its route module, for a page an
   * expression for its rsc-layer module, which lives in another environment.
   */
  loadEdgeEntry(route: NextRoute, userland: string): Promise<string>;
};

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

  // next-app-loader keys its per-build caches on the compilation object.
  const compilation = {};

  return {
    root,
    appDir,
    nextDir,
    version,
    routes,
    metadataFiles,
    config: JSON.parse(JSON.stringify(config)),
    defines: { rsc: definesFor("rsc"), ssr: definesFor("ssr"), browser: definesFor("browser") },
    aliases,
    flightExports,
    async loadAppPageEntry(route) {
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
        // The route entry binds Next's renderer to its bundler: its module
        // loader, and a runtime that also holds the request handler for
        // Node.js. Here both are this package's: rsc.ts, app-page-entrypoint.ts.
        code = replace(code, /\b__webpack_require__\b/g, "__next_require__", where);
        code = replace(
          code,
          /(["'])next\/dist\/build\/templates\/app-page-runtime\1/,
          `"vitest-plugin-rsc/nextjs/app-page-entrypoint"`,
          where,
        );
        code = `import { requireModule as __next_require__ } from "vitest-plugin-rsc/nextjs/rsc";\n${code}`;
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
  };
}
