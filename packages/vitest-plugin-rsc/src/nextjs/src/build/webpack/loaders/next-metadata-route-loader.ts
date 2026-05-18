import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import {
  createProjectRequire,
  getProjectRoot,
  normalizePath,
  splitOnce,
} from "../../../../plugin-utils.ts";

// Mirror/adapt: Next.js next-metadata-route-loader.
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/webpack/loaders/next-app-loader/create-app-route-code.ts#L38-L49
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/webpack/loaders/next-metadata-route-loader.ts
// Adaptation: Vite resolves the webpack loader request to a virtual module,
// invokes the installed Next loader, and emulates webpack's export discovery.

// Begin adapted: Next.js metadata route loader virtual module bridge
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/webpack/loaders/next-app-loader/create-app-route-code.ts#L38-L49
// Source: https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/webpack/loaders/next-metadata-route-loader.ts
// Adaptation: Preserve Next's loader options, `!?__next_metadata_route__`
// request shape, generated GET handler code, and export discovery while
// replacing webpack loader context APIs with Vite-compatible virtual loading.
const virtualNextMetadataRouteLoaderPrefix = "\0vitest-plugin-rsc:next-metadata-route-loader:";

export function useNextMetadataRouteLoader(): Plugin {
  let root = process.cwd();

  return {
    name: "next-rsc-metadata-route-loader",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
    },
    resolveId(source) {
      if (source.startsWith("next-metadata-route-loader?")) {
        return `${virtualNextMetadataRouteLoaderPrefix}${encodeURIComponent(source)}`;
      }

      if (source.startsWith(virtualNextMetadataRouteLoaderPrefix)) {
        return source;
      }
    },
    async load(id) {
      if (!id.startsWith(virtualNextMetadataRouteLoaderPrefix)) return;

      const request = decodeURIComponent(id.slice(virtualNextMetadataRouteLoaderPrefix.length));
      const options = parseNextMetadataRouteLoaderRequest(request);
      const loader = createProjectRequire(root)(
        "next/dist/build/webpack/loaders/next-metadata-route-loader.js",
      ) as {
        default: (this: NextMetadataRouteLoaderContext) => Promise<string> | string;
      };

      const code = await loader.default.call({
        getOptions: () => options,
        addDependency: (file: string) => this.addWatchFile(file),
        loadModule(_request, callback) {
          void loadNextMetadataRouteModule(root, options.filePath, callback);
        },
        resourcePath: "",
        resourceQuery: "?__next_metadata_route__",
        rootContext: root,
        context: path.dirname(options.filePath),
      });

      return rewriteNextMetadataRouteLoaderImports(code);
    },
  };
}
// End adapted

type NextMetadataRouteLoaderContext = {
  getOptions(): NextMetadataRouteLoaderOptions;
  addDependency(file: string): void;
  loadModule(
    request: string,
    callback: (
      error: Error | null,
      source?: string,
      sourceMap?: unknown,
      module?: NextMetadataRouteModule,
    ) => void,
  ): void;
  resourcePath: string;
  resourceQuery: string;
  rootContext: string;
  context: string;
};

type NextMetadataRouteLoaderOptions = {
  filePath: string;
  isDynamicRouteExtension: "1" | "0";
};

type NextMetadataRouteModule = {
  dependencies: NextMetadataRouteExportDependency[];
};

type NextMetadataRouteExportDependency = {
  constructor: {
    name: "HarmonyExportImportedSpecifierDependency" | "HarmonyExportSpecifierDependency";
  };
  name: string;
};

async function loadNextMetadataRouteModule(
  root: string,
  resourcePath: string,
  callback: Parameters<NextMetadataRouteLoaderContext["loadModule"]>[1],
) {
  try {
    callback(null, "", null, await createNextMetadataRouteModule(root, resourcePath));
  } catch (error) {
    callback(error as Error);
  }
}

async function createNextMetadataRouteModule(
  root: string,
  resourcePath: string,
): Promise<NextMetadataRouteModule> {
  const { getModuleNamedExports } = createProjectRequire(root)("next/dist/build/swc") as {
    getModuleNamedExports(resourcePath: string): Promise<string[]> | string[];
  };
  const exportNames = await getModuleNamedExports(resourcePath);
  return {
    dependencies: exportNames
      .filter((name) => name !== "default")
      .map((name) => ({
        constructor: { name: "HarmonyExportSpecifierDependency" },
        name,
      })),
  };
}

function parseNextMetadataRouteLoaderRequest(request: string): NextMetadataRouteLoaderOptions {
  const [loaderRequest, resourceRequest] = splitOnce(request, "!");
  if (!loaderRequest || !resourceRequest?.startsWith("?__next_metadata_route__")) {
    throw new Error(`Invalid Next metadata route loader request: ${request}`);
  }

  const query = loaderRequest.slice("next-metadata-route-loader?".length);
  const params = new URLSearchParams(query);
  const filePath = params.get("filePath");
  const isDynamicRouteExtension = params.get("isDynamicRouteExtension");

  if (!filePath) {
    throw new Error(`Missing filePath for Next metadata route loader request: ${request}`);
  }
  if (isDynamicRouteExtension !== "1" && isDynamicRouteExtension !== "0") {
    throw new Error(
      `Invalid isDynamicRouteExtension for Next metadata route loader request: ${request}`,
    );
  }

  return {
    filePath,
    isDynamicRouteExtension,
  };
}

function rewriteNextMetadataRouteLoaderImports(code: string) {
  return code
    .replace(
      /(from\s+)(['"])([^'"]+)\2/g,
      (_match, prefix: string, _quote: string, source: string) =>
        `${prefix}${JSON.stringify(toViteImportSource(source))}`,
    )
    .replace(
      /(import\s+[^'"]+\s+from\s+)(['"])([^'"]+)\2/g,
      (_match, prefix: string, _quote: string, source: string) =>
        `${prefix}${JSON.stringify(toViteImportSource(source))}`,
    );
}

function toViteImportSource(source: string) {
  if (!path.isAbsolute(source)) return source;
  const [file] = source.split("?");
  if (file && !fs.existsSync(file)) return source;

  return `/@fs/${normalizePath(source).replace(/^\//, "")}`;
}
