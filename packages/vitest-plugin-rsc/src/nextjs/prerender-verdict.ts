import { collectSegments } from "next/dist/build/segment-config/app/app-segments";
import { collectRootParamKeys } from "next/dist/build/segment-config/app/collect-root-param-keys";
import { buildAppStaticPaths } from "next/dist/build/static-paths/app";
import { fallbackModeToFallbackField, type FallbackMode } from "next/dist/lib/fallback";
import { isEdgeRuntime } from "next/dist/lib/is-edge-runtime";
import { isMetadataRoute, isStaticMetadataFile } from "next/dist/lib/metadata/is-metadata-route";
import { isEmptyParams } from "next/dist/server/lib/params-utils";
import type { AppRouteRouteModule } from "next/dist/server/route-modules/app-route/module";
import { isStaticGenEnabled } from "next/dist/server/route-modules/app-route/helpers/is-static-gen-enabled";
import { parseNormalizedAppRoute } from "next/dist/shared/lib/router/routes/app";
import { nextConfig, routing } from "virtual:vitest-plugin-rsc/next-manifest";
import { registry, type PrerenderVerdict } from "./registry.ts";

// The verdict of `next build` on a route, from its config: whether it
// prerenders it, and which pathnames. Next's build makes it in a worker for
// each route, before it renders one, with the functions of Next below on the
// module of the route, which here is the route entry of the rsc layer. Where
// the build reads the compiled route from `.next/`, this has the module.
// Whether a page that the config lets the build prerender reads the request
// is the verdict of its render, which is Next's handler's: see `handle()` in
// ssr.ts.

type RouteEntry = Parameters<typeof buildAppStaticPaths>[0]["ComponentMod"];
type Segments = Parameters<typeof buildAppStaticPaths>[0]["segments"];

// The config of a route from that of its segments: the three options of
// `reduceAppConfig()` of `build/utils.js:876-916` that the verdict reads. Its
// module sets a Node.js process up as it loads (`require-hook`), so it is
// not one to import here. project/runtime.ts checks that it still reads
// them so.
function reduceAppConfig(segments: Segments) {
  const config: { dynamic?: string; revalidate?: number | false; runtime?: string } = {};
  for (const segment of segments) {
    const { dynamic, revalidate, runtime } = segment.config ?? {};
    if (typeof dynamic !== "undefined") config.dynamic = dynamic;
    if (typeof runtime !== "undefined") config.runtime = runtime;
    if (typeof revalidate !== "undefined") config.revalidate = revalidate;
    // Any number overrides `false`, and a shorter one a longer one.
    if (
      typeof revalidate === "number" &&
      (typeof config.revalidate !== "number" || revalidate < config.revalidate)
    ) {
      config.revalidate = revalidate;
    }
  }
  return config;
}

