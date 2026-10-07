import * as routeKind from "next/dist/server/route-kind";
import { registry } from "./registry.ts";

// Next types this as a const enum, which only its own build can read.
const { RouteKind } = routeKind as unknown as { RouteKind: { APP_PAGE: string } };

// Next's loader tree: a segment, its parallel routes by slot, and the modules
// of the segment, each as a function that loads it and the path of its file.
type ModuleGetter = () => Promise<unknown>;
type SegmentModules = { page?: [ModuleGetter, string] } & Record<string, unknown>;
type LoaderTree = [
  segment: string,
  parallelRoutes: Record<string, LoaderTree>,
  modules: SegmentModules,
  ...rest: unknown[],
];

// The pages in a tree, each with the slots that lead to it. The page of a
// route is mostly in `children` all the way down, which is no slot at all.
function* pagesOf(
  [segment, parallelRoutes, modules]: LoaderTree,
  slots: string[] = [],
): Generator<{ modules: SegmentModules; slots: string[] }> {
  if (segment.startsWith("__PAGE__") && modules.page) yield { modules, slots };
  for (const [slot, child] of Object.entries(parallelRoutes)) {
    yield* pagesOf(child, slot === "children" ? slots : [...slots, slot]);
  }
}

// `renderServer(<Node />, { url })` renders a node where the route has its
// page. The request still goes through Next and the layouts of the route, so
// the page is swapped where Next loads it. Next reads more off that module
// than its component: `generateMetadata`, `metadata`, `viewport`, and segment
// config like `dynamic`. With a node there is no page, so none of them apply.
function withPageOverride(tree: LoaderTree, page: string): void {
  // `/dashboard/@stats/page` is the page in the slot `stats`.
  const slots = [...page.matchAll(/\/@([^/]+)/g)].map((match) => match[1]).join("/");
  for (const candidate of pagesOf(tree)) {
    if (candidate.slots.join("/") !== slots) continue;
    const [load, file] = candidate.modules.page!;
    candidate.modules.page = [
      async () =>
        page in registry.pageOverrides ? { default: () => registry.pageOverrides[page] } : load(),
      file,
    ];
  }
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
