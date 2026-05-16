# Next.js App Router Fidelity Architecture

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

Use this source order for every fidelity decision:

1. Import and call the installed Next, Vite, Vitest, React, or
   `@vitejs/plugin-rsc` module directly.
2. Invoke the real Next loader, compiler transform, runtime helper, or RSC
   helper behind the narrowest Vite/Vitest adapter.
3. Copy the smallest non-importable upstream block, with exact source lines,
   `Begin copy` / `End copy` markers, and an adaptation note.
4. Add local behavior only as a last resort. The local code must explain why the
   upstream path is blocked and must have a regression test for the
   user-visible behavior.

PR #45 is the precedent for this mindset: when CJS `"use client"` handling
blocked real Next modules, it explored a generic browser/RSC CJS bridge instead
of adding more Next-specific stubs. Local shims are allowed as proving grounds,
but generic lower-layer fixes should be patched or upstreamed when possible.

## Constraints

Ownership boundaries are part of the architecture, not review preferences.
Next.js owns App Router semantics: route discovery, route conventions, loader
trees, route modules, metadata, static info, request stores, cookies, headers,
draft mode, redirects, access fallbacks, cache state, fetch patching, app render,
fonts, images, App Router API modules, aliases, defines, compiler options, and
runtime globals.

Vite is the bundler. Webpack and Turbopack do not own module resolution,
transforms, HMR, optimizer behavior, RSC graph splitting, or manifests.
`@vitejs/plugin-rsc` owns RSC boundaries, client references, server references,
Server Action loading, Flight serialization/deserialization, and Vite
ModuleRunner transport between the server, browser, and SSR environments. Do not
replace that with Next's webpack/Turbopack RSC graph, layer graph, client
reference graph, or manifest graph.

Vitest owns the browser document. We cannot serve a real top-level Next
document. We can ask Next for HTML/Flight and hydrate a Next-like document
inside the Vitest page while preserving the Vite/Vitest harness.

The Vite RSC environment names are fixed:

- `client` is the RSC/edge-server environment. It uses `react-server` and
  `edge-light` conditions and defines `process.env.NEXT_RUNTIME` as `"edge"`.
- `react_client` is the visible browser App Router and Client Component
  environment. It uses browser conditions, Next browser React aliases, and
  defines `process.env.NEXT_RUNTIME` as `""`.
- `react_ssr` is the browser-ish SSR environment used to turn Flight data into
  HTML for hydration.

Runtime code must not assume a Node test runner or a running Next dev server.
The "server" side runs inside Vitest Browser Mode through Vite environments and
should use Web APIs unless a narrowly scoped shim mirrors real Next behavior.

The runtime target is App Router Edge/Web API only for now. This is a support
boundary for this adapter, not a claim that Node runtime apps do not work in
production Next.js. If a feature fundamentally requires Node runtime semantics,
we leave it unsupported in this adapter for now.

Because the runtime target is Edge/Web, the runtime bootstrap must follow
Next's Edge templates, not Next's Node server bootstrap. Do not import
`next/dist/server/node-environment.js` or
`next/dist/server/node-environment-baseline.js` in the Edge App Router runtime
path. Those files belong to Next's Node server path (`next-server.ts`,
`router-server.ts`, build workers, and export workers). If a direct low-level
Next server import fails because it expected that Node bootstrap, that is a sign
we are importing the wrong layer for this adapter. Move higher to the Edge
template/loader/adapter path instead of patching the Edge runtime with
`node-environment`.

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
  -> Edge/Web runtime bootstrap
       App Page: server/web/globals from edge-ssr-app
       App Route: edge-app-route through EdgeRouteModuleWrapper/server/web/adapter
       never server/node-environment or server/node-environment-baseline
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
- Vite virtual modules replace build output files when needed, and their
  payload generators belong under the Next source file that would have produced
  that artifact.
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

Same-origin request routing must preserve Next's observed App Router order:

1. Redirects.
2. `beforeFiles` rewrites.
3. Exact App Page or App Route match.
4. `afterFiles` rewrites.
5. Dynamic App Page or App Route match.
6. `fallback` rewrites.

