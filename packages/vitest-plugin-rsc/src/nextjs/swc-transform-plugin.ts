import path from "node:path";
import type { Plugin } from "vite";
import { createProjectRequire, getProjectRoot, normalizePath } from "./plugin-utils";

type NextSwc = {
  loadBindings(): Promise<unknown>;
  transform(code: string, options: unknown): Promise<{ code: string; map?: string | null }>;
};

type NextSwcOptionsModule = {
  getLoaderSWCOptions(options: {
    filename: string;
    development: boolean;
    isServer: boolean;
    pagesDir?: string;
    appDir?: string;
    isPageFile: boolean;
    isCacheComponents?: boolean;
    hasReactRefresh: boolean;
    optimizeServerReact?: boolean;
    modularizeImports?: unknown;
    optimizePackageImports?: unknown;
    swcPlugins?: unknown;
    compilerOptions?: unknown;
    jsConfig?: unknown;
    supportedBrowsers?: string[];
    swcCacheDir: string;
    relativeFilePathFromRoot: string;
    esm?: boolean;
    serverComponents?: boolean;
    serverReferenceHashSalt: string;
    bundleLayer?: string;
    cacheHandlers?: unknown;
    useCacheEnabled?: boolean;
    taintEnabled?: boolean;
    trackDynamicImports?: boolean;
    pageExtensions?: string[];
  }): unknown;
};

type NextConfigModule = {
  default?: NextLoadConfig;
} & NextLoadConfig;

type NextLoadConfig = (phase: string, dir: string) => Promise<NextConfigLike>;

type NextLoadJsConfigModule = {
  default?: NextLoadJsConfig;
} & NextLoadJsConfig;

type NextLoadJsConfig = (dir: string, config: NextConfigLike) => Promise<LoadedJsConfig>;

type LoadedJsConfig = {
  jsConfig?: unknown;
  resolvedBaseUrl?: unknown;
};

type NextFindPagesDirModule = {
  findPagesDir(dir: string): { pagesDir?: string; appDir?: string };
};

type NextBuildUtilsModule = {
  getSupportedBrowsers(dir: string, dev: boolean): string[];
};

type NextConstantsModule = {
  PHASE_DEVELOPMENT_SERVER: string;
  PHASE_PRODUCTION_BUILD: string;
  PHASE_TEST: string;
};

type NextConfigLike = {
  distDir?: string;
  pageExtensions?: string[];
  cacheComponents?: boolean;
  cacheHandlers?: unknown;
  compiler?: unknown;
  modularizeImports?: unknown;
  experimental?: {
    allowDevelopmentBuild?: boolean;
    optimizePackageImports?: unknown;
    optimizeServerReact?: boolean;
    swcPlugins?: unknown;
    useCache?: boolean;
    taint?: boolean;
  };
};

type NextSwcTransformContext = {
  nextSwc: NextSwc;
  nextSwcOptions: NextSwcOptionsModule;
  nextConfig: NextConfigLike;
  loadedJsConfig: LoadedJsConfig;
  appDir?: string;
  pagesDir?: string;
  supportedBrowsers?: string[];
  isDev: boolean;
};

// Keep this in sync with Next's webpack loader `FORCE_TRANSPILE_CONDITIONS`
// and Turbopack's Next transform rules. Vite RSC still owns the RSC graph and
// action wiring, but these files need Next's source-level compiler passes.
const nextSwcTransformConditions = /next\/font|next\/dynamic|use server|use client|use cache/;

