# Next.js Edge App Page Delegation

Status: P1 Edge App Page route-runtime migration has focused browser gates
passing, including redirect coverage for next.config initial redirects, browser
RSC navigation, hydrated `next/link` / `router.push` / `router.replace` client
navigation, Server Action POST, and App Route/API fetches. Focused Server Action
protocol coverage now also exercises real exported redirect actions through the
generated Edge App Page handler and MSW, asserting Next's 303 +
`x-action-redirect` response semantics. Full App Page and Edge App Page
virtual modules are generated, and the focused initial HTML/Flight, browser RSC
GET, and Server Action POST gates dispatch through `src/server/next-server.ts`
into generated Edge App Page handlers. The focused App Route browser fixture
dispatches through MSW to the generated Edge App Route handler. MSW is the
supported browser/runtime transport for browser-originated RSC/navigation/API
requests and Server Action POSTs, while initial SSR/document rendering is not an
MSW transport: it is the test harness/runtime path consuming generated Edge App
Page artifacts directly. The P1 route-runtime target is real filesystem App Page
routes discovered from `app/**/page.*`; `renderServer(<ReactNode />)` is outside
this App Page route architecture. There is no separate compatibility mode for old
direct-node/local app-render glue, route-entry replacement helpers, or fake
routes.

The rule is no-own-logic: preserve Next/webpack-generated artifact shapes and
adapt only at the Vite bundler boundary. Do not hand-author App Page semantics.

## Current State

The old top-level App Page runtime wrapper and local app-render compatibility
files are deleted. The focused gates prove Edge dispatch ownership for initial
HTML/Flight, browser RSC GET, Server Action POST entry, and browser App Route
API dispatch. Follow-up work should keep shrinking manifest/cache/font adapters
only where they still translate Vite RSC graph data into Next-owned input
shapes.

Latest focused notes-demo check: the generated App Page `entry-base` import
attribute rewrite no longer strands `with { ... }` on synthetic `export const`
re-exports; a focused app-loader regression now guards that syntax. The CJS
`entry-base` gap remains limited to discovered Next `"use client"` boundaries;
generic RSC references and RSDW decode stay with `@vitejs/plugin-rsc`, except
for installed Next `react-server-dom-webpack` entry aliases and the SSR client
shim that passes the upstream server consumer manifest shape. The CJS boundary
restore now clears the focused `hasCjsBoundaryRuntimeQuery`/CJS ReferenceError
regression. Metadata route browser fetches now dispatch through MSW to generated
Edge App Route handlers: the Vite boundary resolves Next's generated
`next-metadata-route-loader?...!?__next_metadata_route__` request, invokes the
installed loader, and rewrites only absolute userland imports. The fixture uses
Next's generated `generateSitemaps()` URL shape (`/sitemap/[id].xml`, for
example `/sitemap/notes.xml`) instead of adding a local `/sitemap.xml` fallback.
The generated Edge render path now preserves browser Web Crypto for installed
Next server/edge render modules by binding their free `crypto` identifier to
`globalThis["crypto"]`, so clean-cache optimized `react_ssr` chunks keep Next's
Web Crypto calls without Node crypto assumptions. The focused Edge App Page
browser fixture no longer has the original optimized `crypto.subtle.digest`
request-id call in the generated app-page module cache. The later undefined
throw was traced to the generated full app-page `__next_app__.require` fallback:
React Flight SSR preloads async references and then requires them again, and the
fallback was returning a fresh dynamic-import Promise for each call. The fallback
now caches those imports in the generated require map, so this layer preserves
Next's async module status/value semantics instead of producing an undefined
`reason`. The next focused blocker is past that digest failure: initial render now
reaches Next's Flight/App Router SSR path and fails on an undefined element type
from client-boundary SSR module resolution, followed by the existing
`createMutableActionQueue was called more than once` recovery noise. Keep that
follow-up in the strict generated Edge path and do not reintroduce app-render
wrappers, helper boundary abstractions, fake route transports, local Flight
sniffing, or local digest parsing.

Remaining backlog is deliberately small: keep the browser/MSW Cookie-header
limitation documented, broaden Server Action error/access-fallback and
refresh/revalidation/cache header protocol coverage beyond the focused fixtures,
restore page-thrown initial render redirects as P2/later client-bootstrap work
once Next's app-index bootstrap consumes that control-flow without local Flight
sniffing, and keep synthetic/fake route exploration in P2 only if it can enter
through generated App Page artifacts.

## Notes Demo Migration Status

The notes demo browser suite now treats real filesystem App Pages as the P1
acceptance model. Page tests under `app/**/page.test.tsx` render real URLs with
`renderServer({ url })`; browser-observed RSC/navigation/API requests and Server
Action POSTs go through MSW; initial document rendering enters the generated
Edge App Page handler directly from the test harness.

Migrated probe-only browser tests now have real app routes instead of direct
ReactNode render calls: router hooks, client navigation, refresh probes, cache
probes, request-header/cookie probes, and the async-storage probe. Focused client
navigation coverage clicks `next/link`, `router.push`, and `router.replace`, and
asserts `window.location` plus the target route UI after MSW-routed RSC
navigation. The only remaining notes-demo browser TODOs are explicit out-of-scope
items:

- P2 synthetic route fixtures must be represented as generated App Page entries,
  not private fake routes or replacement helpers.