export async function prerenderVerdictOf(
  entry: RouteEntry,
  pathname: string,
  kind: "page" | "route",
): Promise<PrerenderVerdict | undefined> {
  const { routeModule } = entry;
  const cacheComponents = Boolean(nextConfig.cacheComponents);
  // A page of an app with Cache Components is prerendered in stages, which
  // the plugin does not run: see `fast-set-immediate` in node-platform.ts.
  if (kind === "page" && cacheComponents) return undefined;
  if (kind === "route") {
    // What the export of a route handler checks before it calls the
    // handler: `export/routes/app-route.js:59-71`.
    const routeHandler = routeModule as AppRouteRouteModule;
    await routeHandler.ensureUserland();
    const userland = routeHandler.userland as Parameters<typeof isStaticGenEnabled>[0];
    if (
      !isStaticGenEnabled(userland) &&
      !isMetadataRoute(`${pathname}/route`) &&
      !cacheComponents
    ) {
      return undefined;
    }
  }

  // What `isPageStatic()` does with the route module: `build/utils.js:736-805`.
  // `force-dynamic` is `revalidate: 0` there (:763).
  const { segments, segmentTree } = await collectSegments(routeModule as never, {
    cacheComponents,
    partialPrefetching: Boolean(nextConfig.partialPrefetching),
  });
  const appConfig = reduceAppConfig(segments);
  // A route of the edge runtime, which runs on Node.js here: the build does
  // not prerender it (`build/index.js:1454-1457`).
  if (isEdgeRuntime(appConfig.runtime)) return undefined;
  if (appConfig.dynamic === "force-dynamic") appConfig.revalidate = 0;
  const route = parseNormalizedAppRoute(pathname);
  const isDynamic = route.dynamicSegments.length > 0;
  let prerenderedRoutes: { pathname: string; params: object }[] | undefined;
  let fallbackMode: FallbackMode | undefined;
  // A static file of metadata under a dynamic segment, which the build
  // prerenders under a pathname of its own (`build/utils.js:770-776`).
  if (isDynamic && kind === "route" && isStaticMetadataFile(pathname)) return undefined;
  if (isDynamic) {
    // Next's cache of the build, which it makes for `generateStaticParams`
    // and leaves in the global of the server's: put back afterwards.
    const serverCache = globalThis.__incrementalCache;
    try {
      ({ prerenderedRoutes, fallbackMode } = await buildAppStaticPaths({
        // Next makes its cache on `.next/` for these, which here is the
        // stand-in of Node's file system: see node-platform.ts.
        dir: "",
        distDir: "",
        page: pathname,
        route,
        cacheComponents,
        authInterrupts: Boolean(nextConfig.experimental.authInterrupts),
        useCacheTimeout: nextConfig.experimental.useCacheTimeout as number,
        durableUseCacheEntries: Boolean(nextConfig.experimental.durableUseCacheEntries),
        staticPageGenerationTimeout: nextConfig.staticPageGenerationTimeout,
        segments,
        segmentTree,
        requestHeaders: {},
        isrFlushToDisk: false,
        cacheMaxMemorySize: nextConfig.cacheMaxMemorySize,
        // The fetches of `generateStaticParams` are not those of an earlier
        // test: see cache.ts.
        fetchCacheKeyPrefix: `${nextConfig.experimental.fetchCacheKeyPrefix ?? ""}${registry.cacheGeneration()}`,
        cacheLifeProfiles: nextConfig.cacheLife as never,
        ComponentMod: entry,
        nextConfigOutput: nextConfig.output,
        isRoutePPREnabled: false,
        isEnsureStaticPage: false,
        buildId: routing.buildId,
        deploymentId: nextConfig.deploymentId ?? "",
        rootParamKeys: collectRootParamKeys(routeModule as never),
      }));
    } finally {
      globalThis.__incrementalCache = serverCache;
    }
  }

  // Next's build makes "static or not" of that, in `build/index.js`. Not a
  // function of its own: these are its lines, with their numbers. A render
  // of each path of a route with `revalidate: 0` answers so, and the export
  // keeps none and lists no dynamic route (:1483, :2239).
  if (appConfig.revalidate === 0) return undefined;
  // :1474-1478, the paths of `generateStaticParams`, also none.
  let staticPaths = prerenderedRoutes;
  // :1484-1488
  const hasGenerateStaticParams =
    prerenderedRoutes?.some(
      (route) => isStaticMetadataFile(route.pathname) || !isEmptyParams(route.params as never),
    ) ?? false;
  // :1501-1513, a route without params: its own pathname.
  if (!isDynamic) staticPaths = [{ pathname, params: {} }];
  // :1514-1518
  else if (
    !hasGenerateStaticParams &&
    (appConfig.dynamic === "error" || appConfig.dynamic === "force-static")
  ) {
    staticPaths = [];
  }
  if (!staticPaths) return undefined;
  return {
    // :2133, without the pattern of the route itself.
    pathnames: staticPaths
      .map((path) => path.pathname)
      .filter((path) => !isDynamic || path !== pathname),
    // :2249, :1978
    fallback: isDynamic
      ? (fallbackModeToFallbackField(fallbackMode ?? ("NOT_FOUND" as FallbackMode), pathname) as
          | null
          | false)
      : undefined,
    // :2137, before an export of the path says otherwise.
    revalidate: appConfig.revalidate ?? false,
  };
}
