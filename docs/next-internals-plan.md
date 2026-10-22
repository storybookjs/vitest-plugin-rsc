# Next.js Internals: The Plan

How `vitest-plugin-rsc/nextjs` should couple to Next.js from here on, so that a release of Next breaks as little as possible and what it does break shows early, in one place, and only in the feature it touches. The measurements behind it are in [next-internals-risk.md](next-internals-risk.md). Two independent second opinions, from Codex and from Fable, were asked the same question; where they differ, the plan says which way it goes and why.

The yardstick stays the conformance suite: 956 of the 1147 tests of Next's that apply pass ([next-conformance.md](next-conformance.md)). No step below may lower it.

## The Rules

1. **Reuse Next's code wherever it runs where we need it.** The plugin keeps calling Next's own build code and running Next's own runtime.
2. **Call the coarsest function of Next whose output is data.** One call that hands us what five helpers would, so that what Next adds arrives without a change here. Where Next has no such function, call the helpers, but never copy what a function of Next computes.
3. **Compute ourselves only where Next has no function we can call**, like the prerender verdict, whose last step is inline in `build/index.js`. Every such computation is checked against Next's real build in CI.
4. **Patch only where Next has no switch**, and only by a mechanism that checks its own target: an export by name, a resolver alias, an AST site with an exact count. Never a piece of text that may match nothing.
5. **Fail loudly, but only the feature that needs it.** A change in production prerendering must not stop a development run.
6. **Know before the release.** Every night against canary, with a type check, the playgrounds, conformance and the comparisons with Next's real build.

## The Architecture

### Modules

- `compat/node/`: the build side, in Node. One module per cluster: `config`, `routes`, `entries`, `routing`, `compiler`, `loaders`. Each exports operations of the plugin, like `entriesOf(routes)` or `compile(file, layer)`, not Next's modules. Today's `project/context.ts` becomes its loader, lazy per feature.
- `compat/runtime/{rsc,ssr,browser}.ts`: the runtime, in the browser. What the plugin's browser modules use from Next, behind functions of the plugin, with namespace imports so that a branch can see what is there.
- `compat/patches.ts`: every change of Next's or React's code, in one list. Each entry names its target, its anchor, the feature it serves and its probe. The ones there are today move in: the `server-reference-info` shim, the asset-prefix stub, React's `patchConsole()` and `performWork()`, the modules compiled to keep their stores.
- `features.ts`: the features and what each needs of Next. Each feature has a status, active or off, and the reason.

### Core And Optional

| Core: a failure stops the run          | Optional: a failure turns the feature off                      |
| -------------------------------------- | -------------------------------------------------------------- |
| config, routes, entries, routing       | production prerendering                                        |
| aliases, defines, the compiler         | the route of a node: `renderServer(<Node />)` and `rerender()` |
| a request, the client entry, hydration | fonts, images and metadata files, each on its own              |
| Server Actions, the request stores     | the image optimizer behind `/_next/image`                      |
| the data cache                         | `cleanup()` of an app's own cache handler                      |

An optional feature that is off logs one warning when the run starts, naming the version of Next and what differs. Its API throws that same reason when a test uses it. It never substitutes something else. A feature that the config selects, like `build: "production"`, checks at startup; one that a test selects checks on first use.

Lazy imports alone are not enough: the dependency optimizer pre-bundles the runtime imports of every feature up front (`runtimeImports` at `plugin.ts:597`). Each feature lists its own, and only active features are pre-bundled.

### Versions

- **Version profiles**, chosen once by the installed version of Next, not by guessing from a function's arity. A profile holds the few branches that differ, like `hydrate()` with or without the asset prefix. Each branch names the Next PR that made it necessary.
- **The peer range** `>=16.4.0-0 <17.0.0-0` for `next` and for `@next/routing`. A major is where the Adapter API may break and where webpack or the Edge Runtime may go.
- **Caches** of compiled modules are keyed by the Next version, the profile and the revision of the patches.

### Early Warning

A workflow, `next-canary.yml`, every night and by hand, against `next@canary`:

- the four Next.js playgrounds, in development and in production, as the `next` job of CI does for each push;
- the type check of the plugin against canary's declarations, as the last step, so that a type error never hides a runtime failure;
- the conformance suite;
- the comparisons with Next's real build: see [Phase 5](#phase-5-nexts-real-build-as-the-oracle-2-3-days).

A failure opens an issue. A table of the versions CI has seen pass is written by the same workflow.

## Per Cluster

