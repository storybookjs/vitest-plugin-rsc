# Next App Router Fidelity Architecture

Source of truth: Next.js `v16.2.6`
(`ee6e79b1792a4d401ddf2480f40a83549fe8e722`), installed
`next@16.2.6`, and installed `@next/routing@16.2.6`.

This document describes the ideal architecture for `vitest-plugin-rsc/nextjs`.
The rule is strict: every internal file under `nextjs/src/` must imitate a
concrete Next.js source file or an exact line range inside one. If a behavior can
be handled by a direct `next/dist/...` import and copies/adapts no Next source,
it should not get a `nextjs/src/` file.

## Core Rules

Make the higher Next layer work. Start from the highest Next module that owns
the behavior. Step down only when that layer would force us to recreate a larger
blocked system: webpack/Turbopack graph ownership, `.next` production output,
Node server lifecycle, or top-level document ownership.

Go higher when it improves business or visual fidelity, or when it deletes glue:
fewer imports, fewer local shims, fewer copied blocks, fewer special cases.

Copy as little as possible. If code must be copied or substantially adapted,
place it at the exact matching path under
`packages/vitest-plugin-rsc/src/nextjs/src/`.

Do not create internal files that only wrap imports. A `nextjs/src/...` file must
say exactly which upstream Next file and line ranges it imitates or copies.

PR #45 is the precedent for this mindset: when CJS `"use client"` handling
blocked real Next modules, it explored a generic browser/RSC CJS bridge instead
of adding more Next-specific stubs. Local shims are allowed as proving grounds,
but generic lower-layer fixes should be patched or upstreamed when possible.

## Constraints

Vite is the bundler. Webpack and Turbopack do not own module resolution,
transforms, HMR, optimizer behavior, RSC graph splitting, or manifests.
`@vitejs/plugin-rsc` owns RSC boundaries, client references, server references,
Server Action loading, and Flight module references.

Vitest owns the browser document. We cannot serve a real top-level Next
document. We can ask Next for HTML/Flight and hydrate a Next-like document
inside the Vitest page while preserving the Vite/Vitest harness.

The runtime target is App Router Edge/Web API only for now. This is a support
boundary for this adapter, not a claim that Node runtime apps do not work in
production Next.js. If a feature fundamentally requires Node runtime semantics,
we leave it unsupported in this adapter for now.

MSW is the preferred HTTP boundary for browser-observed behavior. Browser
requests should go through MSW into the in-process adapter when request/response
semantics matter. Direct calls may exist for focused tests, but they are lower
fidelity and must not define framework semantics.

The fidelity target is business and visual semantics: routing, params, cookies,
headers, middleware/proxy, redirects, rewrites, Server Actions, route handlers,
cache behavior, layouts, templates, errors, metadata, fonts, images, CSS,
hydration, navigation, Flight, and HTML. Production packaging fidelity is out of
scope unless it changes those semantics.

## Public Adapter Surface

These top-level files are package entrypoints. They may compose direct Next
imports and internal copied files, but they are not part of the exact
`nextjs/src/` mirror rule.

```text
packages/vitest-plugin-rsc/src/nextjs/
  plugin.ts
  testing-library.tsx
  testing-library-client.ts
  client.tsx
  msw.ts
  virtual.d.ts
  tester.html
```

## Production Next.js App Router Overview

Production Next.js starts from one integrated build and request pipeline. The
adapter should not recreate that pipeline wholesale, but this is the model we
compare ourselves against.

Build-time flow:

```text
next.config
  -> webpack-config.ts
       creates client, node server, and edge server compiler configs
       installs aliases, defines, loader aliases, and graph-owning plugins
  -> entries.ts
       creates App Router entries such as getAppEntry() and edge server entries
  -> next-app-loader
       resolves app layouts/pages/templates/errors/default slots/metadata
       generates app-page or app-route userland modules
       emits the App Router loader tree for App Page routes
  -> next-edge-ssr-loader
       expands edge-ssr-app for App Page routes
  -> next-edge-app-route-loader
       expands edge-app-route for app/**/route.ts handlers
  -> manifest plugins
       emit client reference, server action, font, build, and route manifests
  -> build-complete.ts
       converts route manifests into adapter routing data
```

Request-time Edge App Router flow:

```text
Request
  -> route manifests / adapter routing data
  -> request routing
       production: router/server routing over manifests
       adapter: @next/routing over serialized virtual-module data
  -> invoke middleware/proxy through server/web/adapter when matched
  -> App Page target
       edge-ssr-app.handler()
       -> server/web/adapter
       -> WebNextRequest / WebNextResponse
       -> AppPageRouteModule.prepare()
       -> AppPageRouteModule.render()
       -> renderToHTMLOrFlight()
       -> HTML, Flight, or app-render action Response
  -> App Route target
       edge-app-route.handler()
       -> EdgeRouteModuleWrapper.wrap(routeModule)
       -> server/web/adapter
       -> AppRouteRouteModule.handle()
       -> Response
```

Browser flow:

```text
HTML / inline Flight bootstrap
  -> client/app-index.tsx
       consumes self.__next_f.push(...) chunks
       creates initial router state
       creates mutable action queue
       hydrates NextAppRouter
  -> client navigation / refresh / Server Actions
       issue real browser requests with Next headers
       receive Flight/action responses
       update the App Router tree
```

The important production distinction for this adapter is that `edge-ssr-app` is
not only an HTML SSR entry. For App Router it is the Edge App Page entry: HTML,
Flight, and app-render action responses all flow through
`AppPageRouteModule.render()` and `renderToHTMLOrFlight()`.

