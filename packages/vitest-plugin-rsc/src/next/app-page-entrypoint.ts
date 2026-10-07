import * as routeKind from "next/dist/server/route-kind";
import { registry } from "./registry.ts";

// Next types this as a const enum, which only its own build can read.
const { RouteKind } = routeKind as unknown as { RouteKind: { APP_PAGE: string } };

// Next's loader tree: a segment, its parallel routes, and its modules, each a
// function that loads the module and the path of its file.
type ModuleGetter = () => Promise<unknown>;
type LoaderTree = [
  segment: string,
  parallelRoutes: Record<string, LoaderTree>,
  modules: Record<string, [ModuleGetter, string] | undefined>,
];

// `renderServer(<Node />, { url })` renders a node where the route has its
// page. The request still goes through Next and the layouts of the route, so
// the page is swapped where Next loads it.
function withPageOverride(tree: LoaderTree, page: string): void {
  const [segment, parallelRoutes, modules] = tree;
  if (segment.startsWith("__PAGE__") && modules.page) {
    const [load, file] = modules.page;
    modules.page = [
      async () =>
        page in registry.pageOverrides ? { default: () => registry.pageOverrides[page] } : load(),
      file,
    ];
  }
  if (parallelRoutes.children) withPageOverride(parallelRoutes.children, page);
}

// Stands in for `next/dist/build/templates/app-page-runtime`, which the
// route entry of Next's app loader imports to create its route module.
//
// That file also holds the request handler for the Node.js server. The edge
// entry has its own, so only the route module is created here: the same way,
// with the class from the ssr layer, which is where Next's bundler config
// puts it.
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
  withPageOverride(tree, page);
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