| Cluster             | Today                                                                                                                                                         | Plan                                                                                                                                                       | Why                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Config              | `loadConfig()`                                                                                                                                                | keep; phases and names from the public `next/constants`                                                                                                    | the call has been the same since 15.0                                                                        |
| Routes and entries  | `discoverRoutes()`, `normalizeCatchAllRoutes()`, the interception check, three error classes, the app loader's options copied by hand, `getEdgeServerEntry()` | `discoverRoutes()`, then **`createEntrypoints()`**, which does all of that for `next build` and returns the loader request of every route and of the proxy | one call instead of about eight; its parameters only gained optional fields in 16.x                          |
| The route of a node | `loadEntrypoint("app-page", …)`                                                                                                                               | keep, and inject `__next_require__` directly                                                                                                               | the placeholders are the steadiest surface there is                                                          |
| Code Next generates | three regex rewrites                                                                                                                                          | a define for `__webpack_require__`, and the plugin's own CommonJS transform for the entries                                                                | mechanisms that match no text of Next's                                                                      |
| Routing             | `handleBuildComplete()`, `@next/routing`                                                                                                                      | keep both, contained in `compat/node/routing`                                                                                                              | the only producer of the `routing` phases; their shape is documented, and recomputing would copy Next's code |
| Request matchers    | `getRouteRegex()`, `getRouteMatcher()`                                                                                                                        | keep                                                                                                                                                       | `@next/routing` gives raw captures, not App Router params                                                    |
| Compiler            | `getLoaderSWCOptions()` and `transform()`                                                                                                                     | keep now; try `next-swc-loader` as it is, which maps the config itself                                                                                     | its options changed once in 16.x, `getLoaderSWCOptions()` in 7 of 12 releases                                |
| Aliases and defines | `createWebpackAliases()` and four more, `getDefineEnv()`                                                                                                      | keep; compare with `getBaseWebpackConfig()` in CI                                                                                                          | the comparison tells when Next adds a table the plugin lacks                                                 |
| Loaders             | Next's loaders, run as they are                                                                                                                               | keep; `next/image-optimizer-transform` where it exists                                                                                                     | they are among the steadiest internals                                                                       |
| A request           | the entry's `handler(req, res, ctx)`                                                                                                                          | keep                                                                                                                                                       | documented for adapters                                                                                      |
| Client entry        | `appBootstrap()` and `hydrate()`, a global wrapper of `hydrateRoot()`                                                                                         | keep the two behind a profile; the wrapper becomes a bridge of `react-dom/client` for Next's `app-index` alone                                             | no global change of React DOM, and no check of `const appElement = document`                                 |
| Hydration done      | `__NEXT_HYDRATED_CB` under `__NEXT_TEST_MODE`                                                                                                                 | from the bridge's root, once it has committed                                                                                                              | one define and one check less                                                                                |
| The data cache      | the plugin constructs `IncrementalCache`                                                                                                                      | try letting Next's route module construct it, steered by the config and `distDir` it already reads                                                         | takes the constructor that changed in 6 of 12 releases out of the plugin                                     |
| Prerender verdict   | 9 modules of Next, 8 code checks                                                                                                                              | keep the computation, lazy and optional; test it against Next's real build                                                                                 | Next has no function for it that runs in a browser                                                           |
| Server Actions      | the `server-reference-info` shim                                                                                                                              | keep                                                                                                                                                       | already a module wrapped by its exports                                                                      |
| Request stores      | three modules compiled by path                                                                                                                                | keep the list; CI flags a new module of Next that keeps a store and is not on it                                                                           | a list that cannot grow by itself is safer than a rule that can                                              |

## The Phases

Each phase ends with the relevant tests by file and a conformance run on the branch, at 956 or more.

### Phase 0: Nightly Canary, Green From The Start (hours)

- The `next-canary.yml` workflow above, with the type check of the plugin as its last step.
- The profile branch for `hydrate()` and `appBootstrap()`, which canary.21 changed, so that the workflow starts green.

Removes: hearing of a change at GA. It catches the change of `hydrate()` today.

### Phase 1: Features (2–3 days)

- `features.ts`, and the failure model above.
- `prerender-verdict.ts` imported dynamically, only with `build: "production"` (today statically at `rsc.ts:15`).
- The optional modules of `project/context.ts` loaded on the feature's first use: the image optimizer, the metadata loaders, the prerender modules.
- The pre-bundled runtime imports per feature.
- The 20 code checks of `project/runtime.ts` split by feature. The two that match indentation and the 127-character line of `build/index` become whitespace-insensitive, for now.
- Tests that a missing optional module turns its feature off, and that using it then throws.

Removes: 12 of the 20 checks and the most changed prerender internals from every run that does not use them.

### Phase 2: `compat/` (2 days)

- The build side and the runtime side behind the modules above. Every import of `next/dist` in the plugin goes through them; a lint rule keeps it so.
- The patch registry, with today's patches moved in, each with its probe.
- `next/constants` for `shared/lib/constants`, `NextAdapter` from `next`.

Removes: imports of Next spread over about 15 files. A change of Next is then a change of one file.

### Phase 3: Mechanisms, Not Text (1 day)

- `__next_require__` injected into the template directly, where it is rewritten now (`project/entries.ts:144,187`).
- A define of `__webpack_require__` for the code Next generates, as the browser layer already has (`plugin.ts:539`).
- The plugin's CommonJS transform for the generated entries: `require()` in a function becomes `import()`, which Next's templates await.

