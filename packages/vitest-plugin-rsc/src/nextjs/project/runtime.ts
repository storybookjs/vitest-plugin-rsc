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
    serverDistDir: "/.next/server",
    dev: false,
    requestHeaders: {},
    fetchCacheKeyPrefix: "prefix",
    previewProps,
    // As `prerenderManifest` of build-output.ts.
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
  // `rerender()` hears of an error that takes the place of a node from the
  // `onCaughtError` and `onUncaughtError` of the options of that root, which
  // it wraps. Without them a rerender would wait for a node that an error
  // page has replaced. Indented, they are the ones of the options.
  appIndex.contains(
    "    onCaughtError,",
    "    onUncaughtError",
    "ReactDOMClient.createRoot(appElement, reactRootOptions)",
    "...reactRootOptions",
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
  // build-output.ts provides the manifests of a build: through the module
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
  // build-output.ts lists the stylesheets of a route where Next's renderer
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
  // In production the server lists what Next's build prerenders as a route
  // is first requested (build-output.ts, prerender-verdict.ts), and Next's
  // handler prerenders it then. A page that reads the request throws this
  // there, which the server takes for the bail-out of the build's prerender
  // (node-server.ts). Without it, such a page would answer 500.
  runtimeFile("build/templates/app-page-runtime").contains(
    "`Page changed from static to dynamic at runtime ${resolvedPathname}",
    "throw new NoFallbackError()",
  );
  runtimeFile("build/templates/app-route").contains("if (isIsr) throw err;");
  // The server's logger, which leaves that one out, is what `next start`
  // hands the route module around it.
  runtimeFile("server/lib/router-utils/router-server-context").contains(
    "Symbol.for('@next/router-server-methods')",
  );
  runtimeFile("server/route-modules/route-module").contains(
    "routerServerContext.logErrorWithOriginalStack(err",
  );
  // Next's route module of a page keeps what it matched by the object of the
  // manifest, so a new one comes as a dynamic route comes or goes.
  runtimeFile("server/route-modules/app-page/module").contains(
    "this.matchers.get(prerenderManifest)",
  );
  // The build's verdict on which pathnames of a route it prerenders, which
  // prerender-verdict.ts makes as the build does: the last segment's
  // `dynamic` and `runtime`, the paths of `generateStaticParams`, and
  // without one `dynamic = "error"` or `"force-static"`.
  runtimeFile("build/utils").contains("config.dynamic = dynamic;", "config.runtime = runtime;");
  runtimeFile("build/index").contains(
    "if (workerResult.prerenderedRoutes) {",
    "ssgPageRoutes = workerResult.prerenderedRoutes.filter((route)=>route.isPrerenderOutput !== false).map((route)=>route.pathname);",
    "} else if (!hasGenerateStaticParams && (appConfig.dynamic === 'error' || appConfig.dynamic === 'force-static')) {",
  );
  // Whether a route is static at all is Next's handler's verdict, at the
  // render: a `force-dynamic` page throws this as it is prerendered.
  runtimeFile("server/app-render/create-component-tree").contains(
    'const err = new DynamicServerError(`Page with \\`dynamic = "force-dynamic"\\` won\'t be rendered statically.`);',
  );
  // cleanup() expires the kept pages of an app's own `cacheHandler` by the
  // tag each has for the root layout.
  runtimeFile("server/lib/implicit-tags").contains(
    "const derivedTags = [\n        `/layout`\n    ];",
  );

  // The plugin turns Next's renderer to web streams with this.
  runtimeFile("server/app-render/stream-ops").contains("process.env.__NEXT_USE_NODE_STREAMS");

  return { builtinBoundaries };
}
