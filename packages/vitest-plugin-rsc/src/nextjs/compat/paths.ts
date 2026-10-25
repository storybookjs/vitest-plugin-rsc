import type { NextLayer } from "../project.ts";

// The modules of Next that the plugin names by their path, as a string: what
// it pre-bundles, stands in for, compiles, aliases and generates imports of.
// The ones it imports itself are the other modules of this directory.

/** The function a `"use cache"` function is compiled to call: see use-cache.ts. */
export const cacheWrapper = "next/dist/build/webpack/loaders/next-flight-loader/cache-wrapper";

/**
 * What the modules of this package import of Next in each layer, the modules
 * of compat/rsc, compat/ssr, compat/server and compat/browser, and what the
 * code that Vite and Vite RSC generate imports: plugin.ts pre-bundles them.
 * Not what only `build: "production"` loads: `prerenderImports`.
 */
export const runtimeImports: Record<NextLayer, string[]> = {
  rsc: [
    "next/dist/server/route-kind",
    cacheWrapper,
    // server/headers.ts
    "next/dist/server/lib/server-ipc/utils",
    "next/dist/server/web/utils",
    // rsc/handlers.ts
    "next/dist/shared/lib/no-fallback-error.external",
  ],
  ssr: [
    // ssr/handler.ts
    "next/dist/server/route-modules/app-page/module",
    // ssr/cache.ts
    "next/dist/server/lib/incremental-cache",
    "next/dist/server/lib/incremental-cache/tags-manifest.external",
    "next/dist/server/lib/node-fs-methods",
    "next/dist/server/use-cache/handlers",
    // ssr/cache.ts and ssr/build-output.ts
    "next/dist/lib/constants",
    "next/dist/shared/lib/page-path/normalize-page-path",
    // ssr/handler.ts, for what the server in front of the app routes to it
    "next/dist/client/components/app-router-headers",
    "next/dist/server/lib/server-action-request-meta",
    "next/dist/server/lib/is-rsc-request",
    "next/dist/shared/lib/router/utils/route-matcher",
    "next/dist/shared/lib/router/utils/route-regex",
    // server/headers.ts
    "next/dist/server/lib/server-ipc/utils",
    // ssr/node-server.ts
    "next/dist/server/lib/mock-request",
    "next/dist/client/components/hooks-server-context",
    // ssr/node-server.ts, ssr/handler.ts and server/headers.ts
    "next/dist/server/web/utils",
    // ssr/render-errors.ts
    "next/dist/client/components/http-access-fallback/http-access-fallback",
    "next/dist/client/components/redirect",
    "next/dist/client/components/redirect-error",
  ],
  browser: [
    // browser/client.ts
    "next/dist/client/app-bootstrap",
    "next/dist/client/app-call-server",
    "next/dist/client/app-index",
    // browser/client.ts, for a page of a kept app: `renderAgain()` of client.tsx
    "next/dist/client/components/app-router",
    "next/dist/client/components/app-router-instance",
    "next/dist/client/components/router-reducer/create-initial-router-state",
    "next/dist/client/components/segment-cache/bfcache",
    "next/dist/client/components/segment-cache/cache",
    "next/dist/shared/lib/head-manager-context.shared-runtime",
  ],
};

/**
 * What rsc/prerender.ts imports, for the build's verdict on which pathnames
 * of a route it prerenders: in the rsc layer, and only with
 * `build: "production"`, the one run that loads it.
 */
export const prerenderImports = [
  "next/dist/build/segment-config/app/app-segments",
  "next/dist/build/segment-config/app/collect-root-param-keys",
  "next/dist/build/static-paths/app",
  "next/dist/lib/fallback",
  "next/dist/lib/is-edge-runtime",
  "next/dist/lib/metadata/is-metadata-route",
  "next/dist/server/route-modules/app-route/helpers/is-static-gen-enabled",
  "next/dist/shared/lib/router/routes/app",
];

/** The module whose functions the shim of plugin.ts replaces, for Vite RSC's ids. */
export const serverReferenceInfo = "next/dist/esm/shared/lib/server-reference-info.js";

/** The module of the asset prefix of Next's dev server, which plugin.ts gives none. */
export const devAssetPrefix =
  /^next\/dist\/(esm\/)?client\/dev\/hot-reloader\/app\/asset-prefix(\.js)?$/;

/** Next's runtime of a page, which the entry of a page imports: see project/entries.ts. */
export const appPageRuntime = "next/dist/build/templates/app-page-runtime";

/** Next's own boundaries, which the route of a node has at its root: see compat/checks.ts. */
export const builtinBoundary = (name: string) => `next/dist/client/components/builtin/${name}.js`;

/** The loader of a font of `next/font`, `google` or `local`. */
export const fontLoaderPath = (name: string) => `next/dist/compiled/@next/font/${name}/loader`;

/**
 * React's Flight server, of the React that Next ships: the build for
 * development and the one for production, of React and of its experimental
 * channel. By the file.
 */
