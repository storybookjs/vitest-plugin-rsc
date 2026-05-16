import { stringify, type ParsedUrlQueryInput } from "node:querystring";
import type { NextProjectConfig } from "../../config.ts";
import { createProjectRequire } from "../../plugin-utils.ts";
import { virtualNextEntrypointsPublicId, virtualNextRouteTreePublicId } from "../../virtual-ids.ts";
import { loadNextRouteStaticInfo } from "./analysis/get-page-static-info.ts";
import {
  extractRouteTreeImportSources,
  generateNextRouteTreeModule,
  toOptimizerImportSource,
} from "./webpack/loaders/next-app-loader/index.ts";
import type { NextRouteManifestBuildEntry } from "../server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts";
import type { NextRouteHandlerManifestBuildEntry } from "../server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts";

// Mirror/adapt: Next.js App Router entry and next-app-loader option shape.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/entries.ts#L287-L294
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/entries.ts#L593-L615
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L48-L67
// Adaptation: Vite uses a virtual module instead of webpack entry objects, but
// the query payload is still AppLoaderOptions-shaped and serialized like
// Next's `getAppEntry()`.

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

export async function generateNextEntrypointsModule(
  root: string,
  projectConfig: NextProjectConfig,
  entries: NextRouteManifestBuildEntry[],
  routeHandlers: NextRouteHandlerManifestBuildEntry[],
) {
  const watchFiles = new Set<string>();
  const routeModuleImports = new Set<string>();
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
    for (const source of extractRouteTreeImportSources(routeTree.code)) {
      routeModuleImports.add(source);
    }
  }

  const routeHandlerImports = routeHandlers.map(
    (entry) => `import ${JSON.stringify(entry.routeFile)};`,
  );
  const routeDependencyImports = Array.from(routeModuleImports, (source) => {
    return `import ${JSON.stringify(toOptimizerImportSource(source))};`;
  });

  return {
    code: `${[...routeTreeImports, ...routeDependencyImports, ...routeHandlerImports].join("\n")}\nexport {};\n`,
    watchFiles: [...watchFiles],
  };
}

export function createNextSourceOptimizerEntries(_root: string): string[] {
  return [virtualNextEntrypointsPublicId];
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

export function createNextRouteTreeVirtualSource(options: NextAppLoaderOptions) {
  return `${virtualNextRouteTreePublicId}?${stringifyNextAppLoaderOptions(options)}`;
}

function stringifyNextAppLoaderOptions(options: NextAppLoaderOptions) {
  const query: ParsedUrlQueryInput = {
    name: options.name,
    page: options.page,
    pagePath: options.pagePath,
    appDir: options.appDir,
    appPaths: options.appPaths ? [...options.appPaths] : null,
    allNormalizedAppPaths: options.allNormalizedAppPaths
      ? [...options.allNormalizedAppPaths]
      : null,
    preferredRegion: Array.isArray(options.preferredRegion)
      ? [...options.preferredRegion]
      : (options.preferredRegion ?? null),
    pageExtensions: [...options.pageExtensions],
    assetPrefix: options.assetPrefix,
    rootDir: options.rootDir ?? null,
    tsconfigPath: options.tsconfigPath ?? null,
    isDev: options.isDev ?? null,
    basePath: options.basePath,
    nextConfigOutput: options.nextConfigOutput ?? null,
    middlewareConfig: options.middlewareConfig,
    isGlobalNotFoundEnabled: options.isGlobalNotFoundEnabled ?? null,
  };

  return stringify(query);
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
