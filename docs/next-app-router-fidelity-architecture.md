# Next App Router Fidelity Architecture

Source of truth: Next.js `v16.2.6`
(`ee6e79b1792a4d401ddf2480f40a83549fe8e722`), installed
`next@16.2.6`, and installed `@next/routing@16.2.6`.

This document is the high-level map for the `vitest-plugin-rsc/nextjs`
adapter. It explains the planes of the system, how data moves between them,
which local modules belong together, and where we should import Next internals
instead of imitating them.

## The Big Picture

The adapter is not one Next server. It is five connected planes:

1. Vite/RSC environment setup.
2. Next build-time artifacts.
3. Next webpack/compiler feature adapters.
4. Request and render runtime.
5. Browser runtime, hydration, and transport.

Each plane owns a different kind of work. Most architecture mistakes happen
when a module does work from the wrong plane, such as building custom routes in
browser runtime code, invoking route handlers through page render glue, or
letting webpack-only assumptions leak into Vite RSC without an explicit bridge.

## Plane 1: Vite And RSC Environments

This is the foundation. It decides which module graph a file is evaluated in.

Local modules:

- `packages/vitest-plugin-rsc/src/index.ts`
- `packages/vitest-plugin-rsc/src/nextjs/plugin.ts`
- `packages/vitest-plugin-rsc/src/nextjs/plugin/aliases.ts`
- `packages/vitest-plugin-rsc/src/nextjs/plugin/runtime-rewrites.ts`
- `packages/vitest-plugin-rsc/src/nextjs/plugin/optimizer.ts`

What it creates:

- `client`: the RSC/edge-server graph. This is where Server Components and
  Next server-layer internals run in browser-mode Vitest. It uses
  `react-server` and `edge-light` conditions, and should define
  `process.env.NEXT_RUNTIME` as `"edge"`.
- `react_client`: the visible browser/App Router graph. This is where Client
  Components, `NextAppRouter`, `next/link`, `next/form`, and `next/script`
  run.
- `react_ssr`: the browser-ish SSR graph used to turn Flight data into document
  HTML for hydration tests.

How it connects:

- `vitestPluginRSC()` creates the three Vite environments and the websocket/HTTP
  bridges that let hidden browser environments execute modules.
- `vitestPluginNext()` layers Next aliases, defines, source transforms,
  optimizer entries, route virtual modules, and runtime shims onto those
  environments.
- Hidden `react_client` and `react_ssr` optimizers inherit scan roots from the
  visible Vitest browser client, then Next adds route-aware app entries and
  resolvable Next internals.

What we imitate:

- Next webpack conditions, aliases, defines, and polyfills are mirrored through
  Vite aliases, Vite `define`, optimize-deps config, and small runtime rewrites.
- Next's webpack `ProvidePlugin` behavior for `Buffer` is mirrored narrowly for
  installed Next internals.

What should change:

- Prefer real Next alias/define helpers such as `create-compiler-aliases` and
  `define-env` over local fallback tables.
- Keep runtime rewrites scoped to installed Next internals. They are shims, not
  a general transform layer.
- Do not create a webpack or Turbopack RSC graph. The graph belongs to Vite and
  `@vitejs/plugin-rsc`.

## Plane 2: Next Build-Time Artifacts

This plane creates facts that Next would normally create during dev-server or
build setup. These facts are serialized into virtual modules and then consumed
by request/runtime code.

Local modules:

- `packages/vitest-plugin-rsc/src/nextjs/config.ts`
- `packages/vitest-plugin-rsc/src/nextjs/route-manifest-plugin.ts`
- `packages/vitest-plugin-rsc/src/nextjs/plugin/routing-data.ts`
- `packages/vitest-plugin-rsc/src/nextjs/routing-types.ts`

Important virtual modules:

- `virtual:vitest-plugin-rsc/next-routes`: exports discovered app pages, route
  handlers, loader trees, and serialized routing data.
- `virtual:vitest-plugin-rsc/next-route-tree?...`: exports one loader tree for
  one discovered App Page route.
- `virtual:vitest-plugin-rsc/next-entrypoints`: imports discovered route trees,
  route dependencies, and route handler modules for optimizer warmup.

Data flow:

```text
config.ts
  loads next.config, custom routes, appDir, pageExtensions, image/cache config
  -> route-manifest-plugin.ts
      scans app pages and route handlers with Next dev matcher providers
      invokes next-app-loader for each page loaderTree
      -> plugin/routing-data.ts
          converts route facts and next.config routes into @next/routing data
          -> virtual:vitest-plugin-rsc/next-routes
```

Next modules to import:

- `next/dist/server/config.js`
- `next/dist/lib/load-custom-routes.js`
- `next/dist/lib/find-pages-dir.js`
- `next/dist/build/load-jsconfig.js`
- `next/dist/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.js`
- `next/dist/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.js`
- `next/dist/build/webpack/loaders/next-app-loader/index.js`
- `next/dist/build/generate-routes-manifest.js`
- `next/dist/compiled/@vercel/routing-utils/superstatic.js`

What we imitate:

- The dev route matcher setup is copied narrowly because we ask the provider
  for matchers directly instead of starting the full Next dev server.
- The `next-app-loader` option shape is copied from Next's entry builder, then
  the generated webpack-shaped module is rewritten into a Vite virtual module.
- The routing-data mapping copies the small non-exported adapter block from
  `build-complete.ts`; importing `handleBuildComplete()` would require full
  production build outputs, dist files, adapter modules, prerender manifests,
  tracing roots, and build ids.

What should change:

- Keep all `next/dist/build/*`, `load-custom-routes`, `build-custom-route`, and
  `@vercel/routing-utils` imports inside this plane.
- Request runtime should receive serialized route facts. It should not construct
  custom routes or dynamic route regexes.
- The serialized routing data should carry the full request-routing contract
  that `@next/routing` expects, including `buildId`, `basePath`, `i18n`,
  `pathnames`, and route phases.

## Plane 3: Webpack And Compiler Feature Adapters

This plane adapts Next features whose real implementation lives in webpack
loaders, compiler options, or Next client/server aliases. These are build or
transform concerns, not request routing concerns.

Local modules:

- `packages/vitest-plugin-rsc/src/nextjs/swc-transform-plugin.ts`
- `packages/vitest-plugin-rsc/src/nextjs/font-loader-plugin.ts`
- `packages/vitest-plugin-rsc/src/nextjs/font-manifest.ts`
- `packages/vitest-plugin-rsc/src/nextjs/image-plugin.ts`
- `packages/vitest-plugin-rsc/src/nextjs/metadata-image-loader-plugin.ts`
- `packages/vitest-plugin-rsc/src/nextjs/plugin/root-params.ts`
- `packages/vitest-plugin-rsc/src/nextjs/plugin/entry-base-client-references.ts`
- `packages/vitest-plugin-rsc/src/nextjs/client-reference-plugin.ts`

How it connects:

- User source flows through Vite transforms.
- When source imports `next/font` or `next/dynamic`, `swc-transform-plugin.ts`
  invokes Next SWC with Next loader options but keeps `serverComponents: false`.
- Next SWC can rewrite `next/font` calls into target CSS requests, which
  `font-loader-plugin.ts` resolves to real Next font loader output.
- Static image imports and metadata image loader requests are intercepted by
  Vite and delegated to Next's real webpack loaders.
- App Router public APIs such as `next/link`, `next/form`, `next/script`,
  `next/image`, and `next/root-params` are resolved to the correct RSC or
  browser implementation for the current Vite environment.

Next modules to import:

- `next/dist/build/swc/index.js`
- `next/dist/build/swc/options.js`
- `next/dist/compiled/@next/font/dist/google/loader.js`
- `next/dist/compiled/@next/font/dist/local/loader.js`
- `next/dist/build/webpack/loaders/next-image-loader/index.js`
- `next/dist/build/webpack/loaders/next-metadata-image-loader.js`
- `next/dist/build/webpack/loaders/next-root-params-loader.js`
- `next/dist/client/image-component.js`
- `next/dist/shared/lib/get-img-props.js`

What we imitate:

- Webpack loader contexts are recreated just enough for Next's loaders to run.
- Font assets and image assets are emitted or dev-served with Next-style
  `/_next/static/media/...` URLs.
- `next/image` is split so `getImageProps` stays callable in the RSC graph while
  `Image` remains a client reference.
- `next/dist/server/app-render/entry-base.js` CJS client imports are proxied as
  Vite RSC client references because Vite/Rolldown can otherwise inline
  `"use client"` CJS modules into the RSC optimized chunk.

What should change:

- Do not let Next SWC own the RSC graph. Keep Next's RSC and Server Action
  transforms disabled unless specific tests prove they can coexist with
  `@vitejs/plugin-rsc`.
- Keep webpack loader context imitation small and source-linked.
- Delete or narrow `entry-base-client-references.ts` if `@vitejs/plugin-rsc`
  learns to preserve CJS `"use client"` boundaries during dependency
  optimization.

## Plane 4: Request And Render Runtime

This plane runs per request. It consumes the serialized build-time artifacts and
invokes Next request/runtime modules.

Local modules:

- `packages/vitest-plugin-rsc/src/nextjs/request-router.ts`
- `packages/vitest-plugin-rsc/src/nextjs/next-routing.ts`
- `packages/vitest-plugin-rsc/src/nextjs/app-render.ts`
- `packages/vitest-plugin-rsc/src/nextjs/app-render-manifest.ts`
- `packages/vitest-plugin-rsc/src/nextjs/direct-render-routing.ts`
- `packages/vitest-plugin-rsc/src/nextjs/flight-payload.ts`

Data flow:

```text
testing-library.tsx
  imports virtual:vitest-plugin-rsc/next-routes
  -> request-router.ts
      calls @next/routing.resolveRoutes(serialized routing data)
      returns app-page, app-route, redirect, external-rewrite, or not-found
  -> app-render.ts
      receives app-page loaderTree + invocation URL
      builds WebNextRequest/WebNextResponse
      calls renderToHTMLOrFlight()
      returns Flight, HTML, or Server Action response
```

Next modules to import:

- `@next/routing`
- `next/dist/server/web/utils.js`
- `next/dist/shared/lib/router/utils/route-matcher.js`
- `next/dist/shared/lib/router/utils/route-regex.js`
- `next/dist/server/base-http/web.js`
- `next/dist/server/app-render/app-render.js`
- `next/dist/server/app-render/entry-base.js`
- `next/dist/server/app-render/types.js`
- `next/dist/server/app-render/manifests-singleton.js`
- `next/dist/server/request-meta.js`
- `next/dist/server/use-cache/handlers.js`
- `next/dist/server/lib/incremental-cache/index.js`

What we imitate:

- `request-router.ts` maps `@next/routing` output to a test-target union.
- `app-render.ts` still builds a synthetic App Page route module shape because
  directly importing `AppPageRouteModule` crossed the browser/server boundary.
- Minimal webpack-shaped client-reference and server-action manifests are
  proxied because Vite RSC owns the real references but Next app-render expects
  webpack manifest records.
- `RenderOpts`, request lifecycle hooks, cache globals, and manifest singleton
  setup are assembled locally around Next app-render.
- Direct React node renders use a separate synthetic route path in
  `direct-render-routing.ts`; this is not real app route matching.

What should change:

- Keep `request-router.ts` thin. It may translate `@next/routing` results and
  recover params; it must not build route data.
- Move manifest bridge construction out of `app-render.ts` into dedicated
  manifest-bridge modules.
- Keep the synthetic App Page route module isolated and source-linked. If
  `AppPageRouteModule` is retried, it needs a server-only boundary around
  `module.compiled` and `node-environment-baseline`.
- Route handlers should either remain explicit unsupported render targets or be
  invoked through `AppRouteRouteModule.handle()`. Do not call userland handler
  exports directly as the request pipeline.

## Plane 5: Browser Runtime, Hydration, And Transport

This plane consumes Flight/HTML output and drives the real browser App Router.

Local modules:

- `packages/vitest-plugin-rsc/src/nextjs/testing-library.tsx`
- `packages/vitest-plugin-rsc/src/nextjs/client.tsx`
- `packages/vitest-plugin-rsc/src/nextjs/testing-library-client.ts`
- `packages/vitest-plugin-rsc/src/nextjs/msw.ts`
- `packages/vitest-plugin-rsc/src/testing-library-client.tsx`
- `packages/vitest-plugin-rsc/src/testing-library-ssr.tsx`

How it connects:

- `testing-library.tsx` orchestrates the test helper. It loads route facts,
  resolves initial requests, follows supported same-origin redirects, rejects
  route handlers as page targets, renders route or direct-node sources, and
  hydrates either a controlled root or the full document.
- `app-render.ts` returns Flight or HTML. The base RSC testing library turns
  Flight into UI through `@vitejs/plugin-rsc`.
- `client.tsx` renders the real `NextAppRouter` with state created by Next's
  `createInitialRouterState()`.
- `testing-library-client.ts` connects Next's `callServer()` to a registered
  in-process RSC/action fetch function.
- `msw.ts` lets Flight and Server Action requests travel as real browser
  requests when request headers, router refresh, cache revalidation, or action
  protocol behavior matters.

Next modules to import:

- `next/dist/client/app-bootstrap.js`
- `next/dist/client/components/app-router.js`
- `next/dist/client/components/app-router-instance.js`
- `next/dist/client/components/router-reducer/create-initial-router-state.js`
- `next/dist/client/components/router-reducer/router-reducer.js`
- `next/dist/client/app-call-server.js`
- `next/dist/client/components/app-router-headers.js`
- `next/dist/server/lib/server-action-request-meta.js`

What we imitate:

- The initial RSC payload shape and mutable action queue setup are copied
  narrowly around Next client internals.