export function useNextSwcTransform(): Plugin {
  let root = process.cwd();
  let mode = "test";
  let contextPromise: Promise<NextSwcTransformContext> | undefined;

  return {
    name: "next-rsc-swc-transform",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
      mode = config.mode;
      contextPromise = undefined;
    },
    async transform(code, id) {
      if (!isUserSourceFile(id) || !hasSupportedNextSwcTransformTrigger(code)) return;

      const filename = id.replace(/\?.*$/, "");
      contextPromise ??= createNextSwcTransformContext(root, mode);
      const context = await contextPromise;
      const isServer = this.environment.name === "client";
      const isPageFile = context.pagesDir ? filename.startsWith(context.pagesDir) : false;
      const inputSourceMap = this.getCombinedSourcemap();

      return context.nextSwc.transform(code, {
        ...(context.nextSwcOptions.getLoaderSWCOptions({
          filename,
          development:
            context.isDev || context.nextConfig.experimental?.allowDevelopmentBuild === true,
          isServer,
          pagesDir: context.pagesDir,
          appDir: context.appDir,
          isPageFile,
          isCacheComponents: context.nextConfig.cacheComponents,
          hasReactRefresh: false,
          modularizeImports: context.nextConfig.modularizeImports,
          optimizePackageImports: context.nextConfig.experimental?.optimizePackageImports,
          swcPlugins: context.nextConfig.experimental?.swcPlugins,
          compilerOptions: context.nextConfig.compiler,
          jsConfig: context.loadedJsConfig.jsConfig,
          supportedBrowsers: isServer ? undefined : context.supportedBrowsers,
          swcCacheDir: path.join(root, context.nextConfig.distDir ?? ".next", "cache", "swc"),
          relativeFilePathFromRoot: normalizePath(path.relative(root, filename)),
          esm: true,
          // Vite RSC owns client references and server actions. We still use
          // Next's shared SWC compiler for transforms that are independent of
          // the webpack/Turbopack module graph: fonts, next/dynamic metadata,
          // styled-jsx/compiler options, modularized imports, and next/server
          // CJS optimization.
          serverComponents: false,
          serverReferenceHashSalt: "",
          cacheHandlers: context.nextConfig.cacheHandlers,
          useCacheEnabled: context.nextConfig.experimental?.useCache,
          taintEnabled: context.nextConfig.experimental?.taint,
          trackDynamicImports: false,
          pageExtensions: context.nextConfig.pageExtensions,
        }) as Record<string, unknown>),
        inputSourceMap:
          inputSourceMap && typeof inputSourceMap === "object"
            ? JSON.stringify(inputSourceMap)
            : undefined,
        sourceFileName: filename,
        filename,
      });
    },
  };
}

async function createNextSwcTransformContext(
  root: string,
  mode: string,
): Promise<NextSwcTransformContext> {
  const projectRequire = createProjectRequire(root);
  const nextSwc = projectRequire("next/dist/build/swc/index.js") as NextSwc;
  const nextSwcOptions = projectRequire("next/dist/build/swc/options.js") as NextSwcOptionsModule;
  const loadConfigModule = projectRequire("next/dist/server/config.js") as NextConfigModule;
  const loadJsConfigModule = projectRequire(
    "next/dist/build/load-jsconfig.js",
  ) as NextLoadJsConfigModule;
  const constants = projectRequire("next/dist/shared/lib/constants.js") as NextConstantsModule;
  const { findPagesDir } = projectRequire(
    "next/dist/lib/find-pages-dir.js",
  ) as NextFindPagesDirModule;
  const { getSupportedBrowsers } = projectRequire(
    "next/dist/build/utils.js",
  ) as NextBuildUtilsModule;

  const loadConfig = loadConfigModule.default ?? loadConfigModule;
  const loadJsConfig = loadJsConfigModule.default ?? loadJsConfigModule;
  const phase =
    mode === "production"
      ? constants.PHASE_PRODUCTION_BUILD
      : process.env.NODE_ENV === "test"
        ? constants.PHASE_TEST
        : constants.PHASE_DEVELOPMENT_SERVER;
  const isDev = phase !== constants.PHASE_PRODUCTION_BUILD;
  const nextConfig = await loadConfig(phase, root);
  const loadedJsConfig = await loadJsConfig(root, nextConfig);
  const nextDirectories = findNextDirectories(root, findPagesDir);

  await nextSwc.loadBindings();

  return {
    nextSwc,
    nextSwcOptions,
    nextConfig,
    loadedJsConfig,
    supportedBrowsers: getSupportedBrowsers(root, isDev),
    isDev,
    ...nextDirectories,
  };
}

function findNextDirectories(root: string, findPagesDir: NextFindPagesDirModule["findPagesDir"]) {
  try {
    return findPagesDir(root);
  } catch {
    return {
      appDir: undefined,
      pagesDir: undefined,
    };
  }
}

function isUserSourceFile(id: string) {
  return (
    /\.(?:[cm]?[jt]sx?)($|\?)/.test(id) && !id.includes("/node_modules/") && !id.includes("/.vite/")
  );
}

function hasSupportedNextSwcTransformTrigger(code: string) {
  return nextSwcTransformConditions.test(code);
}