- P2/later client-bootstrap coverage must restore page-thrown initial render
  redirects through Next app-index/control-flow, not local Flight sniffing.
- Broader Server Action error/access-fallback and refresh/revalidation/cache
  header protocol assertions beyond the focused generated Edge redirect fixture
  remain follow-up coverage.

## Deletion Goal

P1 success means deleting local authored semantics, not adding a new local Edge
framework. The end state should have fewer dependencies between local adapter
files, fewer custom lifecycle helpers, and more behavior owned by installed Next
modules or generated Next artifacts.

Prefer this order:

1. Direct/generated Next artifact: real `next-app-loader` full output and real
   `next-edge-ssr-loader` / `edge-ssr-app` output.
2. Direct installed import from `next/dist/...` when the runtime helper is the
   highest practical owner.
3. Mechanical `Begin copy` block only when direct/generated use is impossible.
4. `Begin adapted` block only at a Vite/Vitest bundler boundary, with a deletion
   target.

`Begin adapted` blocks are liabilities. In P1 they should move toward direct
Next loader/template output, direct imports, or mechanically copied
source-linked `Begin copy` blocks when no direct path works. For Edge App Page,
this specifically means preferring real app-page userland output and real Edge
entry output over local app-page module synthesis, local render context
construction, or any local `renderToHTMLOrFlight()` wrapper. If
`renderToHTMLOrFlight()` runs at all, it is reached only inside installed Next
code through `AppPageRouteModule.render()`.

Rewrites are allowed only where Vite/Vitest replaces webpack mechanics: import
sources, virtual IDs, eager module values behind generated webpack IDs, and test
environment globals. They must not rename Next-owned fields or invent a local
request/render API. Do not add defensive compatibility for older in-branch
artifact models; replace them with the current Next-owned shape.

## Stop Line

Neither the spike nor the final architecture may introduce:

- a full Next webpack build;
- `createEntrypoints()` or `getBaseWebpackConfig()`;
- a Next dev server;
- `.next` build output as a requirement;
- a second webpack/Turbopack RSC graph, manifest graph, or layer graph;
- a rewrite of `testing-library-runtime.tsx`, `msw.ts`, or the existing render
  flow in the first spike slice;
- non-MSW side-channel support for browser-observed RSC/navigation/API requests
  or Server Action POSTs;
- MSW transport for initial SSR/document rendering;
- private probe headers or routes for browser acceptance;
- Vite dev-server middleware dispatch for browser acceptance;
- custom `ModuleRunner` side-channels or runtime dispatch paths;
- direct React-node/local app-render compatibility paths for App Page
  route architecture;
- a local `app-render.ts` App Page runtime wrapper that survives the Edge
  migration;
- fake or synthetic App Page routes that bypass real `next-app-loader` full
  output, `edge-ssr-app`, or the correct request owner: non-MSW initial render
  and MSW browser request transport.

MSW is the only supported browser/runtime transport for browser-originated Edge
App Page App Router requests: client RSC/navigation fetches, API-style browser
fetches, and Server Action POSTs. Initial SSR/document rendering is different: it
is initiated by the Vitest test harness/runtime and should import the generated
Edge App Page entry directly, without routing through MSW. No private probe
headers, dev-server middleware, or custom `ModuleRunner` side-channels may stand
in for either path. Do not preserve old non-MSW App Page route runtime behavior
in the Edge model.

## Spike Architecture

The spike began as isolated artifact generation and now feeds the runtime
dispatch path. Full `next-app-page`, `next-edge-ssr-app`, and Edge App Route
virtual modules are wired through the Vite plugin with focused unit coverage for
their generated shapes. Initial SSR/document rendering consumes the generated
Edge App Page handler through the test harness/runtime without MSW.
Browser-originated RSC/navigation/action/API requests go through MSW. Private
probe routes/headers, Vite dev-server middleware, and custom `ModuleRunner`
side-channels are not supported for either path.

### Spike Files