The loader tree is the main build-to-render handoff for App Pages. Next's
`next-app-loader` converts the `app/` filesystem conventions into a recursive
tuple:

```text
[segment, parallelRoutes, modules, staticSiblings]
```

`modules` contains lazy module loaders for conventions such as `layout`, `page`,
`template`, `loading`, `error`, `not-found`, `forbidden`, `unauthorized`,
`default`, metadata, and built-in fallbacks. `parallelRoutes` contains nested
loader trees for `children` and named slots. At request time, app-render parses
this loader tree, creates the Flight router state, and builds the React component
tree that becomes HTML or Flight. This is why the adapter must use Next's
loader-tree generation rather than reconstructing layouts or route conventions
locally.

The adapter's job is to preserve this shape on Vite:

- Vite replaces webpack/Turbopack as bundler.
- `@vitejs/plugin-rsc` replaces Next's webpack/Turbopack RSC graph ownership.
- Vite virtual modules replace build output files when needed.
- MSW replaces the network boundary to a real Next server.
- The Edge/Web runtime path remains the semantic target.

## Phase Overview

Next App Router has different owners at different phases. The adapter should not
mix these phases.

Build-time work decides what exists:

```text
next.config
  -> webpack-config.ts chooses compiler layers, defines, aliases, loaders/plugins
  -> entries.ts chooses App Router entries
  -> next-app-loader creates loader trees and app page/app route userland modules
  -> next-edge-ssr-loader creates Edge App Page entries
  -> next-edge-app-route-loader creates Edge App Route entries
  -> manifest/build-complete code creates route and manifest data
```

Request-runtime work decides what a concrete URL does:

```text
browser Request
  -> routing data / @next/routing-style resolution
  -> middleware/proxy via server/web/adapter if matched
  -> App Page edge handler, App Route edge handler, redirect, rewrite, or response
```

App Page HTML/SSR flow is one mode of the Edge App Page entry:

```text
Request without RSC header
  -> edge-ssr-app.handler()
  -> server/web/adapter
  -> AppPageRouteModule.prepare()
  -> AppPageRouteModule.render()
  -> renderToHTMLOrFlight()
  -> HTML RenderResult
  -> Web Response
  -> browser document hydration inside Vitest-owned page
```

App Page RSC/Flight flow is the same Edge App Page entry with different request
headers:

```text
Request with RSC / router state headers
  -> edge-ssr-app.handler()
  -> server/web/adapter
  -> AppPageRouteModule.prepare()
  -> AppPageRouteModule.render()
  -> renderToHTMLOrFlight()
  -> Flight RenderResult
  -> text/x-component Response
  -> Next client router consumes Flight and updates the tree
```

Server Actions also flow through the App Page render path:

```text
Server Action POST
  -> MSW HTTP boundary
  -> Edge App Page request path
  -> app-render action handling inside renderToHTMLOrFlight()
  -> action redirect / revalidation / Flight response protocol
  -> Next client action reducer consumes the response
```

App Route runtime is separate from App Page rendering:

```text
Request to app/**/route.ts
  -> edge-app-route.handler()
  -> EdgeRouteModuleWrapper.wrap(routeModule)
  -> server/web/adapter
  -> AppRouteRouteModule.handle()
  -> user route handler Response
```

Browser runtime consumes outputs; it should not create build artifacts:

```text
HTML + inline Flight bootstrap
  -> client/app-index.tsx semantics
  -> createInitialRouterState()
  -> createMutableActionQueue()
  -> NextAppRouter hydration
  -> navigation/refresh/action fetches return to MSW
```

The same file can participate in multiple phases, but the phase boundary should
stay explicit. For example, `edge-ssr-app` is runtime code generated at
build-time. `next-app-loader` is build-time code whose loader tree is consumed
at runtime. `server/web/adapter` is runtime code used by middleware, App Page
edge entries, and App Route edge entries.

## File Connection Overview

The public entrypoints compose the internal mirror files into one App Router
test pipeline:

```text
nextjs/plugin.ts
  -> nextjs/src/build/webpack-config.ts
       selects the Next loaders/plugins/helpers we imitate in Vite
       configures Vite environments instead of webpack compilers
  -> nextjs/src/build/entries.ts
       creates App Router app-loader entry requests
  -> nextjs/src/build/webpack/loaders/next-app-loader/index.ts
       generates loader-tree/userland modules for App Pages and App Routes
  -> nextjs/src/build/webpack/loaders/next-edge-ssr-loader/index.ts
       expands the Edge App Page entry through edge-ssr-app
  -> nextjs/src/build/webpack/loaders/next-edge-app-route-loader/index.ts
       expands the Edge App Route entry through edge-app-route
  -> nextjs/src/build/adapter/build-complete.ts
       converts route manifests into @next/routing data
```

At runtime, the browser-observed path is:

```text
nextjs/msw.ts
  -> @next/routing
       resolves redirect, rewrite, app-page, app-route, or not-found
       calls invokeMiddleware when middleware/proxy matches
  -> nextjs/src/server/web/adapter.ts
       runs middleware/proxy semantics when @next/routing invokes middleware
  -> nextjs/src/build/templates/edge-ssr-app.ts
       handles App Page HTML, Flight, and app-render action responses
  -> nextjs/src/build/templates/edge-app-route.ts
       handles App Route route.ts responses
  -> nextjs/src/client/app-index.tsx
       hydrates/boots the browser App Router inside the Vitest-owned page
```

Visual and protocol support comes from the same mirrored graph:

```text
nextjs/src/build/webpack/loaders/next-swc-loader.ts
  -> compiler features such as next/font and next/dynamic
nextjs/src/build/webpack/loaders/next-font-loader/index.ts
  -> font CSS/assets
nextjs/src/build/webpack/plugins/next-font-manifest-plugin.ts
  -> route-scoped font preload manifest shape
nextjs/src/build/webpack/loaders/next-image-loader/index.ts
  -> static image metadata/assets
nextjs/src/build/webpack/loaders/next-metadata-image-loader.ts
  -> metadata image modules
nextjs/src/build/webpack/plugins/flight-manifest-plugin.ts
nextjs/src/build/webpack/plugins/flight-client-entry-plugin.ts
  -> manifest shapes consumed by app-render, while Vite RSC owns the graph
```

This overview is a dependency map, not a promise that every file must exist.
If a direct import works, the corresponding mirror file should not be created.
If a mirror file exists, it must document the exact upstream lines it
imitates/copies.

## Internal Files That Imitate Next.js

Every section below names the local file, the upstream file it imitates, the
line ranges that matter, the associated imports, and the higher/lower
consideration.

### `nextjs/src/build/webpack-config.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/webpack-config.ts`

Imitates/copies these upstream lines:

- `webpack-config.ts:L9-L82`: imports for `getDefineEnv`, webpack constants,
  webpack plugins, alias helpers, SWC loader types, and Next build helpers.
- `webpack-config.ts:L1351-L1389`: `resolveLoader.alias` list for Next-provided
  loaders.
- `webpack-config.ts:L2020-L2045`: `ProvidePlugin` and `DefinePlugin` setup for
  client/edge bundles.

Associated imports from those lines:

- `./define-env#getDefineEnv`
- `./create-compiler-aliases#createWebpackAliases`
- `./create-compiler-aliases#createAppRouterApiAliases`
- `./create-compiler-aliases#createVendoredReactAliases`
- `./webpack/plugins/flight-manifest-plugin`
- `./webpack/plugins/flight-client-entry-plugin`
- `./webpack/plugins/next-font-manifest-plugin`
- `next-swc-loader`
- `next-app-loader`
- `next-edge-ssr-loader`
- `next-edge-app-route-loader`
- `next-font-loader`
- `next-image-loader`
- `next-metadata-image-loader`
- `next-root-params-loader`
- `server/config`
- `lib/load-custom-routes`
- `lib/find-pages-dir`
- `build/load-jsconfig`

Copies/adapts:

1. The loader/plugin selection that affects App Router Edge/Web business and
   visual fidelity.
2. The mapping from webpack compiler/layer concepts to Vite environments.
3. The edge/client polyfill behavior: `Buffer`, selected `process` behavior, and
   Next defines.
4. The decision that graph-owning plugins are source-of-truth for manifest
   shapes, not plugins we run inside Vite.

Direct imports in this imitation:

- `next/dist/build/define-env.js`
- `next/dist/build/create-compiler-aliases.js`
- `next/dist/build/swc/options.js`
- `next/dist/build/swc/index.js`
- `next/dist/server/config.js`
- `next/dist/lib/load-custom-routes.js`
- `next/dist/lib/find-pages-dir.js`
- `next/dist/build/load-jsconfig.js`
- `next/dist/build/utils.js`
- `next/dist/shared/lib/image-config.js`

Higher/lower consideration:

- Higher candidate: `getBaseWebpackConfig()` from `webpack-config.ts`.
- Why not higher: it would make webpack own the graph and conflicts with Vite as
  bundler.
- Why this level: it preserves Next's relevant loader/plugin wiring while
  letting Vite own the graph.
- Lower fallback: import individual loaders from arbitrary public adapter files.
- Why not lower: it loses the architecture map of how Next wires the pieces
  together.

### `nextjs/src/build/entries.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/entries.ts`

Imitates/copies these upstream lines:

- `entries.ts:L281-L295`: `getAppLoader()` and `getAppEntry()`.

Associated imports from those lines:

- `next-app-loader`
- `WEBPACK_LAYERS.reactServerComponents`
- query string serialization for `AppLoaderOptions`

Copies/adapts:

1. The `getAppLoader()` / `getAppEntry()` request-string and RSC-layer behavior
   only if `next/dist/build/entries.js#getAppEntry` cannot be imported.
2. If direct import works, do not create this file.

Direct imports in this imitation:

- `next/dist/build/entries.js#getAppEntry`

Higher/lower consideration:

- Higher candidate: `createEntrypoints()`.
- Why not higher by default: it creates full client/server/edge webpack entry
  maps and likely brings too much graph ownership.
- Why this level: `getAppEntry()` removes our need to copy app-loader option
  serialization.
- Lower fallback: manually build `next-app-loader?...!` request strings.
- Why not lower: it duplicates Next entry serialization.

### `nextjs/src/build/webpack/loaders/next-swc-loader.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/webpack/loaders/next-swc-loader.ts`

Imitates/copies these upstream lines:

- `next-swc-loader.ts:L81-L89`: force-transpile conditions for `next/font`,
  `next/dynamic`, `"use server"`, `"use client"`, `"use cache"`, and dynamic
  import tracking.
- `next-swc-loader.ts:L91-L219`: `loaderTransform()` option construction and
  `transform()` call.

Associated imports from those lines:

- `../../swc#transform`
- `../../swc/options#getLoaderSWCOptions`
- `../../webpack-config#babelIncludeRegexes`
- `../../handle-externals#isResourceInPackages`
- telemetry transform update helpers

Copies/adapts:

