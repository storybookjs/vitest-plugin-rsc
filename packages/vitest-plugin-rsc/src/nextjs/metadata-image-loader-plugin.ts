import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { createProjectRequire, getProjectRoot, splitOnce } from "./plugin-utils";

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

type NextMetadataImageLoaderContext = {
  getOptions(): NextMetadataImageLoaderOptions;
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
