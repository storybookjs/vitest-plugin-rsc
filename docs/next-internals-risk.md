# Next.js Internals: The Risk, Measured

`vitest-plugin-rsc/nextjs` runs Next's own runtime and calls Next's own build code, from `next/dist`. Next makes no promise about any of it. This page counts what the plugin couples to, measures how often each piece moved in Next's last two years, and weighs what would make that coupling cheaper to carry: fewer internals, public APIs, steadier internals, isolation, and upstream changes.

Measured on 2026-10-22, against `next@16.4.0` (the pinned one), `16.4.2` (`latest`) and `16.5.0-canary.21` (`canary`).

## In Short

- **The plugin touches Next in about 150 places, not 38.** There are 103 module paths under `next/dist`, 20 checks of the shape of Next's compiled code, 8 rewrites of code that Next generates, about 14 globals, env names and symbols, and about 8 data shapes.
- **The count is the wrong measure.** 32 of the 103 paths had no change to the types of what the plugin uses, and fewer than 10 commits, in two years. The risk sits in about 20 surfaces, listed in [Blast Radius](#6-blast-radius).
- **The treadmill has a speed, and it can be measured.** In each release from 16.0 to 16.4, 6 to 16 of about 90 internals changed the declared types of what the plugin uses. 5 of the 20 code-shape checks, written for 16.4, do not hold on 16.3. Patch releases changed nothing. From 16.4.2 to canary.21: 4 type changes, nothing removed, and one new module to stub, which the plugin already does.
- **The premise "couple to the build/runtime contract, it is the most stable" is half right.** The contract's narrow part is steady: the placeholders of Next's templates (`app-route`'s did not change in two years), the loader tree (one additive change) and `handler(req, res, ctx)` (documented). The rest is among the most changed code in Next: the template bodies, the route module classes, the manifests. The plugin already couples at the narrow part wherever it exists. Its fragility is in what it does around it.
- **The strategy itself is the right one.** Calling the installed Next's code and failing loudly at startup is what the ecosystem found to work best (Netlify). The worst is patching Next's text silently (OpenNext lost a patch for 11 months). Reimplementing Next (vinext) trades the treadmill for fidelity that lags.
- **Three weaknesses:** the startup checks are all or nothing, so a change that only matters for production prerendering stops every run; signature changes are not checked before a Next release; and the most brittle checks match the formatting of Next's compiled output.
- **Bigger than release-to-release churn are three directions:** Next's webpack path, which about 15 of the 52 build modules exist for; the deprecated Edge Runtime, whose alias tables and web-stream paths the plugin runs on; and Vercel's own draft test runner with Vitest APIs, [vercel/next.js#98869](https://github.com/vercel/next.js/pull/98869).
- **Public APIs cover routing and the call into a route, not the build.** `@next/routing`, the adapter types, `handler(req, res, ctx)` and `next/constants` exist and are mostly used already. Everything else needs upstream work.
- **Recommendation, in order:** a nightly run against canary that also type-checks; checks and modules scoped to the feature they serve; looser checks of compiled code; one module for the runtime internals, with version branches; and the Ecosystem Working Group with a short list of upstream asks, soon, while #98869 is still a draft. See [Recommendation](#7-recommendation-five-changes-in-order).

The conformance suite is the yardstick for fidelity throughout: 956 of the 1147 tests that apply pass (83%), see [next-conformance.md](next-conformance.md). The 402 of 474 of an earlier selection is from before [#228](https://github.com/storybookjs/vitest-plugin-rsc/pull/228).

## How It Was Measured

- **Inventory.** Every reference to Next in `packages/vitest-plugin-rsc/src/nextjs/` (about 22,000 lines with tests), `packages/storybook-nextjs-vite-rsc/` and `conformance/`, by grep for `next/dist`, `next/`, `require`, `createRequire`, `__next`, `NEXT_`, `globalThis.` and `Symbol.for`, and by reading each file that matched.
- **Version matrix.** The npm tarballs of 13 releases: 15.0.0, 15.1.0, 15.2.0, 15.3.0, 15.4.1, 15.5.0, 16.0.0, 16.1.0, 16.2.0, 16.3.0, 16.4.0, 16.4.2 and 16.5.0-canary.21. For each internal: is the file there, does it have the exports the plugin uses (with `cjs-module-lexer`), and a hash of the declared types of each export in its `.d.ts`, with the types of the same file that it names. For each of the 20 code-shape checks: does it hold.
- **Git history.** A clone of `vercel/next.js` (`canary`, history since 2024-06). For each internal, the commits to its source file since 2024-10-22 and since 2025-10-22, and whether the file existed two years ago.
- **Base rate.** For all of `next/dist/{build,server,client,shared,lib}`: the share of files and exports that each release removed.
- **Ecosystem.** The source of OpenNext AWS and Cloudflare, Netlify's plugin, Storybook's `nextjs-vite` and vinext, at the commits named in [How Others Do It](#4-how-others-do-it), with their issues and PRs.
- **This repository's CI.** The `latest` and `canary` jobs and the weekly conformance run on canary.

The scripts were throwaway. Their limits:

- A type hash over-counts: a class counts as changed when one of its private members does. It can under-count: a function whose options type lives in another file counts as unchanged when only that type changes.
- A commit count includes formatting and unrelated edits to the same file.
- A change of behavior behind an unchanged signature is invisible to all of this. Only the tests, the playgrounds on `latest` and `canary`, and the conformance suite see it.

## 1. What The Plugin Couples To

### 1.1 Seven Kinds

| Kind                                              | How many   | When a change of Next shows                                                 | Example                                          |
| ------------------------------------------------- | ---------- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| Build code, `require()`d in Node                  | 52 modules | At startup: `load()` of `project/context.ts` names the file and the version | `getDefineEnv()`                                 |
| Runtime, imported by the plugin's browser modules | 31 modules | When the module loads: it fails to link, naming the export                  | `hydrate()` of `client/app-index`                |
| Replaced, wrapped or matched by its path          | 20 paths   | Partly at startup. A path that moved loads Next's own module instead        | the `server-reference-info` shim                 |
| The shape of Next's compiled code, `contains()`   | 20 checks  | At startup (`project/runtime.ts`)                                           | a line of `build/index.js`                       |
| Rewrites of the code Next generates               | 8          | At startup or on first use: `replace()` fails when the piece is not there   | `userland: () => require(` to `import(`          |
| Globals, env names, symbols                       | about 14   | Some are checked                                                            | `__NEXT_HYDRATED_CB`                             |
| Data shapes                                       | about 8    | Mostly by the tests                                                         | the loader tree, the manifests, `routing` phases |

On top of these, `@next/routing` has to be at the version of `next` (checked in `project/routing.ts`), and `@next/env` is found next to `next`.

`packages/storybook-nextjs-vite-rsc` has no coupling of its own: it goes through `vitest-plugin-rsc`. The conformance runner loads `next/dist/server/config` (`conformance/src/vite-plugin.ts`).

The build side already has one place: `project/context.ts` loads every module of Next's build through `load()`, which fails at startup with the version of Next, and a `Proxy` that fails where an export that is gone is read. The runtime side is spread over about 15 files.

### 1.2 The Inventory

Paths are under `next/dist/`, and the files of the plugin under `packages/vitest-plugin-rsc/src/nextjs/`. **Churn** is the commits to the source file in two years (`c`), then the number of releases, of the 12 steps from 15.0.0 to canary.21, in which the declared types of the exports the plugin uses changed (`s`). **Class** is defined in [How Often It Moves](#21-four-classes).

#### Config and constants

| Internal                  | Our code                                                                               | For                                               | Churn     | Class     |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------- | --------- | --------- |
| `server/config`           | project/context.ts                                                                     | load `next.config` as `next build` does           | 205c · 4s | **churn** |
| `shared/lib/constants`    | project/context.ts, project/loaders.ts                                                 | the phase for `loadConfig()`, compiler names      | 19c · 0s  | 1–2×      |
| `lib/constants`           | project/routes.ts, project/routing.ts, project/transform.ts, cache.ts, build-output.ts | layer names, file names, cache tag prefix, `.rsc` | 20c · 5s  | **churn** |
| `build/generate-build-id` | project/context.ts                                                                     | the build id                                      | 1c · 1s   | 1–2×      |

`lib/constants` counts as churn because Next adds layers to `WEBPACK_LAYERS`: every change was an addition.

#### The app's routes, as `next build` lists them

| Internal                                                        | Our code                                | For                                    | Churn    | Class     |
| --------------------------------------------------------------- | --------------------------------------- | -------------------------------------- | -------- | --------- |
| `lib/find-pages-dir`                                            | project/context.ts                      | find `app/`                            | 1c · 0s  | stable    |
| `build/route-discovery`                                         | project/routes.ts, project/routing.ts   | the routes, as `next build` lists them | 3c · 1s  | 1–2×      |
| `build/normalize-catchall-routes`                               | project/routes.ts                       | catch-all pages in slots               | 7c · 1s  | 1–2×      |
| `shared/lib/router/utils/app-paths`                             | project/routes.ts                       | route names                            | 2c · 0s  | 1–2×      |
| `lib/is-app-route-route`                                        | project/routes.ts                       | route handler or page                  | 0c · 0s  | stable    |
| `lib/is-app-page-route`                                         | project/routes.ts                       | route handler or page                  | 0c · 0s  | stable    |
| `shared/lib/router/utils/interception-routes`                   | project/routes.ts                       | the build errors of `next build`       | 4c · 0s  | 1–2×      |
| `shared/lib/errors/missing-canonical-interception-routes-error` | project/routes.ts                       | Next's own error                       | 1c · 0s  | 1–2×      |
| `shared/lib/errors/incompatible-parallel-route-slots-error`     | project/routes.ts                       | Next's own error                       | 1c · 0s  | 1–2×      |
| `shared/lib/errors/unmatched-app-pages-error`                   | project/routes.ts                       | Next's own error                       | 1c · 0s  | 1–2×      |
| `build/analysis/get-page-static-info`                           | project/routes.ts, project/transform.ts | segment config, the proxy's matcher    | 33c · 4s | **churn** |
| `lib/get-files-in-dir`                                          | project/routing.ts                      | the files of `app/`                    | 0c · 0s  | stable    |
| `lib/page-types`                                                | project/context.ts, project/entries.ts  | `PAGE_TYPES.ROOT`, a const enum        | 0c · 0s  | stable    |
| `build/get-static-info-including-layouts`                       | project/routing.ts                      | segment config with the layouts        | 3c · 1s  | 1–2×      |

#### The server in front of the app

| Internal                                    | Our code                       | For                                                               | Churn    | Class      |
| ------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- | -------- | ---------- |
| `lib/load-custom-routes`                    | project/routing.ts             | redirects, rewrites, headers                                      | 14c · 2s | **canary** |
| `lib/generate-interception-routes-rewrites` | project/routing.ts             | the rewrites of interception routes                               | 8c · 0s  | stable     |
| `client/components/app-router-headers`      | project/routing.ts, ssr.ts     | header names                                                      | 13c · 1s | 1–2×       |
| `build/generate-routes-manifest`            | project/routing.ts             | the routes manifest                                               | 12c · 1s | 1–2×       |
| `build/adapter/build-complete`              | project/routing.ts, adapter.ts | `handleBuildComplete()`: the `routing` phases for `@next/routing` | 87c · 5s | **churn**  |
| `lib/bundler`                               | project/routing.ts             | an argument of `handleBuildComplete()`                            | 10c · 0s | 1–2×       |
| `shared/lib/router/utils/route-regex`       | project/routing.ts, ssr.ts     | matchers                                                          | 7c · 1s  | 1–2×       |

#### Route entries and Next's templates

| Internal                                       | Our code                               | For                                                      | Churn     | Class     |
| ---------------------------------------------- | -------------------------------------- | -------------------------------------------------------- | --------- | --------- |
| `build/load-entrypoint`                        | project/entries.ts                     | the `app-page` template, for the route of a node         | 4c · 1s   | 1–2×      |
| `build/webpack/loaders/next-app-loader/index`  | project/entries.ts                     | the loader tree of a route, as webpack makes it          | 37c · 0s  | 1–2×      |
| `build/entries`                                | project/entries.ts                     | `getEdgeServerEntry()`: the proxy's entry                | 43c · 3s  | **churn** |
| `build/webpack/loaders/next-middleware-loader` | project/entries.ts                     | the proxy's module                                       | 6c · 0s   | stable    |
| `build/templates/app-page`                     | project/entries.ts                     | the template; its output is rewritten                    | 147c · 0s | **churn** |
| `build/templates/app-page-runtime`             | project/entries.ts, project/runtime.ts | a page's request handler; its code is checked            | 47c · 0s  | **churn** |
| `build/templates/app-route`                    | project/entries.ts, project/runtime.ts | a route handler's module and handler; rewritten, checked | 57c · 0s  | **churn** |
| `build/templates/middleware`                   | project/entries.ts                     | the proxy's template; rewritten                          | 16c · 0s  | 1–2×      |

The templates count as churn by their bodies. Their placeholders, which are what a bundler fills in, hardly moved: see [The Contract](#24-the-contract-between-build-and-runtime).

#### Compiler, defines and aliases

| Internal                                  | Our code                          | For                                          | Churn    | Class     |
| ----------------------------------------- | --------------------------------- | -------------------------------------------- | -------- | --------- |
| `build/define-env`                        | project/layers.ts                 | the compile-time constants of a layer        | 96c · 1s | **churn** |
| `lib/static-env`                          | project/layers.ts, project/env.ts | `NEXT_PUBLIC_*` and `env` of `next.config`   | 4c · 2s  | 1–2×      |
| `build/webpack/plugins/middleware-plugin` | project/layers.ts                 | the modules of Node.js the browser layer has | 20c · 0s | 1–2×      |
| `build/create-compiler-aliases`           | project/layers.ts                 | the aliases of a layer, Next's React         | 21c · 1s | 1–2×      |
| `lib/needs-experimental-react`            | project/layers.ts                 | which channel of React                       | 12c · 0s | 1–2×      |
| `build/swc/index`                         | project/transform.ts              | Next's SWC transform of the app's files      | 99c · 0s | **churn** |
| `build/swc/options`                       | project/transform.ts              | `getLoaderSWCOptions()` for a layer          | 28c · 7s | **churn** |
| `build/load-jsconfig`                     | project/transform.ts              | `paths` of `tsconfig.json`                   | 7c · 1s  | 1–2×      |

#### Loaders: fonts, images, metadata, CSS

| Internal                                            | Our code            | For                                  | Churn     | Class     |
| --------------------------------------------------- | ------------------- | ------------------------------------ | --------- | --------- |
| `build/webpack-config`                              | project/loaders.ts  | `nextImageLoaderRegex`               | 125c · 0s | **churn** |
| `build/webpack/loaders/next-image-loader/index`     | project/loaders.ts  | an imported image                    | 5c · 0s   | stable    |
| `build/webpack/config/blocks/css/loaders/next-font` | project/loaders.ts  | `next/font`                          | 3c · 0s   | stable    |
| `build/webpack/config/blocks/css/plugins`           | project/loaders.ts  | the plugins of PostCSS               | 1c · 0s   | stable    |
| `lib/find-config`                                   | project/loaders.ts  | the config of PostCSS                | 0c · 0s   | stable    |
| `build/webpack/config/blocks/css/loaders/modules`   | project/loaders.ts  | class names and mode of a CSS module | 3c · 0s   | stable    |
| `compiled/postcss-modules-local-by-default/index`   | project/loaders.ts  | Next's check of a CSS module's mode  | – · 0s    | stable    |
| `build/get-supported-browsers`                      | project/loaders.ts  | the browsers for PostCSS             | 1c · 0s   | 1–2×      |
| `build/webpack/loaders/next-font-loader/index`      | project/loaders.ts  | `next/font`                          | 4c · 0s   | stable    |
| `build/webpack/loaders/next-root-params-loader`     | project/loaders.ts  | `next/root-params`                   | 4c · 0s   | 1–2×      |
| `server/image-optimizer`                            | project/loaders.ts  | `/_next/image`                       | 44c · 7s  | **churn** |
| `server/serve-static`                               | project/loaders.ts  | content types                        | 1c · 0s   | stable    |
| `build/webpack/loaders/next-metadata-image-loader`  | project/metadata.ts | `icon.png` and the like              | 9c · 0s   | stable    |
| `build/webpack/loaders/next-metadata-route-loader`  | project/metadata.ts | `sitemap.ts` and the like            | 11c · 1s  | 1–2×      |

#### Server runtime: a request

| Internal                                                         | Our code                                   | For                                        | Churn     | Class      |
| ---------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ | --------- | ---------- |
| `server/lib/is-rsc-request`                                      | ssr.ts                                     | is it a request of the router?             | 1c · 0s   | 1–2×       |
| `server/route-modules/app-page/module`                           | ssr.ts, registry.ts, node-platform.ts      | the route module's class, React's contexts | 30c · 10s | **canary** |
| `server/lib/server-action-request-meta`                          | ssr.ts                                     | is it a Server Action?                     | 4c · 0s   | 1–2×       |
| `server/web/utils`                                               | ssr.ts, node-server.ts, server-in-front.ts | headers                                    | 2c · 1s   | 1–2×       |
| `shared/lib/router/utils/route-matcher`                          | ssr.ts                                     | the params of a route                      | 2c · 1s   | 1–2×       |
| `server/lib/mock-request`                                        | node-server.ts                             | the `res` of `handler(req, res)`           | 2c · 2s   | 1–2×       |
| `server/request-meta`                                            | node-server.ts                             | `RequestMeta`, a type only                 | 41c · 0s  | **churn**  |
| `server/lib/server-ipc/utils`                                    | server-in-front.ts                         | `filterInternalHeaders()`                  | 6c · 0s   | 1–2×       |
| `server/route-kind`                                              | plugin.ts                                  | pre-bundled for the route kinds            | 0c · 0s   | stable     |
| `server/route-modules/app-page/module.compiled`                  | plugin.ts, node-platform.ts                | bridged to the ssr layer's class           | 1c · 0s   | stable     |
| `server/route-modules/app-route/module.compiled`                 | project/layers.ts                          | aliased to `module`                        | 1c · 0s   | stable     |
| `server/route-modules/app-page/vendored/contexts/entrypoints`    | project/layers.ts                          | the directory of contexts is listed        | 5c · 0s   | stable     |
| `server/route-modules/app-page/vendored/rsc/entrypoints`         | node-platform.ts                           | Next's bundle of React, stood in for       | 3c · 0s   | stable     |
| `server/route-modules/app-page/vendored/ssr/entrypoints`         | node-platform.ts                           | the same                                   | 3c · 0s   | stable     |
| `server/load-manifest.external`                                  | node-platform.ts, build-output.ts          | the manifests, from memory                 | 7c · 2s   | 1–2×       |
| `server/lib/router-utils/instrumentation-globals.external`       | node-platform.ts                           | stood in for                               | 6c · 0s   | 1–2×       |
| `server/node-environment`                                        | node-platform.ts                           | stood in for                               | 9c · 0s   | stable     |
| `server/node-environment-extensions/fast-set-immediate.external` | node-platform.ts                           | stood in for                               | 5c · 0s   | 1–2×       |
| `build/adapter/setup-node-env.external`                          | node-platform.ts                           | stood in for                               | 2c · 0s   | 1–2×       |
| `server/app-render/react-server.node`                            | node-platform.ts                           | stood in for                               | 0c · 0s   | stable     |

#### Client runtime and the route of a node

| Internal                                   | Our code           | For                                   | Churn    | Class      |
| ------------------------------------------ | ------------------ | ------------------------------------- | -------- | ---------- |
| `client/app-bootstrap`                     | client.tsx         | Next's client entry                   | 9c · 3s  | **canary** |
| `client/app-call-server`                   | client.tsx         | the call of a Server Action           | 3c · 0s  | stable     |
| `client/app-index`                         | client.tsx         | `hydrate()`                           | 61c · 4s | **canary** |
| `client/components/builtin/global-error`   | project/runtime.ts | the boundaries of the route of a node | 9c · 1s  | 1–2×       |
| `client/components/builtin/not-found`      | project/runtime.ts | the same                              | 1c · 1s  | 1–2×       |
| `client/components/builtin/forbidden`      | project/runtime.ts | the same                              | 1c · 1s  | 1–2×       |
| `client/components/builtin/unauthorized`   | project/runtime.ts | the same                              | 1c · 1s  | 1–2×       |
| `client/dev/hot-reloader/app/asset-prefix` | plugin.ts          | new on canary, stubbed                | 1c · 0s  | **canary** |

#### Caching and `"use cache"`

| Internal                                                 | Our code                     | For                                   | Churn    | Class     |
| -------------------------------------------------------- | ---------------------------- | ------------------------------------- | -------- | --------- |
| `server/lib/incremental-cache/index`                     | project/runtime.ts, cache.ts | Next's data cache, checked at startup | 36c · 6s | **churn** |
| `server/lib/incremental-cache/tags-manifest.external`    | cache.ts                     | revalidated tags                      | 4c · 2s  | 1–2×      |
| `server/lib/node-fs-methods`                             | cache.ts                     | the cache's file system               | 1c · 0s  | stable    |
| `server/use-cache/handlers`                              | cache.ts                     | the handlers of `"use cache"`         | 14c · 3s | **churn** |
| `build/webpack/loaders/next-flight-loader/cache-wrapper` | use-cache.ts                 | what `"use cache"` compiles to        | 0c · 0s  | stable    |

#### Production: what `next build` prerenders

| Internal                                                       | Our code             | For                            | Churn    | Class     |
| -------------------------------------------------------------- | -------------------- | ------------------------------ | -------- | --------- |
| `shared/lib/no-fallback-error.external`                        | rsc.ts               | the bail-out of a prerender    | 1c · 0s  | 1–2×      |
| `client/components/hooks-server-context`                       | node-server.ts       | the dynamic bail-out           | 0c · 0s  | stable    |
| `build/segment-config/app/app-segments`                        | prerender-verdict.ts | the build's verdict on a route | 14c · 4s | **churn** |
| `build/segment-config/app/collect-root-param-keys`             | prerender-verdict.ts | the same                       | 4c · 1s  | 1–2×      |
| `build/static-paths/app`                                       | prerender-verdict.ts | `generateStaticParams`         | 53c · 7s | **churn** |
| `lib/fallback`                                                 | prerender-verdict.ts | the build's verdict            | 1c · 0s  | stable    |
| `lib/is-edge-runtime`                                          | prerender-verdict.ts | the same                       | 0c · 0s  | stable    |
| `lib/metadata/is-metadata-route`                               | prerender-verdict.ts | the same                       | 6c · 0s  | 1–2×      |
| `server/route-modules/app-route/helpers/is-static-gen-enabled` | prerender-verdict.ts | the same                       | 0c · 0s  | stable    |
| `shared/lib/router/routes/app`                                 | prerender-verdict.ts | the same                       | 4c · 0s  | 1–2×      |
| `shared/lib/page-path/normalize-page-path`                     | build-output.ts      | the keys of the manifest       | 1c · 0s  | stable    |

#### Server Actions and request stores

| Internal                             | Our code       | For                                                    | Churn     | Class     |
| ------------------------------------ | -------------- | ------------------------------------------------------ | --------- | --------- |
| `shared/lib/server-reference-info`   | plugin.ts      | the shim that takes Vite RSC's ids of Server Actions   | 3c · 0s   | 1–2×      |
| `server/use-cache/use-cache-wrapper` | server-code.ts | async functions compiled to keep their stores, by path | 159c · 0s | **churn** |
| `server/app-render/action-handler`   | server-code.ts | the same                                               | 70c · 0s  | **churn** |
| `server/app-render/app-render`       | server-code.ts | the same                                               | 479c · 0s | **churn** |

### 1.3 The Other Kinds

**The shape of compiled code.** `project/runtime.ts` reads 12 files of `next/dist/esm` at startup and looks for 20 pieces of code, where Next would otherwise fail without saying why. Each check is written for 16.4. Where it holds:

| File (`next/dist/esm/…`)                        | What it looks for                                               | Holds in       | For                 |
| ----------------------------------------------- | --------------------------------------------------------------- | -------------- | ------------------- |
| `client/app-index`                              | `__NEXT_TEST_MODE`, `__NEXT_HYDRATED_CB`                        | 15.0 and later | every page          |
| `client/app-index`                              | `const appElement = document`, `hydrateRoot(appElement`         | 15.0 and later | every page, a node  |
| `client/app-index`                              | `onCaughtError,` and `createRoot(appElement, reactRootOptions)` | 15.1 and later | `rerender()`        |
| `client/components/segment-cache/cache`         | `currentTree.segment === nextTree.segment`                      | 16.4 and later | the route of a node |
| `client/components/render-tree`                 | `doesRouteStructureMatch(` and two more                         | 16.4 and later | the route of a node |
| `client/asset-prefix`                           | `document.currentScript`, `/_next/`                             | 16.0 and later | every page          |
| `server/route-modules/route-module`             | `load-manifest.external` and its two functions                  | 16.4 and later | every request       |
| `build/templates/app-page-runtime`              | `app-page/module.compiled`                                      | 16.3 and later | every page          |
| `server/app-render/get-css-inlined-link-tags`   | `entryCSSFiles[filePathWithoutExt]`                             | 15.0 and later | CSS                 |
| `server/app-render/render-css-resource`         | `entryCssFile.inlined` and two more                             | 15.1 and later | CSS                 |
| `build/templates/app-page-runtime`              | the message of a page that turned dynamic, `NoFallbackError`    | 16.3 and later | production          |
| `build/templates/app-route`                     | `if (isIsr) throw err;`                                         | 15.4 and later | production          |
| `server/lib/router-utils/router-server-context` | `Symbol.for('@next/router-server-methods')`                     | 15.4 and later | production          |
| `server/route-modules/route-module`             | `routerServerContext.logErrorWithOriginalStack(err`             | 15.4 and later | production          |
| `server/route-modules/app-page/module`          | `this.matchers.get(prerenderManifest)`                          | 15.5 and later | production          |
| `build/utils`                                   | `config.dynamic = dynamic;`                                     | 15.0 and later | production          |
| `build/index`                                   | a 150-character line of the build's prerender loop              | 16.4 and later | production          |
| `server/app-render/create-component-tree`       | the message of a `force-dynamic` page                           | 16.4 and later | production          |
| `server/lib/implicit-tags`                      | ``const derivedTags = [\n        `/layout`\n    ];``            | 15.0 and later | `cleanup()`         |
| `server/app-render/stream-ops`                  | `process.env.__NEXT_USE_NODE_STREAMS`                           | 16.3 and later | every page          |

Five of the 20 do not hold on 16.3.0, the release before the pinned one. Twelve of them are for features that not every run uses: production prerendering (8), the route of a node (3), and `cleanup()` of an app's own cache handler (1). All 20 run at the start of every run (`project.ts:304`). Two match the formatting of Next's compiled output, not its meaning: the indentation of `implicit-tags`, and the 150 characters of `build/index`, a file of 313 commits in two years.

**Rewrites of the code Next generates**, each with `replace()`, which fails when the piece is gone:

- `__webpack_require__` to the plugin's `__next_require__`, in the output of `next-app-loader` (`project/entries.ts:144`)
- `userland: () => require(` to `import(`, in a route handler's entry (`project/entries.ts:251`)
- `page: [<module>, "<file>"]` to the node, for a node in the layouts of a route (`project/entries.ts:310`)
- `require(` to `await import(`, in the proxy's template (`project/entries.ts:354`)
- Turbopack's `with { 'turbopack-transition': … }` taken out (`project/entries.ts:46`)
- a piece of a metadata loader's output (`project/metadata.ts:37`)
- React's `patchConsole()` turned off and `performWork()` wrapped, in the Flight server that Next vendors (`plugin.ts`, `server-code.ts:369`). These are React's, not Next's, and change with React.

**Globals, env names and symbols:** `process.env.__NEXT_TEST_MODE` with `globalThis.__NEXT_HYDRATED_CB` (Next's own hook for its e2e tests), `__NEXT_USE_NODE_STREAMS`, `__NEXT_RELATIVE_PROJECT_DIR`, `NEXT_RUNTIME`, `__NEXT_BUILD_ID` and the three `__NEXT_PREVIEW_MODE_*`, `__NEXT_PRIVATE_ORIGIN`, `globalThis.__incrementalCache`, `Symbol.for('@next/router-server-methods')`, `self.__next_f` and `self.__next_s` (the Flight data in the HTML), the `__next-page-redirect` element, and `__webpack_require__` as a define of the browser layer.

**Data shapes and objects:**

- The loader tree, `[segment, parallelRoutes, modules, staticSiblings]`, which the plugin writes for the route of a node. Not checked.
- The prerender manifest (`version: 4` throughout), the client reference manifest's `entryCSSFiles`, the routes and middleware manifests, made by Next's own functions where it has them.
- The `routing` phases that `handleBuildComplete()` hands an adapter. Checked.
- The `requestMeta` that `handler()` gets: `params`, `query`, `initURL`, `initProtocol`, `incrementalCache`.
- Next's ids of Server Actions, 42 hex characters, read as `SERVER_REFERENCE_ID_LENGTH`.
- Three objects the plugin changes: `routeModule.getIncrementalCache` (`rsc.ts:118`), `routeModule.distDir` (`ssr.ts:651`), and `hydrateRoot()` and `createRoot()` of React DOM, wrapped while `hydrate()` runs.

## 2. How Often It Moves

### 2.1 Four Classes

- **stable**: in 15.0.0 with the exports the plugin uses, their types unchanged up to canary.21, and fewer than 10 commits in two years.
- **1–2×**: one or two changes of types, or new since 15.0, or 10 to 39 commits.
- **churn**: three or more changes of types, or 40 or more commits.
- **canary**: changed between 16.4.2 and 16.5.0-canary.21.

| Class  | Build | Runtime | Replaced or matched | All |
| ------ | ----: | ------: | ------------------: | --: |
| stable |    16 |       9 |                   7 |  32 |
| 1–2×   |    24 |      15 |                   6 |  45 |
| churn  |    11 |       4 |                   6 |  21 |
| canary |     1 |       3 |                   1 |   5 |

None of the 103 is in Next's `exports` map, because `next` has none, in any release from 15.0.0 to canary.21. Every deep path resolves, and none is promised. Three are reachable by a public name: `shared/lib/constants` is `next/constants`, the type `NextAdapter` of `build/adapter/build-complete` is exported from `next`, and on canary `server/image-optimizer/transform` is `next/image-optimizer-transform`. None is under `next/experimental`.

### 2.2 Per Release

| Step                | Internals whose types changed | Of the 20 checks, written for 16.4, not holding on the newer one |
| ------------------- | ----------------------------: | ---------------------------------------------------------------: |
| 15.5 to 16.0        |                      16 of 82 |                                                                8 |
| 16.0 to 16.1        |                       6 of 86 |                                                                8 |
| 16.1 to 16.2        |                       8 of 88 |                                                                8 |
| 16.2 to 16.3        |                      13 of 91 |                                                                5 |
| 16.3 to 16.4        |                      11 of 95 |                                                                0 |
| 16.4.0 to 16.4.2    |                      0 of 102 |                                                                0 |
| 16.4.2 to canary.21 |                      4 of 102 |                                                                0 |

The 15.x steps had 5 to 11 each. A minor of Next came every two to five months in 16.x: 16.0 in October 2025, 16.1 in December, 16.2 in March 2026, 16.3 in August, 16.4 in October.

For all of Next's deep files, not only the plugin's, the base rate per release:

> 15.5→16.0: 2.8% of files removed, 1.5% of exports
> 16.0→16.1: 1.9% of files, 0.8% of exports
> 16.1→16.2: 1.2% of files, 1.2% of exports
> 16.2→16.3: 0.4% of files, 1.2% of exports
> 16.3→16.4: 3.4% of files, 1.5% of exports
> 16.4.0→16.4.2: nothing
> 16.4.2→canary.21: no file, 0.3% of exports
> (15.3→15.4 was the outlier: 14.4% of files)

With 103 internals that is zero to three gone per minor, at random. The plugin's internals moved more than that, because so many are in the parts of Next that are being reworked: 37 of the 103 did not exist in their present form in 15.0.0.

### 2.3 What Changed Most

- `handleBuildComplete()`: its arguments changed in 15.5, 16.0, 16.2, 16.3 and 16.4. 16.3 replaced `tracingRoot` with `repoRoot` and `outputFileTracingRoot`; 16.4 added `previewProps`, required.
- `getLoaderSWCOptions()`: changed in 7 of the 12 steps. 16.3 added `configDir`, required.
- `AppPageRouteModule`: changed in 10 of 12. On canary its `prerender()` lost the `req` argument ([#100331](https://github.com/vercel/next.js/pull/100331), 2026-10-20). The plugin does not call it.
- `hydrate()` and `appBootstrap()`: on canary.21 they no longer take the asset prefix. The plugin passes it (`client.tsx:187`), which JavaScript ignores, so canary still works.
- `buildAppStaticPaths()` and the image optimizer: 7 of 12 each.

### 2.4 The Contract Between Build And Runtime

Next's two bundlers fill the same templates. Webpack does it through `build/load-entrypoint`, and Turbopack in Rust, in `crates/next-core/src/next_app/app_page_entry.rs`:

```rust
load_next_js_template(
  "app-page.js",
  project_root.clone(),
  [
    ("VAR_DEFINITION_PAGE", &*page.to_string()),
    ("VAR_DEFINITION_PATHNAME", &pathname),
  ],
  [
    ("tree", &*loader_tree_code),
    ("__next_app_require__", &TURBOPACK_REQUIRE.bound()),
    ("__next_app_load_chunk__", &TURBOPACK_LOAD.bound()),
  ],
  [],
)
```

The plugin makes the same call for the route of a node (`project/entries.ts:181`):

```ts
code = await loadEntrypoint(
  "app-page",
  {
    VAR_DEFINITION_PAGE: page,
    VAR_DEFINITION_PATHNAME: pathname,
  },
  {
    tree,
    __next_app_require__: "__webpack_require__",
    __next_app_load_chunk__: "() => Promise.resolve()",
  },
);
```

That part is steady:

| Piece                                | Changes in two years                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| The placeholders of `app-route`      | none                                                                                                                       |
| The placeholders of `app-page`       | two removals: `pages` in 16.0, `VAR_MODULE_GLOBAL_ERROR` in 16.2                                                           |
| The placeholders of `middleware`     | one addition: `incrementalCacheHandler`, in 16.2                                                                           |
| The loader tree                      | one addition: `staticSiblings`, in 16.2                                                                                    |
| `handler(req, res, ctx)` of an entry | documented for adapters in [Invoking Entrypoints](https://nextjs.org/docs/app/api-reference/adapters/invoking-entrypoints) |
| The prerender manifest               | `version: 4` throughout                                                                                                    |

What is behind it is not:

| Piece                               | Changes in two years                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| The body of `templates/app-page`    | 147 commits; from 33 lines to over 1,000 and, in 16.3, to 22                          |
| `templates/app-page-runtime`        | new in 16.3; 47 commits since                                                         |
| `AppPageRouteModule`                | types changed in 10 of 12 releases                                                    |
| `server/route-modules/route-module` | 64 commits                                                                            |
| The manifests                       | no version on the client and server reference manifests; shapes change without a bump |

So the contract between Next's build and its runtime is the template's placeholders, the loader tree, and the entry's `handler(req, res, ctx)`. The template's body, the route module and the manifests are internal to the runtime, and both bundlers only reach them through the template.

### 2.5 What CI Has Seen

- The `latest` and `canary` jobs, both builds, passed on `main` today, against 16.4.2 and 16.5.0-canary.21 ([run 39750407654](https://github.com/storybookjs/vitest-plugin-rsc/actions/runs/39750407654)).
- The weekly conformance run on canary passed on 2026-10-12. On 2026-10-19, against canary.17, it failed on one test that Next's fixture had just added, which needs `gate()` of Next's test utilities: a change of the fixture, not of the plugin.
- One change of canary needed code so far: a module that reads the dev server's asset prefix when it loads, which the plugin stubs (`plugin.ts:174`, [#101](https://github.com/storybookjs/vitest-plugin-rsc/pull/101)).
- The integration with Next's App Router is two weeks old ([#57](https://github.com/storybookjs/vitest-plugin-rsc/pull/57), 2026-10-08), all on 16.4. It has not lived through a minor of Next yet. The numbers above are the forecast.

A type check against canary sees what the jobs above do not. Run against 16.5.0-canary.21 for this report, `tsgo` finds exactly the change of `hydrate()` and `appBootstrap()`, which works at runtime and is a change all the same:

> client.tsx(187,22): error TS2345: Argument of type '(assetPrefix: string) => void' is not assignable to parameter of type '() => void'.
> client.tsx(188,32): error TS2554: Expected 1 arguments, but got 2.

Everything else of the plugin type-checks against canary.21.

## 3. Is The Premise Right?

The premise: the plugin imports about 38 paths of `next/dist`, every release of Next can break one, Vercel owes us nothing, and it is a treadmill with no end.

**What holds.** Vercel owes us nothing, and says so: a deep import "pins an internal file layout that should be free to change" ([#99312](https://github.com/vercel/next.js/pull/99312), 2026-10-09). `next` has no `exports` map to draw a line with. And the treadmill is real: in each minor about one in ten of the plugin's internals changes the types of what it uses, and a quarter of the code-shape checks would have to be written again.

**What does not hold, in three ways.**

1. **The number of paths is not the risk.** A third of them did not change in two years, and a change to most of the rest is caught at startup with the version of Next in the message. Twenty surfaces carry the risk, and the five changes at the end of this page work on those.
2. **Release-to-release churn is not the biggest risk.** It costs days per minor, and CI on canary sees it weeks early. Bigger is a change of direction in Next, which no check helps with:
   - **Webpack.** About 15 of the 52 build modules exist only for Next's webpack build: `next-app-loader`, the font, image, metadata, middleware and root-params loaders, the CSS config blocks, `createWebpackAliases()`. Turbopack has Rust ports of them, like `crates/next-core/src/next_app/metadata/route.rs` ("Rust port of the `next-metadata-route-loader`"), which the plugin cannot call. Turbopack is the default of `next build` since 16.0. I found no plan to drop webpack, in commit messages since 2025-06 or in the source of canary. If it goes, those modules go with it.
   - **The Edge Runtime.** It was deprecated in [#93369](https://github.com/vercel/next.js/pull/93369) (2026-04-30). The server layers run on Next's alias tables for edge (`isEdgeServer: true`), on its ESM build, which exists for edge and Turbopack, and on its render to web streams (`__NEXT_USE_NODE_STREAMS` off). Node streams are now always on for Node.js, and [#93944](https://github.com/vercel/next.js/pull/93944) removed the web-stream branches of Cache Components, keeping the others "for edge/runtime compatibility". The web-stream branches are still in 16.4 and canary.21: 11 switches in `app-render.js`. When edge goes, their reason to exist goes too.
   - **Next's own test runner.** Tim Neutkens has a draft PR open, [#98869](https://github.com/vercel/next.js/pull/98869) "[experiment] Add a test runner with Vitest APIs" (2026-09-18, updated 2026-10-19). It adds `next test` and `next/experimental/testing/vitest`. Its `rsc.render` "runs route-less async server component subtrees through the real server renderer", and its component fixtures "render through Next App Pages with server rendering and client hydration": the route of a node, by another road. It runs through Turbopack, in Node.js workers that drive Chromium, without Vite. It is a draft of 205,000 lines, and may never land as it is.
3. **"Couple to the contract" is what the plugin already does where a contract exists.** It fills the templates with the same placeholders as Turbopack, runs `next-app-loader` as webpack does, calls the entry's `handler(req, res, ctx)` as an adapter does, and routes with `@next/routing` from the `routing` phases an adapter gets. What is fragile is around the contract: the rewrites of the template's output, the checks of the runtime's code, the producer of the adapter's phases (`handleBuildComplete()`, which Next does not promise), and a copy of the build's verdict on prerendering.

**And the strategy is right.** Calling the installed Next's own build code, rather than copying it, and failing at startup with the version, is the approach with the fewest breaks in the ecosystem below. Copying (Storybook's mocks of Next's contexts), patching text (OpenNext) and reimplementing (vinext) each fail more quietly or fall behind.

## 4. How Others Do It

| Project                                                                                                    | What it couples to                                                                                                   | How it tracks Next                                                                                                      | What broke recently                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OpenNext AWS](https://github.com/opennextjs/opennextjs-aws)                                               | `next-server`, `request-meta`, `image-optimizer`, `config-shared`; rewrites the compiled files of the server         | ast-grep rules with version gates (`versions: ">=16.0.0"`); nightly e2e on `latest`; no canary                          | 16.4 removed the route matchers of `BaseServer`: every fall-through was a 404 ([#1285](https://github.com/opennextjs/opennextjs-aws/pull/1285)). A rule stopped matching in 16.0 and was skipped silently for about 11 months ([#1211](https://github.com/opennextjs/opennextjs-aws/pull/1211))         |
| [OpenNext Cloudflare](https://github.com/opennextjs/opennextjs-cloudflare)                                 | the same, plus minified `*.runtime.prod.js` and Turbopack chunks                                                     | the same gates; no canary CI                                                                                            | a patch of a minified bundle made every request 500 with a green build ([#1385](https://github.com/opennextjs/opennextjs-cloudflare/issues/1385)); 16.4 was seen on canary six weeks early, and the fix still shipped after GA ([#1356](https://github.com/opennextjs/opennextjs-cloudflare/pull/1356)) |
| [Netlify](https://github.com/opennextjs/opennextjs-netlify)                                                | Next's standalone server and public hooks like `cacheHandler`; a few internals (`load-manifest`, the response cache) | try/catch fallbacks, each with the Next PR that moved the module; Next's own e2e suite nightly on `latest` and `canary` | few; a canary change of `extract-const-value` ([#3444](https://github.com/opennextjs/opennextjs-netlify/pull/3444))                                                                                                                                                                                     |
| [`@storybook/nextjs-vite`](https://github.com/storybookjs/storybook/tree/next/code/frameworks/nextjs-vite) | `server/config`, `build/swc`, `build/define-env`, `get-supported-browsers`; mocks of Next's router contexts          | try/catch fallbacks, a semver alias map, `isNext16orNewer`; CI on `latest` and 15 only                                  | every recent minor: an SWC option in 16.0, the config cache in 16.3, a router context in 16.4 ([#36720](https://github.com/storybookjs/storybook/issues/36720))                                                                                                                                         |
| [vinext](https://github.com/cloudflare/vinext)                                                             | nothing: it reimplements Next on Vite and `@vitejs/plugin-rsc`                                                       | Next's deploy suite nightly, pinned to 16.2.6; an LLM triages canary's commits into issues (152, 109 open)              | never crashes on a release; 95.9% of Next's suite, and behind on Cache Components                                                                                                                                                                                                                       |
| [OpenNext adapters-api](https://github.com/opennextjs/adapters-api)                                        | Next's adapter API, plus `next-server`, `require`, `load-manifest`                                                   | pinned to exactly 16.2.1; unreleased                                                                                    | –                                                                                                                                                                                                                                                                                                       |

What this says:

- **Fail loudly.** A patch or check that may match nothing is the worst failure mode there is: OpenNext's 11 months. The plugin already fails at startup.
- **Test against the installed Next, not snippets of it.** OpenNext's frozen snippets hid the miss.
- **Canary only helps if the fix ships before GA.** Cloudflare saw 16.4 coming and shipped after it anyway.
- **Mocks of Next's private shapes break every minor.** Storybook's do. The plugin runs Next's real router, and mocks none.
- **The adapter API replaced reading the build's output, not patching the runtime.** No adapter of OpenNext, Netlify or Cloudflare is on its main branch yet.
- **The internals that break for everyone** are `base-server` and `next-server` (the plugin uses neither), `load-manifest` (stood in for), the incremental and response caches (the plugin uses the first), the build helpers (it uses them) and Next's private client contexts (it mocks none).

## 5. Public And Semi-Public Alternatives

| What the plugin needs                                   | It uses                                     | Public or semi-public                                                                                                                                                                                                    | Swap                                  |
| ------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| The route of a request                                  | `@next/routing`                             | the package, "no longer experimental" since [#94903](https://github.com/vercel/next.js/pull/94903) (2026-07), versioned with `next`                                                                                      | done                                  |
| Calling a route                                         | the entry's `handler(req, res, ctx)`        | [documented for adapters](https://nextjs.org/docs/app/api-reference/adapters/invoking-entrypoints); the `requestMeta` fields beyond `hostname`, `revalidate`, `render404` are not                                        | done; `RequestMeta` stays a deep type |
| The `routing` phases                                    | `handleBuildComplete()`                     | the adapter API is stable since 16.2, "Breaking changes require a new major version" ([blog](https://nextjs.org/blog/nextjs-across-platforms)). That covers what an adapter gets, not `handleBuildComplete()`            | upstream, see below                   |
| The adapter's types                                     | `next/dist/build/adapter/build-complete.js` | `import type { NextAdapter } from "next"`                                                                                                                                                                                | **now**                               |
| Phases and compiler names                               | `next/dist/shared/lib/constants`            | `next/constants`, the same module                                                                                                                                                                                        | **now**                               |
| The image optimizer                                     | `imageOptimizer()`                          | `imageOptimizerTransform()` of `next/image-optimizer-transform`, on canary ([#99312](https://github.com/vercel/next.js/pull/99312)), "a stable contract". `validateParams`, the fetches and `sendResponse` stay internal | when 16.5 ships, with a fallback      |
| Caching                                                 | `IncrementalCache`, `use-cache/handlers`    | `cacheHandler` and `cacheHandlers` in `next.config`, documented; how Next registers them is not                                                                                                                          | no                                    |
| Config, SWC, aliases, defines, loaders, the loader tree | `next/dist/build/*`                         | none                                                                                                                                                                                                                     | upstream                              |
| The client entry                                        | `hydrate()`                                 | none                                                                                                                                                                                                                     | upstream                              |
| Rendering a route in a test                             | the plugin                                  | `next/experimental/testing/server` matches config and middleware only; `testmode` and `@next/playwright` are for e2e                                                                                                     | none; #98869 is a draft               |

Two swaps are there today and one with 16.5. They change no behavior, and they move three of the 103 internals. Next has no public API for building an app without its bundlers. That is not an oversight the plugin can work around; it is the upstream question.

## 6. Blast Radius

What breaks when a surface moves, and how likely that is per minor, from its history:

| Surface                                             | When it moves                                            | Seen                                           | What stops working                                           | Likely per minor                                            |
| --------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| `getLoaderSWCOptions()`, `transform()`              | a required option, an option SWC rejects                 | at startup, or on the first file               | every run                                                    | high: 7 of 12                                               |
| `handleBuildComplete()`                             | a renamed or required argument                           | at startup                                     | every run                                                    | high: 5 of 12, and not promised                             |
| `hydrate()`, `appBootstrap()`, `app-index`'s code   | a page that does not hydrate                             | at startup (checks) or the first page          | every page                                                   | high: changed on canary                                     |
| `AppPageRouteModule`, `module.compiled`             | a request that fails                                     | the first request                              | every page                                                   | high: 10 of 12                                              |
| Aliases and defines                                 | a wrong module or constant, possibly silent              | partly at startup                              | every run                                                    | medium                                                      |
| `next-app-loader`, the templates' output            | an entry that does not build                             | at startup or the first route                  | every page                                                   | medium: 37 and 147 commits                                  |
| `loadConfig()`                                      | a changed call                                           | at startup                                     | every run                                                    | low: the call has been the same                             |
| The prerender verdict: 9 modules, 8 checks          | a module that does not link, a check that fails          | at startup                                     | **every run today**; it is for `build: "production"` only    | high: `static-paths/app` 7 of 12, `build/index` 313 commits |
| The route of a node: boundaries, 3 checks           | a check that fails                                       | at startup                                     | **every run today**; it is for `renderServer(<Node />)` only | medium: `render-tree` is new in 16.4                        |
| The cache: `IncrementalCache`, `use-cache/handlers` | a changed constructor                                    | at startup                                     | every run, through the check                                 | medium: 6 of 12                                             |
| The image optimizer                                 | a changed function                                       | when `/_next/image` is requested               | images                                                       | high: 7 of 12, but lazy                                     |
| The stores, compiled by path                        | a request store that is wrong after an `await`, silently | the path at startup, the behavior by the tests | Server Actions, `"use cache"`                                | low for the path                                            |
| `server-reference-info`                             | Next answers 400 to Vite RSC's ids                       | at startup                                     | every Server Action                                          | low: 3 commits                                              |
| The stand-ins of `node-platform.ts`, by path        | Next's own module of Node.js loads in the browser        | when it loads, mostly loudly                   | the server layers                                            | low to medium                                               |

The two rows in bold are the cheapest risk to take away: a change in a feature that a run does not use still stops the run.

## 7. Recommendation: Five Changes, In Order

### 1. A nightly run against canary that type-checks

Hours of work. The plugin types every call into Next against Next's own declarations, so a type check against canary turns the changes of [2.3](#23-what-changed-most) into errors weeks before a release: the rename of `tracingRoot` in 16.3, the required `previewProps` of 16.4, the `hydrate()` of canary today. The docs say this gap is open: "A function that is still there but takes other arguments is not checked" ([next-routes.md](next-routes.md#when-next-changes)).

In the `next` job of `ci.yml`, for `canary`:

```yaml
- name: Type-check against the Next.js under test
  run: |
    v=$(npm view next@${{ matrix.next }} version)
    pnpm --filter vitest-plugin-rsc add -D \
      --config.minimum-release-age=0 \
      next@$v @next/routing@$v
    pnpm build
    pnpm tsgo
```

And a `schedule:` that runs the job every night, not only on a push, with an issue when it fails. The conformance run on canary could go from weekly to nightly too. It does not catch a change of behavior with the same signature: the playgrounds and the conformance suite are for that. A failure on canary should block the plugin's release for that minor, which Cloudflare's story shows.

### 2. Checks and modules scoped to their feature

One to two days. Today any of the 20 checks, and any module that fails to link, stops every run. Split them:

- **Core**: routes, entries, aliases, the compiler, a request, the client. These still stop the run.
- **Optional**: production prerendering (`prerender-verdict.ts`, 9 modules, 8 checks), the route of a node (3 checks), `cleanup()` of an app's own cache handler (1 check), images. A failing check turns its feature off with one warning, and the feature throws a clear error when it is used.

`prerender-verdict.ts` is imported statically by `rsc.ts`, so a module of Next's that it imports and that moves stops the `rsc` layer, also in development, where it is never used. It should be a dynamic import, loaded only with `build: "production"`. This takes the riskiest internals by history (`static-paths/app`, `app-segments`, `build/index`) out of every run that does not use them.

### 3. Checks of meaning, not of formatting

About a day. Two checks match the output of Next's compiler, not what it does: the indentation of `implicit-tags`, and a 150-character line of `build/index`. A refactor of Next that changes nothing would still fail them. Match them with patterns that ignore whitespace and names, or move them to the tests of the plugin that run against `latest` and `canary`, and keep at startup only what fails silently. `create-component-tree`'s check matches an error message up to its `);`: the message stayed, and the code around it changed in 15.2, when Next's error codes came to wrap it, and changed back in 16.4.

### 4. One module for the runtime, with version branches

One to two days. The build side has `project/context.ts`. The runtime side imports from Next in about 15 files. One module per layer that re-exports what the plugin uses would be the place for a branch by version, like `hydrate()` with or without the asset prefix, and for a fallback with the PR of Next that moved a module, as Netlify writes them. Take the three swaps of [section 5](#5-public-and-semi-public-alternatives) at the same time: `next/constants`, `NextAdapter` from `next`, and `next/image-optimizer-transform` where it exists.

And a range for the peer: `next` is `>=16.4.0-0`, which promises every future major. `>=16.4.0-0 <17.0.0-0` says what is tested: a major is where the adapter API may break, and where webpack or the Edge Runtime would go. With it, a notice at startup for a minor newer than CI has seen, and a table of versions that CI writes, as hand-written ones go stale (both of OpenNext's did).

### 5. Upstream, through the Ecosystem Working Group

Days of work, weeks of calendar. Two PRs first, both of the kind Vercel merges ([#99312](https://github.com/vercel/next.js/pull/99312), Netlify's [#90735](https://github.com/vercel/next.js/pull/90735), Storybook's [#77376](https://github.com/vercel/next.js/pull/77376)):

- `@next/routing` computes the `routing` phases from a config and the app's routes, without a build. That removes `handleBuildComplete()`, `generateRoutesManifest()`, `loadCustomRoutes()`, `generateInterceptionRoutesRewrites()` and `Bundler` from the plugin: the most churned call of its build side, onto a package Next calls stable.
- `hydrate()` takes the element to hydrate, which is `document` in the code today. That removes three code-shape checks and the wrapper of `hydrateRoot()`.

See [Upstream](#8-upstream-candidates) for the rest, and [Vercel](#9-the-relationship-with-vercel) for the conversation around them.

### What Not To Do

- **Reimplement Next**, as vinext does. The treadmill goes, and fidelity goes with it. 83% of the tests of Next's that apply pass here, on the Next of today. vinext passes 95.9% of Next's deploy suite, but of 16.2.6, two minors back, with Cache Components unfinished.
- **Copy Next's build code into the plugin.** It would drift silently, which is worse than failing at startup.
- **Pin `next` exactly.** Patch releases changed none of the 103 internals; a pin only keeps users off fixes.
- **Count internals.** Dropping `is-app-route-route`, untouched in two years, takes away no risk.

## 8. Upstream Candidates

Ordered by what they take away, with who else would use them:

1. **`@next/routing` without a build**: the `routing` phases from a config and the app's routes. Adapters that test locally, and this plugin. It moves the most churned build call onto a package Next calls stable.
2. **`hydrate()` with a container**: today `const appElement = document`. Storybook, micro-frontends, and #98869's component fixtures, which need the same.
3. **A hook for when a page has hydrated**: today `__NEXT_HYDRATED_CB` under `__NEXT_TEST_MODE`, Next's hook for its own e2e tests. Every tool that tests a Next app.
4. **Ids of Server Actions in another format**: the action handler takes any id the server reference manifest has. Any bundler of React Server Components but Next's two: Vite RSC, Parcel.
5. **A logger and a bail-out hook on `handler()`'s `ctx`**: today the plugin sets `Symbol.for('@next/router-server-methods')` on `globalThis`. Adapters, which Next's docs already point to `requestMeta` for.
6. **Compiling an app's file for a layer**: `getLoaderSWCOptions()` with `transform()`, as one public function. `@storybook/nextjs-vite` calls the same two.
7. **The aliases and defines of a layer**: what a third bundler needs, `createWebpackAliases()`, `createVendoredReactAliases()`, `getDefineEnv()`. A bigger ask, maybe an RFC for bundler adapters after the first PRs.
8. **The build's verdict on prerendering**, as a function of a route's segment config. Adapters that prerender on demand.
9. **Web streams for Node.js as a supported switch** once the Edge Runtime goes: `__NEXT_USE_NODE_STREAMS` is compile-time and internal. Any runtime without Node's streams: Workers, Deno, a browser.
10. **What replaces the edge alias tables and `next/dist/esm`** for server code outside Node.js, when edge goes. A question more than a PR.

## 9. The Relationship With Vercel

**The venue exists.** Next 16.2 came with an [Ecosystem Working Group](https://nextjs.org/ecosystem-working-group): Vercel, Netlify, Cloudflare, Google Cloud, AWS Amplify and OpenNext. It promises "early visibility into upcoming changes" and lead time "proportional to their scope". One joins with an issue on [nextjs/adapters-wg](https://github.com/nextjs/adapters-wg). Its scope is "currently focused on deployment adapters and platform integration, but may expand to other areas of the ecosystem over time". And: "Adapter breakage does not block a framework release." Its repository of meeting notes was last pushed on 2026-06-08.

**Vercel takes small PRs with a consumer.** #99312 promoted a deep import to a public subpath for Vercel's own image proxy. Netlify, Firebase, OpenNext and Cloudflare got hooks into the adapter API. Storybook's PostCSS fix for `create-next-app`, #77376, was merged in 2025.

**#98869 changes the conversation.** If Vercel ships its own runner, this plugin competes with Next for the same users, and Next has no reason to keep anything stable for it. If the two share primitives, the plugin gets public APIs that Vercel needs anyway. The primitives are the same: rendering a component as a route without the app's layouts, hydrating it in an element, knowing when it has hydrated. The plugin's architecture differs, and that is the case for it: everything runs in the browser's tab, so a test and a Server Component share one module graph, and Storybook stories run on it.

What to ask, in order:

1. A seat in the working group, or a track for testing in it, with Storybook as the consumer: `@storybook/nextjs-vite-rsc` is built on this plugin.
2. The two PRs of [recommendation 5](#5-upstream-through-the-ecosystem-working-group), with the plugin's conformance results as the evidence.
3. A heads-up on the plans for webpack's loaders, the Edge Runtime's alias tables and the web-stream render, because those are the changes no check can absorb.
4. Where #98869 is going, and which of its primitives could be public.

Not worth asking: a promise of stability for `next/dist`. Vercel will not give one, and #99312 says why.

I would start this conversation now, while #98869 is a draft and the primitives are still being designed.

## 10. What I Could Not Verify

- Any timeline for dropping webpack, or the web-stream paths of the Edge Runtime. I found no announcement.
- Whether the Ecosystem Working Group still meets: its notes were last pushed on 2026-06-08.
- Whether #98869 lands, and in what form.
- Changes of behavior behind unchanged signatures, which this method cannot see. CI and conformance are the only measure of those.
- The type hashes over- and under-count, as described in [How It Was Measured](#how-it-was-measured).
- When OpenNext's, Netlify's and Cloudflare's adapters on the adapter API will ship. The March blog said "later this year".