1. SWC option construction needed outside webpack.
2. The force-transpile trigger logic if Vite needs the same behavior.
3. The call shape for `getLoaderSWCOptions()` and `transform()`.

Direct imports in this imitation:

- `next/dist/build/swc/index.js`
- `next/dist/build/swc/options.js`

Higher/lower consideration:

- Higher candidate: run `next-swc-loader` as a webpack loader.
- Why not higher by default: we do not run webpack; Vite owns transforms.
- Why this level: we get Next SWC semantics without webpack graph ownership.
- Lower fallback: regex transforms.
- Why not lower: regex transforms duplicate Next compiler behavior.

### `nextjs/src/build/webpack/loaders/next-app-loader/index.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/webpack/loaders/next-app-loader/index.ts`

Imitates/copies these upstream lines:

- `next-app-loader/index.ts:L81-L123`: `FILE_TYPES` and `AppDirModules` shape,
  which define the app convention modules that can appear in a loader tree.
- `next-app-loader/index.ts:L143-L180`: `createTreeCodeFromPath()` signature and
  return shape, including `treeCode`, `rootLayout`, `globalError`, and
  `globalNotFound`.
- `next-app-loader/index.ts:L244-L321`: per-segment metadata discovery, page
  module insertion, parallel segment traversal, and special file lookup.
- `next-app-loader/index.ts:L315-L420`: layout/template/error/loading/default
  convention lookup, global-error/global-not-found insertion, default access
  fallback insertion, and root layout tracking.
- `next-app-loader/index.ts:L1080-L1088`: `createTreeCodeFromPath()` output and
  loader tree generation inputs.
- `next-app-loader/index.ts:L1092-L1120`: app pathname normalization,
  `loadEntrypoint("app-page")`, injected `tree`, `__next_app_require__`,
  `__next_app_load_chunk__`, and eager module import declarations.
- `server/lib/app-dir-module.ts:L4-L29`: `LoaderTree` tuple type consumed by
  app-render.
- `server/app-render/create-component-tree.tsx:L54-L80`: app-render entrypoint
  that turns a loader tree into a React component tree.
- `server/app-render/create-component-tree.tsx:L154-L165`: `parseLoaderTree()`
  output and convention modules app-render consumes.

Associated imports from those lines:

- `../../../load-entrypoint#loadEntrypoint`
- `AppPathnameNormalizer`
- loader tree generation helpers in the same loader
- `createStaticMetadataFromRoute`
- `createMetadataExportsCode`
- `PARALLEL_ROUTE_DEFAULT_PATH`
- `defaultHTTPAccessFallbackPaths`
- `parseLoaderTree`
- `createComponentTree`

Copies/adapts:

1. Only output extraction/rewrite logic if the real loader output cannot be
   consumed directly by Vite.
2. Do not copy loader tree construction if the real loader can run.
3. Preserve the loader tree as the contract between build-time app convention
   discovery and request-time app-render. Do not replace it with a local route
   convention model.

Direct imports in this imitation:

- `next/dist/build/webpack/loaders/next-app-loader/index.js`
- `next/dist/build/entries.js#getAppEntry`
- `next/dist/server/lib/app-dir-module.js` for types and helper behavior where
  needed.

Higher/lower consideration:

- Higher candidate: `getAppEntry()` plus the real `next-app-loader`.
- Why this file may exist: only if consuming the generated output requires
  substantial extraction/rewrite.
- Lower fallback: locally construct loader trees or local layout/page/template
  traversal.
- Why not lower: it reimplements App Router conventions and breaks the same
  loader-tree contract that `AppPageRouteModule` and app-render consume.

### `nextjs/src/build/webpack/loaders/next-edge-ssr-loader/index.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/webpack/loaders/next-edge-ssr-loader/index.ts`

Imitates/copies these upstream lines:

- `next-edge-ssr-loader/index.ts:L65-L101`: cache handler import and registration
  injection.
- `next-edge-ssr-loader/index.ts:L104-L152`: loader option reading and route
  build info setup.
- `next-edge-ssr-loader/index.ts:L183-L201`: App Router branch that creates
  `pageModPath` and calls `loadEntrypoint("edge-ssr-app")`.

Associated imports from those lines:

- `../../../load-entrypoint#loadEntrypoint`
- `../../../../lib/constants#WEBPACK_RESOURCE_QUERIES`
- `../get-module-build-info#getModuleBuildInfo`
- `ProxyConfig`

Copies/adapts:

1. The App Router branch that expands `edge-ssr-app`.
2. Cache handler injection shape if direct loader invocation cannot own it.
3. `appDirLoader` and `pageModPath` wiring if needed.
4. If direct loader invocation works with a small Vite loader context, do not
   create this file.

Direct imports in this imitation:

- `next/dist/build/webpack/loaders/next-edge-ssr-loader/index.js`, preferred.
- `next/dist/build/load-entrypoint.js#loadEntrypoint`, fallback.

Higher/lower consideration:

- Higher candidate: real `next-edge-ssr-loader`.
- Why this file may exist: only if the loader cannot run with a small Vite
  loader context.
- Lower fallback: copy `edge-ssr-app.ts`.
- Why not lower: the loader already owns template expansion and injection.

### `nextjs/src/build/templates/edge-ssr-app.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/templates/edge-ssr-app.ts`

Create this file only if `next-edge-ssr-loader` or
`loadEntrypoint("edge-ssr-app")` cannot work.

Imitates/copies these upstream lines:

- `edge-ssr-app.ts:L1-L31`: imports.
- `edge-ssr-app.ts:L39-L48`: manifest singleton setup from
  `self.__RSC_MANIFEST`.
