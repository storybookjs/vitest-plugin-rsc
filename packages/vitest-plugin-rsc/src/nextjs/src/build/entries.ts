import fs from "node:fs";
import path from "node:path";
import { stringify, type ParsedUrlQueryInput } from "node:querystring";
import type { NextProjectConfig } from "../../config.ts";
import { createProjectRequire } from "../../plugin-utils.ts";
import {
  virtualNextAppRoutePublicId,
  virtualNextAppPagePublicId,
  virtualNextEntrypointsPublicId,
  virtualNextRouteTreePublicId,
} from "../../virtual-ids.ts";
import { loadNextRouteStaticInfo } from "./analysis/get-page-static-info.ts";
import { generateNextRouteTreeModule } from "./webpack/loaders/next-app-loader/index.ts";
import {
  createNextEdgeAppPageEntrypointVirtualSource,
  createNextEdgeAppPageUserlandSource,
} from "./webpack/loaders/next-edge-ssr-loader/index.ts";
import {
  createNextEdgeAppRouteEntrypointVirtualSource,
  createNextEdgeAppRouteUserlandSource,
} from "./webpack/loaders/next-edge-app-route-loader/index.ts";
import type { NextRouteManifestBuildEntry } from "../server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts";
import type { NextRouteHandlerManifestBuildEntry } from "../server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts";

// Direct Next entry serialization: App Router entry and next-app-loader options.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/entries.ts#L287-L294
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/entries.ts#L593-L615
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L48-L67
// Note: Vite uses virtual modules instead of webpack entry objects. Real
// `next-app-loader` requests delegate to the installed Next `getAppEntry()`
// when available; remaining query serialization is a tested transport boundary
// for virtual modules and installs where that export differs, not app semantics.

// Begin adapted: Next.js AppLoaderOptions and App Router entries
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/entries.ts#L287-L294
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/entries.ts#L593-L615
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L48-L67
// Adaptation: Preserve the Next option names and query serialization while
// turning the webpack entry list into scan-only Vite imports.
export type NextAppLoaderOptions = {
  name: string;
  page: string;
  pagePath: string;
  appDir: string;
  appPaths: readonly string[] | null;
  allNormalizedAppPaths: readonly string[] | null;
  preferredRegion: string | string[] | undefined;
  pageExtensions: string[];
  assetPrefix: string;
  rootDir?: string;
  tsconfigPath?: string;
  isDev?: true;
  basePath: string;
  nextConfigOutput: NextProjectConfig["nextConfig"]["output"];
  middlewareConfig: string;
  isGlobalNotFoundEnabled: true | undefined;
};

export type NextAppRouteLoaderOptions = {
  name: string;
  page: string;
  pagePath: string;
  appDir: string;
  routeFile: string;
  preferredRegion: string | string[] | undefined;
  pageExtensions: string[];
  rootDir?: string;
  tsconfigPath?: string;
  isDev?: true;
  nextConfigOutput: NextProjectConfig["nextConfig"]["output"];
  middlewareConfig: string;
};

type NextAppEntry = {
  import?: unknown;
};

type NextBuildEntriesModule = {
  getAppEntry?: (options: Readonly<NextAppLoaderOptions>) => NextAppEntry;
};

export async function generateNextEntrypointsModule(
  root: string,
  projectConfig: NextProjectConfig,
  entries: NextRouteManifestBuildEntry[],
) {
  const watchFiles = new Set<string>();
  const routeTreeImports: string[] = [];

  for (const entry of entries) {
    const loaderOptions = await createNextAppLoaderOptions(root, projectConfig, entry);
    const routeTree = await generateNextRouteTreeModule(root, entry, loaderOptions);
    routeTreeImports.push(
      `import ${JSON.stringify(createNextRouteTreeVirtualSource(routeTree.loaderOptions))};`,
    );
    for (const file of routeTree.watchFiles) {
      watchFiles.add(file);
    }
  }

  return {
    code: `${routeTreeImports.join("\n")}\nexport {};\n`,
    watchFiles: [...watchFiles],
  };
}

export function createNextSourceOptimizerEntries(root: string): string[] {
  for (const appDir of ["app", "src/app"]) {
    if (!fs.existsSync(path.join(root, appDir))) continue;
    return [virtualNextEntrypointsPublicId];
  }
  return [];
}

