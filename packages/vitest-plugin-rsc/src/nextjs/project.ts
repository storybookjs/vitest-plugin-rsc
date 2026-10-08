import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResolveRoutesParams } from "@next/routing";
import type { RoutesManifest } from "next/dist/build/index.js";
import type { FlightEntry } from "./flight.ts";
import { openNextProject } from "./project/context.ts";
import { routeEntries } from "./project/entries.ts";
import { layerTables } from "./project/layers.ts";
import { createLoaders } from "./project/loaders.ts";
import { discoverAppRoutes } from "./project/routes.ts";
import { buildRouting, findMiddleware } from "./project/routing.ts";
import { checkRuntime } from "./project/runtime.ts";
import { createCompiler } from "./project/transform.ts";

// The one place that calls the build code of the project's own `next`: this
// file, and the ones in `project/`. The routes, the route entries, the
// compile-time constants and the alias tables are what `next build` computes.
// What the plugin assumes about them, and about the runtime it runs them on,
// is checked here, so that another Next fails when a run starts, with its
// version and what changed.

/** The layers Next compiles an App Router app into, each with its own React. */
export type NextLayer = "rsc" | "ssr" | "browser";

export type NextRoute = {
  /** What serves the route: a `page.tsx` with its layouts, or a `route.ts`. */
  kind: "page" | "route";
  /** App page name, e.g. `/notes/[id]/page` or `/api/notes/[id]/route`. */
  page: string;
  /** Routable pathname, e.g. `/notes/[id]`. */
  pathname: string;
  /** `private-next-app-dir/...`, or an absolute path for Next's builtin pages. */
  pagePath: string;
  /** The pages of the route: `page`, and those of its parallel routes. */
  appPaths: string[];
};

/** A route of a node, see `NextProject.componentRoutes`. */
export type ComponentRoute = {
  kind: "page";
  /**
   * Its page name, e.g. `/notes/[id]/page`, from which Next takes its params
   * and the tags of its path. `revalidatePath("/notes/[id]", "page")` expires
   * the cached reads with those tags. A page of the app can have the same
   * name.
   */
  page: string;
  /** Routable pathname, e.g. `/notes/[id]`. */
  pathname: string;
  /** What its modules are listed by, which no page of the app has as its name. */
  component: string;
  /**
   * With the layouts of the app's route `page`: the node is the page of that
   * route, in its layouts and with its `loading`, `error` and `not-found`.
   */
  layouts?: true;
};

/**
 * What the server in front of the app goes by: the routes that Next's build
 * hands a deployment adapter, as `resolveRoutes()` of `@next/routing` takes
 * them.
 */
export type NextRouting = Pick<ResolveRoutesParams, "routes" | "basePath" | "buildId"> & {
  /**
   * What the build has to answer a request with, by the pathname Next serves
   * it at, like `/notes/[id]`: the page name of its route.
   */
  outputs: Record<string, string>;
  /**
   * The routes of the app alone, without the server in front of it: no
   * redirect, rewrite or header of `next.config`, and no middleware. What is
   * left is Next's own: the routes of the app, its interception routes, and
   * the headers it adds once it has a route.
   */
  appRoutes: ResolveRoutesParams["routes"];
};