| File or virtual module                                                                               | Spike purpose                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/vitest-plugin-rsc/src/nextjs/src/build/webpack/loaders/next-edge-ssr-loader/index.test.ts` | Characterize `loadEntrypoint("edge-ssr-app")`, `ComponentMod`, `handler`, manifest singleton setup, `server/web/adapter` wrapping, and no Node bootstrap.                                                     |
| `packages/vitest-plugin-rsc/src/nextjs/src/build/webpack/loaders/next-edge-ssr-loader/index.ts`      | Vite bridge for real `next-edge-ssr-loader` or direct `loadEntrypoint("edge-ssr-app")`. It owns Edge entry generation only and points `VAR_USERLAND` at full `next-app-page` userland, not `next-route-tree`. |
| `packages/vitest-plugin-rsc/src/nextjs/src/build/webpack/loaders/next-app-loader/index.ts`           | Extend from tree-only extraction to a full App Page userland output mode while still invoking real `next-app-loader`.                                                                                         |
| `packages/vitest-plugin-rsc/src/nextjs/src/build/webpack/loaders/next-app-loader/index.test.ts`      | Add full-output characterization for `tree`, `routeModule`, `__next_app__`, entry-base exports, generated require keys, and eager Vite imports.                                                               |
| `packages/vitest-plugin-rsc/src/nextjs/virtual-ids.ts`                                               | Owns isolated virtual IDs for full App Page userland and Edge App Page entry.                                                                                                                                 |
| `packages/vitest-plugin-rsc/src/nextjs/route-manifest-plugin.ts`                                     | Vite resolver/source dispatcher for the isolated full App Page and Edge App Page virtual modules. It keeps the existing `next-route-tree` path tree-only.                                                     |
| `virtual:vitest-plugin-rsc/next-app-page?...`                                                        | Wired full App Page userland virtual module with resolver/source coverage, separate from the existing tree-only route-tree path.                                                                              |
| `virtual:vitest-plugin-rsc/next-edge-ssr-app?...`                                                    | Wired Edge App Page entry virtual module generated from `next-edge-ssr-loader` or `loadEntrypoint("edge-ssr-app")`; initial SSR and MSW browser App Page request owners consume it.                           |
| `packages/vitest-plugin-rsc/src/nextjs/src/server/app-render/manifests-singleton.test.ts`            | Spike coverage for manifest globals around `self.__RSC_MANIFEST` and `self.__RSC_SERVER_MANIFEST` shape handoff.                                                                                              |

The existing `virtual:vitest-plugin-rsc/next-route-tree?...` remains the current
tree-only artifact for the existing flow. Do not expand that ID to full App Page
output; the full-output mode is the separate wired
`virtual:vitest-plugin-rsc/next-app-page?...` path.

### Spike Data Contracts

The implemented artifact slice proves these contracts before request migration:

- `next-app-loader` still creates the artifact; Vite only rewrites imports and
  exposes the generated shape.
- The full App Page userland module exports `tree`, `routeModule`,
  `__next_app__`, and entry-base-compatible exports.
- `__next_app__.require` preserves generated/webpack IDs as keys and uses eager
  Vite static imports as values.
- `__next_app__.loadChunk` can remain a tested no-op or follow-up; explore it
  only after `require` works.
- `next-edge-ssr-loader` or `loadEntrypoint("edge-ssr-app")` creates the Edge
  entry, including `ComponentMod`, `handler`, cache handler injection points,
  and manifest singleton setup.
- The Edge entry's `VAR_USERLAND` points at full `next-app-page` userland, not
  the tree-only `next-route-tree` virtual module.
- The Edge entry receives Next-shaped manifest globals, not `.next` files.
- Vite require-map rewriting stays a bundler boundary and does not create local
  app-page glue.
- Any new `Begin adapted` block is limited to the bundler boundary and states
  what direct/generated Next artifact should delete it.

Current unit coverage includes real Next app-page artifact shape, Edge template
output, `VAR_USERLAND`, manifest reads, the Vite require-map rewrite, and
negative checks against local authored glue. It does not establish a separate
compatibility mode, non-MSW browser route runtime compatibility, direct
React-node route compatibility, or synthetic route support, which are
intentionally outside the P1 Edge model.

### Runtime Migration State

The route-runtime slice now wires the generated Edge entries into the runtime
request paths:

- `packages/vitest-plugin-rsc/src/nextjs/testing-library.tsx`;
- `packages/vitest-plugin-rsc/src/nextjs/testing-library-runtime.tsx`;
- `packages/vitest-plugin-rsc/src/nextjs/msw.ts`;
- `packages/vitest-plugin-rsc/src/nextjs/request-router.ts`;
- `packages/vitest-plugin-rsc/src/nextjs/src/server/next-server.ts`;
- `packages/vitest-plugin-rsc/src/nextjs/src/build/templates/app-page.ts`;
- current `virtual:vitest-plugin-rsc/next-route-tree?...` consumers.

The legacy top-level App Page runtime wrapper
`packages/vitest-plugin-rsc/src/nextjs/app-render.ts` and the local
`src/server/app-render/app-render.ts` compatibility plugin are deletion history,
not runtime architecture. `route-manifest-plugin.ts` remains Vite virtual-module
wiring; it must not install private request dispatch routes, probe headers,
dev-server middleware, or custom `ModuleRunner` side channels.

### Spike Collaboration

```text
route discovery
  -> src/server/route-matcher-providers/dev/...
  -> src/build/analysis/get-page-static-info.ts

entry request
  -> src/build/entries.ts
  -> getAppEntry() / next-app-loader?AppLoaderOptions

full App Page userland artifact
  -> src/build/webpack/loaders/next-app-loader/index.ts
  -> virtual:vitest-plugin-rsc/next-app-page?...
  -> exports tree, routeModule, __next_app__, entry-base-compatible exports

Edge App Page entry artifact
  -> src/build/webpack/loaders/next-edge-ssr-loader/index.ts
  -> virtual:vitest-plugin-rsc/next-edge-ssr-app?...
  -> imports full next-app-page userland through VAR_USERLAND
  -> loadEntrypoint("edge-ssr-app")
  -> exports ComponentMod and handler

runtime dispatch
  -> src/server/next-server.ts
  -> generated Edge App Page handler
  -> deletion target for remaining local document/fallback glue
