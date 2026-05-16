import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { loadNextProjectConfig, type NextProjectConfig } from "./config";
import { createProjectRequire, getProjectRoot, normalizePath } from "./plugin-utils";
import { createNextRoutingData } from "./plugin/routing-data";
import {
  virtualNextEntrypointsId,
  virtualNextEntrypointsPublicId,
  virtualNextRouteEmptyModuleId,
  virtualNextRouteEmptyModulePublicId,
  virtualNextRouteManifestId,
  virtualNextRouteManifestPublicId,
  virtualNextRouteTreeIdPrefix,
  virtualNextRouteTreePublicId,
} from "./virtual-ids";

type NextRouteManifestBuildEntry = {
  route: string;
  appDir: string;
  appPath: string;
  appPaths: readonly string[];
  allNormalizedAppPaths: readonly string[];
  pageFile: string;
};

type NextRouteHandlerManifestBuildEntry = {
  route: string;
  appPath: string;
  routeFile: string;
};

type NextRouteStaticInfo = {
  runtime?: string;
  maxDuration?: number;
  preferredRegion?: string | string[];
  middleware?: unknown;
};

export function useNextRouteManifest(): Plugin {
  let root = process.cwd();
  let mode = "test";

  return {
    name: "next-rsc-route-manifest",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
      mode = config.mode;
    },
    resolveId(source) {
      const [sourceFile] = source.split("?");
      if (
        sourceFile &&
        path.isAbsolute(sourceFile) &&
        !fs.existsSync(sourceFile) &&
        isInNextAppDir(root, sourceFile)
      ) {
        return virtualNextRouteEmptyModuleId;
      }

      if (source === virtualNextRouteManifestPublicId) {
        return virtualNextRouteManifestId;
      }
      if (source === virtualNextEntrypointsPublicId) {
        return virtualNextEntrypointsId;
      }
      if (source.startsWith(`${virtualNextRouteTreePublicId}?`)) {
        return `${virtualNextRouteTreeIdPrefix}${source.slice(virtualNextRouteTreePublicId.length + 1)}`;
      }
      if (source === virtualNextRouteEmptyModulePublicId) {
        return virtualNextRouteEmptyModuleId;
      }
    },
    async load(id) {
      if (id === virtualNextRouteEmptyModuleId) {
        return "export default function VitestNextEmptyRouteModule() { return null; }";
      }

      if (id.startsWith(virtualNextRouteTreeIdPrefix)) {
        const params = new URLSearchParams(id.slice(virtualNextRouteTreeIdPrefix.length));
        const pageFile = params.get("pageFile");
        if (!pageFile) {
          throw new Error("Missing pageFile for Next route tree virtual module.");
        }

        const entries = await scanNextAppRoutes(root, mode);
        const entry = entries.find((candidate) => candidate.pageFile === pageFile);
        if (!entry) {
          throw new Error(`No Next app route entry found for ${pageFile}.`);
        }

        const { code, watchFiles } = await generateNextRouteTreeModule(root, mode, entry, entries);
        for (const file of watchFiles) {
          this.addWatchFile(file);
        }
        return code;
      }

      if (id === virtualNextEntrypointsId) {
        const [entries, routeHandlers] = await Promise.all([
          scanNextAppRoutes(root, mode),
          scanNextAppRouteHandlers(root, mode),
        ]);
        for (const entry of routeHandlers) {
          this.addWatchFile(entry.routeFile);
        }

        const { code, watchFiles } = await generateNextEntrypointsModule(
          root,
          mode,
          entries,
          routeHandlers,
        );
        for (const file of watchFiles) {
          this.addWatchFile(file);
        }
        return code;
      }

      if (id === virtualNextRouteManifestId) {
        const [entries, routeHandlers, projectConfig] = await Promise.all([
          scanNextAppRoutes(root, mode),
          scanNextAppRouteHandlers(root, mode),
          loadNextProjectConfig(root, mode),
        ]);
        for (const entry of entries) {
          this.addWatchFile(entry.pageFile);
        }
        for (const entry of routeHandlers) {
          this.addWatchFile(entry.routeFile);
        }

        return generateNextRouteManifest(entries, routeHandlers, projectConfig);
      }
    },
  };
}

