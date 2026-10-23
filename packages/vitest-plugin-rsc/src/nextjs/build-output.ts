import {
  nextConfig,
  preview,
  routesManifest,
  routing,
} from "virtual:vitest-plugin-rsc/next-manifest";
import {
  normalizePagePath,
  RSC_SUFFIX,
  type PrerenderManifest,
} from "./compat/ssr/build-output.ts";
import { actionModulePrefix, registry, type PrerenderVerdict } from "./registry.ts";
import type { Stylesheets } from "./styles-shared.ts";

// What `next build` writes to `.next/`, filled per route as the plugin learns
// it, and read by Next through `load-manifest.external`, the module Next keeps
// out of its own bundle to read those files. The server of a route reads them
// for every request, so what is set here before a request is what that
// request finds.

const anyKey = <T>(create: (key: string) => T) =>
  new Proxy({} as Record<string, T>, {
    get: (_, key) => (typeof key === "string" ? create(key) : undefined),
    has: () => true,
  });

// Next's build lists the CSS files of every layout, page and boundary, by the
// file of the segment, and Next's renderer links them next to that segment.
// Here the plugin says which they are, for the routes that were requested:
// see styles.ts. The stylesheets of a file are the same in every route.
type CssFile = { path: string; inlined: false } | { path: string; inlined: true; content: string };
const stylesheets = new Map<string, CssFile[]>();
// And the fonts of `next/font` that each file uses, the way Next's build lists
// them in its manifest of fonts: the files to preload, of the fonts with
// `preload` on. An empty list for a file whose fonts all have it off, for
// which Next adds a `<link rel="preconnect">`, and nothing for one without
// fonts.
const fontFiles = new Map<string, string[]>();
export function setStylesheets(of: Stylesheets): void {
  for (const [file, entries] of Object.entries(of)) {
    stylesheets.set(
      file,
      entries.map(({ path, content }) =>
        content === undefined ? { path, inlined: false } : { path, inlined: true, content },
      ),
    );
    const fonts = entries.flatMap((entry) => entry.fonts ?? []);
    if (fonts.length === 0) fontFiles.delete(file);
    // As `NextFontManifestPlugin` picks them: a font to preload has `.p.`.
    else
      fontFiles.set(
        file,
        fonts.filter((font) => /\.p\.(?:woff|woff2|eot|ttf|otf)$/.test(font)),
      );
  }
}
// What Next's build writes to `next-font-manifest.json`. Without its flag for
// an app with a font whose fallback has adjusted metrics, which Next sets for
// a font of any route and says with a `<meta name="next-size-adjust">`: the
// fonts here are those of the routes requested so far, so a page would have
// it or not by the pages before it.
const nextFontManifest = {
  pages: {},
  app: new Proxy({} as Record<string, string[]>, {
    get: (_, key) => (typeof key === "string" ? fontFiles.get(key) : undefined),
    has: (_, key) => typeof key === "string" && fontFiles.has(key),
  }),
  appUsingSizeAdjust: false,
  pagesUsingSizeAdjust: false,
};

// Next's build writes a manifest of every client reference. For Vite RSC a
// reference is its module id, so this one answers for any id.
const clientReference = anyKey((id) => anyKey((name) => ({ id, name, chunks: [], async: true })));
const clientReferenceManifest = {
  moduleLoading: { prefix: "", crossOrigin: null },
  clientModules: anyKey((id) => ({ id, name: "*", chunks: [], async: true })),
  ssrModuleMapping: clientReference,
  rscModuleMapping: clientReference,
  entryCSSFiles: anyKey((file) => stylesheets.get(file) ?? []),
  entryJSFiles: anyKey(() => []),
};

const buildManifest = {
  polyfillFiles: [],
  // Next requires a script that starts the app and puts it in the HTML.
  // Nothing loads it: `renderServer()` starts the app.
  rootMainFiles: ["static/chunks/main-app.js"],
  devFiles: [],
  lowPriorityFiles: [],
  pages: {},
};

