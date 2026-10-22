import { collectSegments } from "next/dist/build/segment-config/app/app-segments";
import { collectRootParamKeys } from "next/dist/build/segment-config/app/collect-root-param-keys";
import { buildAppStaticPaths } from "next/dist/build/static-paths/app";
import { fallbackModeToFallbackField, type FallbackMode } from "next/dist/lib/fallback";
import { isEdgeRuntime } from "next/dist/lib/is-edge-runtime";
import { isMetadataRoute, isStaticMetadataFile } from "next/dist/lib/metadata/is-metadata-route";
import type { AppRouteRouteModule } from "next/dist/server/route-modules/app-route/module";
import { isStaticGenEnabled } from "next/dist/server/route-modules/app-route/helpers/is-static-gen-enabled";
import { parseNormalizedAppRoute } from "next/dist/shared/lib/router/routes/app";
import { nextConfig, routing } from "virtual:vitest-plugin-rsc/next-manifest";
import { registry, type PrerenderVerdict } from "./registry.ts";

// Which pathnames of a route `next build` prerenders, from its
// `generateStaticParams`: what the build asks of the module of a route in a
// worker, before it renders one, with the functions of Next below. Where the
// build reads the compiled route from `.next/`, this has the route entry of
// the rsc layer.
//
// Whether the route is static at all is Next's handler's verdict, at the
// render: `handle()` in ssr.ts. A `force-dynamic` page throws as Next's
// handler prerenders it, before it renders a component
// (`create-component-tree.js:159`), and a page that reads the request, or
// has `revalidate = 0`, after its render (`app-page-runtime.js:663`). The
// build reads those from the config of the route instead
// (`build/utils.js:876-916`), which is no module to import here: it sets a
// Node.js process up as it loads.

type RouteEntry = Parameters<typeof buildAppStaticPaths>[0]["ComponentMod"];

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
    // The export prerenders a route handler with a request of `GET`, and
    // keeps it only for a status below 400 or 404 (:73-81). A route handler
    // without a `GET` answers that with 405 (`auto-implement-methods.js`):
    // `next start` runs its `POST` at every request.
    if (typeof (userland as { GET?: unknown }).GET !== "function") return undefined;
  }

  // What `isPageStatic()` does with the route module: `build/utils.js:736-805`.
  const { segments, segmentTree } = await collectSegments(routeModule as never, {
    cacheComponents,
    partialPrefetching: Boolean(nextConfig.partialPrefetching),
  });
  // The two options of the config of the segments that the build's verdict
  // reads before a render: the last segment's, as `reduceAppConfig()` of
  // `build/utils.js:886,900` takes them.
  const configured = (option: "dynamic" | "runtime") =>
    segments.findLast((segment) => segment.config?.[option] !== undefined)?.config?.[option];
  // A route of the edge runtime, which runs on Node.js here: the build does
  // not prerender it (`build/index.js:1454-1457`).
  if (isEdgeRuntime(configured("runtime"))) return undefined;
  const route = parseNormalizedAppRoute(pathname);
  const isDynamic = route.dynamicSegments.length > 0;
  // A route without params: its own pathname (`build/index.js:1501-1513`).
  if (!isDynamic) return { pathnames: [pathname] };
  // A static file of metadata under a dynamic segment, which the build
  // prerenders under a pathname of its own (`build/utils.js:770-776`).
  if (kind === "route" && isStaticMetadataFile(pathname)) return undefined;

  // Next's cache of the build, which it makes for `generateStaticParams`
  // and leaves in the global of the server's: put back afterwards.
  const serverCache = globalThis.__incrementalCache;
  let prerenderedRoutes: { pathname: string; isPrerenderOutput?: boolean }[] | undefined;
  let fallbackMode: FallbackMode | undefined;
  try {
    ({ prerenderedRoutes, fallbackMode } = await buildAppStaticPaths({
      // Next makes its cache for these in the directory of the build, where
      // the server's cache is too (cache.ts): a fetch of `generateStaticParams`
      // is the page's, as a build's is `next start`'s.
      dir: "/",
      distDir: registry.buildDir(),
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
      isrFlushToDisk: true,
      // On the server's disk, as the server's own cache: see cache.ts.
      cacheMaxMemorySize: 0,
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

  // What the build makes of the paths of a route with params, in
  // `build/index.js:1474-1518`, which Next has in no function of its own.
  // The paths of `generateStaticParams`, if it has one: also none, for one
  // that lists none, which prerenders every path at its first request.
  // Without one, so does `dynamic = "error"` or `"force-static"`, and
  // otherwise the route is dynamic.
  const dynamic = configured("dynamic");
  if (!prerenderedRoutes && dynamic !== "error" && dynamic !== "force-static") return undefined;
  return {
    // :1476, and :2133 without the pattern of the route itself.
    pathnames: (prerenderedRoutes ?? [])
      .filter((route) => route.isPrerenderOutput !== false)
      .map((route) => route.pathname)
      .filter((path) => path !== pathname),
    // :2249, :1978
    fallback: fallbackModeToFallbackField(
      fallbackMode ?? ("NOT_FOUND" as FallbackMode),
      pathname,
    ) as null | false,
  };
}
