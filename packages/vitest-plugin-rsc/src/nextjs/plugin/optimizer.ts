import { createProjectRequire } from "../plugin-utils";
import { virtualNextEntrypointsPublicId } from "../virtual-ids";

export const nextRootParamsOptimizeDepsExclude = [
  "next/root-params",
  "next/root-params.js",
] as const;

const nextBrowserRuntimeOptimizeDeps = [
  "node:buffer",
  "vitest-plugin-rsc/async-local-storage",
] as const;

const nextClientRouterOptimizeDeps = [
  "next/dist/client/app-call-server.js",
  "next/dist/client/app-bootstrap.js",
  "next/dist/client/route-params.js",
  "next/dist/client/components/app-router.js",
  "next/dist/client/app-dir/link",
  "next/dist/client/app-dir/link.js",
  "next/dist/client/components/navigation.react-server",
  "next/dist/client/components/app-router-instance.js",
  "next/dist/client/components/navigation.react-server.js",
  "next/dist/client/components/redirect-boundary.js",
  "next/dist/client/components/router-reducer/compute-changed-path.js",
  "next/dist/client/components/router-reducer/create-href-from-url.js",
  "next/dist/client/components/router-reducer/create-initial-router-state.js",
  "next/dist/client/components/router-reducer/ppr-navigations.js",
  "next/dist/client/components/router-reducer/router-reducer.js",
  "next/dist/client/components/router-reducer/router-reducer-types.js",
  "next/dist/client/components/router-reducer/reducers/server-action-reducer.js",
  "next/dist/client/components/unresolved-thenable.js",
  "next/dist/shared/lib/server-reference-info.js",
  "next/dist/client/components/app-router-headers.js",
  "next/dist/client/components/http-access-fallback/http-access-fallback.js",
  "next/dist/client/components/redirect-error.js",
  "next/dist/client/components/redirect-status-code.js",
  "next/dist/client/components/redirect.js",
  "next/dist/server/lib/server-action-request-meta.js",
  "next/dist/client/components/use-action-queue.js",
  "next/dist/client/components/match-segments.js",
  "next/dist/shared/lib/app-router-context.shared-runtime.js",
  "next/dist/shared/lib/hooks-client-context.shared-runtime.js",
  "next/dist/shared/lib/server-inserted-html.shared-runtime.js",
] as const;

const nextClientNavigationOptimizeDeps = [
  "next/dist/client/components/navigation",
  "next/dist/client/components/navigation.js",
] as const;

const nextAppRouterApiOptimizeDeps = [
  "next/dist/api/app-dynamic",
  "next/dist/api/app-dynamic.js",
  "next/dist/api/error",
  "next/dist/api/error.js",
  "next/dist/client/components/catch-error",
  "next/dist/client/components/catch-error.js",
  "next/dist/client/components/noop-head",
  "next/dist/client/components/noop-head.js",
  "next/dist/client/web-vitals",
  "next/dist/client/web-vitals.js",
  "next/dist/compiled/web-vitals",
  "next/dist/shared/lib/app-dynamic",
  "next/dist/shared/lib/app-dynamic.js",
  "next/dist/shared/lib/lazy-dynamic/loadable",
  "next/dist/shared/lib/lazy-dynamic/loadable.js",
  "next/error",
  "next/error.js",
  "next/web-vitals",
  "next/web-vitals.js",
] as const;

const nextAppRouterClientApiOptimizeDeps = [
  "next/dist/client/add-base-path",
  "next/dist/client/add-base-path.js",
  "next/dist/client/app-dir/form",
  "next/dist/client/app-dir/form.js",
  "next/dist/client/app-dir/link",
  "next/dist/client/app-dir/link.js",
  "next/dist/client/request-idle-callback",
  "next/dist/client/request-idle-callback.js",
  "next/dist/client/script",
  "next/dist/client/script.js",
  "next/dist/client/set-attributes-from-props",
  "next/dist/client/set-attributes-from-props.js",
  "next/dist/client/components/links",
  "next/dist/client/components/links.js",
  "next/dist/client/components/segment-cache/types",
  "next/dist/client/components/segment-cache/types.js",
  "next/dist/client/form-shared",
  "next/dist/client/form-shared.js",
] as const;