export async function createNextAppLoaderOptions(
  root: string,
  projectConfig: NextProjectConfig,
  entry: NextRouteManifestBuildEntry,
): Promise<NextAppLoaderOptions> {
  const staticInfo = await loadNextRouteStaticInfo(root, projectConfig, entry);
  const { encodeToBase64 } = createProjectRequire(root)(
    "next/dist/build/webpack/loaders/utils.js",
  ) as {
    encodeToBase64(value: object): string;
  };

  return {
    name: `app${entry.appPath}`,
    page: entry.appPath,
    pagePath: `private-next-app-dir${entry.appPath}`,
    appDir: entry.appDir,
    appPaths: entry.appPaths,
    allNormalizedAppPaths: entry.allNormalizedAppPaths,
    preferredRegion: staticInfo.preferredRegion,
    pageExtensions: projectConfig.pageExtensions,
    assetPrefix: projectConfig.assetPrefix,
    rootDir: root,
    tsconfigPath: projectConfig.tsconfigPath,
    isDev: projectConfig.isDev ? true : undefined,
    basePath: projectConfig.basePath,
    nextConfigOutput: projectConfig.nextConfig.output,
    middlewareConfig: encodeToBase64((staticInfo.middleware ?? { matchers: [] }) as object),
    isGlobalNotFoundEnabled:
      projectConfig.nextConfig.experimental?.globalNotFound === true ? true : undefined,
  };
}

export async function createNextAppRouteLoaderOptions(
  root: string,
  projectConfig: NextProjectConfig,
  entry: NextRouteHandlerManifestBuildEntry,
): Promise<NextAppRouteLoaderOptions> {
  const appDir = projectConfig.appDir;
  if (!appDir) {
    throw new Error(`Cannot create Next App Route loader options without an app directory.`);
  }
  const staticInfo = await loadNextRouteStaticInfo(root, projectConfig, {
    route: entry.route,
    appDir,
    appPath: entry.appPath,
    appPaths: [entry.appPath],
    allNormalizedAppPaths: [entry.route],
    pageFile: entry.routeFile,
  });
  const { encodeToBase64 } = createProjectRequire(root)(
    "next/dist/build/webpack/loaders/utils.js",
  ) as {
    encodeToBase64(value: object): string;
  };

  return {
    name: `app${entry.appPath}`,
    page: entry.appPath,
    pagePath: createPrivateAppDirRouteFilePath(appDir, entry.routeFile),
    appDir,
    routeFile: entry.routeFile,
    preferredRegion: staticInfo.preferredRegion,
    pageExtensions: projectConfig.pageExtensions,
    rootDir: root,
    tsconfigPath: projectConfig.tsconfigPath,
    isDev: projectConfig.isDev ? true : undefined,
    nextConfigOutput: projectConfig.nextConfig.output,
    middlewareConfig: encodeToBase64((staticInfo.middleware ?? { matchers: [] }) as object),
  };
}

function createPrivateAppDirRouteFilePath(appDir: string, routeFile: string) {
  return `private-next-app-dir/${path.relative(appDir, routeFile).split(path.sep).join("/")}`;
}

export function createNextRouteTreeVirtualSource(options: NextAppLoaderOptions) {
  return `${virtualNextRouteTreePublicId}?${stringifyNextAppLoaderOptions(options)}`;
}

export function createNextAppPageVirtualSource(options: NextAppLoaderOptions) {
  return `${virtualNextAppPagePublicId}?${stringifyNextAppLoaderOptions(options)}`;
}

export function createNextAppRouteVirtualSource(options: NextAppRouteLoaderOptions) {
  return `${virtualNextAppRoutePublicId}?${stringifyNextAppRouteLoaderOptions(options)}`;
}

export function createNextEdgeSsrAppVirtualSource(options: NextAppLoaderOptions) {
  const appPageVirtualSource = createNextAppPageVirtualSource(options);

  return createNextEdgeAppPageEntrypointVirtualSource({
    page: options.page,
    userland: createNextEdgeAppPageUserlandSource({
      appPageVirtualSource,
      pagePath: options.pagePath,
    }),
  });
}

export function createNextEdgeAppRouteVirtualSource(options: NextAppRouteLoaderOptions) {
  const appRouteVirtualSource = createNextAppRouteVirtualSource(options);

  return createNextEdgeAppRouteEntrypointVirtualSource({
    page: options.page,
    userland: createNextEdgeAppRouteUserlandSource({
      appRouteVirtualSource,
      pagePath: options.pagePath,
    }),
  });
}

export function createNextAppLoaderSource(options: NextAppLoaderOptions) {
  return getInstalledNextAppEntryImport(options) ?? createSerializedNextAppLoaderSource(options);
}

function stringifyNextAppLoaderOptions(options: NextAppLoaderOptions) {
  return stringify(options as unknown as ParsedUrlQueryInput);
}

function stringifyNextAppRouteLoaderOptions(options: NextAppRouteLoaderOptions) {
  return stringify(options as unknown as ParsedUrlQueryInput);
}