Removes: the three regex rewrites of `project/entries.ts:144`, `:251` and `:354`.

### Phase 4: `createEntrypoints()` (2–4 days)

- A prototype that calls `createEntrypoints()` with the output of `discoverRoutes()`, and runs the loader of each request it returns, as now.
- A comparison of its requests with today's on the playgrounds and the conformance fixtures: slots, interception routes, metadata files, the proxy.
- Adoption once the comparison is empty and conformance is equal.

Removes: the hand-copied options of `next-app-loader` (`project/entries.ts:212`), the call of `getEdgeServerEntry()`, and the plugin's own calls of the route checks that `next build` makes in the same function.

### Phase 5: Next's Real Build As The Oracle (2–3 days)

In the nightly workflow, `next build` of each playground with a small adapter of the stable Adapter API, which writes what `onBuildComplete` gets. Then the plugin's own view of the same app, compared:

- the routes and their entries;
- the `routing` phases;
- which pathnames are prerendered, with their fallback, against `outputs.prerenders`;
- the alias and define tables against `getBaseWebpackConfig()`.

The text checks of `build/index`, `build/utils` and `create-component-tree` then go: the behavior they guarded is compared directly.

Removes: the checks that break on a refactor of Next that changes nothing, and the silent drift of what the plugin computes itself.

### Phase 6: Prototypes, Each Kept Only If Conformance Is Equal (1–3 days each)

- **The `react-dom/client` bridge.** Next's `app-index` alone resolves `react-dom/client` to a module of the plugin, which gives Next the container and keeps the root. It takes the place of the global wrapper at `client.tsx:130`, and of three checks of `app-index`'s code.
- **The cache through Next's route module.** Next constructs `IncrementalCache` itself when `requestMeta` has none (`app-page-runtime.js:532`, `route-module.js:272`). What to find out first: whether it reads the config per request, and whether its `import()` of a cache handler goes through the module runner. If either fails, the constructor adapter stays.
- **`next-swc-loader` as it is.** Run through `runLoader()`, as the font and image loaders are, with the plugin's changes to the options applied before they reach SWC. Next's CommonJS exports are getters that cannot be replaced, so this needs the module of `getLoaderSWCOptions()` swapped in the require cache before the loader loads. If that is not clean, the call stays as it is.

## Decided Against

- **`getBaseWebpackConfig()` as the source of aliases and defines.** One call for all of them, which is what Rule 2 asks for, but its signature changed in 7 of 12 releases, it is webpack's alone, and its output means webpack's rule semantics: `issuerLayer`, `oneOf`, aliases inside rules. It is the comparison in Phase 5 instead.
- **`isPageStatic()`** for the prerender verdict. It loads a built route from `.next/` in a Node.js process; the plugin's routes are modules in the browser.
- **Computing the `routing` phases ourselves.** It would copy Next's code from inside `handleBuildComplete()`.
- **Next's client entry files** (`app-next-turbopack.js` and the like). Codex suggested trying them. They `require()` the dev overlay and more: more surface, with the same contract.
- **Selecting the modules that keep a store by their content**, as Fable suggested. It would also compile modules nobody has tested that way. CI flags them instead.
- **Node module hooks for ordinary compilation.** Only where Node-side code of Next must load another module, and then in a worker.
- **Pinning `next` exactly, or reimplementing Next.**
- **Upstream PRs, for now.** Later candidates: `@next/routing` computing the phases without a build, and `hydrate()` taking a container.

## Where The Second Opinions Differed

| Question                   | Codex                                                            | Fable                                            | The plan                                                    |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| `getBaseWebpackConfig()`   | reject                                                           | shadow mode, then switch                         | a comparison in CI, not the source                          |
| Client entry               | try Next's `app-next` entry, with a bridge of `react-dom/client` | keep `hydrate()`; detect hydration from the root | keep `hydrate()`, with Codex's bridge and Fable's detection |
| SWC                        | keep `getLoaderSWCOptions()` behind the compiler module          | run `next-swc-loader`, patch its options         | keep now, try the loader in Phase 6                         |
| The data cache             | keep the constructor                                             | let the route module construct it                | try it in Phase 6, keep the constructor if it differs       |
| Request stores             | keep the path list, test the behavior                            | select by content                                | keep the list, flag new modules in CI                       |
| Rewrites of generated code | AST with asserted sites                                          | a define and the CommonJS transform              | Fable's                                                     |

Both agreed on: `createEntrypoints()`, keeping `handleBuildComplete()` and the request matchers, the scoping by feature, the patch registry, the runtime facades, the peer range, and upstream last.

## How We Know It Worked

- Conformance stays at 956 of 1147 or more, at every phase.
- A change of canary that breaks the plugin is an issue by the next morning, before its release.
- A development run no longer depends on any module or check of production prerendering.
- The text checks of Next's compiled code go from 20 to at most 8, all of the core and whitespace-insensitive. No hand-copied options of Next's are left, and no global change of React DOM.
- All imports of `next/dist` are in `compat/`.
