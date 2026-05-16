import type { CustomRoutes } from "next/dist/lib/load-custom-routes.js";
import { createProjectRequire } from "./plugin-utils";

export type NextImageConfig = {
  deviceSizes: number[];
  imageSizes: number[];
  qualities?: number[];
  path: string;
  loader: string;
  dangerouslyAllowSVG: boolean;
  unoptimized?: boolean;
  domains?: string[];
  remotePatterns?: unknown[];
  localPatterns?: unknown[];
  output?: string;
};

export type NextConfigLike = {
  assetPrefix?: string;
  basePath?: string;
  cacheComponents?: boolean;
  cacheHandlers?: Record<string, string | undefined>;
  cacheLife?: unknown;
  cacheMaxMemorySize?: number;
  compiler?: unknown;
  distDir?: string;
  images?: NextImageConfig;
  modularizeImports?: unknown;
  output?: string;
  pageExtensions?: string[];
  trailingSlash?: boolean;
  typescript?: {
    tsconfigPath?: string;
  };
  experimental?: {
    allowDevelopmentBuild?: boolean;
    appNavFailHandling?: boolean;
    authInterrupts?: boolean;
    fetchCacheKeyPrefix?: string;
    globalNotFound?: boolean;
    optimizePackageImports?: unknown;
    optimizeServerReact?: boolean;
    rootParams?: boolean;
    swcPlugins?: unknown;
    taint?: boolean;
    useCache?: boolean;
  };
};

export type LoadedJsConfig = {
  jsConfig?: unknown;
  resolvedBaseUrl?: unknown;
};

type NextLoadConfig = (phase: string, dir: string) => Promise<NextConfigLike>;

type NextConfigModule = {
  default?: NextLoadConfig;
} & NextLoadConfig;

export type NextCustomRoutes = CustomRoutes;

type NextLoadCustomRoutes = (config: NextConfigLike) => Promise<NextCustomRoutes>;

type NextLoadCustomRoutesModule = {
  default?: NextLoadCustomRoutes;
} & NextLoadCustomRoutes;

type NextConstantsModule = {
  PHASE_DEVELOPMENT_SERVER: string;
  PHASE_PRODUCTION_BUILD: string;
  PHASE_TEST: string;
};

type NextLoadJsConfigModule = {
  default?: NextLoadJsConfig;
} & NextLoadJsConfig;

type NextLoadJsConfig = (dir: string, config: NextConfigLike) => Promise<LoadedJsConfig>;

type NextFindPagesDirModule = {
  findPagesDir(dir: string): { pagesDir?: string; appDir?: string };
};

type NextBuildUtilsModule = {
  getSupportedBrowsers(dir: string, dev: boolean): string[];
};

export type NextProjectConfig = {
  constants: NextConstantsModule;
  phase: string;
  isDev: boolean;
  nextConfig: NextConfigLike;
  customRoutes: NextCustomRoutes;
  loadedJsConfig: LoadedJsConfig;
  appDir?: string;
  pagesDir?: string;
  pageExtensions: string[];
  supportedBrowsers?: string[];
  distDir: string;
  assetPrefix: string;
  basePath: string;
  tsconfigPath: string | undefined;
  nextImageConfig: NextImageConfig | undefined;
};

const nextProjectConfigCache = new Map<string, Promise<NextProjectConfig>>();

export function loadNextProjectConfig(root: string, mode: string): Promise<NextProjectConfig> {
  const cacheKey = `${root}\0${mode}\0${process.env.NODE_ENV ?? ""}`;
  let config = nextProjectConfigCache.get(cacheKey);
  if (!config) {
    config = loadNextProjectConfigUncached(root, mode);
    nextProjectConfigCache.set(cacheKey, config);
  }
  return config;
}

async function loadNextProjectConfigUncached(
  root: string,
  mode: string,
): Promise<NextProjectConfig> {
  const projectRequire = createProjectRequire(root);
  const loadConfigModule = projectRequire("next/dist/server/config.js") as NextConfigModule;
  const constants = projectRequire("next/dist/shared/lib/constants.js") as NextConstantsModule;
  const loadJsConfigModule = projectRequire(
    "next/dist/build/load-jsconfig.js",
  ) as NextLoadJsConfigModule;
  const loadCustomRoutesModule = projectRequire(
    "next/dist/lib/load-custom-routes.js",
  ) as NextLoadCustomRoutesModule;
  const { findPagesDir } = projectRequire(
    "next/dist/lib/find-pages-dir.js",
  ) as NextFindPagesDirModule;
  const { getSupportedBrowsers } = projectRequire(
    "next/dist/build/utils.js",
  ) as NextBuildUtilsModule;

  const loadConfig = loadConfigModule.default ?? loadConfigModule;
  const loadCustomRoutes = loadCustomRoutesModule.default ?? loadCustomRoutesModule;
  const loadJsConfig = loadJsConfigModule.default ?? loadJsConfigModule;
  const phase = getNextPhase(constants, mode);
  const isDev = phase !== constants.PHASE_PRODUCTION_BUILD;
  const nextConfig = await loadConfig(phase, root);
  const customRoutes = await loadCustomRoutes(nextConfig);
  const loadedJsConfig = await loadJsConfig(root, nextConfig);
  const directories = findNextDirectories(root, findPagesDir);

  return {
    constants,
    phase,
    isDev,
    nextConfig,
    customRoutes,
    loadedJsConfig,
    supportedBrowsers: getSupportedBrowsers(root, isDev),
    pageExtensions: nextConfig.pageExtensions ?? ["tsx", "ts", "jsx", "js"],
    distDir: nextConfig.distDir ?? ".next",
    assetPrefix: nextConfig.assetPrefix ?? "",
    basePath: nextConfig.basePath ?? "",
    tsconfigPath: nextConfig.typescript?.tsconfigPath,
    nextImageConfig: pickNextImageConfig(
      nextConfig.images ?? loadNextDefaultImageConfig(root),
      nextConfig.output,
    ),
    ...directories,
  };
}

function getNextPhase(constants: NextConstantsModule, mode: string) {
  return mode === "production"
    ? constants.PHASE_PRODUCTION_BUILD
    : process.env.NODE_ENV === "test"
      ? constants.PHASE_TEST
      : constants.PHASE_DEVELOPMENT_SERVER;
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

function loadNextDefaultImageConfig(root: string): NextImageConfig | undefined {
  try {
    const { imageConfigDefault } = createProjectRequire(root)(
      "next/dist/shared/lib/image-config.js",
    ) as typeof import("next/dist/shared/lib/image-config.js");
    return imageConfigDefault;
  } catch {
    return;
  }
}

export function pickNextImageConfig(
  config: NextImageConfig | undefined,
  output?: string,
): NextImageConfig | undefined {
  if (!config) return;

  // Mirrors Next's DefineEnv image config shape. Next includes the validation
  // fields during dev; Vitest runs against dev-like browser modules, so expose
  // them here too.
  return {
    deviceSizes: config.deviceSizes,
    imageSizes: config.imageSizes,
    qualities: config.qualities,
    path: config.path,
    loader: config.loader,
    dangerouslyAllowSVG: config.dangerouslyAllowSVG,
    unoptimized: config.unoptimized,
    domains: config.domains,
    remotePatterns: config.remotePatterns,
    localPatterns: config.localPatterns,
    output: output ?? config.output,
  };
}