function createSerializedNextAppLoaderSource(options: NextAppLoaderOptions) {
  return `next-app-loader?${stringifyNextAppLoaderOptions(options)}!`;
}

function getInstalledNextAppEntryImport(options: NextAppLoaderOptions) {
  if (!options.rootDir) return;

  const getAppEntry = loadInstalledGetAppEntry(options.rootDir);
  if (!getAppEntry) return;

  const entry = getAppEntry(options);
  return typeof entry.import === "string" ? entry.import : undefined;
}

function loadInstalledGetAppEntry(root: string) {
  const projectRequire = createProjectRequire(root);
  let entriesPath: string;
  try {
    entriesPath = projectRequire.resolve("next/dist/build/entries.js");
  } catch (error) {
    if (isModuleNotFoundError(error)) return;
    throw error;
  }

  const entries = projectRequire(entriesPath) as NextBuildEntriesModule;
  return typeof entries.getAppEntry === "function" ? entries.getAppEntry : undefined;
}

function isModuleNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "MODULE_NOT_FOUND"
  );
}

export function parseNextAppLoaderOptions(params: URLSearchParams): NextAppLoaderOptions {
  const preferredRegion = parseOptionalArrayParam(params, "preferredRegion");

  return {
    name: getRequiredParam(params, "name"),
    page: getRequiredParam(params, "page"),
    pagePath: getRequiredParam(params, "pagePath"),
    appDir: getRequiredParam(params, "appDir"),
    appPaths: parseNullableArrayParam(params, "appPaths"),
    allNormalizedAppPaths: parseNullableArrayParam(params, "allNormalizedAppPaths"),
    preferredRegion:
      preferredRegion.length > 1 ? preferredRegion : (preferredRegion[0] ?? undefined),
    pageExtensions: parseRequiredArrayParam(params, "pageExtensions"),
    assetPrefix: params.get("assetPrefix") ?? "",
    rootDir: parseOptionalParam(params, "rootDir"),
    tsconfigPath: parseOptionalParam(params, "tsconfigPath"),
    isDev: params.get("isDev") === "true" ? true : undefined,
    basePath: params.get("basePath") ?? "",
    nextConfigOutput: parseOptionalParam(params, "nextConfigOutput"),
    middlewareConfig: getRequiredParam(params, "middlewareConfig"),
    isGlobalNotFoundEnabled: params.get("isGlobalNotFoundEnabled") === "true" ? true : undefined,
  };
}

export function parseNextAppRouteLoaderOptions(params: URLSearchParams): NextAppRouteLoaderOptions {
  return {
    name: getRequiredParam(params, "name"),
    page: getRequiredParam(params, "page"),
    pagePath: getRequiredParam(params, "pagePath"),
    appDir: getRequiredParam(params, "appDir"),
    routeFile: getRequiredParam(params, "routeFile"),
    preferredRegion: parsePreferredRegionParam(params),
    pageExtensions: parseRequiredArrayParam(params, "pageExtensions"),
    rootDir: parseOptionalParam(params, "rootDir"),
    tsconfigPath: parseOptionalParam(params, "tsconfigPath"),
    isDev: params.get("isDev") === "true" ? true : undefined,
    nextConfigOutput: parseOptionalParam(params, "nextConfigOutput"),
    middlewareConfig: getRequiredParam(params, "middlewareConfig"),
  };
}

function getRequiredParam(params: URLSearchParams, name: string) {
  const value = parseOptionalParam(params, name);
  if (value === undefined) {
    throw new Error(`Missing ${name} for Next route tree virtual module.`);
  }
  return value;
}

function parseOptionalParam(params: URLSearchParams, name: string) {
  const value = params.get(name);
  return value === null || value === "" ? undefined : value;
}

function parsePreferredRegionParam(params: URLSearchParams) {
  const preferredRegion = parseOptionalArrayParam(params, "preferredRegion");
  return preferredRegion.length > 1 ? preferredRegion : (preferredRegion[0] ?? undefined);
}

function parseRequiredArrayParam(params: URLSearchParams, name: string) {
  const values = parseOptionalArrayParam(params, name);
  if (values.length === 0) {
    throw new Error(`Missing ${name} for Next route tree virtual module.`);
  }
  return values;
}

function parseNullableArrayParam(params: URLSearchParams, name: string) {
  const values = parseOptionalArrayParam(params, name);
  return values.length > 0 ? values : null;
}

function parseOptionalArrayParam(params: URLSearchParams, name: string) {
  return params.getAll(name).filter((value) => value !== "");
}
// End adapted