```

### Spike Phases And Gates

1. Done: characterize `loadEntrypoint("edge-ssr-app")` and real
   `next-edge-ssr-loader` output.
2. Done: characterize full `next-app-loader` app-page output.
3. Done: generate and wire isolated `next-app-page` and `next-edge-ssr-app`
   virtual modules without changing request dispatch.
4. Done: runtime dispatch uses generated Edge App Page entries for both initial
   SSR/document rendering and MSW browser requests.
5. Done: initial SSR/document rendering moves through the Edge handler without
   MSW.
6. Done: browser RSC/navigation GET requests move through MSW to the Edge
   handler.
7. Done: Server Action POSTs move through MSW to the same handler for the
   action-not-found/protocol-entry checkpoint.
8. Done: browser App Route/API requests move through MSW to the Edge App Route
   handler.

### Immediate Wiring Checklist

Current artifact wiring state:

- [x] full App Page output;
- [x] Edge entry source;
- [x] unit coverage for generated artifact shapes;
- [x] runtime dispatch design for non-MSW initial SSR and MSW browser requests;
- [x] unskipped initial SSR/document Edge App Page request gate;
- [x] unskipped RSC GET Edge App Page request gate;
- [x] unskipped Server Action POST request-preservation unit gate;
- [x] unskipped Server Action manifest/protocol gate;
- [x] unskipped App Route/API Edge dispatch unit gate;
- [x] unskipped App Route/API browser request gate;
- [x] unskipped Server Action POST action-not-found/browser gate.

Current focused browser gate state:

- Cleared: Edge App Page initial render receives generated Edge HTML/Flight and
  hydrates through the Vitest-owned document without MSW.
- Cleared: browser-observed RSC GET stays on MSW transport and reaches the same
  generated Edge App Page handler.
- Cleared: hydrated `next/link`, `router.push`, and `router.replace` client
  navigations start from `renderServer({ url })`, use real App Page targets, and
  assert browser URL plus target route UI.
- Cleared: browser-observed Server Action POST stays on MSW transport, forwards
  the raw `Request` body with standards-compatible `duplex: "half"`, and reaches
  Next's action-not-found protocol.
- Cleared: browser App Route/API fetches stay on MSW transport and reach the
  generated Edge App Route handler.
- Known limitation: browser/MSW `Request.headers` does not expose `Cookie`, so
  App Route browser coverage must not fake Cookie through a private side
  channel.
- Current local verification note: the RSDW client optimizer alias gap and
  `NextAppRouterHydrationBoundary` dispatcher gap are covered by unit tests.
  Generated App Page `__next_app_require__` now falls back to `react_ssr` imports
  for Vite CJS client-boundary ids and root-relative project module ids. The
  clean-cache `react_ssr` optimizer blocker on Next's compiled
  `nanoid/index.cjs` is cleared by stricter Next CJS runtime handling. The latest
  focused browser rerun confirms the generated Edge render optimizer chunk no
  longer has bare `crypto.subtle.digest`, and the generated app-page require
  fallback now caches async dynamic imports so React Flight SSR no longer reaches
  Next error recovery through an undefined Promise `reason`. The current focused
  stop is an undefined element type while SSR rendering Next client-boundary
  modules, plus `createMutableActionQueue was called more than once` during
  recovery. Keep that follow-up scoped to preserving the generated Edge pipeline
  and upstream error semantics, not to local digest parsing, App Page wrappers,
  or fake route transports.
- Remaining backlog: broader Server Action error/access-fallback and
  refresh/revalidation/cache header protocol coverage, P2/later client-bootstrap
  coverage for page-thrown initial render redirects, and any P2 synthetic route
  fixtures that can enter through generated App Page entries.

### Unit Test Ladder

Enable tests from the request boundary inward. Do not narrow or empty Vitest
include patterns to hide unrelated failures; old non-MSW browser tests are legacy
coverage, not new Edge App Page acceptance.

1. MSW RSC GET boundary: `nextRscRequestHandlers` forwards a real intercepted
   request to `fetchRsc` with the original URL, headers, router state, and
   `Next-Url`.
2. RSC GET dispatch selection: the request router selects only discovered App
   Page targets with a generated `edgeAppPage` entry and does not fall back to
   local App Page rendering for other targets.
3. Edge handler dispatch: the dispatcher imports the generated Edge entry,
   installs Next-shaped manifest globals, passes a Next-shaped event context, and
   avoids the local app-render Flight shortcut.
4. Virtual manifest contract: `virtual:vitest-plugin-rsc/next-routes` exposes
   Edge App Page loader functions for real filesystem App Page routes.
5. Done: Server Action POST checkpoint proves the original action headers and
   body reach the Edge handler selection path without local action decode/replay.
6. Done: a focused real Server Action POST uses a Next-shaped manifest worker and
   generated action-entry module through the same Edge handler.
7. Done: App Route/API dispatch unit and browser coverage select the generated
   Edge App Route entry for manifest-backed route targets, including redirects.

The focused runtime gates are now initial SSR/document rendering through the
generated Edge handler without MSW, MSW RSC/navigation GET through the Edge
handler and Flight consumption, Server Action POST through MSW to the same
handler, and browser App Route/API fetches through MSW to the Edge App Route
handler. Redirects are covered on those paths without Flight sniffing or local
fallback parsing for next.config initial redirects, browser RSC navigation,
hydrated client navigation, Server Action POST, and App Route/API fetches.
Page-thrown initial render redirects currently surface as Next redirect
control-flow during hydration; that is explicitly P2/later client-bootstrap
backlog, not a P1 route-runtime blocker, because the P1 slice must not
reintroduce local Flight sniffing. Remaining migration work is broader Server
Action protocol coverage and P2-only synthetic route exploration.

Focused verification gates:

- `pnpm test -- --project vitest-plugin-rsc packages/vitest-plugin-rsc/src/nextjs/msw.test.ts packages/vitest-plugin-rsc/src/nextjs/src/server/next-server.test.ts packages/vitest-plugin-rsc/src/nextjs/route-manifest-plugin.test.ts packages/vitest-plugin-rsc/src/nextjs/src/build/webpack/loaders/next-edge-ssr-loader/index.test.ts packages/vitest-plugin-rsc/src/nextjs/src/build/webpack/loaders/next-edge-app-route-loader/index.test.ts packages/vitest-plugin-rsc/src/nextjs/src/build/webpack/loaders/next-app-loader/index.test.ts packages/vitest-plugin-rsc/src/nextjs/src/build/templates/edge-ssr-app.test.ts`
- `pnpm test -- --project nextjs-notes-demo-browser --api 52643 playground/nextjs-notes-demo/components/next-router.test.tsx playground/nextjs-notes-demo/app/edge-app-page-delegation/page.test.tsx playground/nextjs-notes-demo/app/route-action/page.test.tsx playground/nextjs-notes-demo/app/api/next-request-response/route-render.test.tsx`
- `pnpm exec vitest run --configLoader native --project nextjs-notes-demo-browser --api 52643 playground/nextjs-notes-demo/app/metadata-routes.browser.test.tsx`
- `pnpm tsgo --build`
- `pnpm exec oxfmt --check docs/nextjs-edge-app-page-delegation.md`
- `git diff --check`

Do not use old non-MSW browser suites as Edge App Page acceptance. Any new
browser-observed dispatch change must go through MSW transport. Private probe
routes/headers, Vite dev-server middleware, and custom `ModuleRunner`
side-channels are not supported.

### Current Runtime Dispatch Slice

The implemented runtime slice uses one generated Edge App Page entry per
discovered App Page route, consumed by two request owners:

- `testing-library-runtime.tsx` owns initial SSR/document rendering and calls
  the generated Edge handler directly, without MSW and without RSC headers.
- `nextRscRequestHandlers` owns browser-originated RSC/navigation fetches and
  Server Action POSTs and passes the original `Request` to the generated Edge
  handler. It must not read or decode the action body before entering that
  handler.

Route selection comes from `virtual:vitest-plugin-rsc/next-routes`. Each App
Page manifest entry carries the Edge App Page virtual source so runtime code
imports a discovered entry instead of rebuilding loader options from filesystem
state. The dispatcher resolves a request with `request-router.ts`, imports the
generated entry through Vite, prepares Next-shaped manifest/cache globals, and
calls `edgeEntry.handler(request, ctx)`.

Manifest and cache adapters remain temporary Vite/RSC-to-Next shape adapters:
`@vitejs/plugin-rsc` still owns client references, server references, and module
loading. The Edge handler should receive `self.__RSC_MANIFEST`,
`self.__RSC_SERVER_MANIFEST`, cache handler registration, `waitUntil`,
`requestMeta`, and `signal` in the shapes Next's generated edge entry already
expects.

### Initial HTML Gate Preparation

The initial HTML gate is a test harness/runtime request, not an MSW request:

```text
renderServer({ url }) / initial test harness document render
  -> testing-library-runtime.tsx route render path
  -> virtual:vitest-plugin-rsc/next-routes
  -> request-router.ts resolves App Page target
  -> target.edgeAppPage imports virtual:vitest-plugin-rsc/next-edge-ssr-app?...
  -> edge-ssr-app.handler(request without RSC headers, ctx)
  -> server/web/adapter
  -> AppPageRouteModule.render()
  -> text/html Response
  -> app-index / hydration inside the Vitest-owned document
