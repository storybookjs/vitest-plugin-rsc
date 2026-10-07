import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { AppLoaderOptions } from "next/dist/build/webpack/loaders/next-app-loader/index.js";

// The one file that calls the build code of the project's own `next`: what
// `next build` computes is asked from Next. What the plugin assumes about it
// is checked here, so that another Next fails when a run starts, with its
// version and what changed.

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
  routes: NextRoute[];
  /** The resolved `next.config`, as far as it serializes. */
  config: Record<string, unknown>;
  /** Next's compile-time constants per layer, as code strings. */
  defines: Record<NextLayer, Record<string, string>>;
  /** Next's compiler aliases per layer, in webpack's notation: `$` ends an exact match. */
  aliases: Record<NextLayer, Record<string, string | false>>;
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
  const fail = (what: string): never => {
    throw new Error(
      `vitest-plugin-rsc: next@${version} differs from the Next.js this plugin was written for: ` +
        `${what}. Use a version of vitest-plugin-rsc that supports next@${version}.`,
    );
  };
  // A module of Next's build. An export that is gone fails where it is read.
  const load = <T extends object>(file: string): T => {
    let loaded: T;
    try {
      loaded = require(`next/dist/${file}.js`) as T;
    } catch (error) {
      return fail(`next/dist/${file}.js does not load (${(error as Error).message})`);
    }
    return new Proxy(loaded, {
      get: (target, name) =>
        target[name as keyof T] ?? fail(`next/dist/${file}.js has no export \`${String(name)}\``),
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
  if (unmatchedAppPages.length > 0 || incompatibleParallelRouteSlots.length > 0) {
    throw new Error(
      `vitest-plugin-rsc: \`next build\` fails on the parallel routes of this app. ` +
        `Pages no route matches: ${JSON.stringify(unmatchedAppPages)}. ` +
        `Routes with a slot that has no page and no default: ` +
        `${JSON.stringify(incompatibleParallelRouteSlots)}.`,
    );
  }
  // Next also lists metadata files like `sitemap.ts` as app routes. Those
  // need its metadata loaders and are not served yet.
  const isRouteHandler = (appPath: string) =>
    isAppRouteRoute(appPath) &&
    !isMetadataRouteFile(
      mappedAppPages[appPath]!.slice(APP_DIR_ALIAS.length),
      DEFAULT_METADATA_ROUTE_EXTENSIONS,
      true,
    );
  const routes: NextRoute[] = [];
  for (const [pathname, appPaths] of Object.entries(appPathsPerRoute)) {
    appPaths.sort(compareAppPaths);
    const page = selectAppPageEntry(pathname, appPaths);
    const pagePath = mappedAppPages[page]!;
    const pages = appPaths.filter((appPath) => appPath.endsWith("/page"));
    const handlers = appPaths.filter(isRouteHandler);
    // `next build` fails on this too.
    if (pages.length > 0 && handlers.length > 0) {
      throw new Error(
        `vitest-plugin-rsc: ${pathname} is both a page and a route handler ` +
          `(${pages.join(", ")} and ${handlers.join(", ")}). A path can only be one of them.`,
      );
    }
    const kind = pages.length > 0 ? "page" : handlers.length > 0 ? "route" : undefined;
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

  // next-app-loader keys its per-build caches on the compilation object.
  const compilation = {};

  return {
    root,
    appDir,
    nextDir,
    routes,
    config: JSON.parse(JSON.stringify(config)),
    defines: { rsc: definesFor("rsc"), ssr: definesFor("ssr"), browser: definesFor("browser") },
    aliases: { rsc: aliasesFor("rsc"), ssr: aliasesFor("ssr"), browser: aliasesFor("browser") },
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
