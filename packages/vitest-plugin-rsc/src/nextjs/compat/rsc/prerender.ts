// What prerender-verdict.ts, in the rsc layer, calls of Next's build to tell
// which pathnames of a route it prerenders. Only `build: "production"`
// prerenders: a run without it loads none of this, and pre-bundles none of
// it (`prerenderImports` of compat/paths.ts, `prerenderId` of plugin.ts).

export { collectSegments } from "next/dist/build/segment-config/app/app-segments";
export { collectRootParamKeys } from "next/dist/build/segment-config/app/collect-root-param-keys";
export { buildAppStaticPaths } from "next/dist/build/static-paths/app";
export { fallbackModeToFallbackField, type FallbackMode } from "next/dist/lib/fallback";
export { isEdgeRuntime } from "next/dist/lib/is-edge-runtime";
export { isMetadataRoute, isStaticMetadataFile } from "next/dist/lib/metadata/is-metadata-route";
export type { AppRouteRouteModule } from "next/dist/server/route-modules/app-route/module";
export { isStaticGenEnabled } from "next/dist/server/route-modules/app-route/helpers/is-static-gen-enabled";
export { parseNormalizedAppRoute } from "next/dist/shared/lib/router/routes/app";