```

This gate is green for the focused fixture. It renders the same fixture route
through the test harness, receives generated HTML/Flight, and verifies the
response is owned by the generated Edge App Page handler without MSW and without
private observer headers.

HTML-specific cleanup after the gate hydrates through the Edge handler:

- `packages/vitest-plugin-rsc/src/nextjs/testing-library-runtime.tsx` now uses
  generated Edge HTML for the initial document and no longer has local document
  fallback rendering, raw Flight control-flow sniffing, or late manual font
  injection;
- the access-fallback seed recovery helper in
  `packages/vitest-plugin-rsc/src/nextjs/src/server/app-render/create-component-tree.tsx`
  was deleted because the delegated HTML/Flight payload is the owner of initial
  fallback state;
- the manual font document glue in
  `packages/vitest-plugin-rsc/src/nextjs/src/server/app-render/get-layer-assets.tsx`
  was deleted; the generated Edge render path owns font manifest consumption and
  the Vite font module still injects CSS when evaluated in the browser.

## End Architecture

The final target is that App Page requests enter through the Edge App Page entry
and Next's route module owns render semantics. Local files compose the path; they
do not synthesize App Page behavior. Initial SSR/document rendering enters from
the test harness/runtime without MSW. Browser-originated RSC/navigation/API
requests and Server Action POSTs enter through MSW transport. This architecture
has no private non-MSW side-channel for browser-originated request flows.

Do not preserve old non-MSW App Page route runtime behavior in the Edge model.
For this P1 architecture, the route path is a real filesystem App Page route
through the generated Edge pipeline. `renderServer(<ReactNode />)` is outside App
Page route runtime and must not be a reason to keep direct-node/local app-render
glue, replacement-helper dispatch, fake routes, or a separate compatibility
mode. `renderServer({ url })` App Page route behavior goes through the same
request-router/Edge handler path as browser-observed requests, but without MSW
for the initial document render.

Future fake or synthetic App Page routes are allowed only as P2 exploration.
They must be represented as a synthetic file/page module that enters the same
pipeline as real routes: real Next `next-app-loader` full output ->
`edge-ssr-app` -> generated Edge handler request path. Browser-originated
requests to such a route would still enter through MSW. They are not a P1
requirement, fallback, or compatibility mode.

### Target Call Stacks

Build/plugin artifact generation:

```text
vite plugin setup
  -> useNextRouteManifest()
  -> scanNextAppRoutes() / scanNextAppRouteHandlers()
  -> loadNextProjectConfig()
  -> generateNextRouteManifestModule()
  -> createNextAppLoaderOptions()
  -> createNextRouteTreeVirtualSource() for current tree-only consumers
  -> createNextEdgeSsrAppVirtualSource()
  -> virtual:vitest-plugin-rsc/next-routes
       exports routing, nextRouteManifest, nextRouteHandlerManifest
       app-page entries include edgeAppPageSource and edgeAppPage loader
  -> virtual:vitest-plugin-rsc/next-app-page?...
       getAppEntry() / next-app-loader full App Page userland output
  -> virtual:vitest-plugin-rsc/next-edge-ssr-app?...
       next-edge-ssr-loader / edge-ssr-app output
       VAR_USERLAND imports the full next-app-page userland module
  -> manifest/cache adapters provide Next-shaped input globals
