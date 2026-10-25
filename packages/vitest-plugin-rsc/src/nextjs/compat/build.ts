import type { AppLoaderContext } from "../project/entries.ts";
import type { Loader, LoaderContext } from "../project/loaders.ts";

// The build side of Next, in Node.js: every module of Next's build that the
// plugin calls. Each is loaded with `load()` where the plugin first reads
// it, so that a run loads only what it uses: the modules for the alias
// tables and the routes are read as a run starts, and pull in most of
// Next's build with them, webpack too. A module that is gone fails where it
// is read, and so does an export that is gone. project/context.ts loads
// them for a project.

/**
 * The build code of the `next` that `projectRequire` finds. `fail` stops the
 * run with what differs, and the version of that `next`.
 */
export function loadNextBuild(
  projectRequire: NodeJS.Require,
  fail: (what: string, cause?: unknown) => never,
) {
  // A module of Next's build, required at its first read. A function as the
  // target, for a module that is one, like postcss-modules-local-by-default.
  const load = <T extends object>(id: string): T => {
    let loaded: T | undefined;
    const required = (): T => {
      if (loaded) return loaded;
      try {
        return (loaded = projectRequire(`${id}.js`) as T);
      } catch (error) {
        return fail(`${id}.js does not load (${(error as Error).message})`, error);
      }
    };
    return new Proxy((() => {}) as unknown as T, {
      get: (_, name) => {
        const value = required()[name as keyof T];
        return value !== undefined ? value : fail(`${id}.js has no export \`${String(name)}\``);
      },
      apply: (_, self, input) =>
        Reflect.apply(required() as (...input: unknown[]) => unknown, self, input),
    });
  };
  // A webpack loader of Next, required where it first runs: an app without
  // `next/font` never loads next-font-loader.
  const loader = <T = Loader>(id: string): T => {
    const loaded = load<{ default: Loader }>(id);
    return function (this: LoaderContext, ...input: unknown[]) {
      return loaded.default.apply(this, input);
    } as unknown as T;
  };

  const loadConfig =
    load<typeof import("next/dist/server/config.js")>("next/dist/server/config").default;
  // The constants of `next/dist/shared/lib/constants`, by their public name.
  const constants = load<typeof import("next/constants")>("next/constants");
  const { COMPILER_NAMES } = constants;
  const {
    APP_DIR_ALIAS,
    MIDDLEWARE_FILENAME,
    PROXY_FILENAME,
    WEBPACK_LAYERS,
    WEBPACK_RESOURCE_QUERIES,
  } = load<typeof import("next/dist/lib/constants.js")>("next/dist/lib/constants");
  const { findPagesDir } = load<typeof import("next/dist/lib/find-pages-dir.js")>(
    "next/dist/lib/find-pages-dir",
  );
  const { discoverRoutes, createPagesMapping } = load<
    typeof import("next/dist/build/route-discovery.js")
  >("next/dist/build/route-discovery");
  const { normalizeCatchAllRoutes } = load<
    typeof import("next/dist/build/normalize-catchall-routes.js")
  >("next/dist/build/normalize-catchall-routes");
  const { normalizeAppPath, compareAppPaths, selectAppPageEntry } = load<
    typeof import("next/dist/shared/lib/router/utils/app-paths.js")
  >("next/dist/shared/lib/router/utils/app-paths");
  const { isAppRouteRoute } = load<typeof import("next/dist/lib/is-app-route-route.js")>(
    "next/dist/lib/is-app-route-route",
  );
  const { isAppPageRoute } = load<typeof import("next/dist/lib/is-app-page-route.js")>(
    "next/dist/lib/is-app-page-route",
  );
  const { findMissingCanonicalInterceptionRoutes } = load<
    typeof import("next/dist/shared/lib/router/utils/interception-routes.js")
  >("next/dist/shared/lib/router/utils/interception-routes");
  const { MissingCanonicalInterceptionRoutesError } = load<
    typeof import("next/dist/shared/lib/errors/missing-canonical-interception-routes-error.js")
  >("next/dist/shared/lib/errors/missing-canonical-interception-routes-error");
  const { IncompatibleParallelRouteSlotsError } = load<
    typeof import("next/dist/shared/lib/errors/incompatible-parallel-route-slots-error.js")
  >("next/dist/shared/lib/errors/incompatible-parallel-route-slots-error");
  const { UnmatchedAppPagesError } = load<
    typeof import("next/dist/shared/lib/errors/unmatched-app-pages-error.js")
  >("next/dist/shared/lib/errors/unmatched-app-pages-error");
  const { generateBuildId } = load<typeof import("next/dist/build/generate-build-id.js")>(
    "next/dist/build/generate-build-id",
  );
  const { getDefineEnv } = load<typeof import("next/dist/build/define-env.js")>(
    "next/dist/build/define-env",
  );
  const { getNextPublicEnvironmentVariables, getNextConfigEnv } = load<
    typeof import("next/dist/lib/static-env.js")
  >("next/dist/lib/static-env");
  const { SUPPORTED_NATIVE_MODULES } = load<
    typeof import("next/dist/build/webpack/plugins/middleware-plugin.js")
  >("next/dist/build/webpack/plugins/middleware-plugin");
  const compilerAliases = load<typeof import("next/dist/build/create-compiler-aliases.js")>(
    "next/dist/build/create-compiler-aliases",
  );
  const { needsExperimentalReact } = load<
    typeof import("next/dist/lib/needs-experimental-react.js")
  >("next/dist/lib/needs-experimental-react");
  const { loadEntrypoint } = load<typeof import("next/dist/build/load-entrypoint.js")>(
    "next/dist/build/load-entrypoint",
  );
  const nextAppLoader = loader<(this: AppLoaderContext) => Promise<string>>(
    "next/dist/build/webpack/loaders/next-app-loader/index",
  );
  const { IncrementalCache } = load<
    typeof import("next/dist/server/lib/incremental-cache/index.js")
  >("next/dist/server/lib/incremental-cache/index");
  const swc = load<typeof import("next/dist/build/swc/index.js")>("next/dist/build/swc/index");
  const { getLoaderSWCOptions } = load<typeof import("next/dist/build/swc/options.js")>(
    "next/dist/build/swc/options",
  );
  const loadJsConfig = load<typeof import("next/dist/build/load-jsconfig.js")>(
    "next/dist/build/load-jsconfig",
  ).default;
  const { getRSCModuleInformation, getAppPageStaticInfo } = load<
    typeof import("next/dist/build/analysis/get-page-static-info.js")
  >("next/dist/build/analysis/get-page-static-info");
  const { nextImageLoaderRegex } = load<typeof import("next/dist/build/webpack-config.js")>(
    "next/dist/build/webpack-config",
  );
  const nextImageLoader = loader("next/dist/build/webpack/loaders/next-image-loader/index");
  const { getNextFontLoader } = load<
    typeof import("next/dist/build/webpack/config/blocks/css/loaders/next-font.js")
  >("next/dist/build/webpack/config/blocks/css/loaders/next-font");
  const { getPostCssPlugins } = load<
    typeof import("next/dist/build/webpack/config/blocks/css/plugins.js")
  >("next/dist/build/webpack/config/blocks/css/plugins");
  const { findConfig } = load<typeof import("next/dist/lib/find-config.js")>(
    "next/dist/lib/find-config",
  );
  const { getCssModuleLoader } = load<
    typeof import("next/dist/build/webpack/config/blocks/css/loaders/modules.js")
  >("next/dist/build/webpack/config/blocks/css/loaders/modules");
  // The PostCSS plugin of Next's css-loader that holds a CSS module to its mode.
  const localByDefault = load<(options: { mode: string }) => never>(
    "next/dist/compiled/postcss-modules-local-by-default/index",
  );
  const { getSupportedBrowsers } = load<typeof import("next/dist/build/get-supported-browsers.js")>(
    "next/dist/build/get-supported-browsers",
  );
  const nextFontLoader = loader("next/dist/build/webpack/loaders/next-font-loader/index");
  const nextRootParamsLoader = loader("next/dist/build/webpack/loaders/next-root-params-loader");
  const imageOptimizer = load<typeof import("next/dist/server/image-optimizer.js")>(
    "next/dist/server/image-optimizer",
  );
  const loadCustomRoutes = load<typeof import("next/dist/lib/load-custom-routes.js")>(
    "next/dist/lib/load-custom-routes",
  ).default;
  const { generateInterceptionRoutesRewrites } = load<
    typeof import("next/dist/lib/generate-interception-routes-rewrites.js")
  >("next/dist/lib/generate-interception-routes-rewrites");
  const { NEXT_URL } = load<typeof import("next/dist/client/components/app-router-headers.js")>(
    "next/dist/client/components/app-router-headers",
  );
  const { generateRoutesManifest } = load<
    typeof import("next/dist/build/generate-routes-manifest.js")
  >("next/dist/build/generate-routes-manifest");
  const { handleBuildComplete } = load<typeof import("next/dist/build/adapter/build-complete.js")>(
    "next/dist/build/adapter/build-complete",
  );
  const { Bundler } = load<typeof import("next/dist/lib/bundler.js")>("next/dist/lib/bundler");
  const { getFilesInDir } = load<typeof import("next/dist/lib/get-files-in-dir.js")>(
    "next/dist/lib/get-files-in-dir",
  );
  // Next types this as a const enum, which only its own build can read: so
  // the value is read as it is, and passed on as whatever Next asks for.
  const { PAGE_TYPES } = load<{ PAGE_TYPES: { ROOT?: string } }>("next/dist/lib/page-types");
  const rootPageType = (PAGE_TYPES.ROOT ??
    fail("next/dist/lib/page-types.js has no `PAGE_TYPES.ROOT`")) as never;
  const { getStaticInfoIncludingLayouts } = load<
    typeof import("next/dist/build/get-static-info-including-layouts.js")
  >("next/dist/build/get-static-info-including-layouts");
  const { getEdgeServerEntry } =
    load<typeof import("next/dist/build/entries.js")>("next/dist/build/entries");
  const { getNamedMiddlewareRegex } = load<
    typeof import("next/dist/shared/lib/router/utils/route-regex.js")
  >("next/dist/shared/lib/router/utils/route-regex");
  const nextMiddlewareLoader = loader("next/dist/build/webpack/loaders/next-middleware-loader");
  const { getContentType, getExtension } = load<typeof import("next/dist/server/serve-static.js")>(
    "next/dist/server/serve-static",
  );
  const nextMetadataImageLoader = loader(
    "next/dist/build/webpack/loaders/next-metadata-image-loader",
  );
  const nextMetadataRouteLoader = loader(
    "next/dist/build/webpack/loaders/next-metadata-route-loader",
  );

  return {
    // What project/context.ts loads the project with.
    loadConfig,
    // As the phase `loadConfig()` takes, not a string.
    PHASE_PRODUCTION_BUILD:
      constants.PHASE_PRODUCTION_BUILD as typeof constants.PHASE_PRODUCTION_BUILD,
    findPagesDir,
    generateBuildId,
    // And what the other files of project/ call, as `next` of the context.
    COMPILER_NAMES,
    APP_DIR_ALIAS,
    MIDDLEWARE_FILENAME,
    PROXY_FILENAME,
    WEBPACK_LAYERS,
    WEBPACK_RESOURCE_QUERIES,
    discoverRoutes,
    createPagesMapping,
    normalizeCatchAllRoutes,
    normalizeAppPath,
    compareAppPaths,
    selectAppPageEntry,
    isAppRouteRoute,
    isAppPageRoute,
    findMissingCanonicalInterceptionRoutes,
    MissingCanonicalInterceptionRoutesError,
    IncompatibleParallelRouteSlotsError,
    UnmatchedAppPagesError,
    getDefineEnv,
    getNextPublicEnvironmentVariables,
    getNextConfigEnv,
    SUPPORTED_NATIVE_MODULES,
    compilerAliases,
    needsExperimentalReact,
    loadEntrypoint,
    nextAppLoader,
    IncrementalCache,
    swc,
    getLoaderSWCOptions,
    loadJsConfig,
    getRSCModuleInformation,
    getAppPageStaticInfo,
    nextImageLoaderRegex,
    nextImageLoader,
    getNextFontLoader,
    getPostCssPlugins,
    getSupportedBrowsers,
    getCssModuleLoader,
    localByDefault,
    findConfig,
    nextFontLoader,
    nextRootParamsLoader,
    imageOptimizer,
    loadCustomRoutes,
    generateInterceptionRoutesRewrites,
    NEXT_URL,
    generateRoutesManifest,
    handleBuildComplete,
    Bundler,
    getFilesInDir,
    rootPageType,
    getStaticInfoIncludingLayouts,
    getEdgeServerEntry,
    getNamedMiddlewareRegex,
    nextMiddlewareLoader,
    getContentType,
    getExtension,
    nextMetadataImageLoader,
    nextMetadataRouteLoader,
  };
}