export type NextProject = {
  root: string;
  appDir: string;
  /** Directory of the installed `next` package. */
  nextDir: string;
  /** Version of the installed `next` package. */
  version: string;
  routes: NextRoute[];
  /**
   * The routes `renderServer(<Node />, { url })` renders a node in: one for
   * each pathname of the app, so that a URL has the params of the app's route,
   * and one for `/`, for a node without a url or with a URL of no route.
   */
  componentRoutes: ComponentRoute[];
  /** The metadata files of the app, like `app/icon.png`, which are not served yet. */
  metadataFiles: string[];
  /** The route files of the app that ask for Next's edge runtime, which they do not get. */
  edgeRouteFiles: string[];
  /**
   * The dynamic routes that `resolveRoutes()` does not find for a request: the
   * ones under a folder with a name that a URL percent-encodes.
   */
  unmatchedRoutes: string[];
  /** The `proxy.ts` of the app, or its `middleware.ts`: its file, if it has one. */
  middlewareFile: string | undefined;
  /** What the server does with a request before a route gets it. */
  routing: NextRouting;
  /** What a build writes to `.next/routes-manifest.json`, which Next's route module reads. */
  routesManifest: RoutesManifest;
  /** The keys of draft mode, which a build makes and writes to `.next/`. */
  preview: {
    previewModeId: string;
    previewModeSigningKey: string;
    previewModeEncryptionKey: string;
  };
  /**
   * The `paths` of the app's tsconfig or jsconfig, as Next's build reads
   * them, and the directory they are from. Nothing for an app without either.
   */
  paths:
    | { baseUrl: string; explicitBaseUrl: boolean; patterns: Record<string, string[]> }
    | undefined;
  /** The resolved `next.config`, as far as it serializes. */
  config: Record<string, unknown>;
  /** Next's compile-time constants per layer, as code strings. */
  defines: Record<NextLayer, Record<string, string>>;
  /** Next's compiler aliases per layer, in webpack's notation: `$` ends an exact match. */
  aliases: Record<NextLayer, Record<string, string | false>>;
  /**
   * The exports of each entry of the Flight codec that the rsc layer imports
   * as `react-server-dom-webpack/<entry>`.
   */
  flightExports: Record<FlightEntry, string[]>;
  /**
   * The rsc-layer module of a route, from Next's app loader, with this
   * package's runtime where Next's code names its bundler. For a page: its
   * loader tree and `entry-base`. For a route handler: its route module.
   *
   * For a route of a node: Next's page template around a loader tree that has
   * the segments of the pathname, and the node as its page. Nothing of the app.
   */
  loadRouteEntry(
    route: NextRoute | ComponentRoute,
  ): Promise<{ code: string; watchFiles: string[] }>;
  /**
   * Next's request handler of the middleware: its template around the file.
   * Nothing for an app without one.
   */
  loadMiddlewareEntry(): Promise<string | undefined>;
  /**
   * Next's SWC transform of a module of the app, for a layer. Nothing for a
   * client module in the rsc layer: Vite RSC turns it into references.
   */
  compile(code: string, file: string, layer: NextLayer): Promise<Compiled | undefined>;
  /** Whether Next's build imports a file as an image: `next-image-loader`. */
  isImage(file: string): boolean;
  /** The module of an image: what `next-image-loader` makes of the file. */
  loadImage(file: string): Promise<string>;
  /**
   * A call of a `next/font` function, by the import the SWC transform turns it
   * into: the CSS of the font, and what the call returns.
   */
  loadFont(request: string): Promise<{ css: string; exports: Record<string, unknown> }>;
  /** A file the loaders emitted for the browser, by the path the browser asks for. */
  readEmittedFile(pathname: string): { body: Buffer; contentType: string } | undefined;
  /**
   * Answers a request for `/_next/image` with Next's image optimizer, as
   * `next start` does, and resolves with whether it was one. `serveFile`
   * answers the request for an image of the app.
   */
  optimizeImage(
    request: IncomingMessage,
    response: ServerResponse,
    serveFile: ServeFile,
  ): Promise<boolean>;
};

export type Compiled = { code: string; map?: string };

/** Answers a request the way the server does: what Next calls for an image of the app. */
export type ServeFile = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

// The adapter that Next's build hands the routes to: see adapter.ts. Found
// from this file, which is next to it in the source and in the built package.
const adapterPath = fileURLToPath(
  new URL(`./adapter${path.extname(import.meta.url)}`, import.meta.url),
);

export async function loadNextProject(
  root: string,
  projectRequire: NodeJS.Require = createRequire(path.join(root, "package.json")),
): Promise<NextProject> {
  // The project, its `next.config`, and the build code of its `next`.
  const context = await openNextProject(root, projectRequire);
  // The app: its routes, its middleware, and the server in front of them.
  const app = await discoverAppRoutes(context);
  const middleware = await findMiddleware(context);
  const { routing, routesManifest, unmatchedRoutes } = await buildRouting(
    context,
    app,
    middleware,
    adapterPath,
  );
  // What the modules of this package in the browser assume of Next's runtime.
  const { builtinBoundaries } = checkRuntime(context);
  // What Next's build gives each layer, and its compiler and loaders for the
  // files of the app.
  const layers = await layerTables(context);
  const compiler = await createCompiler(context);
  const { runLoader, ...loaders } = createLoaders(context);

  return {
    root,
    appDir: context.appDir,
    nextDir: context.nextDir,
    version: context.version,
    routes: app.routes,
    metadataFiles: app.metadataFiles,
    edgeRouteFiles: app.edgeRouteFiles,
    unmatchedRoutes,
    middlewareFile: middleware.middlewareFile,
    routing,
    routesManifest,
    preview: context.previewProps,
    config: JSON.parse(JSON.stringify(context.config)),
    ...layers,
    ...routeEntries(context, app, middleware, builtinBoundaries, runLoader),
    ...compiler,
    ...loaders,
  };
}
