declare module "virtual:vitest-plugin-rsc/next-routes" {
  import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";

  type NextCustomRoute = {
    source: string;
    destination?: string;
    permanent?: boolean;
    statusCode?: number;
    has?: unknown[];
    missing?: unknown[];
    headers?: { key: string; value: string }[];
  };

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
  export const nextCustomRoutes: {
    headers: NextCustomRoute[];
    redirects: NextCustomRoute[];
    rewrites: {
      beforeFiles: NextCustomRoute[];
      afterFiles: NextCustomRoute[];
      fallback: NextCustomRoute[];
    };
  };
}