Array-form rewrites normalize to `afterFiles`. An `afterFiles` rewrite must not
hide an existing exact app route. If this behavior cannot be delegated directly
to `@next/routing` plus Next-produced routing data, the adapter code must live
under the Next source file that produces or consumes that routing data, not in
`testing-library.tsx`.

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

Redirects are an observable browser contract. Tests must prove the redirect
branch was hit, for example by asserting target-route UI plus a
redirect-specific marker such as a preserved `from=` query value. Form and
Server Action redirects must be client-side App Router navigations through the
hydrated React tree; a hard document navigation that leaves Vitest on a blank
page is a regression.

Hydration must stay tied to Next app-index semantics. The adapter may parse the
`self.__next_f.push(...)` bootstrap tuple shape that `app-index.tsx` consumes,
but it must not scan arbitrary document HTML for broad magic strings. Document
hydration must preserve Vite/Vitest harness scripts, and visible navigation must
go through `NextAppRouter` rather than a local router element or navigation spy.

The same file can participate in multiple phases, but the phase boundary should
stay explicit. For example, `edge-ssr-app` is runtime code generated at
build-time. `next-app-loader` is build-time code whose loader tree is consumed
at runtime. `server/web/adapter` is runtime code used by middleware, App Page
edge entries, and App Route edge entries.

Dependency optimization is build/test startup work, not request runtime work.
Hidden `react_client` and `react_ssr` environments must not discover app-shell
dependencies mid-test because that can reload the browser page. The base RSC
plugin should copy optimizer scan roots from the visible Vitest browser client,
and the Next adapter should contribute route-discovered entrypoints shaped like
Next `entries.ts` output. A broad `app/**` source scan is only a temporary
fallback. Demo apps must not include broad ESM app-shell dependencies in
`optimizeDeps.include`; explicit prebundling should be limited to CJS
dependencies, resolvable Next internals, or a focused optimizer regression.

Vite virtual modules are not an exception to the mirror rule. The Vite
`resolveId` / `load` hook dispatch is adapter plumbing, but the code that
generates a virtual module payload must live under the exact Next source file it
imitates or adapts:

```text
virtual:vitest-plugin-rsc/next-entrypoints
  -> nextjs/src/build/entries.ts
     imitates Next's App Router entry creation and the build graph roots that
     webpack would discover from those entries

virtual:vitest-plugin-rsc/next-route-tree?...
  -> nextjs/src/build/webpack/loaders/next-app-loader/index.ts
     imitates next-app-loader output: loader tree, userland module imports, and
     convention module references

virtual:vitest-plugin-rsc/next-routes
  -> nextjs/src/build/adapter/build-complete.ts
     imitates route manifest to adapter routing data conversion

future virtual Edge App Page entry
  -> nextjs/src/build/webpack/loaders/next-edge-ssr-loader/index.ts
     or nextjs/src/build/templates/edge-ssr-app.ts when the loader/template must
     be copied or substantially adapted

future virtual Edge App Route entry
  -> nextjs/src/build/webpack/loaders/next-edge-app-route-loader/index.ts
     or nextjs/src/build/templates/edge-app-route.ts when the loader/template
     must be copied or substantially adapted
```

The virtual ID does not decide ownership. The payload decides ownership. If a
virtual module contains Next build-time semantics, it must point at the upstream
Next file and line range that would have produced equivalent webpack output,
`.next` artifact data, or runtime entry code.

Virtual payloads must keep a structure comparable to the webpack/Next artifact
they replace: the same meaningful exports, entry shape, loader/template shape,
manifest fields, request metadata, and protocol data where those exist upstream.
Do not invent a local convenience API and call it equivalent. If Vite needs a
small translation layer, keep that layer outside the Next-owned payload and make
the payload itself look like the thing webpack or Next would have generated.

The intended glue contract for virtual modules is:

- The public virtual ID is only the Vite transport address.
- The query, exports, and serialized objects are the Next contract.
- `next-route-tree` query data must be `AppLoaderOptions`-shaped and serialized
  like `entries.ts#getAppEntry()` serializes `next-app-loader` requests with
  `querystring.stringify`.
- `page`, `pagePath`, `appPaths`, and `allNormalizedAppPaths` must keep Next's
  meanings. For example, `page`/`appPaths` use App Router page paths such as
  `/notes/page`, while `allNormalizedAppPaths` uses the normalized route-key
  set from `appPathsPerRoute`, such as `/notes`.
- `next-route-tree` exports `tree` because the upstream `app-page` template
  consumes `tree`; `loaderTree` is only an adapter manifest property after that
  boundary.
- `next-routes` exports `routing` because `build-complete.ts` calls
  `onBuildComplete({ routing })`; `nextRoutingData` can exist only as a
  compatibility alias.

Concrete naming/data parity:

| Vite module/artifact                            | Webpack/Next source                                      | Upstream names and data to preserve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `virtual:vitest-plugin-rsc/next-entrypoints`    | `entries.ts#getAppEntry()`                               | Preserve the `getAppEntry()` entry shape: `import` is a `next-app-loader?${AppLoaderOptions}!` request and `layer` is `WEBPACK_LAYERS.reactServerComponents`. If the Vite optimizer needs a scan-only module, derive it from the same `AppLoaderOptions` fields (`name`, `page`, `pagePath`, `appDir`, `appPaths`, `allNormalizedAppPaths`, `pageExtensions`, `basePath`, `assetPrefix`, `rootDir`, `tsconfigPath`, `isDev`, `nextConfigOutput`, `preferredRegion`, `middlewareConfig`, `isGlobalNotFoundEnabled`) rather than inventing a smaller route model. |
| `virtual:vitest-plugin-rsc/next-route-tree?...` | `next-app-loader` + `app-page` template                  | Preserve the generated names injected into `app-page`: `tree`, `__next_app_require__`, and `__next_app_load_chunk__`. The Vite module may export `tree` for consumption, but it must not rename the payload to a local concept such as `loaderTree` before the adapter boundary.                                                                                                                                                                                                                                                                                |
| `virtual:vitest-plugin-rsc/next-routes`         | `build-complete.ts#onBuildComplete()`                    | Preserve the adapter field name `routing` and its object shape: `beforeMiddleware`, `beforeFiles`, `afterFiles`, `dynamicRoutes`, `onMatch`, `fallback`, `shouldNormalizeNextData`, and `rsc` when supported. Extra Vitest manifest exports may exist next to it, but request routing should consume `routing` as the Next-owned payload.                                                                                                                                                                                                                       |
| Future Edge App Page virtual entry              | `next-edge-ssr-loader` + `edge-ssr-app` template         | Preserve `pageModPath` / `VAR_USERLAND`, `VAR_PAGE`, cache handler injection, exported `ComponentMod`, exported `handler`, and the default backwards-compatible handler shape.                                                                                                                                                                                                                                                                                                                                                                                  |
| Future Edge App Route virtual entry             | `next-edge-app-route-loader` + `edge-app-route` template | Preserve `modulePath` / `VAR_USERLAND`, `VAR_PAGE`, cache handler injection, exported `ComponentMod`, exported `handler`, and the default backwards-compatible handler shape.                                                                                                                                                                                                                                                                                                                                                                                   |

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
  -> Next server/web/adapter
       direct import preferred; mirror nextjs/src/server/web/adapter.ts only if copying
       runs middleware/proxy semantics when @next/routing invokes middleware
  -> Edge App Page entry
       next-edge-ssr-loader / loadEntrypoint preferred
       mirror nextjs/src/build/templates/edge-ssr-app.ts only if copying
       handles App Page HTML, Flight, and app-render action responses
  -> Edge App Route entry
       next-edge-app-route-loader / loadEntrypoint preferred
       mirror nextjs/src/build/templates/edge-app-route.ts only if copying
       handles App Route route.ts responses
  -> app-index semantics
       direct App Router imports preferred
       mirror nextjs/src/client/app-index.tsx only for copied bootstrap/hydration pieces
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

