import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResolveRoutesParams } from "@next/routing";
import type { RoutesManifest } from "next/dist/build/index.js";
import type { NextBuild } from "./build.ts";
import type { FlightEntry } from "./flight.ts";
import { openNextProject } from "./project/context.ts";
import type { PageEnv } from "./project/env.ts";
import { routeEntries } from "./project/entries.ts";
import { layerTables } from "./project/layers.ts";
import { createLoaders } from "./project/loaders.ts";
import { createMetadataLoaders } from "./project/metadata.ts";
import { discoverAppRoutes } from "./project/routes.ts";
import { buildRouting, findMiddleware } from "./project/routing.ts";
import { checkRuntime } from "./project/runtime.ts";
import { createCompiler } from "./project/transform.ts";
import { createWebpackRules, type WebpackRule } from "./project/webpack.ts";

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
  /** What the page's `process.env` gets: see project/env.ts. */
  env: PageEnv;
  /** The env again, after a change of an env file. */
  loadEnv: () => Promise<PageEnv>;
  /** The resolved `next.config`, as far as it serializes. */
  config: Record<string, unknown>;
  /** Next's compile-time constants per layer, as code strings. */
  defines: Record<NextLayer, Record<string, string>>;
  /** Next's compiler aliases per layer, in webpack's notation: `$` ends an exact match. */
  aliases: Record<NextLayer, Record<string, string | false>>;
  /**
   * Entries that the app's code, and not Next's own files, gets in place of
   * those of `aliases`: React's for Node.js. Exact matches, `$`.
   */
  appAliases: Record<NextLayer, Record<string, string>>;
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
  loadRouteEntry(route: NextRoute | ComponentRoute): Promise<{
    code: string;
    watchFiles: string[];
    /**
     * The files of the segments of a page route, as its entry imports them:
     * its layouts, pages and boundaries. Not the node of the route of a node,
     * which is no file: its name in the loader tree is `componentPagePath`.
     */
    segments: RouteSegment[];
  }>;
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
  /**
   * The options of that transform for a dependency of a layer, like a package
   * that calls `next/font`: from `next.config` and the app's tsconfig. For the
   * key of the optimizer's cache, which compiles such a package.
   */
  dependencyCompileOptions: Record<NextLayer, unknown>;
  /**
   * The rule of the `webpack` function in `next.config` for a file, like the
   * one of `@next/mdx` for an `.mdx` file: see project/webpack.ts.
   */
  webpackRuleOf(file: string, layer: NextLayer): WebpackRule | undefined;
  /** What the loaders of that rule make of the file. Nothing for a file without one. */
  loadWithWebpackRule(file: string, layer: NextLayer): Promise<string | undefined>;
  /** The candidates of an alias of the `webpack` function for an import, in order. */
  webpackAliasOf(source: string, layer: NextLayer): string[] | undefined;
  /** The packages among those candidates, to pre-bundle. */
  webpackPackages: Record<NextLayer, string[]>;
  /** What of the `webpack` function does not apply, to say when a run starts. */
  webpackDifferences: string[];
  /**
   * Whether an import is Next's inline request for one of its metadata
   * loaders, which its app loader asks for a metadata file of the app with.
   */
  isMetadataRequest(source: string): boolean;
  /**
   * What a metadata loader makes of a file: for a page, the data of an image
   * it links in its head, like `icon.png`; for a route, its route module.
   */
  loadMetadata(request: string): Promise<{ code: string; watchFiles: string[] }>;
  /**
   * The query with which the module of a generated image, like `icon.tsx`,
   * is imported for what it says of the image: its `size`, `alt`,
   * `contentType` and `generateImageMetadata`.
   */
  metadataImageMeta: string;
  /** Whether Next's build imports a file as an image: `next-image-loader`. */
  isImage(file: string): boolean;
  /** The module of an image: what `next-image-loader` makes of the file. */
  loadImage(file: string): Promise<string>;
  /**
   * A call of a `next/font` function, by the import the SWC transform turns it
   * into: the CSS of the font, what the call returns, and its font files,
   * under `/_next/` (`static/media/…`). Next preloads a file whose name has
   * `.p.`, which the loader gives it for a font with `preload` on.
   */
  loadFont(
    request: string,
  ): Promise<{ css: string; exports: Record<string, unknown>; files: string[] }>;
  /**
   * What Next's rules for CSS decide that is not bundling: its PostCSS
   * plugins and the class names of a CSS module, as Vite's options.
   */
  loadCssOptions(): Promise<{
    options: import("vite").CSSOptions;
    /** What is done otherwise than Next's build does it, to say when a run starts. */
    differences: string[];
  }>;
  /**
   * Where the browser asks for the files of the app: `/_next/`, after an
   * asset prefix that is a path.
   */
  assetPath: string;
  /** A file the loaders emitted for the browser, by the path the browser asks for. */
  readEmittedFile(pathname: string): { body: Buffer; contentType: string } | undefined;
  /** The files the loaders have emitted so far, for a static build to write. */
  emittedFiles(): { pathname: string; body: Buffer }[];
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
  /** The module that Next's build makes of `next/root-params`, for the app. */
  loadRootParams(): Promise<string>;
};