function isInNextAppDir(root: string, file: string) {
  const dirs = [path.join(root, "app"), path.join(root, "src", "app")];
  return dirs.some((dir) => {
    const relative = path.relative(dir, file);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

async function scanNextAppRoutes(
  root: string,
  mode: string,
): Promise<NextRouteManifestBuildEntry[]> {
  const requireFromProject = createProjectRequire(root);
  const projectConfig = await loadNextProjectConfig(root, mode);
  const appDir = projectConfig.appDir;
  if (!appDir) return [];

  // Begin copy: Next.js dev app-page route matcher setup
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts#L16-L83
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.ts#L12-L42
  // Adaptation: Vitest asks the provider for matchers directly instead of
  // running the full Next dev server route matcher manager.
  const { DevAppPageRouteMatcherProvider } = requireFromProject(
    "next/dist/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.js",
  ) as typeof import("next/dist/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.js");
  const { DefaultFileReader } = requireFromProject(
    "next/dist/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.js",
  ) as typeof import("next/dist/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.js");
  const { sortPageObjects } = requireFromProject(
    "next/dist/shared/lib/router/utils/sortable-routes.js",
  ) as typeof import("next/dist/shared/lib/router/utils/sortable-routes.js");

  const provider = new DevAppPageRouteMatcherProvider(
    appDir,
    projectConfig.pageExtensions,
    new DefaultFileReader({
      ignorePartFilter: (part: string) => part === "node_modules" || part.startsWith("."),
    }),
    false,
  );
  const matchers = await provider.matchers();
  // End copy

  const pageFileByAppPath = new Map<string, string>();
  const matcherByRoute = new Map<string, (typeof matchers)[number]>();

  for (const matcher of matchers) {
    pageFileByAppPath.set(matcher.definition.page, matcher.definition.filename);
    matcherByRoute.set(matcher.definition.pathname, matcher);
  }

  const entries = Array.from(matcherByRoute, ([route, matcher]) => {
    const appPath = matcher.definition.appPaths.at(-1) ?? matcher.definition.page;
    const pageFile = pageFileByAppPath.get(appPath) ?? matcher.definition.filename;

    return {
      route,
      appDir,
      appPath,
      appPaths: matcher.definition.appPaths,
      allNormalizedAppPaths: Array.from(matcherByRoute.keys()),
      pageFile,
    };
  });

  return Array.from(sortPageObjects(entries, (entry) => entry.route));
}

async function scanNextAppRouteHandlers(
  root: string,
  mode: string,
): Promise<NextRouteHandlerManifestBuildEntry[]> {
  const requireFromProject = createProjectRequire(root);
  const projectConfig = await loadNextProjectConfig(root, mode);
  const appDir = projectConfig.appDir;
  if (!appDir) return [];

  // Begin copy: Next.js dev app-route route matcher setup
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts#L16-L146
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.ts#L12-L42
  // Adaptation: Vitest only records these routes so page rendering can reject
  // route handler URLs explicitly until route handlers get their own helper.
  const { DevAppRouteRouteMatcherProvider } = requireFromProject(
    "next/dist/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.js",
  ) as typeof import("next/dist/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.js");
  const { DefaultFileReader } = requireFromProject(
    "next/dist/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.js",
  ) as typeof import("next/dist/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.js");
  const { sortPageObjects } = requireFromProject(
    "next/dist/shared/lib/router/utils/sortable-routes.js",
  ) as typeof import("next/dist/shared/lib/router/utils/sortable-routes.js");

  const provider = new DevAppRouteRouteMatcherProvider(
    appDir,
    projectConfig.pageExtensions,
    new DefaultFileReader({
      ignorePartFilter: (part: string) => part === "node_modules" || part.startsWith("."),
    }),
    false,
  );
  const matchers = await provider.matchers();
  // End copy

  const entries = matchers.map((matcher) => ({
    route: matcher.definition.pathname,
    appPath: matcher.definition.page,
    routeFile: matcher.definition.filename,
  }));

  return Array.from(sortPageObjects(entries, (entry) => entry.route));
}

function generateNextRouteManifest(
  entries: NextRouteManifestBuildEntry[],
  routeHandlers: NextRouteHandlerManifestBuildEntry[],
  projectConfig: NextProjectConfig,
) {
  const routingData = createNextRoutingData({
    pages: entries,
    routeHandlers,
    customRoutes: projectConfig.customRoutes,
    nextConfig: projectConfig.nextConfig,
  });
  const imports = entries
    .map((entry, index) => {
      const params = new URLSearchParams({ pageFile: entry.pageFile });
      return `import { loaderTree as loaderTree${index} } from ${JSON.stringify(`${virtualNextRouteTreePublicId}?${params}`)};`;
    })
    .join("\n");

  const manifest = `[${entries
    .map(
      (entry, index) => `{
        route: ${JSON.stringify(entry.route)},
        appPath: ${JSON.stringify(entry.appPath)},
        pageFile: ${JSON.stringify(entry.pageFile)},
        loaderTree: loaderTree${index},
      }`,
    )
    .join(",")}]`;

  const routeHandlerManifest = `[${routeHandlers
    .map(
      (entry) => `{
        route: ${JSON.stringify(entry.route)},
        appPath: ${JSON.stringify(entry.appPath)},
        routeFile: ${JSON.stringify(entry.routeFile)},
      }`,
    )
    .join(",")}]`;

  return `${imports}\nexport const nextRouteManifest = ${manifest};\nexport const nextRouteHandlerManifest = ${routeHandlerManifest};\nexport const nextRoutingData = ${JSON.stringify(routingData)};\n`;
}

async function generateNextEntrypointsModule(
  root: string,
  mode: string,
  entries: NextRouteManifestBuildEntry[],
  routeHandlers: NextRouteHandlerManifestBuildEntry[],
) {
  const watchFiles = new Set<string>();
  const routeModuleImports = new Set<string>();

  const routeTreeImports = entries.map((entry) => {
    const params = new URLSearchParams({ pageFile: entry.pageFile });
    return `import ${JSON.stringify(`${virtualNextRouteTreePublicId}?${params}`)};`;
  });

  for (const entry of entries) {
    const routeTree = await generateNextRouteTreeModule(root, mode, entry, entries);
    for (const file of routeTree.watchFiles) {
      watchFiles.add(file);
    }
    for (const source of extractRouteTreeImportSources(routeTree.code)) {
      routeModuleImports.add(source);
    }
  }

  const routeHandlerImports = routeHandlers.map(
    (entry) => `import ${JSON.stringify(toViteImportSource(entry.routeFile))};`,
  );
  const routeDependencyImports = Array.from(routeModuleImports, (source) => {
    return `import ${JSON.stringify(source)};`;
  });

  return {
    code: `${[...routeTreeImports, ...routeDependencyImports, ...routeHandlerImports].join("\n")}\nexport {};\n`,
    watchFiles: [...watchFiles],
  };
}

async function generateNextRouteTreeModule(
  root: string,
  mode: string,
  entry: NextRouteManifestBuildEntry,
  entries: NextRouteManifestBuildEntry[],
) {
  const projectConfig = await loadNextProjectConfig(root, mode);
  assertRootLayoutExists(entry, projectConfig.pageExtensions);

  const staticInfo = await loadNextRouteStaticInfo(root, projectConfig, entry);
  const requireFromProject = createProjectRequire(root);
  const watchFiles = new Set<string>([entry.pageFile]);
  const loader = requireFromProject("next/dist/build/webpack/loaders/next-app-loader/index.js") as {
    default: (this: NextAppLoaderContext) => Promise<string>;
  };
  const { encodeToBase64 } = requireFromProject("next/dist/build/webpack/loaders/utils.js") as {
    encodeToBase64(value: object): string;
  };
  // Begin copy: Next.js next-app-loader option shape
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/entries.ts#L584-L615
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack/loaders/next-app-loader/index.ts#L92-L127
  // Adaptation: Vite invokes the loader in-process to get the real loader tree
  // while replacing webpack's module graph with Vite virtual modules.
  const isGlobalNotFoundEnabled: true | undefined =
    projectConfig.nextConfig.experimental?.globalNotFound === true ? true : undefined;
  const options = {
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
    isDev: projectConfig.isDev,
    basePath: projectConfig.basePath,
    nextConfigOutput: projectConfig.nextConfig.output,
    middlewareConfig: encodeToBase64((staticInfo.middleware ?? { matchers: [] }) as object),
    isGlobalNotFoundEnabled,
  };
  // End copy
  const context: NextAppLoaderContext = {
    getOptions: () => options,
    _module: { buildInfo: {} },
    _compiler: { context: root },
    _compilation: undefined,
    addMissingDependency(file) {
      watchFiles.add(file);
    },
  };

  const generated = await loader.default.call(context);
  return {
    code: extractNextLoaderTreeModule(generated),
    watchFiles: [...watchFiles],
  };
}

type NextAppLoaderContext = {
  getOptions(): {
    name: string;
    page: string;
    pagePath: string;
    appDir: string;
    appPaths: readonly string[];
    allNormalizedAppPaths: readonly string[];
    preferredRegion: string | string[] | undefined;
    pageExtensions: string[];
    assetPrefix: string;
    rootDir: string;
    tsconfigPath: string | undefined;
    isDev: boolean;
    basePath: string;
    nextConfigOutput: NextProjectConfig["nextConfig"]["output"];
    middlewareConfig: string;
    isGlobalNotFoundEnabled: true | undefined;
  };
  _module: { buildInfo: Record<string, unknown> };
  _compiler: { context: string };
  _compilation: undefined;
  addMissingDependency(file: string): void;
};

export async function loadNextRouteStaticInfo(
  root: string,
  projectConfig: NextProjectConfig,
  entry: NextRouteManifestBuildEntry,
): Promise<NextRouteStaticInfo> {
  const getStaticInfoIncludingLayouts = loadNextStaticInfoCollector(root);
  if (!getStaticInfoIncludingLayouts) return {};

  return await getStaticInfoIncludingLayouts({
    isInsideAppDir: true,
    pageExtensions: projectConfig.pageExtensions,
    pageFilePath: entry.pageFile,
    appDir: projectConfig.appDir,
    config: projectConfig.nextConfig,
    isDev: projectConfig.isDev,
    page: entry.appPath,
  });
}

function loadNextStaticInfoCollector(root: string) {
  try {
    const { getStaticInfoIncludingLayouts } = createProjectRequire(root)(
      "next/dist/build/get-static-info-including-layouts.js",
    ) as {
      getStaticInfoIncludingLayouts(options: {
        isInsideAppDir: boolean;
        pageExtensions: string[];
        pageFilePath: string;
        appDir: string | undefined;
        config: NextProjectConfig["nextConfig"];
        isDev: boolean;
        page: string;
      }): Promise<NextRouteStaticInfo>;
    };
    return getStaticInfoIncludingLayouts;
  } catch (error) {
    if (!isModuleResolutionError(error)) throw error;
    return undefined;
  }
}

function isModuleResolutionError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "MODULE_NOT_FOUND"
  );
}

function assertRootLayoutExists(entry: NextRouteManifestBuildEntry, pageExtensions: string[]) {
  let currentDir = path.dirname(entry.pageFile);
  while (currentDir.startsWith(entry.appDir)) {
    if (findAppFile(currentDir, "layout", pageExtensions)) return;
    if (currentDir === entry.appDir) break;
    currentDir = path.dirname(currentDir);
  }

  throw new Error(
    `Cannot render Next route ${entry.route} because no root layout was found above ${entry.pageFile}. Add an app/layout file or render a React node directly.`,
  );
}

function findAppFile(dir: string, basename: string, pageExtensions: string[]) {
  return pageExtensions.find((extension) => {
    const extensionWithDot = extension.startsWith(".") ? extension : `.${extension}`;
    return fs.existsSync(path.join(dir, `${basename}${extensionWithDot}`));
  });
}

function extractNextLoaderTreeModule(generated: string) {
  const treeStart = generated.indexOf("const tree =");
  const treeEnd = generated.indexOf("const __next_app_require__", treeStart);
  if (treeStart < 0 || treeEnd < 0) {
    throw new Error("Could not extract loader tree from Next app loader output.");
  }

  const treeCode = generated
    .slice(treeStart, treeEnd)
    .replace("const tree =", "export const loaderTree =");
  const referencedLoaders = new Set(
    Array.from(treeCode.matchAll(/\b([A-Za-z_$][\w$]*)\b/g), (match) => match[1]),
  );
  const moduleLoaders = generated
    .slice(0, treeStart)
    .split("\n")
    .filter((line) => {
      const match = line.match(/^const (\w+) = \(\) => import\(/);
      return match && referencedLoaders.has(match[1]!);
    })
    .join("\n");

  return rewriteNextAppLoaderImports(`${moduleLoaders}\n${treeCode}`);
}

function rewriteNextAppLoaderImports(code: string) {
  return code
    .replace(
      /import\((\/\*[\s\S]*?\*\/\s*)?(['"])([^'"]+)\2\)/g,
      (_match, comment: string | undefined, _quote: string, source: string) =>
        `import(${comment ?? ""}${JSON.stringify(toViteImportSource(source))})`,
    )
    .replace(
      /(from\s+)(['"])([^'"]+)\2/g,
      (_match, prefix: string, _quote: string, source: string) =>
        `${prefix}${JSON.stringify(toViteImportSource(source))}`,
    )
    .replace(
      /(import\s+)(['"])([^'"]+)\2/g,
      (_match, prefix: string, _quote: string, source: string) =>
        `${prefix}${JSON.stringify(toViteImportSource(source))}`,
    );
}

function extractRouteTreeImportSources(code: string) {
  return Array.from(
    code.matchAll(/\bimport\((?:\/\*[\s\S]*?\*\/\s*)?("([^"]+)"|'([^']+)')\)/g),
    (match) => match[2] ?? match[3] ?? "",
  ).filter(Boolean);
}

function toViteImportSource(source: string) {
  if (!path.isAbsolute(source)) return source;
  const [file] = source.split("?");
  if (file && !fs.existsSync(file)) return virtualNextRouteEmptyModulePublicId;

  return `/@fs/${normalizePath(source).replace(/^\//, "")}`;
}
