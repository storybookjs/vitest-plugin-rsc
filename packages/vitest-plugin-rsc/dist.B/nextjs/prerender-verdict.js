import { i as registry } from "../registry-DPyevx_W.js";
import { nextConfig, routing } from "virtual:vitest-plugin-rsc/next-manifest";
import { collectSegments } from "next/dist/build/segment-config/app/app-segments.js";
import { collectRootParamKeys } from "next/dist/build/segment-config/app/collect-root-param-keys.js";
import { buildAppStaticPaths } from "next/dist/build/static-paths/app.js";
import { fallbackModeToFallbackField } from "next/dist/lib/fallback.js";
import { isEdgeRuntime } from "next/dist/lib/is-edge-runtime.js";
import { isMetadataRoute, isStaticMetadataFile } from "next/dist/lib/metadata/is-metadata-route.js";
import { isStaticGenEnabled } from "next/dist/server/route-modules/app-route/helpers/is-static-gen-enabled.js";
import { parseNormalizedAppRoute } from "next/dist/shared/lib/router/routes/app.js";
//#region src/nextjs/prerender-verdict.ts
async function prerenderVerdictOf(entry, pathname, kind) {
	const { routeModule } = entry;
	const cacheComponents = Boolean(nextConfig.cacheComponents);
	if (kind === "page" && cacheComponents) return void 0;
	if (kind === "route") {
		const routeHandler = routeModule;
		await routeHandler.ensureUserland();
		const userland = routeHandler.userland;
		if (!isStaticGenEnabled(userland) && !isMetadataRoute(`${pathname}/route`) && !cacheComponents) return;
		if (typeof userland.GET !== "function") return void 0;
	}
	const { segments, segmentTree } = await collectSegments(routeModule, {
		cacheComponents,
		partialPrefetching: Boolean(nextConfig.partialPrefetching)
	});
	const configured = (option) => segments.findLast((segment) => segment.config?.[option] !== void 0)?.config?.[option];
	if (isEdgeRuntime(configured("runtime"))) return void 0;
	const route = parseNormalizedAppRoute(pathname);
	if (!(route.dynamicSegments.length > 0)) return { pathnames: [pathname] };
	if (kind === "route" && isStaticMetadataFile(pathname)) return void 0;
	const serverCache = globalThis.__incrementalCache;
	let prerenderedRoutes;
	let fallbackMode;
	try {
		({prerenderedRoutes, fallbackMode} = await buildAppStaticPaths({
			dir: "/",
			distDir: registry.buildDir(),
			page: pathname,
			route,
			cacheComponents,
			authInterrupts: Boolean(nextConfig.experimental.authInterrupts),
			useCacheTimeout: nextConfig.experimental.useCacheTimeout,
			durableUseCacheEntries: Boolean(nextConfig.experimental.durableUseCacheEntries),
			staticPageGenerationTimeout: nextConfig.staticPageGenerationTimeout,
			segments,
			segmentTree,
			requestHeaders: {},
			isrFlushToDisk: true,
			cacheMaxMemorySize: 0,
			fetchCacheKeyPrefix: `${nextConfig.experimental.fetchCacheKeyPrefix ?? ""}${registry.cacheGeneration()}`,
			cacheLifeProfiles: nextConfig.cacheLife,
			ComponentMod: entry,
			nextConfigOutput: nextConfig.output,
			isRoutePPREnabled: false,
			isEnsureStaticPage: false,
			buildId: routing.buildId,
			deploymentId: nextConfig.deploymentId ?? "",
			rootParamKeys: collectRootParamKeys(routeModule)
		}));
	} finally {
		globalThis.__incrementalCache = serverCache;
	}
	const dynamic = configured("dynamic");
	if (!prerenderedRoutes && dynamic !== "error" && dynamic !== "force-static") return void 0;
	return {
		pathnames: (prerenderedRoutes ?? []).filter((route) => route.isPrerenderOutput !== false).map((route) => route.pathname).filter((path) => path !== pathname),
		fallback: fallbackModeToFallbackField(fallbackMode ?? "NOT_FOUND", pathname)
	};
}
//#endregion
export { prerenderVerdictOf };
