import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { createProjectRequire, getProjectRoot, splitOnce } from "../../../../plugin-utils.ts";

// Mirror/adapt: Next.js next-metadata-image-loader.
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-metadata-image-loader.ts#L30-L188
// Adaptation: Vite resolves the Next loader request to a virtual module, calls
// the installed loader, and emulates the tiny webpack `loadModule` export shape
// needed by dynamic metadata image routes.

// Begin adapted: Next.js next-metadata-image-loader virtual module bridge
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-metadata-image-loader.ts#L30-L188
// Adaptation: Preserve Next loader options, resource query handling, and
// dynamic metadata export discovery while replacing webpack loader context APIs.
const virtualNextMetadataImageLoaderPrefix = "\0vitest-plugin-rsc:next-metadata-image-loader:";

export function useNextMetadataImageLoader(): Plugin {
  let root = process.cwd();

  return {
    name: "next-rsc-metadata-image-loader",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
    },
    resolveId(source) {
      if (source.startsWith("next-metadata-image-loader?")) {
        return `${virtualNextMetadataImageLoaderPrefix}${encodeURIComponent(source)}`;
      }

      if (source.startsWith(virtualNextMetadataImageLoaderPrefix)) {
        return source;
      }
    },
    async load(id) {
      if (!id.startsWith(virtualNextMetadataImageLoaderPrefix)) return;

      const request = decodeURIComponent(id.slice(virtualNextMetadataImageLoaderPrefix.length));
      const { options, resourcePath, resourceQuery } = parseNextMetadataImageLoaderRequest(request);
      const loader = createProjectRequire(root)(
        "next/dist/build/webpack/loaders/next-metadata-image-loader.js",
      ) as {
        default: (
          this: NextMetadataImageLoaderContext,
          content: Buffer,
        ) => Promise<string> | string;
      };
      const content = await fs.promises.readFile(resourcePath);

      this.addWatchFile(resourcePath);

      return loader.default.call(
        {
          getOptions: () => options,
          loadModule(_request, callback) {
            void loadNextMetadataImageModule(root, resourcePath, callback);
          },
          resourcePath,
          resourceQuery,
          rootContext: root,
          context: path.dirname(resourcePath),
          options: {},
        },
        content,
      );
    },
  };
}
// End adapted

type NextMetadataImageLoaderContext = {
  getOptions(): NextMetadataImageLoaderOptions;
  loadModule(
    request: string,
    callback: (
      error: Error | null,
      source?: string,
      sourceMap?: unknown,
      module?: NextMetadataImageModule,
    ) => void,
  ): void;
  resourcePath: string;
  resourceQuery: string;
  rootContext: string;
  context: string;
  options: Record<string, unknown>;
};

type NextMetadataImageLoaderOptions = {
  type: string;
  segment: string;
  pageExtensions: string[];
  basePath: string;
};

type NextMetadataImageModule = {
  dependencies: NextMetadataImageExportDependency[];
};

type NextMetadataImageExportDependency = {
  constructor: { name: "HarmonyExportSpecifierDependency" };
  name: string;
};

async function loadNextMetadataImageModule(
  root: string,
  resourcePath: string,
  callback: Parameters<NextMetadataImageLoaderContext["loadModule"]>[1],
) {
  try {
    callback(null, "", null, await createNextMetadataImageModule(root, resourcePath));
  } catch (error) {
    callback(error as Error);
  }
}

async function createNextMetadataImageModule(
  root: string,
  resourcePath: string,
): Promise<NextMetadataImageModule> {
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

function parseNextMetadataImageLoaderRequest(request: string) {
  const [loaderRequest, resourceRequest] = splitOnce(request, "!");
  if (!loaderRequest || !resourceRequest) {
    throw new Error(`Invalid Next metadata image loader request: ${request}`);
  }

  const query = loaderRequest.slice("next-metadata-image-loader?".length);
  const params = new URLSearchParams(query);
  const [resourcePath, rawResourceQuery = ""] = splitOnce(resourceRequest, "?");

  if (!resourcePath) {
    throw new Error(`Missing resource path for Next metadata image loader request: ${request}`);
  }

  return {
    options: {
      type: params.get("type") ?? "icon",
      segment: params.get("segment") ?? "",
      pageExtensions: params.getAll("pageExtensions"),
      basePath: params.get("basePath") ?? "",
    },
    resourcePath,
    resourceQuery: rawResourceQuery ? `?${rawResourceQuery}` : "",
  };
}
