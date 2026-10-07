import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// This file calls the build code of the project's own `next` package. The
// route list, the loader tree, the route entry, the compile-time defines and
// the alias tables are what `next build` computes; nothing is re-implemented.

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
   * The RSC-layer module of a route, from Next's app loader. For a page: its
   * loader tree and `entry-base`. For a route handler: its route module.
   */
  loadAppPageEntry(route: NextRoute): Promise<{ code: string; watchFiles: string[] }>;
  /**
   * Next's edge `handler(Request)` of a route. For a page it is a module of
   * the SSR layer, for a route handler one of the RSC layer.
   */
  loadEdgeEntry(route: NextRoute, userland: string): Promise<string>;
};

// What next-app-loader uses of webpack's loader context.
type AppLoaderContext = {
  getOptions(): Record<string, unknown>;
  _module: { buildInfo: Record<string, unknown> };
  _compilation: object;
  _compiler: { context: string };
  addDependency(file: string): void;
  addMissingDependency(file: string): void;
  addContextDependency(dir: string): void;
};

// Next compiles a `next.config.ts` and runs the result as a module without a
// filename (`requireFromString` in next/dist/build/next-config-ts), so Node
// looks up what the config imports by a relative path from the working
// directory. For `next build` that is the project. Vitest loads the projects
// of a workspace side by side, in one process with one working directory, so
// they take turns to have it.
//
// The working directory is the whole process's: other work that runs while a
// config loads sees the project as the working directory too. Next's loader
// for Node's own TypeScript support would not need this, but it gives up on a
// config that `next build` accepts, like one with an import without an
// extension, and then loads it this way after all.
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