```

Initial SSR/document render, not MSW:

```text
renderServer({ url }) / initial test harness render
  -> testing-library-runtime.tsx
  -> virtual:vitest-plugin-rsc/next-routes
  -> request-router.ts resolves App Page target
  -> target.edgeAppPage imports virtual:vitest-plugin-rsc/next-edge-ssr-app?...
  -> install Next-shaped manifest/cache globals
  -> edge-ssr-app.handler(request without RSC headers, ctx)
  -> server/web/adapter
  -> AppPageRouteModule.render()
  -> HTML Response with Flight bootstrap
  -> app-index / NextAppRouter hydration in Vitest-owned document
```

Browser RSC/navigation requests:

```text
browser navigation / router refresh / RSC fetch
  -> MSW nextRscRequestHandlers
  -> request pipeline / request-router.ts resolves App Page target
  -> target.edgeAppPage imports virtual:vitest-plugin-rsc/next-edge-ssr-app?...
  -> install Next-shaped manifest/cache globals
  -> edge-ssr-app.handler(request with RSC/router-state headers, ctx)
  -> server/web/adapter
  -> AppPageRouteModule.render()
  -> Flight Response
  -> Next client router consumes Flight
```

Server Action POST:

```text
browser form/action POST
  -> MSW nextRscRequestHandlers
  -> request pipeline / request-router.ts resolves App Page target
  -> target.edgeAppPage imports virtual:vitest-plugin-rsc/next-edge-ssr-app?...
  -> install Next-shaped manifest/cache globals
  -> edge-ssr-app.handler(raw POST request, ctx)
  -> server/web/adapter
  -> AppPageRouteModule.render()
  -> Next app-render action protocol
  -> action / Flight / redirect Response
  -> Next client action reducer consumes the response
```

Browser App Route/API path:

```text
browser API fetch
  -> MSW request pipeline
  -> virtual:vitest-plugin-rsc/next-routes resolves App Route target
  -> Edge App Route virtual entry
  -> edge-app-route.handler(request, ctx)
  -> EdgeRouteModuleWrapper
  -> server/web/adapter
  -> AppRouteRouteModule.handle()
  -> Response
```

Anti-callstacks:

```text
testing-library-runtime.tsx
  -> app-render.ts
  -> local renderToHTMLOrFlight wrapper
```

```text
browser request
  -> non-MSW direct route runtime
```

```text
browser request
  -> private probe header / dev-server middleware / custom ModuleRunner side-channel
```

### Files And Virtual Modules That Remain

| File or virtual module                                                                          | End-state role                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/vitest-plugin-rsc/src/nextjs/testing-library.tsx`                                     | Public testing helper only. It should not own App Page semantics.                                                                                                                  |
| `packages/vitest-plugin-rsc/src/nextjs/testing-library-runtime.tsx`                             | Thin Vitest orchestration: public API, direct React node handling, document lifecycle, and dispatch to the request path.                                                           |
| `packages/vitest-plugin-rsc/src/nextjs/msw.ts`                                                  | Public browser HTTP boundary. It routes App Page requests to Edge entries rather than local render helpers.                                                                        |
| `packages/vitest-plugin-rsc/src/nextjs/request-router.ts`                                       | Route/redirect/rewrite target resolution over Next-shaped routing data. Dispatch becomes Edge-entry selection, not render lifecycle ownership.                                     |
| `packages/vitest-plugin-rsc/src/nextjs/src/build/entries.ts`                                    | `getAppEntry()` shaped entry request data and optimizer scan roots.                                                                                                                |
| `packages/vitest-plugin-rsc/src/nextjs/src/build/webpack/loaders/next-app-loader/index.ts`      | Vite boundary around real `next-app-loader` output. It preserves full app-page userland artifact shape.                                                                            |
| `virtual:vitest-plugin-rsc/next-app-page?...`                                                   | Full App Page userland artifact consumed by the Edge entry.                                                                                                                        |
| `packages/vitest-plugin-rsc/src/nextjs/src/build/webpack/loaders/next-edge-ssr-loader/index.ts` | Vite boundary around real `next-edge-ssr-loader` or `loadEntrypoint("edge-ssr-app")`.                                                                                              |
| `virtual:vitest-plugin-rsc/next-edge-ssr-app?...`                                               | Edge App Page entry exporting `ComponentMod`, `handler`, and default handler shape.                                                                                                |
| `packages/vitest-plugin-rsc/src/nextjs/client.tsx` and `src/client/app-index.ts` mirrors        | Internal browser hydration and App Router state boundary inside Vitest-owned document; `vitest-plugin-rsc/nextjs/client` is source-condition only and intentionally not published. |
| `packages/vitest-plugin-rsc/src/nextjs/src/server/web/adapter.ts`                               | Fallback mirror only if `next/dist/server/web/adapter.js` cannot be imported directly. Direct import is preferred.                                                                 |