## Support Boundaries And Review Contract

This document describes the target architecture. A feature is not a support
claim until the matching Next-owned path is wired, covered by tests, and tracked
in `nextjs-fidelity-architecture-tracker.md`.

Unsupported or unclaimed behavior must fail clearly or stay undocumented as a
feature. Do not make a demo pass with app-local mocks, local route runners,
fake router state, or broad source rewrites that imply unsupported Next
semantics.

These remain unsupported unless a later section explicitly maps them to a
working Next source path and tests:

- Pages Router.
- `next/legacy/image`.
- Production Next build output fidelity.
- PPR/progressive timing fidelity.
- Node.js runtime parity.
- `instrumentation.ts` and `instrumentation-client.ts` startup lifecycles.
- `mdx-components.tsx` without a delegated MDX compiler path.
- Next image optimizer endpoint behavior.
- Cached components with `children` / encrypted `boundArgsLength` cache call
  shape.
- Route handlers as `renderServer({ url })` targets unless they run through the
  Edge App Route path and `AppRouteRouteModule.handle()`.

Tests should cover framework behavior, not just demo behavior. Use notes-demo
browser tests for user-visible App Router behavior such as route matching,
layouts, params, metadata, document/head behavior, cookies, headers, redirects,
Server Actions, refresh, request stores, client navigation, forms, CSS, fonts,
and images. Use MSW-routed transport when request/response semantics matter.
Use package-level tests for adapter internals such as transforms, aliases,
loader adapters, optimizer behavior, manifest proxies, runtime shims, and
version gates.

Before accepting a fidelity change, verify that it deletes or narrows glue where
a real Next/Vite/Vitest/RSC entrypoint can own the behavior, that every copied
block has source links and adaptation notes, that every local shim names the
upstream behavior it mirrors, and that no webpack/Turbopack RSC graph or Next
dev server was introduced.

## Internal Files That Imitate Next.js

Most files in this section should not exist forever. They are a map for the
glue we may need while making Next internals work inside Vite/Vitest. The
preferred end state is that many of these paths disappear by going higher up in
Next's own pipeline: use the real entry/template/loader/module that already owns
the behavior instead of keeping a lower-level mirror. Direct `next/dist/...`
imports are good when that is the highest practical owner; otherwise prefer the
higher Next layer even if it means adapting a larger boundary once and deleting
several lower shims. A file under `nextjs/src/` is acceptable only while it
copies or substantially adapts a specific upstream Next file and line range.

Every section below names the local file, the upstream file it imitates, the
line ranges that matter, the associated imports, and the higher/lower
consideration. Treat "Direct imports", "Higher candidate", and "Why not higher"
as deletion pressure: when the higher/direct path works, remove the mirror file
instead of keeping a wrapper around it.

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

Inputs consumed before this imitation:

- `next/dist/server/config.js`
- `next/dist/lib/load-custom-routes.js`
- `next/dist/lib/find-pages-dir.js`
- `next/dist/build/load-jsconfig.js`
- `next/dist/build/utils.js`
- `next/dist/shared/lib/image-config.js`

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

Virtual modules/artifacts owned:

- `virtual:vitest-plugin-rsc/next-entrypoints`: Vite optimizer/build-scan entry
  module generated from Next App Router entry creation. It must import the
  route-tree virtual modules and route handler modules discovered from the same
  App Router entry facts that webpack would have received from `entries.ts`.
  Preserve `getAppEntry()` naming and data: the canonical upstream entry has an
  `import` request shaped like `next-app-loader?${AppLoaderOptions}!` and a
  `WEBPACK_LAYERS.reactServerComponents` layer. Any scan-only Vite module must
  be derived from those `AppLoaderOptions` field names, including dev-only
  fields such as `rootDir`, `tsconfigPath`, and `isDev`, not from a local route
  model.

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

### `nextjs/src/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts`

Imitates/copies these upstream lines:

- `dev-app-page-route-matcher-provider.ts:L10-L103`: App Page matcher provider,
  page/default file matching, app path grouping, catch-all normalization, and
  deterministic parallel-route sorting.

Associated imports from those lines:

- `AppPageRouteMatcher`
- `RouteKind.APP_PAGE`
- `DevAppNormalizers`
- `normalizeCatchAllRoutes`
- `compareAppPaths`

Copies/adapts:

1. App Page route discovery only when the real provider needs a Vite-specific
   `FileReader` or app-dir boundary.
2. App path grouping used later by `next-app-loader` entry options.

Direct imports in this imitation:

- `next/dist/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.js`,
  preferred.

Higher/lower consideration:

- Higher candidate: real Next dev matcher provider.
- Lower fallback: local `app/**/page.tsx` globbing.
- Why not lower: route groups, parallel slots, defaults, and catch-all
  normalization are Next-owned.

### `nextjs/src/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts`

Imitates/copies these upstream lines:

- `dev-app-route-route-matcher-provider.ts:L16-L138`: App Route matcher
  provider, metadata route handling, ignored route filtering, normalizers, and
  `AppRouteRouteMatcher` creation.

Associated imports from those lines:

- `AppRouteRouteMatcher`
- `RouteKind.APP_ROUTE`
- `isAppRouteRoute`
- `isMetadataRouteFile`
- `isStaticMetadataRoute`
- `isStaticMetadataFile`
- `normalizeMetadataPageToRoute`

Copies/adapts:

1. App Route and metadata route discovery only when the real provider needs a
   Vite-specific file reader or app-dir boundary.
2. The distinction between static metadata files and metadata route handlers.

Direct imports in this imitation:

- `next/dist/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.js`,
  preferred.

Higher/lower consideration:

- Higher candidate: real Next dev matcher provider.
- Lower fallback: local `app/**/route.ts` globbing.
- Why not lower: metadata route mapping and ignored route filtering are
  Next-owned.

### `nextjs/src/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.ts`

Imitates/copies these upstream lines:

- `default-file-reader.ts:L14-L52`: `DefaultFileReader` behavior, recursive
  absolute-path reads, pathname filters, ignored path parts, and unsorted output.

Associated imports from those lines:

- `recursiveReadDir`
- `DefaultFileReaderOptions`
- `FileReader`

Copies/adapts:

1. File-reader setup for the real dev route matcher providers.
2. Vite project-root and extension filtering only at the adapter boundary.

Direct imports in this imitation:

- `next/dist/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.js`,
  preferred.

Higher/lower consideration:

- Higher candidate: real `DefaultFileReader`.
- Lower fallback: ad hoc recursive app-dir reads.
- Why not lower: route discovery should stay aligned with Next's dev matchers.

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

Virtual modules/artifacts owned:

- `virtual:vitest-plugin-rsc/next-route-tree?...`: Vite representation of the
  `next-app-loader` generated module for one App Page route. It must expose the
  loader tree and the rewritten userland/convention module imports that app-render
  consumes. Preserve the upstream injected names from `app-page`: `tree`,
  `__next_app_require__`, and `__next_app_load_chunk__`. If Vite exports the
  tree for another virtual module to import, the export name should be `tree`;
  `loaderTree` is only the adapter manifest property used after this boundary.

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

### `nextjs/src/server/lib/app-dir-module.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/server/lib/app-dir-module.ts`

Imitates/copies these upstream lines:

- `app-dir-module.ts:L4-L29`: `LoaderTree` tuple shape generated by
  `next-app-loader`.
- `app-dir-module.ts:L31-L68`: convention module lookup helpers for layout,
  page, default page, and access fallback modules.

Associated imports from those lines:

- `AppDirModules`
- `DEFAULT_SEGMENT_KEY`

Copies/adapts:

1. The `LoaderTree` tuple shape only when TypeScript/runtime glue needs to name
   the payload crossing from loader output into app-render.
2. Do not reinterpret the tuple into a local route tree before the Next boundary.

