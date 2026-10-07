import * as routeKind from "next/dist/server/route-kind";
import { registry } from "./registry.ts";

// Next types this as a const enum, which only its own build can read.
const { RouteKind } = routeKind as unknown as { RouteKind: { APP_PAGE: string } };

// Next's loader tree: a segment, its parallel routes by slot, and the modules
// of the segment, each as a function that loads it and the path of its file.
type LoaderTree = [
  segment: string,
  parallelRoutes: Record<string, LoaderTree>,
  modules: Record<string, unknown>,
  ...rest: unknown[],
];

// Stands in for `next/dist/build/templates/app-page-runtime`, which the
// route entry of Next's app loader imports to create its route module.
//
// That file also holds the request handler of a page for the Node.js server,
// with the response cache of prerendered pages around a render. Here
// node-server.ts calls the route module, so only that is created: the same
// way, with the class from the ssr layer, which is where Next's bundler
// config puts it.
export function createAppPageEntrypoint({
  tree,
  page,
  pathname,
  require,
  loadChunk,
}: {
  tree: LoaderTree;
  page: string;
  pathname: string;
  require: (id: string) => unknown;
  loadChunk: () => Promise<void>;
}) {
  const routeModule = new registry.ssr.AppPageRouteModule({
    definition: {
      kind: RouteKind.APP_PAGE,
      page,
      pathname,
      bundlePath: "",
      filename: "",
      appPaths: [],
    },
    userland: { loaderTree: tree },
    distDir: "",
    relativeProjectDir: "",
  });

  return {
    __next_app__: { require, loadChunk },
    routeModule,
    handler: undefined,
  };
}