const nextRscClientUtilityOptimizeDeps = [
  "next/dist/client/components/app-router-headers.js",
  "next/dist/client/components/http-access-fallback/http-access-fallback.js",
  "next/dist/client/components/navigation.react-server",
  "next/dist/client/components/navigation.react-server.js",
  "next/dist/client/components/redirect-error.js",
  "next/dist/client/components/redirect-status-code.js",
  "next/dist/client/components/redirect.js",
  "next/dist/server/lib/server-action-request-meta.js",
  "next/dist/shared/lib/server-reference-info.js",
] as const;

const nextTestingLibraryOptimizeDeps = [
  "@next/routing",
  "next/dist/server/app-render/get-preloadable-fonts.js",
  "next/dist/server/web/utils.js",
  "next/dist/shared/lib/encode-uri-path.js",
  "next/dist/shared/lib/router/utils/remove-path-prefix.js",
  "next/dist/shared/lib/router/utils/route-matcher.js",
  "next/dist/shared/lib/router/utils/route-regex.js",
] as const;

const nextEntryBaseClientReferenceOptimizeDeps = [
  "next/dist/client/components/client-page.js",
  "next/dist/client/components/client-segment.js",
  "next/dist/client/components/http-access-fallback/error-boundary.js",
  "next/dist/client/components/layout-router.js",
  "next/dist/client/components/render-from-template-context.js",
  "next/dist/lib/framework/boundary-components.js",
] as const;

const nextRscServerOptimizeDeps = [
  "next/dist/compiled/@opentelemetry/api",
  "next/cache",
  "next/headers",
  "next/server",
  "next/dist/compiled/@edge-runtime/cookies/index.js",
  "next/dist/server/node-environment-baseline.js",
  "next/dist/server/app-render/entry-base.js",
  "next/dist/server/app-render/app-render.js",
  "next/dist/server/app-render/action-handler.js",
  "next/dist/server/app-render/action-async-storage.external.js",
  "next/dist/server/app-render/async-local-storage.js",
  "next/dist/server/app-render/work-async-storage.external.js",
  "next/dist/server/app-render/work-unit-async-storage.external.js",
  "next/dist/server/base-http/web.js",
  "next/dist/server/render-result.js",
  "next/dist/server/async-storage/request-store.js",
  "next/dist/server/async-storage/work-store.js",
  "next/dist/server/config-shared.js",
  "next/dist/server/request-meta.js",
  "next/dist/server/lib/implicit-tags.js",
  "next/dist/server/lib/incremental-cache/index.js",
  "next/dist/server/lib/incremental-cache/file-system-cache.js",
  "next/dist/server/lib/incremental-cache/memory-cache.external.js",
  "next/dist/server/lib/incremental-cache/tags-manifest.external.js",
  "next/dist/server/lib/cache-handlers/default.js",
  "next/dist/server/lib/patch-fetch.js",
  "next/dist/server/revalidation-utils.js",
  "next/dist/server/use-cache/handlers.js",
  "next/dist/server/use-cache/use-cache-wrapper.js",
  "next/dist/client/components/is-next-router-error.js",
  "next/dist/client/app-dir/link.react-server",
  "next/dist/client/app-dir/link.react-server.js",
  "next/dist/server/request/cookies.js",
  "next/dist/server/request/draft-mode.js",
  "next/dist/server/request/headers.js",
  "next/dist/server/request/params.js",
  "next/dist/server/request/root-params.js",
  "next/dist/server/request/search-params.js",
  "next/dist/server/web/spec-extension/adapters/headers.js",
  "next/dist/server/web/spec-extension/adapters/request-cookies.js",
  "next/dist/shared/lib/router/utils/parse-relative-url.js",
  "next/dist/shared/lib/get-img-props.js",
  "next/dist/shared/lib/image-config.js",
  "next/dist/shared/lib/image-loader.js",
  "next/dist/client/components/hooks-server-context.js",
  "next/dist/server/app-render/rsc/postpone.js",
  "next/dist/server/app-render/rsc/preloads.js",
  "next/dist/server/app-render/rsc/taint.js",
  "next/dist/server/app-render/collect-segment-data.js",
  "next/dist/lib/metadata/metadata.js",
  "next/dist/lib/metadata/get-metadata-route",
  "next/dist/lib/metadata/get-metadata-route.js",
] as const;