Direct imports in this imitation:

- `next/dist/server/lib/app-dir-module.js`, preferred for types/helpers where
  available.

Higher/lower consideration:

- Higher candidate: let `next-app-loader` and App Page route modules consume the
  tree directly.
- Lower fallback: local loader-tree object model.
- Why not lower: app-render consumes Next's tuple shape.

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

Virtual modules/artifacts owned:

- Future `virtual:vitest-plugin-rsc/next-edge-ssr-app?...`: Vite representation
  of the edge App Page entry generated by `next-edge-ssr-loader`. It must point
  at the App Page module produced from the loader tree and expand
  `loadEntrypoint("edge-ssr-app")` without letting webpack own the graph.

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

- `../../server/web/globals`
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

Virtual modules/artifacts owned:

- Future `virtual:vitest-plugin-rsc/next-edge-ssr-app?...` fallback payload, but
  only when `next-edge-ssr-loader` or `loadEntrypoint("edge-ssr-app")` cannot
  generate the entry. If this template owns the payload, the virtual module must
  be a source-linked adaptation of `edge-ssr-app.ts`, not a local render wrapper.

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

Must not import:

- `next/dist/server/node-environment.js`
- `next/dist/server/node-environment-baseline.js`

Why: `edge-ssr-app.ts` imports `server/web/globals`, then goes through
`server/web/adapter`. Node environment setup is from Next's Node server path,
not this Edge App Page path.

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

Virtual modules/artifacts owned:

- Future `virtual:vitest-plugin-rsc/next-edge-app-route?...`: Vite
  representation of the edge App Route entry generated by
  `next-edge-app-route-loader`. It must point at the userland `route.ts` module
  and expand `loadEntrypoint("edge-app-route")` without letting webpack own the
  graph.

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

Virtual modules/artifacts owned:

- Future `virtual:vitest-plugin-rsc/next-edge-app-route?...` fallback payload,
  but only when `next-edge-app-route-loader` or
  `loadEntrypoint("edge-app-route")` cannot generate the entry. If this template
  owns the payload, the virtual module must be a source-linked adaptation of
  `edge-app-route.ts`, not a direct userland handler caller.

Direct imports in this imitation:

- `next/dist/server/web/edge-route-module-wrapper.js`
- `next/dist/server/web/utils.js`
- `next/dist/server/route-modules/app-route/module.compiled.js`

Must not import:

- `next/dist/server/node-environment.js`
- `next/dist/server/node-environment-baseline.js`

Why: `edge-app-route.ts` does not use the Node server bootstrap. It wraps the
route module with `EdgeRouteModuleWrapper`, which calls `server/web/adapter`.
If direct route-module imports need Node-only globals, the adapter is too low in
the stack and should move back up to the Edge loader/template/wrapper.

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

Virtual modules/artifacts owned:

- `virtual:vitest-plugin-rsc/next-routes`: Vite representation of Next's route
  manifest plus adapter routing data. It must export the discovered App Page and
  App Route manifest entries and the serialized `@next/routing` data that
  `build-complete.ts` would pass to adapter `onBuildComplete`. The Next-owned
  export name for the routing payload is `routing`, matching
  `onBuildComplete({ routing })`; compatibility aliases may exist, but request
  routing should consume `routing`.

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

Lower fallback imports if the real loader cannot run:

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

### `nextjs/src/server/use-cache/handlers.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/server/use-cache/handlers.ts`

Imitates/copies these upstream lines:

- `handlers.ts:L10-L26`: global cache handler symbols and shared reference
  object.
- `handlers.ts:L34-L80`: `initializeCacheHandlers()`.
- `handlers.ts:L88-L140`: cache handler lookup and mutation APIs.

Associated imports from those lines:

- `createDefaultCacheHandler`
- `CacheHandler`

Copies/adapts:

1. Cache handler initialization and custom handler registration only at the
   Vite config/runtime boundary.
2. Do not create a parallel cache registry when Next's handler module can be
   imported.

Direct imports in this imitation:

- `next/dist/server/use-cache/handlers.js`, preferred.

Higher/lower consideration:

- Higher candidate: Next App Page route module setup that initializes handlers
  through the Edge entry.
- Lower fallback: local cache handler map.
- Why not lower: `use-cache-wrapper` reads Next's global handler registry.

### `nextjs/src/server/use-cache/use-cache-wrapper.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/server/use-cache/use-cache-wrapper.ts`

Imitates/copies these upstream lines:

- `use-cache-wrapper.ts:L1-L78`: React Flight, async-storage, manifest, cache
  handler, and dynamic-rendering imports used by the cache wrapper.
- `use-cache-wrapper.ts:L100-L124`: cache key part and cached page/layout prop
  shapes.
- `use-cache-wrapper.ts:L1084-L1126`: exported `cache()` call shape, cache
  handler lookup, and required WorkStore/WorkUnitStore validation.

Associated imports from those lines:

- `workAsyncStorage`
- `workUnitAsyncStorage`
- `getClientReferenceManifest`
- `getServerModuleMap`
- `getCacheHandler`
- `decryptActionBoundArgs`

Copies/adapts:

1. The call shape for hoisted `"use cache"` functions.
2. Runtime wrapper wiring around Next's real `cache()` implementation.
3. Unsupported encrypted `boundArgsLength`/children call shapes must fail
   clearly instead of inventing local cache keys.

Direct imports in this imitation:

- `next/dist/server/use-cache/use-cache-wrapper.js#cache`, preferred.

Higher/lower consideration:

- Higher candidate: Next compiler output for `"use cache"`.
- Why not higher: Next's RSC/compiler transform would take ownership from
  `@vitejs/plugin-rsc`.
- Lower fallback: local memoization.
- Why not lower: cache tags, work stores, invalid dynamic access, and cache
  handler behavior are Next-owned.

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

### `nextjs/src/server/app-render/entry-base.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/server/app-render/entry-base.ts`

Imitates/copies these upstream lines:

- `entry-base.ts:L1-L14`: React Flight server/static exports and React exports
  re-exported through Next's server entry base.
- `entry-base.ts:L16-L46`: client component, request, metadata, access
  fallback, preload, postpone, taint, and segment-data exports.
- `entry-base.ts:L59-L103`: work store imports, devtools exports, HMR globals,
  and `patchFetch()`.

Associated imports from those lines:

- `react-server-dom-webpack/server`
- `react-server-dom-webpack/static`
- `client/components/layout-router`
- `client/components/client-page`
- `client/components/client-segment`
- `server/request/search-params`
- `server/request/params`
- `server/lib/patch-fetch`

Copies/adapts:

1. Only the RSC client-reference boundary for client imports re-exported by
   `entry-base`.
2. This is temporary Next-specific glue. If `@vitejs/plugin-rsc` preserves CJS
   `"use client"` dependencies during RSC optimization, delete this adapter or
   reduce it to any remaining Next-only metadata.

Direct imports in this imitation:

- `next/dist/server/app-render/entry-base.js`, preferred.

Higher/lower consideration:

- Higher candidate: real `entry-base.js` plus generic RSC CJS client-reference
  handling.
- Lower fallback: per-export Next client stubs.
- Why not lower: it grows a local copy of Next's App Router client boundary.

### `nextjs/src/shared/lib/server-reference-info.ts`

Imitates/copies from:

- `vercel/next.js/packages/next/src/shared/lib/server-reference-info.ts`

Imitates/copies these upstream lines:

- `server-reference-info.ts:L1-L5`: `ServerReferenceInfo` shape.
- `server-reference-info.ts:L7-L54`: server action vs `"use cache"` ID bit
  parsing.
- `server-reference-info.ts:L56-L83`: unused argument omission.

Associated imports from those lines:

- None.

Copies/adapts:

1. Alias or proxy only when Next internals need this helper across the Vite RSC
   boundary.
2. Do not duplicate server reference ID parsing locally when the installed helper
   resolves.

Direct imports in this imitation:

- `next/dist/shared/lib/server-reference-info.js`, preferred.

Higher/lower consideration:

- Higher candidate: direct installed helper import.
- Lower fallback: local bit parsing.
- Why not lower: Server Action and `"use cache"` reference IDs are Next-owned.

### `nextjs/src/client/components/builtin/global-error.tsx`

Imitates/copies from:

- `vercel/next.js/packages/next/src/client/components/builtin/global-error.tsx`

Imitates/copies these upstream lines:

- `global-error.tsx:L1-L11`: client directive and default global-error
  component type.
- `global-error.tsx:L13-L66`: default global-error UI, ISR error handling, and
  default export signature.

Associated imports from those lines:

- `handleISRError`
- `errorStyles`
- `errorThemeCss`
- `WarningIcon`

Copies/adapts:

1. Built-in global-error fallback only when the app does not provide a
   `global-error` module and Next's app-render manifest expects the built-in
   module record.
2. Prefer loading the real built-in client module as a client reference where
   Vite can preserve the boundary.

Direct imports in this imitation:

- `next/dist/client/components/builtin/global-error.js`, preferred.

Higher/lower consideration:

- Higher candidate: user or built-in global-error module from the loader tree.
- Lower fallback: local error page.
- Why not lower: root error fallback UI and module signatures are Next-owned.

### `nextjs/src/client/app-index.tsx`

Imitates/copies from:

- `vercel/next.js/packages/next/src/client/app-index.tsx`

Imitates/copies these upstream lines:

- `app-index.tsx:L58-L77`: Flight segment tuple and `window.__next_f`.
- `app-index.tsx:L79-L110`: `nextServerDataCallback()` for bootstrap, string,
  form-state, and binary segments.
- `app-index.tsx:L125-L130`: flushing buffered Flight chunks into the stream.
- `shared/lib/app-router-types.ts:L290-L325`: `InitialRSCPayload` fields
  consumed by `createInitialRouterState()`.
- `client/components/app-router-instance.ts:L220-L256`:
  `createMutableActionQueue()` state and singleton behavior.

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

## Possible Internal Mirror Paths

This is not a target file list, and it is not an implementation checklist. It is
the maximum allowed set of exact mirror paths if copying or substantial
adaptation becomes necessary. The preferred outcome is fewer files than this by
going higher up in Next's pipeline. For example, a working Edge App Page entry
should delete lower render/request shims; a working `next-app-loader` entry
should delete local loader-tree construction; a working generic RSC CJS boundary
should delete Next-specific `entry-base` proxies. Most files below are
fallback-only: if the direct import, real loader, or higher Edge entry works, the
mirror file should not exist.

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
    components/
      builtin/
        global-error.tsx                      # fallback-only if built-in module cannot be loaded as client reference

  server/
    app-render/
      entry-base.ts                           # temporary mirror/proxy for CJS client-reference boundary only
    lib/
      app-dir-module.ts                       # mirror only loader-tree tuple/helpers when direct import cannot own it
    route-matcher-providers/
      dev/
        dev-app-page-route-matcher-provider.ts  # fallback-only around real dev matcher provider
        dev-app-route-route-matcher-provider.ts # fallback-only around real dev matcher provider
        helpers/
          file-reader/
            default-file-reader.ts            # fallback-only around real file reader
    use-cache/
      handlers.ts                             # fallback-only if real cache handler registry cannot be imported
      use-cache-wrapper.ts                    # fallback-only around real cache() call shape
    web/
      adapter.ts                              # fallback-only if direct server/web/adapter import fails
      edge-route-module-wrapper.ts            # fallback-only if direct import fails

  shared/
    lib/
      server-reference-info.ts                # fallback-only if direct helper import cannot cross Vite boundary
```

Do not create files such as `nextjs/src/build/config.ts`,
`nextjs/src/build/transforms.ts`, `nextjs/src/server/request.ts`, or
`nextjs/src/runtime/shims.ts` unless they are reframed as imitating a concrete
Next source file with exact upstream line ranges.
