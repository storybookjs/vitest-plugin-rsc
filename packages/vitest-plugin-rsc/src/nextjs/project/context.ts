import fs from "node:fs";
import path from "node:path";
import type { AppLoaderContext } from "./entries.ts";
import type { Loader } from "./loaders.ts";

// The project, and the build code of its own `next`: what the other files in
// this directory work with. The modules of Next's build that the plugin calls
// are loaded with `load()` here, so one that is gone fails when a run starts,
// and an export that is gone fails with the same message where it is read.

// Next runs a compiled `next.config.ts` as a module without a filename, so
// Node looks up a relative import of the config, like `./env/server.ts`, from
// the working directory. For `next build` that is the project. Vitest loads
// the projects of a workspace in one process, so they take turns to have it.
const workingDirectory = process.cwd();
let directoryQueue: Promise<unknown> = Promise.resolve();

export function inDirectory<T>(directory: string, load: () => Promise<T>): Promise<T> {
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

/** The file of a module of Next by its path, which may leave out `.js` or `/index.js`. */
export function moduleFileAt(base: string): string | undefined {
  return [base, `${base}.js`, path.join(base, "index.js")].find((candidate) =>
    fs.statSync(candidate, { throwIfNoEntry: false })?.isFile(),
  );
}

/** The project and its `next`, as `openNextProject()` loads them. */
export type NextContext = Awaited<ReturnType<typeof openNextProject>>;

export async function openNextProject(root: string, projectRequire: NodeJS.Require) {
  const nextDir = path.dirname(projectRequire.resolve("next/package.json"));
  const { version } = projectRequire("next/package.json") as { version: string };
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
      loaded = projectRequire(`next/dist/${file}.js`) as T;
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
  const { PHASE_PRODUCTION_BUILD, COMPILER_NAMES } =
    load<typeof import("next/dist/shared/lib/constants.js")>("shared/lib/constants");
  const { APP_DIR_ALIAS, MIDDLEWARE_FILENAME, PROXY_FILENAME, WEBPACK_LAYERS } =
    load<typeof import("next/dist/lib/constants.js")>("lib/constants");
  const { findPagesDir } =
    load<typeof import("next/dist/lib/find-pages-dir.js")>("lib/find-pages-dir");
  const { discoverRoutes, createPagesMapping } =
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
  const loadJsConfig =
    load<typeof import("next/dist/build/load-jsconfig.js")>("build/load-jsconfig").default;
  const { getRSCModuleInformation, getAppPageStaticInfo } = load<
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
  const { getPostCssPlugins } = load<
    typeof import("next/dist/build/webpack/config/blocks/css/plugins.js")
  >("build/webpack/config/blocks/css/plugins");
  const { findConfig } = load<typeof import("next/dist/lib/find-config.js")>("lib/find-config");
  const { getCssModuleLoader } = load<
    typeof import("next/dist/build/webpack/config/blocks/css/loaders/modules.js")
  >("build/webpack/config/blocks/css/loaders/modules");
  // The PostCSS plugin of Next's css-loader that holds a CSS module to its mode.
  const localByDefault = load<(options: { mode: string }) => never>(
    "compiled/postcss-modules-local-by-default/index",
  );
  const { getSupportedBrowsers } = load<typeof import("next/dist/build/get-supported-browsers.js")>(
    "build/get-supported-browsers",
  );
  const nextFontLoader = load<
    typeof import("next/dist/build/webpack/loaders/next-font-loader/index.js")
  >("build/webpack/loaders/next-font-loader/index").default as unknown as Loader;
  const imageOptimizer =
    load<typeof import("next/dist/server/image-optimizer.js")>("server/image-optimizer");
  const loadCustomRoutes =
    load<typeof import("next/dist/lib/load-custom-routes.js")>("lib/load-custom-routes").default;
  const { generateInterceptionRoutesRewrites } = load<
    typeof import("next/dist/lib/generate-interception-routes-rewrites.js")
  >("lib/generate-interception-routes-rewrites");
  const { NEXT_URL } = load<typeof import("next/dist/client/components/app-router-headers.js")>(
    "client/components/app-router-headers",
  );
  const { generateRoutesManifest } = load<
    typeof import("next/dist/build/generate-routes-manifest.js")
  >("build/generate-routes-manifest");
  const { handleBuildComplete } = load<typeof import("next/dist/build/adapter/build-complete.js")>(
    "build/adapter/build-complete",
  );
  const { Bundler } = load<typeof import("next/dist/lib/bundler.js")>("lib/bundler");
  const { getFilesInDir } =
    load<typeof import("next/dist/lib/get-files-in-dir.js")>("lib/get-files-in-dir");
  // Next types this as a const enum, which only its own build can read: so
  // the value is read as it is, and passed on as whatever Next asks for.
  const { PAGE_TYPES } = load<{ PAGE_TYPES: { ROOT?: string } }>("lib/page-types");
  const rootPageType = (PAGE_TYPES.ROOT ??
    fail("next/dist/lib/page-types.js has no `PAGE_TYPES.ROOT`")) as never;
  const { getStaticInfoIncludingLayouts } = load<
    typeof import("next/dist/build/get-static-info-including-layouts.js")
  >("build/get-static-info-including-layouts");
  const { getEdgeServerEntry } = load<typeof import("next/dist/build/entries.js")>("build/entries");
  const { getNamedMiddlewareRegex } = load<
    typeof import("next/dist/shared/lib/router/utils/route-regex.js")
  >("shared/lib/router/utils/route-regex");
  const nextMiddlewareLoader = load<
    typeof import("next/dist/build/webpack/loaders/next-middleware-loader.js")
  >("build/webpack/loaders/next-middleware-loader").default as unknown as Loader;
  const { getContentType, getExtension } =
    load<typeof import("next/dist/server/serve-static.js")>("server/serve-static");

  // The app is served the way a deployment serves it: production Next on its
  // Node.js runtime. React itself stays a development build, see plugin.ts.
  const loadedConfig = await inDirectory(root, () =>
    loadConfig(PHASE_PRODUCTION_BUILD, root, { silent: true }),
  );
  // Without `i18n`, which is the Pages Router's: a URL of the App Router has
  // no locale. With it, Next's route resolution and its proxy look for one in
  // every URL, and find no route of the app.
  const config = { ...loadedConfig, i18n: null };
  const { appDir } = findPagesDir(root);
  if (!appDir) {
    throw new Error(`vitest-plugin-rsc: no \`app\` directory found in ${root}`);
  }
  const { pageExtensions } = config;
  const distDir = path.join(root, config.distDir);

  const buildId = await generateBuildId(config.generateBuildId, () => "vitest");
  // What a build writes to `.next/` for its server: the build id and the keys
  // of draft mode. A build makes up the keys; here they are the same on every
  // run, so that the pre-bundled dependencies they are compiled into stay
  // cached. cache.ts gives them to Next's server.
  const buildEnvironment = {
    __NEXT_BUILD_ID: buildId,
    __NEXT_PREVIEW_MODE_ID: "vitest-preview-mode-id",
    __NEXT_PREVIEW_MODE_SIGNING_KEY: "vitest-preview-mode-signing-key",
    __NEXT_PREVIEW_MODE_ENCRYPTION_KEY: "vitest-preview-mode-encryption-key".padEnd(64, "0"),
  };
  const previewProps = {
    previewModeId: buildEnvironment.__NEXT_PREVIEW_MODE_ID,
    previewModeSigningKey: buildEnvironment.__NEXT_PREVIEW_MODE_SIGNING_KEY,
    previewModeEncryptionKey: buildEnvironment.__NEXT_PREVIEW_MODE_ENCRYPTION_KEY,
  };

  return {
    root,
    /** Finds `next`, and what the project has installed next to it. Not the global one. */
    projectRequire,
    nextDir,
    version,
    fail,
    replace,
    config,
    appDir,
    pageExtensions,
    distDir,
    buildId,
    buildEnvironment,
    previewProps,
    /** The build code of the installed `next`. */
    next: {
      COMPILER_NAMES,
      APP_DIR_ALIAS,
      MIDDLEWARE_FILENAME,
      PROXY_FILENAME,
      WEBPACK_LAYERS,
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
      isMetadataRouteFile,
      DEFAULT_METADATA_ROUTE_EXTENSIONS,
      getDefineEnv,
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
    },
  };
}