### Request Flow Ownership

The target call stacks above are the normative request flows. The split is:

- Initial HTML/SSR is a test harness/runtime request. It does not go through MSW.
- Browser RSC/navigation fetches and Server Action POSTs go through
  `nextRscRequestHandlers`.
- Browser API/App Route fetches go through MSW to the Edge App Route path.

In all App Page cases, the local plugin must stop at route selection, generated
entry loading, and manifest/cache input adaptation. Next's generated Edge entry
and `AppPageRouteModule.render()` own HTML, Flight, redirects, and action
responses. The plugin must not keep a local `renderToHTMLOrFlight()` wrapper.

### Server Action POST Checkpoint

The current Server Action slice is a checkpoint, not the full production action
protocol migration. It proves that a `POST` carrying `Next-Action` reaches the
generated Edge App Page handler through MSW with the original headers and body
intact.

The target request path is:

```text
browser POST with ACTION_HEADER and body
  -> MSW nextRscRequestHandlers
  -> request-router.ts resolves App Page target
  -> virtual:vitest-plugin-rsc/next-edge-ssr-app?...
  -> edgeEntry.handler(request, event)
  -> server/web/adapter
  -> AppPageRouteModule.render()
  -> app-render/action-handler.ts
```

The checkpoint must not call `readActionReply()`, `ReactServer.decodeReply()`,
`ReactServer.loadServerAction()`, or `renderNextRouteActionResponse()` before
entering the Edge handler. Those helpers were local action glue; browser
Server Action POSTs now enter through MSW and the generated Edge handler.

Real action execution now installs a request-specific `serverActionsManifest`
for the current `Next-Action` ID, points the worker at a generated
`next-flight-action-entry-loader`-shaped virtual module, and lets the full App
Page userland `__next_app__.require` load that action-entry module through the
Vite RSC environment. The Edge dispatcher also refreshes Next's manifest
singleton after cached Edge entry imports so action POSTs do not reuse a previous
request's empty manifest.

The first accepted response was the Next action-not-found protocol for a missing
action ID. Focused browser fixtures now also cover real action execution through
MSW to the generated Edge handler, assert the returned Flight body, and cover
action redirect response semantics without local action decode/replay. Broader
action protocol coverage should still exercise rejected Flight
error/access-fallback payloads, `refresh()`/cache invalidation headers, and
richer client navigation behavior.

### Runtime Gate Deletion Matrix

Use the runtime gates in this order. Each gate earns deletion only after browser
or package coverage proves the Edge handler owns that response path; do not hide
old helpers behind the delegated handler.

| Gate               | First proof                                                                                                                                                | Delete or reduce                                                                                                                                                        | Temporary blockers that may stay                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Initial HTML/SSR   | The test harness routes a document request without RSC headers through `virtual:vitest-plugin-rsc/next-edge-ssr-app?...` and hydrates the Vitest document. | `renderNextRouteHtmlResponse`, `renderNextRouteResult`, document fallback glue, access-fallback seed recovery, and manual font/layer asset injection.                   | Vitest still owns the test document and hydration container until the delegated HTML path proves head/assets, access fallbacks, metadata, fonts, and images.       |
| RSC GET            | MSW routes an RSC-header GET through `virtual:vitest-plugin-rsc/next-edge-ssr-app?...` and the browser consumes Flight.                                    | `renderNextRouteFlightResponse`, `renderNextRouteInitialPayload`, the GET branch in `fetchNextRsc`, and `prepareServerRoot()` local initial-payload calls.              | Manifest access and Edge entry loading must provide Next-shaped globals without `.next`; manifest/cache proxies may stay as Vite RSC -> Next shape adapters.       |
| Server Action POST | MSW sends a real action POST to the Edge handler and the Next client reducer consumes the action/Flight response.                                          | `renderNextRouteActionResponse`, local action decoding in `msw.ts`, and local action request-shape APIs in `testing-library-client.ts` / `testing-library-runtime.tsx`. | Vite RSC action IDs and reply bodies must reach Next's handler without local decode/replay, while unsupported encrypted/bound argument cases keep failing clearly. |
| App Route/API      | MSW routes browser API fetches through `virtual:vitest-plugin-rsc/next-edge-app-route?...` and the user route handler response is observed in the browser. | Delete direct userland route-handler runners and keep App Route dispatch on `edge-app-route`, `EdgeRouteModuleWrapper`, and `AppRouteRouteModule.handle()`.             | App Route manifest entries and route params must stay Next-shaped; browser coverage remains separate from App Page action protocol coverage.                       |
| All gates          | Initial HTML plus browser-observed RSC GET, Server Action POST, and App Route/API all pass through generated Edge entries.                                 | Top-level `packages/vitest-plugin-rsc/src/nextjs/app-render.ts` and local `src/server/app-render/app-render.ts` compatibility are deleted for App Page route runtime.   | Manifest/cache proxy files can remain temporarily while they only adapt Vite RSC graph data into Next-owned input shapes.                                          |

