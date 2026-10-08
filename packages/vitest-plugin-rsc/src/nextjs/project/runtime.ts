import fs from "node:fs";
import type { NextContext } from "./context.ts";
import { hasExport } from "./module-exports.ts";

/**
 * What the modules of this package in the browser assume about Next's runtime.
 * Returns the files of Next's own boundaries, for the route of a node.
 */
export function checkRuntime(context: NextContext) {
  const { projectRequire, fail, previewProps, next } = context;
  const { IncrementalCache } = next;
  // cache.ts makes Next's cache in the browser with these options. They have to
  // give it Next's own handler, or nothing is cached and nothing says so.
  const cache = new IncrementalCache({
    fs: {} as never,
    serverDistDir: "/",
    dev: false,
    requestHeaders: {},
    fetchCacheKeyPrefix: "prefix",
    previewProps,
    prerenderManifest: {
      version: 4,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: previewProps,
    },
  });
  if (!cache.cacheHandler || cache.fetchCacheKeyPrefix !== "prefix") {
    fail("`IncrementalCache` no longer takes `fs`, `serverDistDir` and `fetchCacheKeyPrefix`");
  }

  // What the modules of this package in the browser assume about Next's
  // runtime, where a Next that differs would not fail, or not with a message
  // that says why. (A static import of a name that is gone fails when its
  // module links, naming it.) The runtime runs in the browser, so here its
  // files are read, not loaded.
  const runtimeFile = (file: string) => {
    const id = `next/dist/esm/${file}.js`;
    let resolved: string;
    let code: string;
    try {
      resolved = projectRequire.resolve(id);
      code = fs.readFileSync(resolved, "utf8");
    } catch (error) {
      return fail(`${id} is not there`, error);
    }
    return {
      export: (name: string) => {
        if (!hasExport(resolved, name)) fail(`${id} has no export \`${name}\``);
      },
      contains: (...pieces: string[]) => {
        for (const piece of pieces) if (!code.includes(piece)) fail(`${id} has no \`${piece}\``);
      },
    };
  };

  // client.tsx imports Next's client entry once the page is there.
  const appIndex = runtimeFile("client/app-index");
  appIndex.export("hydrate");
  // It knows that the app has hydrated from Next's own e2e hook, which the
  // plugin turns on with this define.
  appIndex.contains("process.env.__NEXT_TEST_MODE", "__NEXT_HYDRATED_CB");
  // The route of a node has Next's own boundaries at its root, the ones
  // next-app-loader gives a root that has none: the global error page, which
  // Next's renderer throws without, and the pages for `notFound()`,
  // `forbidden()` and `unauthorized()`.
  const builtinBoundaries = Object.fromEntries(
    ["global-error", "not-found", "forbidden", "unauthorized"].map((name) => {
      const file = `next/dist/client/components/builtin/${name}.js`;
      try {
        projectRequire.resolve(file);
      } catch (error) {
        fail(`${file} is not there`, error);
      }
      return [name, file];
    }),
  );
  // It finds the root Next hydrates by the document it is for, and gives a
  // node its container in its place.
  appIndex.contains(
    "const appElement = document",
    "ReactDOMClient.hydrateRoot(appElement",
    "ReactDOMClient.createRoot(appElement",
  );
  // A node renders on a route whose root segment is not the app's, and that
  // has no root layout. Next's router leaves the node with a page load for a
  // page of the app when all of this holds: it compares the root segments of
  // the two trees directly, so the trees do not match at the root; it asks
  // there whether the new tree is in a root layout, which a tree of the app
  // is; and it takes the two for different root layouts.
  runtimeFile("client/components/segment-cache/cache").contains(
    "currentTree.segment === nextTree.segment",
  );
  runtimeFile("client/components/render-tree").contains(
    "doesRouteStructureMatch(",
    "PrefetchHint.IsRootLayoutOrAbove",
    "isNavigatingToNewRootLayout(",
  );
  // It hands Next the bootstrap script as the one that is running.
  runtimeFile("client/asset-prefix").contains("document.currentScript", "/_next/");
  // The shim in plugin.ts reads these, and replaces the functions for Vite
  // RSC's ids.
  const serverReferenceInfo = runtimeFile("shared/lib/server-reference-info");
  for (const name of [
    "SERVER_REFERENCE_ID_LENGTH",
    "mightBeServerReferenceId",
    "extractInfoFromServerReferenceId",
  ]) {
    serverReferenceInfo.export(name);
  }
  // node-server.ts provides the manifests of a build: through the module
  // Next's server reads the files of `.next/` with, and for each request.
  runtimeFile("server/route-modules/route-module").contains(
    "load-manifest.external",
    "loadManifestFromRelativePath",
    "evalManifestFromRelativePath",
  );
  // Next's request handler of a page makes the route module, in the rsc
  // layer. The plugin gives it the class of the ssr layer for this import.
  runtimeFile("build/templates/app-page-runtime").contains(
    "server/route-modules/app-page/module.compiled",
  );
  // node-server.ts lists the stylesheets of a route where Next's renderer
  // looks for those of a segment: in `entryCSSFiles` of the client reference
  // manifest, by the file of the segment without its extension. Next links
  // each by its path under `/_next/`. Without this a page has no CSS, and
  // nothing says why.
  runtimeFile("server/app-render/get-css-inlined-link-tags").contains(
    "filePath.replace(/\\.[^.]+$/, '')",
    "entryCSSFiles[filePathWithoutExt]",
  );
  runtimeFile("server/app-render/render-css-resource").contains(
    "entryCssFile.inlined",
    "entryCssFile.content",
    "/_next/${encodeURIPath(entryCssFile.path)}",
  );
  // The plugin turns Next's renderer to web streams with this.
  runtimeFile("server/app-render/stream-ops").contains("process.env.__NEXT_USE_NODE_STREAMS");

  return { builtinBoundaries };
}