// Next's build lists the Server Actions of the app in a manifest. Here the
// server lists the ones a request calls, for that request: see ssr.ts.
let serverActions: object = {};
export function setServerActions(ids: Iterable<string>): void {
  serverActions = Object.fromEntries(
    Array.from(ids, (id) => [
      id,
      {
        workers: anyKey(() => ({ moduleId: actionModulePrefix + id, async: true })),
        layer: {},
      },
    ]),
  );
}

// What Next's build prerenders: in production, the routes that were
// requested, by its verdict on each (`recordRoute()`). The one object that
// Next's route module and the server's cache (cache.ts) read: a new one as
// a dynamic route comes or goes, since Next's route module of a page keeps
// what it matched by the object.
export let prerenderManifest: PrerenderManifest = {
  version: 4,
  routes: {},
  dynamicRoutes: {},
  notFoundRoutes: [],
  preview,
};

type Route = { kind: "page" | "route"; page: string; pathname: string };

/**
 * Lists what Next's build prerenders of a route, by its verdict: the entries
 * of the prerender manifest that Next's handler reads. With them the handler
 * prerenders a pathname at its first request, keeps it, and serves it from
 * then on, as `next start` serves what the build prerendered. Without the
 * `revalidate` the build writes: Next's cache reads it for a page the build
 * prerendered, and here every page is first prerendered by the handler,
 * which keeps the `revalidate` of the render with it.
 */
export function recordRoute(route: Route, verdict: PrerenderVerdict | undefined): void {
  if (!verdict) return;
  const { pathname: srcRoute, kind } = route;
  // A page has the RSC payload of its path, a route handler none:
  // `isRouteCacheOwner()` tells them apart by this.
  const dataRouteOf = (pathname: string) =>
    kind === "page" ? `${normalizePagePath(pathname)}${RSC_SUFFIX}` : null;
  for (const pathname of verdict.pathnames) {
    prerenderManifest.routes[pathname] = {
      srcRoute,
      dataRoute: dataRouteOf(pathname),
    } as PrerenderManifest["routes"][string];
  }
  if (verdict.fallback !== undefined) {
    prerenderManifest = {
      ...prerenderManifest,
      dynamicRoutes: {
        ...prerenderManifest.dynamicRoutes,
        [srcRoute]: {
          fallback: verdict.fallback,
          dataRoute: dataRouteOf(srcRoute),
        } as PrerenderManifest["dynamicRoutes"][string],
      },
    };
  }
}

// The pathnames whose page the build kept, by the generation of the
// server's cache (cache.ts): its first `set()`, which is the prerender that
// stands in for the build's. A later one is of a revalidation, which Next's
// handler keeps as `next start` keeps it.
const built = new Set<string>();
/** Forgets what the build kept, as the server's cache forgets its entries. */
export function forgetBuilt(): void {
  built.clear();
}

/**
 * A page as the build keeps it, which Next's handler is about to keep for
 * `pathname`, at the first prerender of that pathname in this `generation`
 * of the cache. The build keeps a page of a parallel route's slot without a
 * status (`export/routes/app-page.js:126-141`), which `next start` serves
 * with 200: a page whose other slots have no page for its path renders the
 * not-found page there, which a page load shows, and a navigation, which
 * keeps the other slots as they are, does not. Next's handler would keep
 * the status of its render, 404, and Next's router takes a navigation that
 * answers 404 for a page load. So the entry gets 200, in place: the handler
 * answers the request of its prerender with the status of the entry it
 * keeps, and otherwise with the one its render set. `route` is the source
 * of the entry, the page, as Next's response cache hands it to the cache.
 */
export function keptAsBuilt(
  pathname: string,
  value: { kind: string; status?: number } | null,
  { route }: { route?: { sourceRoute?: string } },
  generation: number,
): void {
  // `CachedRouteKind.APP_PAGE`, a `const enum` of Next's types.
  if (value?.kind !== "APP_PAGE" || !(pathname in prerenderManifest.routes)) return;
  const key = `${generation}:${pathname}`;
  if (built.has(key)) return;
  built.add(key);
  // As the export tells a page of a slot: by `@` in its page.
  if (value.status !== undefined && /\/@\w+/.test(route?.sourceRoute ?? "")) value.status = 200;
}

