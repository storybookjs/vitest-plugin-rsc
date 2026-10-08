import fs from "node:fs";
import path from "node:path";
import type { NextRoute } from "../project.ts";
import type { NextContext } from "./context.ts";

/** The routes of the app, as `discoverAppRoutes()` lists them. */
export type AppRoutes = Awaited<ReturnType<typeof discoverAppRoutes>>;

/**
 * The routes of the app, the way `next build` lists its entries, and what
 * `next build` rejects an app for.
 */
export async function discoverAppRoutes(context: NextContext) {
  const { root, fail, config, appDir, pageExtensions, next } = context;
  const {
    APP_DIR_ALIAS,
    DEFAULT_METADATA_ROUTE_EXTENSIONS,
    IncompatibleParallelRouteSlotsError,
    MissingCanonicalInterceptionRoutesError,
    UnmatchedAppPagesError,
    compareAppPaths,
    discoverRoutes,
    findMissingCanonicalInterceptionRoutes,
    getAppPageStaticInfo,
    isAppPageRoute,
    isAppRouteRoute,
    isMetadataRouteFile,
    normalizeAppPath,
    normalizeCatchAllRoutes,
    selectAppPageEntry,
  } = next;
  const discovered = await discoverRoutes({
    appDir,
    pagesDir: undefined,
    pageExtensions,
    isDev: false,
    baseDir: root,
    isSrcDir: path.basename(path.dirname(appDir)) === "src",
  });
  const mappedAppPages =
    discovered.mappedAppPages ?? fail("`discoverRoutes()` returns no `mappedAppPages`");
  // The routes, the way `createEntrypoints` of `next build` lists them. A
  // route is every page with the same pathname: `/dashboard/page` and the
  // parallel `/dashboard/@stats/page` are one route.
  const appPathsPerRoute: Record<string, string[]> = {};
  for (const page of Object.keys(mappedAppPages)) {
    (appPathsPerRoute[normalizeAppPath(page)] ??= []).push(page);
  }
  // Next's type of the config leaves this option out.
  const { strictRouteMatching: strict } = config.experimental as { strictRouteMatching?: boolean };
  const strictRouteMatching = strict || undefined;
  // Adds a catch-all page to the routes it also matches, and drops the routes
  // that can never render.
  const { unmatchedAppPages, incompatibleParallelRouteSlots } = normalizeCatchAllRoutes(
    appPathsPerRoute,
    { strictRouteMatching, defaultAppPaths: Object.keys(discovered.mappedAppDefaults ?? {}) },
  );
  // What `createEntrypoints` of `next build` rejects, with its errors.
  const pagePathsPerRoute = Object.fromEntries(
    Object.entries(appPathsPerRoute).flatMap(([pathname, appPaths]) => {
      const pages = appPaths.filter(isAppPageRoute);
      return pages.length > 0 ? [[pathname, pages]] : [];
    }),
  );
  const missingCanonical = strictRouteMatching
    ? findMissingCanonicalInterceptionRoutes(pagePathsPerRoute)
    : [];
  const routeErrors = [
    ...(missingCanonical.length > 0
      ? [new MissingCanonicalInterceptionRoutesError(missingCanonical)]
      : []),
    ...(incompatibleParallelRouteSlots.length > 0
      ? [
          new IncompatibleParallelRouteSlotsError(
            incompatibleParallelRouteSlots.map((slot) => ({
              ...slot,
              layoutFile: path.relative(root, path.join(appDir, slot.layoutPath, "layout")),
            })),
          ),
        ]
      : []),
    ...(unmatchedAppPages.length > 0 ? [new UnmatchedAppPagesError(unmatchedAppPages)] : []),
  ];
  if (routeErrors.length > 0) {
    throw new Error(
      `vitest-plugin-rsc: \`next build\` fails on the routes of this app.\n\n` +
        routeErrors.map((error) => error.message).join("\n\n"),
    );
  }
  // A file by its path from the root of the project, for a message.
  const fromRoot = (file: string) => path.relative(root, file).split(path.sep).join("/");
  // Next also lists metadata files like `sitemap.ts` and `icon.png` as app
  // routes. Those need its metadata loaders and are not served yet.
  const fileOf = (appPath: string) => mappedAppPages[appPath]!.slice(APP_DIR_ALIAS.length);
  const isMetadataFile = (appPath: string) =>
    isAppRouteRoute(appPath) &&
    isMetadataRouteFile(fileOf(appPath), DEFAULT_METADATA_ROUTE_EXTENSIONS, true);
  const isRouteHandler = (appPath: string) => isAppRouteRoute(appPath) && !isMetadataFile(appPath);
  const metadataFiles = Object.keys(mappedAppPages)
    .filter(isMetadataFile)
    .map((appPath) => fromRoot(path.join(appDir, fileOf(appPath))))
    .sort();
  const routes: NextRoute[] = [];
  for (const [pathname, appPaths] of Object.entries(appPathsPerRoute)) {
    appPaths.sort(compareAppPaths);
    const page = selectAppPageEntry(pathname, appPaths);
    const pagePath = mappedAppPages[page]!;
    // A route's own files: a catch-all page of a slot is listed with every
    // route it also matches, like a route handler's.
    const own = appPaths.filter((appPath) => normalizeAppPath(appPath) === pathname);
    const pages = own.filter((appPath) => appPath.endsWith("/page"));
    const handlers = own.filter(isRouteHandler);
    // `next build` fails on this too.
    if (pages.length > 0 && handlers.length > 0) {
      throw new Error(
        `vitest-plugin-rsc: ${pathname} is both a page and a route handler ` +
          `(${pages.join(", ")} and ${handlers.join(", ")}). A path can only be one of them.`,
      );
    }
    // What the route is, is what Next builds for it: the file it selects.
    const kind = page.endsWith("/page") ? "page" : isRouteHandler(page) ? "route" : undefined;
    if (kind) routes.push({ kind, page, pathname, appPaths, pagePath });
  }

  // The file of a route of the app. Nothing for a page of Next's own, like
  // its not-found page.
  const routeFile = (route: NextRoute) =>
    route.pagePath.startsWith(APP_DIR_ALIAS)
      ? path.join(appDir, route.pagePath.slice(APP_DIR_ALIAS.length))
      : undefined;

  // A page without a root layout. Next's loader of a page ends the process
  // for one, with a line that does not say whose it is.
  for (const route of routes) {
    const file = routeFile(route);
    if (route.kind !== "page" || !file) continue;
    const hasLayout = (directory: string): boolean =>
      pageExtensions.some((extension) =>
        fs.existsSync(path.join(directory, `layout.${extension}`)),
      ) ||
      (directory !== appDir && hasLayout(path.dirname(directory)));
    if (!hasLayout(path.dirname(file))) {
      throw new Error(
        `vitest-plugin-rsc: ${fromRoot(file)} does not ` +
          `have a root layout: there is no layout file in its directory or in one above it, ` +
          `up to the app directory. \`next build\` stops at that too.`,
      );
    }
  }

  // Next's edge runtime is deprecated, and a route that asks for it with
  // `export const runtime = "edge"` runs on Node.js here, like every other
  // route. Read the way Next's build reads it, from the file of the route.
  const edgeRouteFiles: string[] = [];
  for (const route of routes) {
    const file = routeFile(route);
    if (!file) continue;
    const { runtime } = await getAppPageStaticInfo({
      pageFilePath: file,
      nextConfig: config,
      isDev: false,
      page: route.page,
      // Next types this as an enum, which only its own build can read.
      pageType: "app" as never,
    });
    if (runtime === "edge") edgeRouteFiles.push(fromRoot(file));
  }

  return {
    routes,
    /** The pages of each route, by its pathname: a route can have a page in each of its slots. */
    appPathsPerRoute,
    strictRouteMatching,
    metadataFiles,
    edgeRouteFiles,
    routeFile,
  };
}
