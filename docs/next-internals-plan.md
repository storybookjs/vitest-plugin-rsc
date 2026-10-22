# Next.js Internals: The Plan

How `vitest-plugin-rsc/nextjs` should couple to Next.js from here on, so that a release of Next breaks as little as possible and what it does break shows early, in one place, and only in the feature it touches. The measurements behind it are in [next-internals-risk.md](next-internals-risk.md). Two independent second opinions, from Codex and from Fable, were asked the same question; where they differ, the plan says which way it goes and why.

The yardstick stays the conformance suite ([next-conformance.md](next-conformance.md)): no test that `conformance/expectations.json` expects to pass may stop passing, at any step below.

## The Rules

1. **Reuse Next's code wherever it runs where we need it.** The plugin keeps calling Next's own build code and running Next's own runtime.
2. **Call the coarsest function of Next whose output is data.** One call that hands us what five helpers would, so that what Next adds arrives without a change here. Where Next has no such function, call the helpers, but never copy what a function of Next computes.
3. **Compute ourselves only where Next has no function we can call**, like the prerender verdict, whose last step is inline in `build/index.js`. Where Next's build has the case, CI checks the computation against Next's real build.
4. **Patch only where Next has no switch**, and only by a mechanism that checks its own target: an export by name, a resolver alias, an AST site with an exact count. Never a piece of text that may match nothing.
5. **Fail loudly, but only the feature that needs it.** A change in production prerendering must not stop a development run.
6. **Know before the release.** Every night against canary, with a type check, the playgrounds, conformance and the comparisons with Next's real build.

## The Architecture

### Modules

- `compat/node/`: the build side, in Node. One module per cluster: `config`, `routes`, `entries`, `routing`, `compiler`, `loaders`. Each exports operations of the plugin, like `entriesOf(routes)` or `compile(file, layer)`, not Next's modules. Today's `project/context.ts` becomes its loader, lazy per feature.
- `compat/runtime/<layer>/<feature>.ts`: the runtime, in the browser. What the plugin's browser modules use from Next, behind functions of the plugin, with namespace imports so that a branch can see what is there. An optional feature's module is imported only where that feature is, so that it does not load in a run without it.
- `compat/patches.ts`: every change of Next's or React's code, in one list. Each entry names its target, its anchor, the feature it serves and its probe. Among the ones there today:
  - the `server-reference-info` shim and the asset-prefix stub;
  - React's `patchConsole()` and `performWork()`;
  - the modules compiled to keep their stores;
  - the stand-ins of `node-platform.ts` and the bridge of `module.compiled`;
  - `routeModule.getIncrementalCache` (`rsc.ts:118`) and `routeModule.distDir` (`ssr.ts:651`);
  - the rewrites of generated code in `project/entries.ts` and `project/metadata.ts`;
  - `document.currentScript` for the bootstrap script (`client.tsx:177`).
- `features.ts`: the features and what each needs of Next. Each feature has a status, active or off, and the reason.

### Core And Optional

**Core**, where a failure stops the run with the version of Next and what differs:

- config, routes, entries, routing;
- aliases, defines, the compiler;
- a request, the client entry, hydration;
- Server Actions, the request stores, the data cache.

**Optional**, where a failure turns the feature off:

- production prerendering;
- the route of a node: `renderServer(<Node />)` and `rerender()`;
- fonts, images and metadata files, each on its own;
- the image optimizer behind `/_next/image`;
- `cleanup()` of an app's own cache handler.

Every feature is probed when the run starts, which also decides what the dependency optimizer pre-bundles: the runtime imports of every feature are pre-bundled up front today (`runtimeImports` at `plugin.ts:597`), and a feature found later would make Vite optimize again mid-test. A feature that is off logs one warning, naming the version of Next and what differs. One that the config selects, like `build: "production"`, then stops the run; one that a test selects throws that reason on first use. Neither substitutes something else.

### Versions

- **Version profiles**, chosen once by the installed version of Next, not by guessing from a function's arity. A profile holds the few branches where Next behaves differently, like the stub for the dev server's asset prefix, a module only canary has. Each branch names the Next PR that made it necessary.
- **The peer range** `>=16.4.0-0 <17.0.0-0` for `next` and for `@next/routing`. A major is where the Adapter API may break, and where webpack's loaders or the web-stream path of Next's renderer may go.
- **Caches** of compiled modules are keyed by the Next version, the profile and the revision of the patches.

### Early Warning

A workflow, `next-canary.yml`, every night and by hand, against `next@canary`:

- the four Next.js playgrounds, in development and in production, as the `next` job of CI does for each push;
- the type check of the plugin against canary's declarations, as the last step, so that a type error never hides a runtime failure;
- the conformance suite;
- a check for modules of Next that keep a request store and that the plugin does not compile;
- the comparisons with Next's real build, from Phase 5.

A failure opens an issue. A table of the versions CI has seen pass is written by the same workflow.

## Per Cluster

- **Config.** Keep `loadConfig()`, whose call has been the same since 15.0. Take the phases and names from the public `next/constants`.
- **Routes and entries.** `discoverRoutes()`, then `createEntrypoints()`, which `next build --webpack` calls for its entries. It makes the route checks, the error classes, the options of `next-app-loader` and the proxy's entry: about six of today's calls in one. It returns an entry per page file, not per route, so which page a route gets, the root-layout check and the plugin's policy for routes with `runtime = "edge"` stay the plugin's. Like `next-app-loader`, it is on Next's webpack path.
- **The route of a node.** Keep `loadEntrypoint("app-page", …)`: the placeholders are the steadiest surface there is.
- **Code Next generates.** A define of `__webpack_require__` and a mode of the plugin's CommonJS transform, in place of three regex rewrites. See Phase 3.
- **Routing.** Keep `handleBuildComplete()` and `@next/routing`, contained in `compat/node/routing`. It is the only producer of the `routing` phases; their shape is documented, and computing them ourselves would copy Next's code.
- **Request matchers.** Keep `getRouteRegex()` and `getRouteMatcher()`: `@next/routing` gives raw captures, not App Router params.
- **Compiler.** Keep `getLoaderSWCOptions()` and `transform()` now. Try `next-swc-loader` as it is, in Phase 6: it maps the config itself, and its options are declared the same from 15.5 to canary, where `getLoaderSWCOptions()` changed in 7 of 12 releases.
- **Aliases and defines.** Keep `createWebpackAliases()`, the four tables beside it and `getDefineEnv()`. Compare them with `getBaseWebpackConfig()` in CI, which tells when Next adds a table the plugin lacks.
- **Loaders.** Keep Next's loaders, run as they are: they are among the steadiest internals. `next/image-optimizer-transform` once 16.5 ships, with today's call as the fallback.
- **A request.** Keep the entry's `handler(req, res, ctx)`, documented for adapters.
- **Client entry.** Keep `appBootstrap()` and `hydrate()`. The global wrapper of `hydrateRoot()` becomes a bridge of `react-dom/client` for Next's `app-index` alone (Phase 6), and Next's own entry, `client/app-next.js`, is tried after it.
- **Hydration done.** The plugin's own wait comes from the bridge's root, once it has committed. `__NEXT_TEST_MODE` stays: Next's e2e fixtures and the conformance shim read `__NEXT_HYDRATED_AT`, which only it sets.
- **The data cache.** Keep the plugin's constructor of `IncrementalCache`. See Decided Against.
- **Prerender verdict.** Keep the computation, lazy and optional, and test it against Next's real build. Next has no function for it that runs in a browser.
- **Server Actions.** Keep the `server-reference-info` shim, already a module wrapped by its exports.
- **Request stores.** Keep the list of three modules compiled by path. CI flags a module of Next that keeps a store and is not on it: a list that cannot grow by itself is safer than a rule that can.
- **The renderer's streams.** The plugin runs everything as Next's Node.js runtime, and its `node:stream` is readable-stream. Only Next's renderer runs on web streams, with `__NEXT_USE_NODE_STREAMS` off and React's builds for web streams from the table Next names edge. Next now keeps that path "for edge/runtime compatibility" ([#93944](https://github.com/vercel/next.js/pull/93944)). Try the renderer on its Node-stream path in Phase 6.

## The Phases

Each phase ends with the relevant tests by file, and a conformance run on the branch where it changes how the plugin runs Next.

### Phase 0: Nightly Canary (hours)

- The `next-canary.yml` workflow above, with the type check of the plugin as its last step, the check for store-keeping modules, and the table of versions.
- One call of `appBootstrap()` and `hydrate()` that type-checks against 16.4 and canary: it passes the asset prefix, which canary ignores, so that the workflow starts green.

Removes: a change of canary that only its types show, and the wait for a push or for the weekly conformance run.

### Phase 1: Features (2–3 days)

- `features.ts`, and the failure model above, with every feature probed at startup.
- `prerender-verdict.ts` imported dynamically, only with `build: "production"` (today statically at `rsc.ts:15`), and its modules out of the pre-bundle roots of a run without it (`plugin.ts:610-619`).
- The optional modules of `project/context.ts` loaded only for their feature: the image optimizer and `build/webpack-config` (for `nextImageLoaderRegex`, a file of 125 commits in two years), the font loaders, the metadata loaders.
- The 20 code checks of `project/runtime.ts` split by feature. The three that match formatting become whitespace-insensitive, for now.
- Tests that a missing optional module turns its feature off, and that using it then throws.

Removes: 12 of the 20 checks and the most changed prerender internals from every run that does not use them.

### Phase 2: `compat/` (2 days)

- The build side and the runtime side behind the modules above. Every module path of `next/dist` that the plugin names, in an import or in a string, goes through them; a lint rule keeps imports so.
- The patch registry, with today's patches moved in, each with its probe.
- `next/constants` for `shared/lib/constants`, `NextAdapter` from `next`.
- The peer range, and the cache keys by version, profile and patches.

Removes: imports of Next spread over about 15 files. A change of Next is then a change of one file.

### Phase 3: Mechanisms, Not Text (1 day)

- A define of `__webpack_require__` as `__next_require__` in the code Next generates (`generatedDefines()`, `plugin.ts:747`), with the import of `__next_require__` prepended as now (`project/entries.ts:148`). A check after the compile that `__next_app__.require` is the plugin's keeps it loud.
- A mode of the plugin's CommonJS transform for generated entries: a `require()` in a function becomes `import()`, and `await import()` in an async function, where the middleware template destructures `require('node:path')`. It asserts how many sites it rewrote.
- The node's page in the layouts of a route found as an AST site (`project/entries.ts:310`), which `nameFiles()` already parses.

Removes: the regex rewrites of `project/entries.ts:144`, `:251`, `:310` and `:354`.

### Phase 4: `createEntrypoints()` (2–4 days)

- A prototype that calls `createEntrypoints()` with the output of `discoverRoutes()` and the root paths of `createPagesMapping()`, and runs the loader of each `next-app-loader` request it returns, decoding the request inside the entry of a route with `runtime = "edge"`.
- A comparison of its requests with today's on the playgrounds and the conformance fixtures: slots, interception routes, metadata files, routes with `runtime = "edge"`, `proxy.ts` and `middleware.ts`.
- Adoption once every difference is explained, as a mistake of today's copy or a deviation of the plugin's, and conformance is equal.

Removes: the hand-copied options of `next-app-loader` (`project/entries.ts:212`), which already differ from Next's in `isFinalRouteMatcher`, `preferredRegion` and `middlewareConfig`; the call of `getEdgeServerEntry()`; and the plugin's own calls of the route checks.

### Phase 5: Next's Real Build As The Oracle (2–3 days)

In the nightly workflow, `next build` of each playground and of the conformance fixtures, with a small adapter of the stable Adapter API that writes what `onBuildComplete` gets. Then the plugin's own view of the same app, compared:

- the routes and their entries;
- the `routing` phases;
- which pathnames are prerendered, with their fallback, against `outputs.prerenders`;
- the alias and define tables against `getBaseWebpackConfig()`.

The text checks of `build/index`, `build/utils` and `create-component-tree` then go: the behavior they guarded is compared directly.

Removes: the checks that break on a refactor of Next that changes nothing, and the silent drift of what the plugin computes itself. The trade: a change of the build's verdict that no app of the comparison exercises reaches a user without a check. Today's text checks catch it at startup.

### Phase 6: Prototypes, Each Kept Only If Conformance Is Equal (1–3 days each)

- **The `react-dom/client` bridge.** Next's `app-index` alone resolves `react-dom/client` to a module of the plugin, which gives Next the container and keeps the root. The importer is checked before `normalize()`, which caches by specifier alone. It takes the place of the global wrapper at `client.tsx:130`, and of two checks of `app-index`'s code.
- **Next's own client entry, `client/app-next.js`**, after the bridge. It is about ten lines: `appBootstrap()`, `require-instrumentation-client` and `hydrate()`. On canary it already passes `hydrate()` its new arguments, so it moves with Next by construction, and it brings `instrumentation-client.ts`. Its `app-webpack` sets webpack's chunk URLs on `__webpack_require__`, which needs a stub like the asset prefix's. It does not catch a rejection of `hydrate()`, so it is kept only if a page that fails to start still fails its test.
- **The renderer on Node streams.** `__NEXT_USE_NODE_STREAMS` on, React's builds for Node.js in the server layers, on the plugin's readable-stream, which React's renderer for Node.js already runs on for a Client Component that imports `react-dom/server`. It puts the renderer on the path Next takes by default, and takes away the switch and its check. Since #93944 the staged rendering of Cache Components has only that path. Kept only if `pnpm perf` shows no real slowdown.
- **`next-swc-loader` as it is.** Run through `runLoader()`, as the font and image loaders are, with the plugin's changes to the options applied before they reach SWC. Next's CommonJS exports are getters that cannot be replaced, so this needs the module of `getLoaderSWCOptions()` swapped in the require cache, only inside the plugin's call of the loader or in a worker, since another project in the same process may call it too. If that is not clean, the call stays as it is.

## Decided Against

- **`getBaseWebpackConfig()` as the source of aliases and defines.** One call for all of them, which is what Rule 2 asks for, but its signature changed in 7 of 12 releases, it is webpack's alone, and its output means webpack's rule semantics: `issuerLayer`, `oneOf`, aliases inside rules. It is a comparison in Phase 5 instead.
- **Letting Next's route module construct the cache**, as Fable suggested. One field, `cacheMaxMemorySize`, sizes both that cache and the handlers of `"use cache"`; the plugin needs 0 for the first and the app's value for the second. The cache between requests has no route module, so the constructor stays anyway. And Next imports a cache handler by a `file:` URL, which a browser cannot load.
- **`isPageStatic()`** for the prerender verdict. It loads a built route from `.next/` in a Node.js process; the plugin's routes are modules in the browser.
- **Computing the `routing` phases ourselves.** It would copy Next's code from inside `handleBuildComplete()`.
- **Selecting the modules that keep a store by their content**, as Fable suggested. It would also compile modules nobody has tested that way. CI flags them instead.
- **Node module hooks for ordinary compilation.** Only where Node-side code of Next must load another module, and then in a worker.
- **Pinning `next` exactly, or reimplementing Next.**
- **Upstream PRs, for now.** Later candidates: `@next/routing` computing the phases without a build, and `hydrate()` taking a container.

## Where The Second Opinions Differed

| Question                   | Codex                                                   | Fable                                            | The plan                                              |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| `getBaseWebpackConfig()`   | reject                                                  | shadow mode, then switch                         | a comparison in CI, not the source                    |
| Client entry               | try `app-next`, with a bridge of `react-dom/client`     | keep `hydrate()`; detect hydration from the root | the bridge first, then `app-next` as a prototype      |
| SWC                        | keep `getLoaderSWCOptions()` behind the compiler module | run `next-swc-loader`, patch its options         | keep now, try the loader in Phase 6                   |
| The data cache             | keep the constructor                                    | let the route module construct it                | keep the constructor                                  |
| Request stores             | keep the path list, test the behavior                   | select by content                                | keep the list, flag new modules in CI                 |
| Rewrites of generated code | AST with asserted sites                                 | a define and the CommonJS transform              | the define and the transform, with counts and a check |

Both agreed on: `createEntrypoints()`, keeping `handleBuildComplete()` and the request matchers, the scoping by feature, the patch registry, the runtime facades, the peer range, and upstream last. Codex's caveats on `createEntrypoints()`, the choice of a route's page, the root-layout check and the edge policy, are in Phase 4.

## What Is Left

The plan does not make the number of internals much smaller, by design: the number is not the risk. It changes what breaks when Next changes, and how early it shows. An estimate, if every phase and prototype is kept:

| What                                               | Today | After |
| -------------------------------------------------- | ----: | ----: |
| Module paths of `next/dist`                        |   103 |   ~96 |
| Of them, loaded in a run without optional features |   103 |   ~76 |
| Text checks in every run                           |    20 |   6–8 |
| Text checks only for their feature                 |     0 |     8 |
| Text checks that match formatting                  |     3 |     0 |
| Rewrites of the code Next generates by regex       |     8 |     4 |
| Options of Next copied by hand                     | 1 set |     0 |

The 7 paths that go: `shared/lib/constants` for the public `next/constants`, and about six that `createEntrypoints()` takes over. About 20 load only for an optional feature: production prerendering, the image optimizer, fonts, metadata files, the route of a node.

## How We Know It Worked

- No test that `conformance/expectations.json` expects to pass stops passing, at any phase.
- A change of canary that breaks the plugin is an issue by the next morning.
- A development run loads no module of Next and runs no check for production prerendering.
- The text checks that every run makes go from 20 to at most 8, all whitespace-insensitive; the others run only for their feature.
- The options of `next-app-loader` and `getEdgeServerEntry()` are no longer copied by hand.
- Every module path of `next/dist` that the plugin names is in `compat/`.
- For each prototype that is kept: no change of React DOM's exports; no hand-built options of `getLoaderSWCOptions()`; no switch of Next's streams.
