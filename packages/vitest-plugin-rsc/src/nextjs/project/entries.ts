import fs from "node:fs";
import querystring from "node:querystring";
import type { AppLoaderOptions } from "next/dist/build/webpack/loaders/next-app-loader/index.js";
import type { ComponentRoute, NextProject, NextRoute } from "../project.ts";
import type { NextContext } from "./context.ts";
import type { RunLoader } from "./loaders.ts";
import type { AppRoutes } from "./routes.ts";
import type { FoundMiddleware } from "./routing.ts";

// The entry of a route: the module of the rsc layer that Next's build makes
// for it, and what the plugin makes for the route of a node.

// What next-app-loader uses of webpack's loader context.
export type AppLoaderContext = {
  getOptions(): AppLoaderOptions;
  _module: { buildInfo: Record<string, unknown> };
  _compilation: object;
  _compiler: { context: string };
  addDependency(file: string): void;
  addMissingDependency(file: string): void;
  addContextDependency(dir: string): void;
};

// The root segment of the routes of a node: see `loadNodeEntry()`.
// The parentheses make it a route group for Next, so it never shows in a
// pathname.
const componentRoot = "(vitest-plugin-rsc)";
// What the routes of a node with the layouts of the app are listed by.
const componentLayouts = "(vitest-plugin-rsc-layouts)";
// The node as the page of a loader tree, and the import that goes with it:
// see `loadComponent()` in rsc.ts.
const componentPage = `page: [__next_component__, "vitest-plugin-rsc/component"]`;
const componentImport = `import { loadComponent as __next_component__ } from "vitest-plugin-rsc/nextjs/rsc";\n`;