- `edge-ssr-app.ts:L52-L90`: `requestHandler`, `WebNextRequest`,
  `WebNextResponse`, and `AppPageRouteModule.prepare()`.
- `edge-ssr-app.ts:L105-L207`: `AppPageRouteHandlerContext` and `renderOpts`.
- `edge-ssr-app.ts:L210-L288`: `RenderResult` to Web `Response`.
- `edge-ssr-app.ts:L290-L370`: `pageRouteModule.render()` and instrumentation.
- `edge-ssr-app.ts:L373-L425`: `adapter()` wrapping and exported `handler()`.

Associated imports from those lines:

- `../../server/web/adapter`
- `../../server/lib/incremental-cache`
- `../../server/app-render/manifests-singleton`
- `../../server/use-cache/handlers`
- `../../server/base-http/web`
- `../../server/route-modules/app-page/module.compiled`
- `../../server/web/web-on-close`

Copies/adapts:

1. The `adapter({ handler: requestHandler })` shape.
2. The request data passed to the adapter.
3. `AppPageRouteModule.prepare()` and `AppPageRouteModule.render()`.
4. `RenderResult` to Web `Response`.
5. Cache handler and `waitUntil`/`onClose` wiring.

Direct imports in this imitation:

- `next/dist/server/web/adapter.js`
- `next/dist/server/base-http/web.js`
- `next/dist/server/route-modules/app-page/module.compiled.js`
- `next/dist/server/app-render/manifests-singleton.js`
- `next/dist/server/use-cache/handlers.js`
- `next/dist/server/lib/incremental-cache/index.js`

Gets transitively:

- `renderToHTMLOrFlight()` through `AppPageRouteModule.render()`.
- `NextRequestHint` and `NextFetchEvent` through `server/web/adapter`.
- Edge App Page handling for HTML, Flight, and app-render action responses.

Higher/lower consideration:

- Higher candidate: `next-edge-ssr-loader` or `loadEntrypoint("edge-ssr-app")`.
- Why not higher only if proven: the loader/generator requires too much webpack
  context.
- Lower fallback: direct `renderToHTMLOrFlight()`.
- Why not lower: it recreates render context, request wrapping, response
  conversion, and route module shape.

### `nextjs/src/build/webpack/loaders/next-edge-app-route-loader/index.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/webpack/loaders/next-edge-app-route-loader/index.ts`

Imitates/copies these upstream lines:

- `next-edge-app-route-loader/index.ts:L19-L54`: cache handler import and
  registration injection.
- `next-edge-app-route-loader/index.ts:L57-L99`: loader option and route build
  info setup.
- `next-edge-app-route-loader/index.ts:L100-L116`: `modulePath` creation and
  `loadEntrypoint("edge-app-route")`.

Associated imports from those lines:

- `../../../load-entrypoint#loadEntrypoint`
- `../../../../lib/constants#WEBPACK_RESOURCE_QUERIES`
- `../get-module-build-info#getModuleBuildInfo`
- `isMetadataRoute`

Copies/adapts:

1. Edge App Route entry generation.
2. Cache handler injection shape.
3. Userland `modulePath` wiring.
4. If direct loader invocation works with a small Vite loader context, do not
   create this file.

Direct imports in this imitation:

- `next/dist/build/webpack/loaders/next-edge-app-route-loader/index.js`,
  preferred.
- `next/dist/build/load-entrypoint.js#loadEntrypoint`, fallback.

Higher/lower consideration:

- Higher candidate: real `next-edge-app-route-loader`.
- Lower fallback: copy `edge-app-route.ts`.
- Why not lower: the loader already owns template expansion and injection.

### `nextjs/src/build/templates/edge-app-route.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/templates/edge-app-route.ts`

Create this file only if `next-edge-app-route-loader` or
`loadEntrypoint("edge-app-route")` cannot work.

Imitates/copies these upstream lines:

- `edge-app-route.ts:L1-L8`: imports and userland module import.
- `edge-app-route.ts:L15-L26`: manifest singleton setup.
- `edge-app-route.ts:L28-L40`: `EdgeRouteModuleWrapper.wrap(module.routeModule)`.
- `edge-app-route.ts:L42-L84`: exported `handler(request, ctx)` and request data
  passed to the wrapper.

Associated imports from those lines:

- `../../server/web/edge-route-module-wrapper`
- `../../server/web/utils`
- `../../server/app-render/manifests-singleton`

Copies/adapts:

1. `EdgeRouteModuleWrapper.wrap(module.routeModule)` flow.
2. Web `Request` to Next request data shape.
3. Cache handler injection.
4. `waitUntil` propagation.

Direct imports in this imitation:

- `next/dist/server/web/edge-route-module-wrapper.js`
- `next/dist/server/web/utils.js`
- `next/dist/server/route-modules/app-route/module.compiled.js`

Gets transitively:

- `AppRouteRouteModule.handle()` through `EdgeRouteModuleWrapper`.
- `server/web/adapter`.
- `NextRequestHint` and `NextFetchEvent`.
- Dynamic params, request stores, cache handlers, and response validation.

Higher/lower consideration:

- Higher candidate: `next-edge-app-route-loader`.
- Lower fallback: direct userland `GET`/`POST` calls.
- Why not lower: direct calls bypass Next route module semantics.

### `nextjs/src/build/adapter/build-complete.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/adapter/build-complete.ts`

Imitates/copies these upstream lines:

- `build-complete.ts:L1928-L2029`: dynamic route, RSC suffix, and segment route
  conversion.
