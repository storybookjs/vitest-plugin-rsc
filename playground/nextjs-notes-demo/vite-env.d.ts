/// <reference types="vite/client" />

declare module "@fontsource-variable/geist";
declare module "@fontsource-variable/geist-mono";

declare module "virtual:vitest-plugin-rsc/next-routes" {
  import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";

  export const nextRouteManifest: {
    route: string;
    appPath: string;
    pageFile: string;
    loaderTree: LoaderTree;
  }[];
}
