declare module "next/dist/compiled/path-to-regexp" {
  export type Token =
    | string
    | {
        name: string | number;
        prefix: string;
        suffix: string;
        pattern: string;
        modifier: string;
      };

  export function parse(path: string): Token[];
}

declare module "next/dist/compiled/@vercel/routing-utils/superstatic.js" {
  import type {
    ManifestHeaderRoute,
    ManifestRedirectRoute,
    ManifestRewriteRoute,
  } from "next/dist/build/index.js";
  import type { RouteHas } from "next/dist/lib/load-custom-routes.js";

  export type ConvertedHeaderRoute = {
    src?: string;
    headers?: Record<string, string>;
    has?: RouteHas[];
    missing?: RouteHas[];
  };

  export type ConvertedRedirectRoute = {
    src?: string;
    headers?: Record<string, string>;
    status?: number;
    has?: RouteHas[];
    missing?: RouteHas[];
  };

  export type ConvertedRewriteRoute = {
    src?: string;
    dest?: string;
    status?: number;
    has?: RouteHas[];
    missing?: RouteHas[];
  };

  export type ConvertedTrailingSlashRoute = {
    src?: string;
    headers?: Record<string, string>;
    status?: number;
  };

  const routingUtils: {
    convertHeaders(routes: ManifestHeaderRoute[]): ConvertedHeaderRoute[];
    convertRedirects(routes: ManifestRedirectRoute[], status?: number): ConvertedRedirectRoute[];
    convertRewrites(
      routes: ManifestRewriteRoute[],
      excludedPathParams?: string[],
    ): ConvertedRewriteRoute[];
    convertTrailingSlash(trailingSlash: boolean, status?: number): ConvertedTrailingSlashRoute[];
  };

  export default routingUtils;
}