- `build-complete.ts:L2034-L2099`: data route conversion.
- `build-complete.ts:L2101-L2125`: rewrite/header conversion helpers.
- `build-complete.ts:L2130-L2185`: final adapter `routing` object passed to
  `onBuildComplete`.

Associated imports from those lines:

- `getNamedRouteRegex`
- `convertRewrites`
- `convertHeaders`
- `convertRedirects`
- `modifyRouteRegex`
- `getRedirectStatus`
- `generateRoutesManifest`

Copies/adapts:

1. Dynamic route to adapter route mapping.
2. RSC/data/segment route mapping if needed for business or visual fidelity.
3. Header/rewrite/redirect conversion into `@next/routing` data.
4. The final `routing` shape.

Direct imports in this imitation:

- `@next/routing`
- `next/dist/build/generate-routes-manifest.js`
- `next/dist/compiled/@vercel/routing-utils/superstatic.js`
- `next/dist/shared/lib/router/utils/route-regex.js`
- `next/dist/lib/redirect-status.js`

Higher/lower consideration:

- Higher candidate: full `handleBuildComplete()`.
- Why not higher: it requires production build outputs, dist files, adapter
  module, prerender manifests, build id, and tracing roots.
- Lower fallback: local custom route conversion.
- Why not lower: it duplicates Next routing semantics.

### `nextjs/src/build/analysis/get-page-static-info.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/analysis/get-page-static-info.ts`

Imitates/copies these upstream lines:

- `get-page-static-info.ts:L454-L514`: `getMiddlewareMatchers()`.
- `get-page-static-info.ts:L516-L553`: `parseMiddlewareConfig()` matcher
  extraction, if needed.

Associated imports from those lines:

- Middleware config schema.
- `tryToParsePath`.
- i18n/basePath matcher normalization constants.

Copies/adapts:

1. Matcher generation for middleware/proxy config only if direct import cannot
   be used.
2. If direct import works, do not create this file.

Direct imports in this imitation:

- `next/dist/build/analysis/get-page-static-info.js#getMiddlewareMatchers`,
  preferred.

Higher/lower consideration:

- Higher candidate: direct import from installed Next.
- Lower fallback: local matcher parsing.
- Why not lower: matcher syntax is Next-owned.

### `nextjs/src/server/web/adapter.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/server/web/adapter.ts`

Create this file only if `next/dist/server/web/adapter.js` cannot be imported
directly for middleware/proxy or Edge route entries.

Imitates/copies these upstream lines:

- `adapter.ts:L110-L193`: `adapter()` request normalization and
  `NextRequestHint` creation.
- `adapter.ts:L254-L346`: middleware request/work store setup and handler
  invocation.
- `adapter.ts:L363-L425`: rewrite handling and RSC rewrite headers.
- `adapter.ts:L438-L515`: RSC hash forwarding, redirect handling, middleware
  override headers, and final `FetchEventResult`.

Associated imports from those lines:

- `NextRequest`
- `NextResponse`
- `NextFetchEvent`
- `NextURL`
- `createRequestStoreForAPI`
- `createWorkStore`
- `workAsyncStorage`
- `workUnitAsyncStorage`
- app router headers such as `RSC_HEADER`, `NEXT_REWRITTEN_PATH_HEADER`,
  `NEXT_REWRITTEN_QUERY_HEADER`

Copies/adapts:

1. Web request wrapping.
2. Middleware store setup.
3. RSC-aware rewrite/redirect header behavior.
4. Final `FetchEventResult` shape.
5. If direct import works, do not create this file.

Direct imports in this imitation:

- `next/dist/server/web/adapter.js`, preferred.

Higher/lower consideration:

- Higher candidate: edge templates/loaders that call this adapter.
- Why this file exists only conditionally: direct import should usually be
  enough.
- Lower fallback: local middleware runner.
- Why not lower: it recreates `NextRequest`, `NextResponse`, stores, and RSC
  header semantics.

### `nextjs/src/server/web/edge-route-module-wrapper.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/server/web/edge-route-module-wrapper.ts`

Create this file only if direct import fails.

Imitates/copies these upstream lines:

- `edge-route-module-wrapper.ts:L61-L82`: `EdgeRouteModuleWrapper.wrap()`.
- `edge-route-module-wrapper.ts:L84-L165`: `handler()` converting Edge adapter
  request into `AppRouteRouteModule.handle()`.

Associated imports from those lines:

- `server/web/adapter`
- `IncrementalCache`
- `WebNextRequest`
- `getServerUtils`
- `createRequestStoreForAPI` indirectly through route module execution

Copies/adapts:

1. App Route Edge wrapper flow.
2. Params normalization.
3. Cache handler initialization.
4. `waitUntil` and stream close handling.
5. If direct import works, do not create this file.

Direct imports in this imitation:

- `next/dist/server/web/edge-route-module-wrapper.js`, preferred.

Higher/lower consideration:

- Higher candidate: `edge-app-route` template.
- Lower fallback: direct App Route userland handler call.
- Why not lower: direct userland calls miss route module semantics.

### `nextjs/src/build/webpack/loaders/next-font-loader/index.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/webpack/loaders/next-font-loader/index.ts`

Imitates/copies these upstream lines:

- `next-font-loader/index.ts:L15-L30`: SWC-generated resource query parsing.
- `next-font-loader/index.ts:L66-L97`: `emitFontFile()` URL and preload naming.
- `next-font-loader/index.ts:L99-L170`: loading the real font loader function,
  PostCSS processing, and CSS/module export metadata.

Associated imports from those lines:

- `next/dist/compiled/loader-utils3`
- `./postcss-next-font`
- `next/font/google` or `next/font/local` target loader function

