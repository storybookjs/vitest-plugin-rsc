import fs from "node:fs";
import querystring from "node:querystring";
import type { NextProject } from "../project.ts";
import type { NextContext } from "./context.ts";
import type { RunLoader } from "./loaders.ts";

// The metadata files of the app, like `icon.png`, `opengraph-image.tsx` and
// `sitemap.ts`. Next's app loader asks for them with an inline request for one
// of two loaders of its own: next-metadata-image-loader for what a page puts
// in its head, and next-metadata-route-loader for the route that serves the
// file. Both run here as webpack runs them, on the request as it is.

// `<loader>?<options>!<resource>`, the inline request of webpack.
const metadataRequest = /^(next-metadata-(?:image|route)-loader)\?([^!]*)!(.*)$/;

export function createMetadataLoaders(
  context: NextContext,
  runLoader: RunLoader,
): Pick<NextProject, "metadataImageMeta" | "isMetadataRequest" | "loadMetadata"> {
  const { fail, replace, next } = context;
  const { nextMetadataImageLoader, nextMetadataRouteLoader, WEBPACK_RESOURCE_QUERIES } = next;
  return {
    metadataImageMeta: `?${WEBPACK_RESOURCE_QUERIES.metadataImageMeta}`,
    isMetadataRequest: (source) => metadataRequest.test(source),
    async loadMetadata(request) {
      const [, loader, query = "", resource = ""] =
        metadataRequest.exec(request) ?? fail(`${request} is no request for a metadata loader`);
      const options = querystring.parse(query);
      if (loader === "next-metadata-route-loader") {
        // The resource is only a query: the file is an option.
        const file = String(options.filePath);
        let [code] = (await runLoader(nextMetadataRouteLoader, options, resource)) as [string];
        // The loader gives a static file the cache header of the NODE_ENV of
        // the process it runs in, which for `next build` is `production`.
        // Here it is the host's, like Vitest's `test`.
        if (options.isDynamicRouteExtension !== "1" && process.env.NODE_ENV !== "production") {
          code = replace(
            code,
            JSON.stringify("no-cache, no-store"),
            JSON.stringify("public, max-age=0, must-revalidate"),
            "the route of a static metadata file",
          );
        }
        return { code, watchFiles: [file] };
      }
      // The image itself, or the module that generates it.
      const file = resource.split("?")[0]!;
      const content = await fs.promises.readFile(file);
      const [code] = await runLoader(nextMetadataImageLoader, options, resource, content);
      return { code: code as string, watchFiles: [file] };
    },
  };
}
