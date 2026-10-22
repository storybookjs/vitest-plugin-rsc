// What ssr.ts, in the ssr layer, takes of Next's request handler of a page,
// and of what Next's server routes a request to it with.

export {
  NEXT_REWRITTEN_PATH_HEADER,
  NEXT_REWRITTEN_QUERY_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_RSC_UNION_QUERY,
  RSC_HEADER,
} from "next/dist/client/components/app-router-headers";
export { isRSCRequestHeader } from "next/dist/server/lib/is-rsc-request";
export * as appPageModule from "next/dist/server/route-modules/app-page/module";
export { getIsPossibleServerAction } from "next/dist/server/lib/server-action-request-meta";
export { normalizeNextQueryParam } from "next/dist/server/web/utils";
export { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher";
export { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex";