Copies/adapts:

1. Vite loader context and asset emission bridge if direct loader invocation
   cannot own it.
2. Resource query decoding.
3. Font file URL emission behavior.

Direct imports in this imitation:

- `next/dist/build/webpack/loaders/next-font-loader/index.js`, preferred.
- `next/dist/compiled/@next/font/dist/google/loader.js`
- `next/dist/compiled/@next/font/dist/local/loader.js`
- `next/dist/compiled/loader-utils3`

Gets transitively:

- The Google/local font loader calls.
- `postcss-next-font`.
- Font loader resource query parsing, file naming, and CSS metadata behavior.

Higher/lower consideration:

- Higher candidate: real `next-font-loader`.
- Why this file may exist: only if the real loader cannot run with a small Vite
  loader context.
- Lower fallback: direct Google/local font loader calls plus local wrapper logic.
- Why not lower: font visual behavior is Next-owned.

### `nextjs/src/build/webpack/plugins/next-font-manifest-plugin.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/webpack/plugins/next-font-manifest-plugin.ts`

Imitates/copies these upstream lines:

- `next-font-manifest-plugin.ts:L7-L16`: `NextFontManifest` shape.
- `next-font-manifest-plugin.ts:L19-L54`: preload and manifest behavior
  explanation.
- `next-font-manifest-plugin.ts:L62-L160`: app/pages font file collection and
  emitted manifest shape.

Associated imports from those lines:

- `NEXT_FONT_MANIFEST`
- `traverseModules`
- `getRouteFromEntrypoint`

Copies/adapts:

1. Manifest shape.
2. Preload file selection.
3. App route scoped font records, if Vite asset graph cannot supply equivalent
   data directly.

Direct imports:

- Prefer none if current font recording can stay source-linked and small.

Higher/lower consideration:

- Higher candidate: running the webpack plugin.
- Why not higher: graph-owning webpack plugin.
- Lower fallback: ad hoc font preload tags.
- Why not lower: visual font preload behavior should follow Next.

### `nextjs/src/build/webpack/loaders/next-image-loader/index.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/webpack/loaders/next-image-loader/index.ts`

Imitates/copies these upstream lines:

- `next-image-loader/index.ts:L15-L87`: static image metadata, blur metadata,
  asset emission, and JS export generation.

Associated imports from those lines:

- `next/dist/compiled/loader-utils3`
- `server/image-optimizer#getImageSize`
- `./blur#getBlurImage`

Copies/adapts:

1. Vite loader context and asset emission bridge if direct loader invocation
   cannot own it.

Direct imports in this imitation:

- `next/dist/build/webpack/loaders/next-image-loader/index.js`, preferred.

Higher/lower consideration:

- Higher candidate: real loader.
- Lower fallback: local image metadata parser.
- Why not lower: visual image output is Next-owned.

### `nextjs/src/build/webpack/loaders/next-metadata-image-loader.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/webpack/loaders/next-metadata-image-loader.ts`

Imitates/copies these upstream lines:

- `next-metadata-image-loader.ts:L30-L127`: dynamic metadata image module output.
- `next-metadata-image-loader.ts:L129-L188`: static metadata image sizing,
  `.alt.txt`, and generated metadata export.

Associated imports from those lines:

- `loader-utils3`
- `getImageSize`
- `fillMetadataSegment`
- `getLoaderModuleNamedExports`

Copies/adapts:

1. Vite loader context and module export discovery bridge if the real loader
   cannot run directly.

Direct imports in this imitation:

- `next/dist/build/webpack/loaders/next-metadata-image-loader.js`, preferred.

Higher/lower consideration:

- Higher candidate: real metadata image loader.
- Lower fallback: local metadata image route generation.
- Why not lower: metadata image conventions are Next-owned.

### `nextjs/src/build/webpack/loaders/next-root-params-loader.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/webpack/loaders/next-root-params-loader.ts`

Imitates/copies these upstream lines:

- `next-root-params-loader.ts:L15-L44`: loader output and generated root param
  functions.
- `next-root-params-loader.ts:L46-L140`: root layout traversal and root param
  collection.

Associated imports from those lines:

- `normalizeAppPath`
- `ensureLeadingSlash`
- `getSegmentParam`
- `next/dist/server/request/root-params`

Copies/adapts:

1. The root layout traversal and generated root-param export block only if the
   real loader cannot run with a small Vite loader context.
2. If direct loader invocation works, do not create this file.

Direct imports in this imitation:

- `next/dist/build/webpack/loaders/next-root-params-loader.js`, preferred.

Higher/lower consideration:

- Higher candidate: real loader.
- Lower fallback: local root params discovery.
- Why not lower: root params semantics are Next-owned.

### `nextjs/src/build/webpack/plugins/flight-manifest-plugin.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/webpack/plugins/flight-manifest-plugin.ts`

Imitates/copies these upstream lines:

- `flight-manifest-plugin.ts:L54-L116`: client reference manifest types and
  fields.
- `flight-manifest-plugin.ts:L118-L180`: chunk collection and app entry group
  normalization.

Associated imports from those lines:

- `CLIENT_REFERENCE_MANIFEST`
- `WEBPACK_LAYERS`
- `encodeURIPath`
- `getModuleReferencesInOrder`

Copies/adapts:

1. Manifest shape only.
2. Module id/export/chunk records only if Next runtime needs them.

Direct imports:

- `next/dist/server/app-render/manifests-singleton.js` for runtime singleton
  consumption.

Higher/lower consideration:

- Higher candidate: run `ClientReferenceManifestPlugin`.
- Why not higher: it traverses webpack graph and owns manifest emission.
- Lower fallback: unstructured manifest proxy.
- Why not lower: app-render expects webpack-shaped records.

### `nextjs/src/build/webpack/plugins/flight-client-entry-plugin.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/build/webpack/plugins/flight-client-entry-plugin.ts`

Imitates/copies these upstream lines:

- `flight-client-entry-plugin.ts:L67-L99`: `ActionManifest` shape.
- `flight-client-entry-plugin.ts:L101-L132`: plugin state for server action and
  RSC module records.
- `flight-client-entry-plugin.ts:L137-L204`: CSS/client import dedupe rules, if
  visual fidelity requires them.

Associated imports from those lines:

- `SERVER_REFERENCE_MANIFEST`
- `WEBPACK_LAYERS`
- `next-flight-action-entry-loader`
- `next-flight-client-entry-loader`

Copies/adapts:

1. Server Action manifest shape.
2. Worker record shape.
3. CSS/client entry dedupe only if needed for visual output.

Direct imports:

- Prefer runtime action handling imports over plugin execution.

Higher/lower consideration:

- Higher candidate: run `FlightClientEntryPlugin`.
- Why not higher: graph-owning webpack plugin.
- Lower fallback: ad hoc action map.
- Why not lower: Server Action protocol expects Next-shaped records.

### `nextjs/src/client/app-index.tsx`

Imitates/copies from:

- `vercel/next.js/packages/next/src/client/app-index.tsx`

Imitates/copies these upstream lines:

- `app-index.tsx:L58-L77`: Flight segment tuple and `window.__next_f`.
- `app-index.tsx:L79-L110`: `nextServerDataCallback()` for bootstrap, string,
  form-state, and binary segments.
- `app-index.tsx:L125-L130`: flushing buffered Flight chunks into the stream.

Associated imports from those lines:

- `react-server-dom-webpack/client`
- `createMutableActionQueue`
- `AppRouter`
- `createInitialRouterState`
- `callServer`

Copies/adapts:

1. Inline Flight bootstrap parser.
2. Form-state segment handling when supported.
3. Document hydration behavior compatible with Vitest-owned document.

Direct imports in this imitation:

- `next/dist/client/app-bootstrap.js`
- `next/dist/client/components/app-router.js`
- `next/dist/client/components/app-router-instance.js`
- `next/dist/client/components/router-reducer/create-initial-router-state.js`
- `next/dist/client/components/router-reducer/router-reducer.js`

Higher/lower consideration:

- Higher candidate: real `app-index.tsx`.
- Why not higher: it owns top-level document bootstrap.
- Lower fallback: fake router/hydration.
- Why not lower: business and visual navigation should use real App Router.

## Public Surface And Pure Imports

Top-level public files such as `nextjs/plugin.ts`, `nextjs/testing-library.tsx`,
`nextjs/client.tsx`, and `nextjs/msw.ts` are package API surface. They may be
custom because they are not inside the internal `nextjs/src` mirror.

Pure direct imports from Next do not get internal files. Examples:

- Config loading should direct import `next/dist/server/config.js`.
- Custom routes should direct import `next/dist/lib/load-custom-routes.js`.
- `@next/routing` should be imported directly.
- `next/dist/server/web/adapter.js` should be imported directly unless copying
  is required.

## Ideal Internal Layout

Only create these files when they imitate/copy the matching upstream source.
Most files below are fallback-only: if the direct import or higher loader works,
the mirror file should not exist.

```text
packages/vitest-plugin-rsc/src/nextjs/src/
  build/
    webpack-config.ts                         # mirror when Vite config needs copied webpack-config decisions
    entries.ts                                # fallback-only if getAppEntry cannot be imported

    adapter/
      build-complete.ts                       # mirror for unexported adapter routing conversion

    analysis/
      get-page-static-info.ts                 # fallback-only if getMiddlewareMatchers cannot be imported

    templates/
      edge-ssr-app.ts                         # fallback-only if edge loader/loadEntrypoint works
      edge-app-route.ts                       # fallback-only if edge loader/loadEntrypoint works

    webpack/
      loaders/
        next-swc-loader.ts                    # mirror if next-swc-loader behavior must be copied
        next-app-loader/
          index.ts                            # fallback-only if real next-app-loader output is consumable
        next-edge-ssr-loader/
          index.ts                            # fallback-only if real loader can run in Vite context
        next-edge-app-route-loader/
          index.ts                            # fallback-only if real loader can run in Vite context
        next-font-loader/
          index.ts                            # fallback-only if real next-font-loader cannot run
        next-image-loader/
          index.ts                            # fallback-only if real next-image-loader cannot run
        next-metadata-image-loader.ts         # fallback-only if real loader cannot run
        next-root-params-loader.ts            # fallback-only if real loader cannot run
      plugins/
        flight-manifest-plugin.ts             # mirror only manifest shape, not graph plugin
        flight-client-entry-plugin.ts         # mirror only action manifest shape, not graph plugin
        next-font-manifest-plugin.ts          # mirror only font manifest shape

  client/
    app-index.tsx                             # mirror only hydration/bootstrap pieces

  server/
    web/
      adapter.ts                              # fallback-only if direct server/web/adapter import fails
      edge-route-module-wrapper.ts            # fallback-only if direct import fails
```

Do not create files such as `nextjs/src/build/config.ts`,
`nextjs/src/build/transforms.ts`, `nextjs/src/server/request.ts`, or
`nextjs/src/runtime/shims.ts` unless they are reframed as imitating a concrete
Next source file with exact upstream line ranges.
