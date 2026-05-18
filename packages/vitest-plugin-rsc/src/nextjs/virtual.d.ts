declare module "virtual:vitest-plugin-rsc/next-routes" {
  import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
  import type { NextEdgeAppPageModule, NextEdgeAppRouteModule } from "./request-router.ts";
  import type { NextRoutingData } from "./routing-types.ts";

  export const nextRouteManifest: {
    route: string;
    appPath: string;
    pageFile: string;
    loaderTree: LoaderTree;
    edgeAppPageSource?: string;
    edgeAppPage?: () => Promise<NextEdgeAppPageModule>;
  }[];
  export const nextRouteHandlerManifest: {
    route: string;
    appPath: string;
    routeFile: string;
    edgeAppRouteSource?: string;
    edgeAppRoute?: () => Promise<NextEdgeAppRouteModule>;
  }[];
  export const routing: NextRoutingData;
  export const nextRoutingData: NextRoutingData;
}

declare module "virtual:vitest-plugin-rsc/next-cache-handlers" {
  import type { CacheHandler } from "next/dist/server/lib/cache-handlers/types.js";

  export const nextCacheHandlers: Record<string, CacheHandler>;
}

declare module "next/dist/compiled/react-server-dom-webpack/client.edge" {
  export const createFromReadableStream: unknown;
  export const createServerReference: unknown;

  const ReactServerDomClient: {
    createFromReadableStream: typeof createFromReadableStream;
    createServerReference: typeof createServerReference;
  };
  export default ReactServerDomClient;
}