export async function loadNextProject(root: string): Promise<NextProject> {
  const require = createRequire(path.join(root, "package.json"));
  const nextDir = path.dirname(require.resolve("next/package.json"));
  const { version } = require("next/package.json") as { version: string };
  const [major = 0, minor = 0] = version.split(".").map(Number);
  // 16.4 is where Next's request stores became one per realm, which is what
  // lets the layers run as separate module graphs.
  if (major < 16 || (major === 16 && minor < 4)) {
    throw new Error(
      `vitest-plugin-rsc/next needs next@16.4 or later, found next@${version}. ` +
        `For earlier versions, use vitest-plugin-rsc/nextjs.`,
    );
  }

  const loadConfig = require("next/dist/server/config.js").default as (
    phase: string,
    dir: string,
    options?: { silent?: boolean },
  ) => Promise<Record<string, any>>;
  const { PHASE_PRODUCTION_BUILD } = require("next/dist/shared/lib/constants.js");
  const { findPagesDir } = require("next/dist/lib/find-pages-dir.js");
  const { discoverRoutes } = require("next/dist/build/route-discovery.js");
  const { getDefineEnv } = require("next/dist/build/define-env.js");
  const { normalizeAppPath } = require("next/dist/shared/lib/router/utils/app-paths.js");
  const { loadEntrypoint } = require("next/dist/build/load-entrypoint.js");
  const { isAppRouteRoute } = require("next/dist/lib/is-app-route-route.js") as {
    isAppRouteRoute(page: string): boolean;
  };
  const { isMetadataRouteFile, DEFAULT_METADATA_ROUTE_EXTENSIONS } =
    require("next/dist/lib/metadata/is-metadata-route.js") as {
      isMetadataRouteFile(file: string, extensions: string[], strict: boolean): boolean;
      DEFAULT_METADATA_ROUTE_EXTENSIONS: string[];
    };
  const { APP_DIR_ALIAS } = require("next/dist/lib/constants.js") as { APP_DIR_ALIAS: string };
  const { SUPPORTED_NATIVE_MODULES } =
    require("next/dist/build/webpack/plugins/middleware-plugin.js") as {
      SUPPORTED_NATIVE_MODULES: readonly string[];
    };
  const compilerAliases = require("next/dist/build/create-compiler-aliases.js") as {
    createWebpackAliases(
      options: Record<string, unknown>,
    ): Record<string, string | string[] | false>;
    createVendoredReactAliases(
      channel: string,
      options: Record<string, unknown>,
    ): Record<string, string>;
    createServerOnlyClientOnlyAliases(isServer: boolean): Record<string, string>;
    createNextApiEsmAliases(): Record<string, string>;
    createAppRouterApiAliases(isServerOnlyLayer: boolean): Record<string, string>;
  };
  const { needsExperimentalReact } = require("next/dist/lib/needs-experimental-react.js");
  const nextAppLoader = require("next/dist/build/webpack/loaders/next-app-loader/index.js")
    .default as (this: AppLoaderContext) => Promise<string>;

  // The app is served the way a deployment serves it: production Next on its
  // edge runtime. React itself stays a development build, see plugin.ts.
  const config = await inDirectory(root, () =>
    loadConfig(PHASE_PRODUCTION_BUILD, root, { silent: true }),
  );
  const { appDir } = findPagesDir(root) as { appDir?: string };
  if (!appDir) {
    throw new Error(`vitest-plugin-rsc: no \`app\` directory found in ${root}`);
  }

  const pageExtensions: string[] = config.pageExtensions;
  const discovered = await discoverRoutes({
    appDir,
    pagesDir: undefined,
    pageExtensions,
    isDev: false,
    baseDir: root,
    isSrcDir: path.basename(path.dirname(appDir)) === "src",
  });
  const mappedAppPages = (discovered.mappedAppPages ?? {}) as Record<string, string>;
  // A route is every page with the same pathname: `/dashboard/page` and the
  // parallel `/dashboard/@stats/page` are one route, named after the former.
  const pagesOf = new Map<string, string[]>();
  for (const page of Object.keys(mappedAppPages).sort()) {
    if (!page.endsWith("/page")) continue;
    const pathname = normalizeAppPath(page) as string;
    pagesOf.set(pathname, [...(pagesOf.get(pathname) ?? []), page]);
  }
  const routes: NextRoute[] = [...pagesOf].map(([pathname, appPaths]) => {
    const page = appPaths.find((appPath) => !appPath.includes("/@")) ?? appPaths[0]!;
    return { kind: "page", page, pathname, appPaths, pagePath: mappedAppPages[page]! };
  });
  // Route handlers. Next also lists metadata files like `sitemap.ts` as app
  // routes. Those need its metadata loaders and are not served yet.
  for (const [page, pagePath] of Object.entries(mappedAppPages)) {
    if (
      isAppRouteRoute(page) &&
      !isMetadataRouteFile(
        pagePath.slice(APP_DIR_ALIAS.length),
        DEFAULT_METADATA_ROUTE_EXTENSIONS,
        true,
      )
    ) {
      const pathname = normalizeAppPath(page) as string;
      // `next build` fails on this too.
      if (pagesOf.has(pathname)) {
        throw new Error(
          `vitest-plugin-rsc: ${pathname} is both a page and a route handler ` +
            `(${pagesOf.get(pathname)!.join(", ")} and ${page}). A path can only be one of them.`,
        );
      }
      routes.push({ kind: "route", page, pathname, appPaths: [page], pagePath });
    }
  }

  const { generateBuildId } = require("next/dist/build/generate-build-id.js");
  const buildId: string = await generateBuildId(config.generateBuildId, () => "vitest");
  // The environment variables Next's build gives every edge function. A build
  // makes up the keys; here they are the same on every run, so that the
  // pre-bundled dependencies they are compiled into stay cached.
  const edgeEnvironment = {
    __NEXT_BUILD_ID: buildId,
    __NEXT_PREVIEW_MODE_ID: "vitest-preview-mode-id",
    __NEXT_PREVIEW_MODE_SIGNING_KEY: "vitest-preview-mode-signing-key",
    __NEXT_PREVIEW_MODE_ENCRYPTION_KEY: "vitest-preview-mode-encryption-key".padEnd(64, "0"),
  };

  const definesFor = (layer: NextLayer) => ({
    ...(layer === "browser"
      ? {}
      : Object.fromEntries(
          Object.entries(edgeEnvironment).map(([name, value]) => [
            `process.env.${name}`,
            JSON.stringify(value),
          ]),
        )),
    // getDefineEnv returns code strings; options that are not set are undefined.
    ...Object.fromEntries(
      Object.entries(
        getDefineEnv({
          isTurbopack: false,
          config,
          dev: false,
          distDir: path.join(root, config.distDir ?? ".next"),
          projectPath: root,
          fetchCacheKeyPrefix: config.experimental?.fetchCacheKeyPrefix,
          hasRewrites: false,
          isClient: layer === "browser",
          isEdgeServer: layer !== "browser",
          isNodeServer: false,
          clientRouterFilters: undefined,
          middlewareMatchers: undefined,
          rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
        }) as Record<string, unknown>,
      ).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
  });

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
      distDir: path.join(root, config.distDir ?? ".next"),
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
    Object.assign(aliases, compilerAliases.createServerOnlyClientOnlyAliases(layer === "rsc"));
    // The App Router does not run on the `react` of the project. Next brings
    // its own React, a different build of it per layer.
    Object.assign(
      aliases,
      compilerAliases.createVendoredReactAliases(
        needsExperimentalReact(config) ? "-experimental" : "",
        {
          layer: layer === "browser" ? "app-pages-browser" : layer,
          isBrowser: layer === "browser",
          isEdgeServer: layer !== "browser",
          reactProductionProfiling: false,
        },
      ),
    );
    // These tables are keyed by the public entry file, e.g. `<next>/link.js`.
    Object.assign(
      aliases,
      compilerAliases.createNextApiEsmAliases(),
      compilerAliases.createAppRouterApiAliases(layer === "rsc"),
    );
    return aliases;
  };

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
        getOptions: () => ({
          name: `app${route.page}`,
          page: route.page,
          pagePath: route.pagePath,
          appDir,
          appPaths: route.appPaths,
          allNormalizedAppPaths: routes.map((candidate) => candidate.pathname),
          pageExtensions,
          rootDir: root,
          isDev: false,
          basePath: config.basePath ?? "",
          // Loader options are a query string for webpack, where an option
          // that is not set is empty. The template of a route handler needs
          // a value to inject.
          nextConfigOutput: config.output ?? "",
          preferredRegion: undefined,
          middlewareConfig: Buffer.from("{}").toString("base64"),
          isGlobalNotFoundEnabled: !!config.experimental?.globalNotFound,
        }),
        _module: { buildInfo: {} },
        _compilation: compilation,
        _compiler: { context: root },
        addDependency: (file) => watchFiles.add(file),
        addMissingDependency: (file) => watchFiles.add(file),
        addContextDependency: (dir) => watchFiles.add(dir),
      };
      const code = await nextAppLoader.call(context);
      return { code, watchFiles: [...watchFiles].filter((file) => fs.existsSync(file)) };
    },
    loadEdgeEntry(route, userland) {
      // The two templates name the same injection differently.
      const registration =
        route.kind === "page" ? "cacheHandlerRegistration" : "edgeCacheHandlersRegistration";
      return loadEntrypoint(
        route.kind === "page" ? "edge-ssr-app" : "edge-app-route",
        { VAR_USERLAND: userland, VAR_PAGE: route.page },
        { cacheHandlerImports: "\n", [registration]: "\n" },
        { incrementalCacheHandler: null },
      );
    },
  };
}