// The route that the request the server handles does not find in the
// manifest: see `withoutRoute()`.
let hidden: string | undefined;
/**
 * Hands Next's handler a manifest without `route` for `respond()`, the
 * response of a prefetch: Next reads the manifest as it starts a request.
 */
export async function withoutRoute<T>(route: Route, respond: () => Promise<T>): Promise<T> {
  const before = hidden;
  hidden = route.pathname;
  try {
    return await respond();
  } finally {
    hidden = before;
  }
}
// The manifest of the request the server handles.
function currentPrerenderManifest(): PrerenderManifest {
  const route = hidden;
  if (route === undefined || !isPrerendered({ kind: "page", page: "", pathname: route })) {
    return prerenderManifest;
  }
  const { [route]: _, ...dynamicRoutes } = prerenderManifest.dynamicRoutes;
  return {
    ...prerenderManifest,
    routes: Object.fromEntries(
      Object.entries(prerenderManifest.routes).filter(([, entry]) => entry.srcRoute !== route),
    ),
    dynamicRoutes,
  };
}

/** Whether the build prerenders a route, or a pathname of it. */
export function isPrerendered(route: Route): boolean {
  return (
    route.pathname in prerenderManifest.dynamicRoutes ||
    Object.values(prerenderManifest.routes).some((entry) => entry.srcRoute === route.pathname)
  );
}

/**
 * Takes a route out of what the build prerenders: for a render that read the
 * request, which the build would have found as it prerendered the route.
 * All of its pathnames: of a route with `generateStaticParams`, the build
 * keeps those that did not read it, and here the others are not rendered yet.
 */
export function demoteRoute(route: Route): void {
  for (const [pathname, entry] of Object.entries(prerenderManifest.routes)) {
    if (entry.srcRoute === route.pathname) delete prerenderManifest.routes[pathname];
  }
  if (route.pathname in prerenderManifest.dynamicRoutes) {
    const { [route.pathname]: _, ...dynamicRoutes } = prerenderManifest.dynamicRoutes;
    prerenderManifest = { ...prerenderManifest, dynamicRoutes };
  }
}

// The files of `.next/` that the route module of a page or a route handler
// reads, by the end of their path. What is not here is a file a build does not always write.
const manifests: [suffix: string, manifest: () => unknown][] = [
  // The one Next's build makes: see `routesManifest` in project.ts.
  ["routes-manifest.json", () => routesManifest],
  ["prerender-manifest.json", currentPrerenderManifest],
  ["preview-props.json", () => preview],
  ["fallback-build-manifest.json", () => ({})],
  ["build-manifest.json", () => buildManifest],
  ["next-font-manifest.json", () => nextFontManifest],
  [
    "_client-reference-manifest.js",
    () => ({ __RSC_MANIFEST: anyKey(() => clientReferenceManifest) }),
  ],
  [
    "server-reference-manifest.json",
    () => ({ node: serverActions, edge: serverActions, encryptionKey: "" }),
  ],
  ["required-server-files.json", () => ({ config: nextConfig })],
  ["BUILD_ID", () => routing.buildId],
];

/** A file of `.next/`, by its path, as Next's `loadManifest()` reads it. */
export function loadManifest(file: string): unknown {
  return manifests.find(([suffix]) => file.endsWith(suffix))?.[1]();
}

// The route of a node is none of the build's, and Next takes a page for
// prerendered by its page name, which the route of a node has from the app's
// route. So its route module reads the files of a directory of its own (ssr.ts),
// in which the build prerendered nothing.
export const nodeRouteDistDir = ".next/vitest-plugin-rsc-node";
const nothingPrerendered: PrerenderManifest = {
  ...prerenderManifest,
  routes: {},
  dynamicRoutes: {},
};

registry.node = {
  loadManifest,
  evalManifest: loadManifest,
  loadManifestFromRelativePath: ({ manifest, distDir }: { manifest: string; distDir: string }) =>
    distDir === nodeRouteDistDir && manifest === "prerender-manifest.json"
      ? nothingPrerendered
      : loadManifest(manifest),
  evalManifestFromRelativePath: ({ manifest }: { manifest: string }) => loadManifest(manifest),
};