- Document hydration parses the same inline `self.__next_f.push(...)` segment
  shape that Next app-index consumes.
- No-op websocket/static indicator state is supplied because component tests do
  not run Next's full app-index/dev-client bootstrap.

What should change:

- `testing-library.tsx` should remain orchestration. It should not grow route
  building, request-routing phase logic, app-render manifest logic, or app-route
  handler execution.
- Do not add a local router facade, navigation spy API, or fake router
  assertions. Client navigation should be asserted through real browser/App
  Router behavior.

## Cross-Cutting Runtime Cache

Cache Components touches multiple planes: compiler transform, request/runtime
stores, app-render, cache handlers, and Vite RSC directive hoisting.

Local modules:

- `packages/vitest-plugin-rsc/src/nextjs/plugin/use-cache.ts`
- `packages/vitest-plugin-rsc/src/nextjs/plugin/cache-handlers.ts`
- `packages/vitest-plugin-rsc/src/nextjs/app-render.ts`

Next modules to import:

- `next/dist/server/use-cache/use-cache-wrapper.js`
- `next/dist/server/use-cache/handlers.js`
- `next/dist/server/lib/incremental-cache/index.js`
- `next/dist/server/request/cookies.js`
- `next/dist/server/request/headers.js`

What we imitate:

- Vite RSC hoists inline `"use cache"` functions.
- The hoisted function is wrapped with Next's real cache wrapper.
- Next cache handlers and incremental cache globals are initialized in the RSC
  runtime before app-render/cache code reads them.

What should change:

- Cached components with `children` remain unsupported until the adapter can
  produce Next's encrypted `boundArgsLength` call shape or delegate that shape
  to upstream tooling.
- Unsupported cache shapes should throw clearly.

## Cross-Cutting Runtime Shims

These shims exist because Next internals were built for webpack/Turbopack and a
Next dev/server process, while tests run in Vite browser-mode environments.

Local modules:

- `packages/vitest-plugin-rsc/src/nextjs/plugin/runtime-rewrites.ts`
- `packages/vitest-plugin-rsc/src/nextjs/app-render-compat-plugin.ts`
- `packages/vitest-plugin-rsc/src/nextjs/buffer-compat.ts`
- `packages/vitest-plugin-rsc/src/nextjs/plugin/server-reference-info.ts`
- `packages/vitest-plugin-rsc/src/nextjs/plugin/builtin-global-error.ts`
- `packages/vitest-plugin-rsc/src/nextjs/os-browser.ts`

What we imitate:

- Next's edge/client webpack environment for selected globals and native module
  aliases.
- Next's dev-server-only flags where installed Next internals branch on them.
- Next server-reference info behavior for Vite RSC action ids.
- Builtin global-error module availability across Next versions.

What should change:

- Keep every shim scoped, source-linked, and covered by package tests.
- Prefer real Next bootstrap modules, aliases, conditions, or define values
  over code rewriting when possible.

## What Belongs Together

Build-time route and loader tree modules belong together:

- `config.ts`
- `route-manifest-plugin.ts`
- `plugin/routing-data.ts`
- `routing-types.ts`
- `plugin/optimizer.ts`

Webpack/compiler adapters belong together:

- `swc-transform-plugin.ts`
- `font-loader-plugin.ts`
- `image-plugin.ts`
- `metadata-image-loader-plugin.ts`
- `plugin/root-params.ts`
- `plugin/entry-base-client-references.ts`
- `client-reference-plugin.ts`

Request/render runtime modules belong together:

- `request-router.ts`
- `next-routing.ts`
- `app-render.ts`
- `app-render-manifest.ts`
- `direct-render-routing.ts`
- `flight-payload.ts`

Browser/transport modules belong together:

- `testing-library.tsx`
- `client.tsx`
- `testing-library-client.ts`
- `msw.ts`

Runtime shims cut across the other groups, but they should stay small and
source-linked instead of becoming a hidden platform layer.

## Testing Focus

Package tests should prove plane boundaries:

- Build artifacts: config loading, route discovery, loader tree generation,
  routing data conversion, and virtual optimizer entries.
- Compiler adapters: SWC, font, image, metadata image, root params, API aliases,
  CJS client-reference proxies.
- Runtime routing/rendering: request-router behavior, app-render responses,
  manifest proxies, redirect/access-fallback Flight parsing.
- Browser transport: action protocol, MSW RSC requests, hydration behavior,
  App Router navigation.
- Shims: runtime rewrites, Buffer behavior, builtin global error, server
  reference info, cache handlers.

Notes-demo and no-MSW tests should cover user-visible behavior. Package tests
should cover adapter contracts and guard against the wrong plane importing the
wrong Next module.