// Next's templates carry Turbopack-only import attributes. They mean nothing
// to Vite and are a syntax error in a browser.
function stripTurbopackTransitions(code: string): string {
  return code.replace(/\s+with\s*\{\s*['"]turbopack-transition['"]\s*:\s*['"][^'"]*['"]\s*\}/g, "");
}

export function routeEntries(
  context: NextContext,
  { routes, appPathsPerRoute, strictRouteMatching, routeFile }: AppRoutes,
  { middleware, middlewareFile }: FoundMiddleware,
  builtinBoundaries: Record<string, string>,
  runLoader: RunLoader,
): Pick<NextProject, "componentRoutes" | "loadRouteEntry" | "loadMiddlewareEntry"> {
  const { root, fail, replace, config, appDir, pageExtensions, buildId, next } = context;
  const { getEdgeServerEntry, loadEntrypoint, nextAppLoader, nextMiddlewareLoader, rootPageType } =
    next;
  // The route entry of a page binds Next's renderer to its bundler: its module
  // loader, which here is this package's (rsc.ts). It imports Next's runtime
  // for a page, which has the request handler for Node.js.
  const bindPageEntry = (code: string, where: string) => {
    code = replace(code, /\b__webpack_require__\b/g, "__next_require__", where);
    if (!/(["'])next\/dist\/build\/templates\/app-page-runtime\1/.test(code)) {
      fail(`${where} has no \`next/dist/build/templates/app-page-runtime\``);
    }
    return `import { requireModule as __next_require__ } from "vitest-plugin-rsc/nextjs/rsc";\n${code}`;
  };

  async function loadNodeEntry({ page, pathname }: ComponentRoute): Promise<string> {
    // A loader tree the way Next's app loader writes one: a segment, its
    // slots, its modules, and the static segments next to it, which only
    // a build knows. It has a segment for each one of the pathname, so
    // that Next finds the params of the URL, and the node as its page.
    //
    // Not from Next's app loader, which reads a directory of files and exits
    // the process for a page without a root layout.
    //
    // No layout: Next's renderer does not need one. The modules besides the
    // page are Next's own boundaries, see `builtinBoundaries`.
    //
    // The root segment is not the app's `""`. Next's router compares the
    // root segments of two routes directly, and takes a difference for
    // another root layout. So a navigation from the node to a page of the
    // app is a page load, which renders the app's root layout, and not a
    // client-side one into the container.
    const segment = (name: string, children: string, modules = "{}") =>
      `[${JSON.stringify(name)}, ${children}, ${modules}, null]`;
    let tree = `["__PAGE__", {}, { ${componentPage} }]`;
    for (const name of pathname.split("/").filter(Boolean).reverse()) {
      tree = segment(name, `{ children: ${tree} }`);
    }
    const boundaries = Object.entries(builtinBoundaries).map(
      ([name, file]) =>
        `${JSON.stringify(name)}: [() => import(${JSON.stringify(file)}), ${JSON.stringify(file)}]`,
    );
    tree = segment(componentRoot, `{ children: ${tree} }`, `{ ${boundaries.join(", ")} }`);
    let code: string;
    try {
      code = await loadEntrypoint(
        "app-page",
        { VAR_DEFINITION_PAGE: page, VAR_DEFINITION_PATHNAME: pathname },
        {
          tree,
          // What next-app-loader injects.
          __next_app_require__: "__webpack_require__",
          __next_app_load_chunk__: "() => Promise.resolve()",
        },
      );
    } catch (error) {
      return fail(
        `the app-page template does not take the injections of next-app-loader ` +
          `(${(error as Error).message})`,
        error,
      );
    }
    return (
      componentImport + bindPageEntry(stripTurbopackTransitions(code), "the app-page template")
    );
  }

  // next-app-loader keys its per-build caches on the compilation object.
  const compilation = {};

  // The entry of a route of the app, a page or a route handler, from Next's
  // own loader of one.
  const loadAppRouteEntry = async (route: NextRoute) => {
    const watchFiles = new Set<string>();
    const context: AppLoaderContext = {
      // What `createEntrypoints` of `next build` passes.
      getOptions: () => ({
        name: `app${route.page}`,
        page: route.page,
        pagePath: route.pagePath,
        appDir,
        appPaths: route.appPaths,
        allNormalizedAppPaths: Object.keys(appPathsPerRoute),
        pageExtensions,
        rootDir: root,
        basePath: config.basePath,
        assetPrefix: config.assetPrefix,
        // Loader options are a query string for webpack, where an option
        // that is not set is empty. The template of a route handler needs
        // a value to inject.
        nextConfigOutput: config.output ?? ("" as never),
        preferredRegion: undefined,
        middlewareConfig: Buffer.from("{}").toString("base64"),
        isGlobalNotFoundEnabled: config.experimental.globalNotFound || undefined,
        explicitParallelRouteChildren:
          config.experimental.explicitParallelRouteChildren || undefined,
        strictRouteMatching,
        // Every route here is the one entry `next build` keeps for its pathname.
        isFinalRouteMatcher: strictRouteMatching,
      }),
      _module: { buildInfo: {} },
      _compilation: compilation,
      _compiler: { context: root },
      addDependency: (file) => watchFiles.add(file),
      addMissingDependency: (file) => watchFiles.add(file),
      // Vite takes a watched file for an import of the module, and a
      // directory is not one.
      addContextDependency: () => {},
    };
    let code = stripTurbopackTransitions(await nextAppLoader.call(context));
    const where = "the output of next-app-loader";
    if (route.kind === "route") {
      // Next's template loads `route.ts` when the first request comes in,
      // with the `require` of its bundler. Here that is `import()`: Next
      // waits for a module that loads asynchronously.
      code = replace(code, /(\buserland: \(\)\s*=>\s*)require\(/, "$1import(", where);
    } else {
      code = bindPageEntry(code, where);
    }
    return { code, watchFiles: [...watchFiles].filter((file) => fs.existsSync(file)) };
  };

  return {
    // Not for Next's own pages, `/_not-found` and `/_global-error`.
    componentRoutes: [
      ...[...new Set(["/", ...routes.map((route) => route.pathname)])]
        .filter((pathname) => !/^\/_(not-found|global-error)$/.test(pathname))
        .map(
          (pathname): ComponentRoute => ({
            kind: "page",
            page: `${pathname === "/" ? "" : pathname}/page`,
            pathname,
            component: `${componentRoot}${pathname}`,
          }),
        ),
      // And one with the layouts of each page of the app. Not of a route
      // that only has slots: there is no page for the node to stand in for.
      ...routes
        .filter((route) => route.kind === "page" && routeFile(route) && !route.page.includes("/@"))
        .map(
          (route): ComponentRoute => ({
            kind: "page",
            page: route.page,
            pathname: route.pathname,
            component: `${componentLayouts}${route.page}`,
            layouts: true,
          }),
        ),
    ],
    async loadRouteEntry(route) {
      if (!("component" in route)) return loadAppRouteEntry(route);
      if (!route.layouts) return { code: await loadNodeEntry(route), watchFiles: [] };
      // The entry of the app's route, with the node for its page: the tree
      // of Next's app loader names the page by its file.
      const appRoute = routes.find((candidate) => candidate.page === route.page)!;
      const file = JSON.stringify(routeFile(appRoute)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const entry = await loadAppRouteEntry(appRoute);
      const code = replace(
        entry.code,
        new RegExp(`\\bpage: \\[\\w+, ${file}\\]`),
        componentPage,
        "the output of next-app-loader",
      );
      return { code: componentImport + code, watchFiles: entry.watchFiles };
    },
    async loadMiddlewareEntry() {
      if (!middleware || !middlewareFile) return;
      // The entry the way `createEntrypoints` of `next build` makes it: a
      // request for Next's middleware loader, with its options as a query.
      const entry = getEdgeServerEntry({
        rootDir: root,
        absolutePagePath: middleware.pagePath,
        buildId,
        bundlePath: middleware.page.slice(1),
        config,
        isDev: false,
        isServerComponent: false,
        page: middleware.page,
        pages: {},
        pagesType: rootPageType,
        middleware: middleware.staticInfo.middleware,
        middlewareConfig: middleware.staticInfo.middleware,
        preferredRegion: middleware.staticInfo.preferredRegion,
      });
      const [loader, options = ""] = entry.import.replace(/!$/, "").split("?");
      if (loader !== "next-middleware-loader") {
        fail("`getEdgeServerEntry()` no longer loads the middleware with next-middleware-loader");
      }
      const [code] = await runLoader(
        nextMiddlewareLoader,
        querystring.parse(options),
        middlewareFile,
      );
      // For Node.js the template loads two modules with the `require` of
      // Next's bundler, in an async function. Here that is `import()`.
      return replace(
        stripTurbopackTransitions(code as string),
        /\brequire\(/g,
        "await import(",
        "the middleware template",
      );
    },
  };
}
