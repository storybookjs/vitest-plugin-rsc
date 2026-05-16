# Next App Router Fidelity Architecture

Source of truth: Next.js `v16.2.6`
(`ee6e79b1792a4d401ddf2480f40a83549fe8e722`), installed
`next@16.2.6`, and installed `@next/routing@16.2.6`.

This document describes how Next's App Router pipeline is structured, then how
`vitest-plugin-rsc` should map that pipeline onto Vite, Vitest, and
`@vitejs/plugin-rsc`.

## Core Model

Next is not one runtime function. It is a pipeline with strict phase ownership:

```text
next.config
  -> app route discovery
  -> loader tree and source transforms
  -> routes-manifest
  -> adapter routing data
  -> request routing
  -> app page or app route invocation
  -> RSC render and client navigation
```

The plugin must mirror that phase split. If Next does something during build or
dev-server setup, we do it in the Vite plugin or virtual-module generation
layer. If Next does something per request, we call the matching request runtime
module. Browser-facing test helpers must not construct Next build artifacts.

## Next's Pipeline

### 1. Project Config

Next first loads and normalizes project config.

Source files:

- [`packages/next/src/server/config.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/server/config.ts)
- [`packages/next/src/lib/load-custom-routes.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/lib/load-custom-routes.ts)
- [`packages/next/src/lib/find-pages-dir.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/lib/find-pages-dir.ts)
- [`packages/next/src/build/load-jsconfig.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/load-jsconfig.ts)

Output: normalized config, app/pages dirs, page extensions, ts/js config,
image config, custom headers, redirects, rewrites, and internal routes such as
trailing-slash redirects.

Plugin rule: use installed `next/dist/...` modules through the user's project
root. Do not duplicate config normalization.

### 2. App Route Discovery

Next discovers App Router pages and route handlers before request runtime.

Source files:

- [`dev-app-page-route-matcher-provider.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts)
- [`dev-app-route-route-matcher-provider.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts)
- [`default-file-reader.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.ts)

Output: route pathname, app path, source filename, route groups, catch-all
shape, and route-handler pathnames.

Plugin rule: these providers are the source of truth for route existence and
normalization. Do not guess app paths locally for real discovered routes.

### 3. Loader Tree And Transforms

Next turns a page route into a loader tree and applies compiler/loader
semantics.

Source files:

- [`next-app-loader/index.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/webpack/loaders/next-app-loader/index.ts)
- [`entries.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/entries.ts)
- [`swc/options.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/swc/options.ts)
- [`next-font-loader`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/webpack/loaders/next-font-loader/index.ts)
- [`image-loader.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/shared/lib/image-loader.ts)

Output: loader tree, transformed source behavior, Next aliases/defines, font
metadata, image metadata, metadata routes, and runtime bootstrap expectations.

Plugin rule: invoke Next loaders/transforms from Vite plugin hooks where
possible. Any copied option shape needs `Begin copy` / `End copy`, exact source
links, and an adaptation note.

### 4. Routes Manifest And Adapter Routing Data

Next builds a route manifest, then converts it into adapter routing data.
This is still build/dev-server setup work, not browser request runtime work.

Source files:

- [`generate-routes-manifest.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/generate-routes-manifest.ts)
- [`build-complete.ts` routing block](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/adapter/build-complete.ts#L1928-L2185)
- [`redirect-status.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/lib/redirect-status.ts)
- [`route-regex.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/shared/lib/router/utils/route-regex.ts)
- `next/dist/compiled/@vercel/routing-utils/superstatic.js`

Output: data shaped for request routing: route pathnames, custom route regexes,
headers, redirects, rewrites by phase, dynamic route regexes, route-key query
params, `basePath`, i18n, build id, data route behavior, and on-match headers.

Important Next detail: `build-complete.ts` normalizes adapter outputs with
`basePath`, prefixes dynamic route `sourceRegex` and `destination` with
`basePath`, and then passes this data to the adapter's `onBuildComplete()`.

Plugin rule: build this data in the Vite plugin or virtual route manifest
module. Runtime request code should receive serialized routing data and should
not import `next/dist/build/*`, `load-custom-routes`, `build-custom-route`, or
`@vercel/routing-utils`.

### 5. Request Routing

Next resolves a concrete request URL through the routing phases.

Source files:

- [`packages/next-routing/src/resolve-routes.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next-routing/src/resolve-routes.ts)
- [`packages/next-routing/src/types.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next-routing/src/types.ts)

Input: request URL, headers, request body, `buildId`, `basePath`, i18n,
pathnames, and route phase data.

Output: redirect, external rewrite, resolved pathname, invocation target,
resolved query, resolved headers, status, and route matches.

Plugin rule: `request-router.ts` should be a thin adapter around
`@next/routing.resolveRoutes()`. It may map the result to our test harness
target union and use Next request-time matcher utilities to recover concrete
params. It must not build custom routes or dynamic adapter routes for real app
routes.

### 6. App Page And App Route Invocation

After routing, Next invokes either an App Page route module or an App Route
route module.

Source files:

- [`build/templates/app-page.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/templates/app-page.ts)
- [`server/route-modules/app-page/module.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/server/route-modules/app-page/module.ts)
- [`server/app-render/app-render.tsx`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/server/app-render/app-render.tsx)
- [`build/templates/app-route.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/templates/app-route.ts)
- [`server/route-modules/app-route/module.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/server/route-modules/app-route/module.ts)

App pages go through `AppPageRouteModule.render()`, which delegates to
`renderToHTMLOrFlight()`. App route handlers go through
`AppRouteRouteModule.handle()`.

Plugin rule: request routing, app page rendering, and route handler invocation
are separate layers. If route handlers are supported, use
`AppRouteRouteModule.handle()`. Do not invoke route handlers through page render
glue. If `AppPageRouteModule` is retried, keep it server-only and import
`next/dist/server/node-environment-baseline` before server route modules.

### 7. RSC Graph And Browser Runtime

In real Next, webpack or Turbopack owns the RSC graph and manifests. In this
plugin, Vite owns the module graph and `@vitejs/plugin-rsc` owns RSC semantics.

Sources we mirror or depend on:

- [`@vitejs/plugin-rsc`](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc)
- [`webpack-config.ts` runtime polyfill precedent](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/build/webpack-config.ts#L2020-L2044)
- [`node-environment-baseline.ts`](https://github.com/vercel/next.js/blob/v16.2.6/packages/next/src/server/node-environment-baseline.ts)
- [`vite optimizer scan.ts`](https://github.com/vitejs/vite/blob/main/packages/vite/src/node/optimizer/scan.ts)

Plugin rule: do not create a webpack/Turbopack RSC graph, layer graph, or
manifest graph. Keep `"use client"`, `"use server"`, client references, server
references, Server Action transport, browser/server graph separation, and HMR
websocket updates in `@vitejs/plugin-rsc`.

## Plugin Mapping

```text
Next build/dev-server setup
  -> src/nextjs/config.ts
  -> src/nextjs/route-manifest-plugin.ts
  -> src/nextjs/plugin/routing-data.ts
  -> virtual:vitest-plugin-rsc/next-routes

Next request runtime
  -> src/nextjs/next-routing.ts
  -> src/nextjs/request-router.ts

Next app invocation
  -> src/nextjs/app-render.ts
  -> future app-route-invoker.ts if route handler URLs are supported

Vite RSC graph
  -> @vitejs/plugin-rsc
  -> small manifest/runtime bridges only where Next runtime needs data
```

Forbidden runtime imports:

- `next/dist/build/*`
- `next/dist/lib/load-custom-routes`
- `next/dist/lib/build-custom-route`
- `next/dist/compiled/@vercel/routing-utils`

## Already Good

- Config loading delegates to installed Next modules.
- Route discovery uses real Next dev matcher providers.
- Loader trees come from real `next-app-loader`.
- App rendering calls Next `renderToHTMLOrFlight()`, so we are not writing a
  full renderer.
- RSC graph ownership stays with `@vitejs/plugin-rsc`.
- `@next/routing` is now the right request-router direction.
- Raw custom routes are moving out of the browser runtime contract.
- Direct ReactNode rendering is being split away from real request routing.

## Must Change

- The routing-data contract should include the request routing fields Next uses:
  `buildId`, `basePath`, i18n, pathnames, and routes. Do not hardcode
  `basePath: ""` in request runtime if `next.config.basePath` is supported.
- Plugin routing data must mirror Next's `build-complete.ts` adapter data shape,
  including basePath/pathname consistency, or explicitly document unsupported
  cases with tests.
- `request-router.ts` should stay a thin `resolveRoutes()` adapter. It should
  not create build-time route data.
- Synthetic direct-render routing belongs only in direct-render helper code.
- Optimizer entries must not scan all `app/**/*` files. Preserve Vitest browser
  setup entries for hidden RSC client environments and explicitly include only
  CJS/Next internals that need prebundling.
- Manifest bridge code should move into dedicated modules and source-link the
  Next manifest shape it mirrors.

## Review Checklist

- Does this code run in the same phase where Next runs the behavior?
- Does it call installed Next code when that code is importable?
- If it copies Next behavior, does it have Begin/End copy markers, exact
  `v16.2.6` links, and an adaptation note?
- Does browser/request runtime avoid Next build-only imports?
- Does app page rendering stay separate from request routing?
- Are route handlers either real `AppRouteRouteModule.handle()` or explicitly
  unsupported?
- Do tests cover user-visible behavior and adapter boundaries, not just local
  helper shapes?
