declare module "virtual:vitest-plugin-rsc/next-routes" {
  import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
  import type { NextRoutingData } from "./routing-types";

  export const nextRouteManifest: {
    route: string;
    appPath: string;
    pageFile: string;
    loaderTree: LoaderTree;
  }[];
  export const nextRouteHandlerManifest: {
    route: string;
    appPath: string;
    routeFile: string;
  }[];
  export const nextRoutingData: NextRoutingData;
}

declare module "virtual:vitest-plugin-rsc/next-cache-handlers" {
  import type { CacheHandler } from "next/dist/server/lib/cache-handlers/types.js";

  export const nextCacheHandlers: Record<string, CacheHandler>;
}