export const vendoredFlightServer =
  /\/next\/dist\/compiled\/react-server-dom-webpack(?:-experimental)?\/cjs\/react-server-dom-webpack-server\.edge\.\w+\.js$/;

// The modules of Next's server whose async functions are compiled to keep
// their stores across an `await` (async-local-storage-transform.ts), as the
// source files of the app are: the ones that await inside a store, one they
// entered or left with `exit()`, or the request's own, and read it after the
// `await`, as on Node.js. One entry per module of `next/dist/server/`, with
// the layer it is a module of and the store it carries. Each server layer's
// optimizer compiles its own, once, and keeps them in its cache. A static
// build does the same. See server-code.ts.
export const nextModulesWithStores: { layer: "rsc" | "ssr"; module: string }[] = [
  // The store of a `"use cache"` function: it enters the scope and awaits
  // before it has React call the function.
  { layer: "rsc", module: "use-cache/use-cache-wrapper.js" },
  // The handler of a Server Action, through `app-page/module`: it enters the
  // action's store, `actionAsyncStorage`, awaits the action, and renders the
  // page after it in an `exit()` of that store, which it awaits. After each
  // `await` it has its own request's stores back: not those of a request
  // that the action made to the app and that is still at work, as one with
  // `after()` is, and not the store it left.
  { layer: "ssr", module: "app-render/action-handler.js" },
  // The render, through `app-page/module`, with the request stores of a
  // page, `workAsyncStorage` and `workUnitAsyncStorage`: it awaits the
  // handler of an action, and its own work, before it starts React's.
  { layer: "ssr", module: "app-render/app-render.js" },
];

/** A module of `nextModulesWithStores`, in Next's ESM build. */
export const withStoresId = (module: string) => `next/dist/esm/server/${module}`;

/** The modules of `nextModulesWithStores` by their file, of either build of Next's server. */
export const withStoresFiles = (modules: string[]) =>
  new RegExp(
    `/next/dist/(?:esm/)?server/(?:${modules.map((module) => module.replaceAll(".", "\\.")).join("|")})$`,
  );

/**
 * The modules of Next's Node.js server that node-platform.ts stands in for,
 * by the name of the stand-in: each by its path in `next/dist`, without
 * `esm/` and `.js`. compat/checks.ts checks that each is a file of the
 * installed Next; an export its stand-in has not gets a stub.
 */
export const nodePlatformModules: Record<string, string[]> = {
  "react-server-node": ["server/app-render/react-server.node"],
  "load-manifest": ["server/load-manifest.external"],
  "node-environment": [
    "server/node-environment",
    ...[
      "error-inspect",
      "console-file",
      "console-exit",
      "console-dim.external",
      "unhandled-rejection.external",
      "random",
      "date",
      "web-crypto",
      "node-crypto",
      "process-error-handlers",
    ].map((name) => `server/node-environment-extensions/${name}`),
    // What sets up a Node.js process for Next: the patches above, a hook on
    // `require`, a `crypto` global.
    "build/adapter/setup-node-env.external",
  ],
  "fast-set-immediate": ["server/node-environment-extensions/fast-set-immediate.external"],
  "gzip-size": ["compiled/gzip-size"],
  "vendored-react": [
    "server/route-modules/app-page/vendored/rsc/entrypoints",
    "server/route-modules/app-page/vendored/ssr/entrypoints",
  ],
};

/**
 * The module of `nodePlatformModules` a specifier is of: of either build of
 * Next, with or without `.js`, or `/index.js` for a directory.
 */
export function nodePlatformModuleOf(specifier: string): string | undefined {
  return /^next\/dist\/(?:esm\/)?(.+?)(?:\/index)?(?:\.js)?$/.exec(specifier)?.[1];
}

/**
 * The module of Next's server that loads the app's `instrumentation.ts`, by
 * its path in `next/dist`: see node-platform.ts.
 */
export const instrumentationModule = "server/lib/router-utils/instrumentation-globals.external";

/**
 * What project/layers.ts adds to the alias tables of Next, as Next's build
 * for Node.js and its module rules have it.
 */
export const aliasPaths = {
  openTelemetry: "next/dist/compiled/@opentelemetry/api",
  /** Next's polyfill of a module of Node.js. */
  polyfill: (name: string) => `next/dist/compiled/${name}`,
  /** The route module of a kind, which Next's bundle for Node.js has as `module.compiled`. */
  routeModule: (kind: string) => `next/dist/server/route-modules/${kind}/module`,
  /** Next's own module for `react-dom/server`, of React's channel. */
  reactDomServer: (channel: string) =>
    `next/dist/build/webpack/alias/react-dom-server${channel}.js`,
  /** React's server renderer for web streams, of its channel and its build. */
  reactDomServerEdge: (channel: string, build: string) =>
    `next/dist/compiled/react-dom${channel}/cjs/react-dom-server.edge.${build}.js`,
  /** The contexts of Next's `*.shared-runtime` modules, of the bundle of its server. */
  vendoredContexts: "next/dist/server/route-modules/app-page/vendored/contexts",
  sharedRuntime: (name: string) => `next/dist/shared/lib/${name}.shared-runtime`,
};