Recommended implementation order:

1. Done: keep artifact-generation virtual modules and unit tests green.
2. Done: prove initial HTML/Flight through the generated Edge handler without
   MSW.
3. Done: prove browser RSC GET through MSW to the same Edge handler.
4. Done: prove Server Action POST reaches the same Edge handler through MSW.
5. Done: prove browser App Route/API fetches through MSW to the Edge App Route
   handler.
6. Done: prove focused real Server Action manifest/protocol execution.
7. Done for notes-demo P1: migrate probe browser fixtures to real App Page
   routes and retire fake-route/replacement support to explicit P2 TODOs.
8. P2 TODO: migrate or retire legacy
   `playground/nextjs-no-msw-demo` coverage. Until then it remains direct
   no-MSW helper coverage only, not Edge App Page acceptance.

### Manifest And Cache Adapters That Stay Temporarily

These remain as Next-shaped input/global adapters while Vite RSC owns the graph:

- `packages/vitest-plugin-rsc/src/nextjs/src/build/webpack/plugins/flight-manifest-plugin.ts`;
- `packages/vitest-plugin-rsc/src/nextjs/src/build/webpack/plugins/flight-client-entry-plugin.ts`;
- `packages/vitest-plugin-rsc/src/nextjs/src/build/webpack/plugins/next-font-manifest-plugin.ts`;
- `packages/vitest-plugin-rsc/src/nextjs/src/server/app-render/manifests-singleton.ts`;
- `packages/vitest-plugin-rsc/src/nextjs/src/server/use-cache/handlers.ts`;
- `packages/vitest-plugin-rsc/src/nextjs/src/server/use-cache/use-cache-wrapper.ts`;
- `virtual:vitest-plugin-rsc/next-cache-handlers`.

The Edge entry should use `self.__RSC_MANIFEST` and
`self.__RSC_SERVER_MANIFEST` shaped like Next's globals. It should not require
`.next` files. Delete these proxies later only when a higher Next/Vite/RSC owner
can provide the same shapes.

### Deletion Or Reduction Targets

Once the Edge App Page path owns initial HTML, RSC GET, and Server Action POST,
delete or reduce lower shims instead of wrapping the Edge handler with old
behavior:

- Deleted `packages/vitest-plugin-rsc/src/nextjs/app-render.ts` as an App Page
  route runtime file, including `renderNextRouteFlightResponse`,
  `renderNextRouteHtmlResponse`, `renderNextRouteInitialPayload`,
  `renderNextRouteActionResponse`, `renderNextRouteResult`,
  `createAppRenderRequest`, `createNextDirectComponentMod`,
  `createNextActionComponentMod`, `createRequestLifecycle`, and
  `createResponseHeaders`.
- Delete `packages/vitest-plugin-rsc/src/nextjs/src/build/templates/app-page.ts`
  once full app-page userland output owns `routeModule`.
- Deleted `packages/vitest-plugin-rsc/src/nextjs/src/server/app-render/app-render.ts`
  compatibility payloads that only supported the local app-render wrapper.
- Deleted
  `packages/vitest-plugin-rsc/src/nextjs/src/server/app-render/create-component-tree.tsx`
  fallback seed recovery; Next's generated Edge payload now owns initial fallback
  state.
- Keep font behavior on the generated Edge/App Render path. Do not reintroduce
  late testing-library document asset injection for fonts.
- Keep reducing `packages/vitest-plugin-rsc/src/nextjs/testing-library-runtime.tsx`
  around `resolveAppRenderEntry`, `renderNextDocumentHtml`, and
  `createNextDocumentInitialPayload` only when that logic can move to a higher
  Next-owned bootstrap. Direct `renderNextRoute*Response` calls and route-entry
  replacement helpers have been removed.
- Reduce `packages/vitest-plugin-rsc/src/nextjs/request-router.ts` only if route
  target dispatch can move closer to Next routing data. It may still own
  Vitest-local target selection over `@next/routing`.
- Keep `packages/vitest-plugin-rsc/src/nextjs/msw.ts` as the public browser
  request boundary, but reduce any direct render-helper coupling.

### End-State Test Gates

Remaining broader notes-demo and package coverage should cover:

- deeper initial HTML/document hydration cases through the Edge handler without
  MSW;
- deeper browser RSC GET cases through MSW to the Edge handler;
- broader browser Server Action POST response protocol for errors,
  access-fallbacks, and client navigation after redirects through MSW to the Edge
  handler;
- deeper browser App Route/API fetches through MSW to the Edge App Route
  handler, excluding Cookie-header assertions until MSW exposes them;
- route params, cookies, headers, cache, access fallbacks, metadata/head, fonts,
  and images still passing through the delegated path;
- no optimizer reload or blank-page regression in hidden `react_client` and
  `react_ssr` environments.

Package tests should keep covering the remaining boundaries: full app-page
artifact shape, Edge entry generation, manifest/cache proxy shapes, route data,
and direct import fallbacks for Next internals.