/** A file of a segment of a page route: see `loadRouteEntry()`. */
export type RouteSegment = {
  /** The file, by its absolute path, which the entry imports. */
  file: string;
  /**
   * What Next looks up the stylesheets of the segment by: the name the loader
   * tree has for the file, without its extension. The name is the path from
   * the root of the project, the same on every machine and with a dev server
   * or a build: see `nameInLoaderTree()` in project/entries.ts.
   */
  stylesheetsKey: string;
};

/**
 * What Next's compiler makes of a module. `refused` where it stops at the
 * module, as `next build` does, like a client hook in a Server Component:
 * then the code throws Next's error.
 */
export type Compiled = { code: string; map?: string; refused?: true };

/** Answers a request the way the server does: what Next calls for an image of the app. */
export type ServeFile = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

// The adapter that Next's build hands the routes to: see adapter.ts. Found
// from this file, which is next to it in the source and in the built package.
const adapterPath = fileURLToPath(
  new URL(`./adapter${path.extname(import.meta.url)}`, import.meta.url),
);
// The thread that parses the env files: see project/env.ts. Found from this
// file, like the adapter.
const envWorker = fileURLToPath(
  new URL(`./project/env-worker${path.extname(import.meta.url)}`, import.meta.url),
);

export type NextProjectOptions = {
  /** The code that Next's runtime and React run: see build.ts. */
  build?: NextBuild;
  /**
   * For a static build, which has no server next to the browser: what the server
   * outside the browser does, the app does without. That is Next's image
   * optimizer, so `next/image` asks for the image itself.
   */
  static?: boolean;
};

export async function loadNextProject(
  root: string,
  projectRequire: NodeJS.Require = createRequire(path.join(root, "package.json")),
  { build = "development", static: isStatic = false }: NextProjectOptions = {},
): Promise<NextProject> {
  // The project, its `next.config`, and the build code of its `next`.
  const context = await openNextProject(root, projectRequire, { static: isStatic, envWorker });
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
  const layers = await layerTables(context, build);
  const compiler = await createCompiler(context);
  const { runLoader, ...loaders } = createLoaders(context, build);

  return {
    root,
    appDir: context.appDir,
    nextDir: context.nextDir,
    version: context.version,
    routes: app.routes,
    edgeRouteFiles: app.edgeRouteFiles,
    unmatchedRoutes,
    middlewareFile: middleware.middlewareFile,
    routing,
    routesManifest,
    preview: context.previewProps,
    env: context.env,
    loadEnv: context.loadEnv,
    // With the page's values of `env`: the config is evaluated in the host,
    // whose value of a name of the env files is not the page's.
    config: JSON.parse(
      JSON.stringify({
        ...context.config,
        env: Object.fromEntries(
          Object.keys(context.config.env).map((name) => [name, context.env.values[name]]),
        ),
      }),
    ),
    ...layers,
    ...routeEntries(context, app, middleware, builtinBoundaries, runLoader),
    ...compiler,
    ...loaders,
    ...createWebpackRules(context, runLoader),
    ...createMetadataLoaders(context, runLoader),
  };
}