const nextOptionalAppRenderOptimizeDeps = [
  "next/dist/server/app-render/action-utils.js",
  "next/dist/server/app-render/encryption-utils.js",
  "next/dist/server/app-render/manifests-singleton.js",
  "next/dist/shared/lib/action-revalidation-kind.js",
] as const;

const nextBuiltinErrorOptimizeDeps = [
  "next/dist/client/components/builtin/default.js",
  "next/dist/client/components/builtin/forbidden.js",
  "next/dist/client/components/builtin/global-error.js",
  "next/dist/client/components/builtin/not-found.js",
  "next/dist/client/components/builtin/unauthorized.js",
] as const;

const nextRouteUtilityOptimizeDeps = [
  "next/dist/lib/redirect-status.js",
  "next/dist/shared/lib/segment.js",
  "next/dist/shared/lib/router/utils/app-paths.js",
  "next/dist/shared/lib/router/utils/format-url.js",
  "next/dist/shared/lib/router/utils/path-match.js",
  "next/dist/shared/lib/router/utils/prepare-destination.js",
  "next/dist/shared/lib/router/utils/route-matcher.js",
  "next/dist/shared/lib/router/utils/route-regex.js",
] as const;

const nextImageOptimizeDeps = [
  "next/dist/client/image-component.js",
  "next/dist/client/use-merged-ref.js",
  "next/dist/shared/lib/get-img-props.js",
  "next/dist/shared/lib/head.js",
  "next/dist/shared/lib/head-manager-context.shared-runtime.js",
  "next/dist/shared/lib/image-config.js",
  "next/dist/shared/lib/image-config-context.shared-runtime.js",
  "next/dist/shared/lib/image-external.js",
  "next/dist/shared/lib/image-loader.js",
  "next/dist/shared/lib/router-context.shared-runtime.js",
] as const;

export function resolveNextOptimizeDeps(root: string) {
  return {
    appRouterApi: filterResolvableOptimizeDeps(root, nextAppRouterApiOptimizeDeps),
    browserRuntime: filterResolvableOptimizeDeps(root, nextBrowserRuntimeOptimizeDeps),
    builtinError: filterResolvableOptimizeDeps(root, nextBuiltinErrorOptimizeDeps),
    clientNavigation: filterResolvableOptimizeDeps(root, nextClientNavigationOptimizeDeps),
    clientRouter: filterResolvableOptimizeDeps(root, nextClientRouterOptimizeDeps),
    entryBaseClientReference: filterResolvableOptimizeDeps(
      root,
      nextEntryBaseClientReferenceOptimizeDeps,
    ),
    image: filterResolvableOptimizeDeps(root, nextImageOptimizeDeps),
    optionalAppRender: filterResolvableOptimizeDeps(root, nextOptionalAppRenderOptimizeDeps),
    routeUtility: filterResolvableOptimizeDeps(root, nextRouteUtilityOptimizeDeps),
    rscClientUtility: filterResolvableOptimizeDeps(root, nextRscClientUtilityOptimizeDeps),
    rscServer: filterResolvableOptimizeDeps(root, nextRscServerOptimizeDeps),
    testingLibrary: filterResolvableOptimizeDeps(root, nextTestingLibraryOptimizeDeps),
    appRouterClientApi: filterResolvableOptimizeDeps(root, nextAppRouterClientApiOptimizeDeps),
  };
}

function filterResolvableOptimizeDeps(root: string, deps: readonly string[]): string[] {
  const projectRequire = createProjectRequire(root);
  return deps.filter((dep) => {
    try {
      projectRequire.resolve(dep);
      return true;
    } catch {
      return false;
    }
  });
}

export function createNextSourceOptimizerEntries(_root: string): string[] {
  return [virtualNextEntrypointsPublicId];
}
