# Next.js Fidelity Architecture

Status: 2026-05-15
Scope: App Router support in `vitest-plugin-rsc/nextjs`, based on the current `codex/next-fidelity-transforms-pr36` worktree.

This document is intentionally stricter than the current implementation. It records what is already done, where we still rely on adapters or shims, and what has to change before we can honestly call specific Next.js App Router features high fidelity.

This is a backlog, not a claim of full fidelity and not a mandate to implement everything at once. Execution should stay narrow: finish P0 items before broadening feature scope, and treat P1/P2 items as explicitly ordered follow-up work.

## Goal

The Next.js adapter should let browser-mode Vitest RSC tests run through real Next.js semantics wherever that is practical. The plugin should not grow a parallel Next implementation.

The target architecture is:

1. Use installed Next.js internals directly when there is a usable JS entrypoint.
2. Invoke real Next webpack loaders, Turbopack transform/compiler code, or SWC transforms when those are the implementation layer Next itself uses and can be isolated behind a narrow Vite adapter.
3. Copy the smallest upstream block only when no importable entrypoint exists, and mark it with `// Begin copy`, `// End copy`, upstream source links, and adaptation notes.
4. Keep local behavior as the last resort, with tests that explain the required Next behavior.
5. Keep `@vitejs/plugin-rsc` responsible for the RSC graph, `use client`, `use server`, client references, server references, and action transport.
6. Keep both `renderServer({ url })` and `renderServer(<ReactNode />)` on a route-shaped path through Next app-render. Direct React nodes should be presented to Next as a synthetic app route, not rendered through a separate local router.

The current implementation is much closer to that goal than the original notes-demo shims, but it is not complete. The biggest remaining risk is not route rendering. It is the amount of compatibility code around fonts, document fallback hydration, fake manifests, and Next runtime globals.

The second biggest risk is version drift. This adapter intentionally imports Next internals. That is acceptable for fidelity, but every internal path should be centralized, feature/version-gated when optional, and covered by current supported Next versions plus latest/canary smoke tests.

## Sources Checked

Official docs checked:

- App Router components: <https://nextjs.org/docs/app/api-reference/components>
- `next/font`: <https://nextjs.org/docs/app/api-reference/components/font>
- `next/image`: <https://nextjs.org/docs/app/api-reference/components/image>
- File-system conventions: <https://nextjs.org/docs/app/api-reference/file-conventions>
- Directives: <https://nextjs.org/docs/app/api-reference/directives>
- Functions: <https://nextjs.org/docs/app/api-reference/functions>
- Route Handlers: <https://nextjs.org/docs/app/getting-started/route-handlers>
- Adapter entrypoints: <https://nextjs.org/docs/app/api-reference/adapters/invoking-entrypoints>
- Adapter PPR/runtime integration docs in the local Next docs tree.
- Image config: <https://nextjs.org/docs/app/api-reference/config/next-config-js/images>

Local source clones checked:

- Next.js: `/Users/kasperpeulen/code/github/vercel/next.js`
- React: `/Users/kasperpeulen/code/github/facebook/react`
- Vite: `/Users/kasperpeulen/code/github/vitejs/vite`
- Vitest: `/Users/kasperpeulen/code/github/vitest-dev/vitest`
- `@vitejs/plugin-rsc`: `/Users/kasperpeulen/code/github/vitejs/vite-plugin-react/packages/plugin-rsc`
- Storybook Next.js Vite plugin: `/Users/kasperpeulen/code/github/storybookjs/vite-plugin-storybook-nextjs`

Most relevant Next internals:

- `packages/next/src/build/webpack/loaders/next-swc-loader.ts`
- `packages/next/src/build/swc/options.ts`
- `packages/next/src/build/create-compiler-aliases.ts`
- `packages/next/src/build/define-env.ts`
- `packages/next/src/build/webpack-config.ts`
- `packages/next/src/build/webpack/loaders/next-app-loader/index.ts`
- `packages/next/src/build/webpack/loaders/next-root-params-loader.ts`
- `packages/next/src/server/app-render/app-render.tsx`
- `packages/next/src/server/app-render/entry-base.ts`
- `packages/next/src/server/app-render/use-cache-wrapper.ts`
- `packages/next/src/server/use-cache/handlers.ts`
- `packages/next/src/client/app-index.tsx`
- `packages/next/src/client/components/app-router.tsx`
- `packages/next/src/build/webpack/loaders/next-font-loader/index.ts`
- `packages/next/src/build/webpack/loaders/next-font-loader/postcss-next-font.ts`
- `packages/next/src/build/webpack/loaders/next-image-loader/index.ts`
- `packages/next/src/build/webpack/loaders/next-metadata-image-loader.ts`
- `crates/next-custom-transforms/src/transforms/fonts/mod.rs`
- `crates/next-custom-transforms/src/transforms/server_actions.rs`
- `crates/next-custom-transforms/src/transforms/react_server_components.rs`
- `crates/next-core/src/next_import_map.rs`
- `crates/next-core/src/next_font/*`

Important RSC ownership source:

- `@vitejs/plugin-rsc/docs/architecture.md`
- `@vitejs/plugin-rsc/docs/bundler-comparison.md`
- React Flight webpack references in `/Users/kasperpeulen/code/github/facebook/react/packages/react-server-dom-webpack/src`

## Ownership Boundaries

The most important rule: do not run two RSC bundlers at the same time.

Next owns framework semantics:

- App Router route conventions and loader trees.
- App render, metadata, not-found, redirects, request stores, async storage, cache state, and headers/cookies/draft mode behavior.
- `next/font`, `next/image`, metadata image loading, `next/link`, `next/form`, `next/script`, `next/navigation`, `next/cache`, `next/headers`, and `next/server` API semantics.
- Next-specific define env and runtime aliases.

`@vitejs/plugin-rsc` owns bundler protocol:

- `use client` client references.
- `use server` server references and action loading.
- Flight serialization/deserialization between Vite environments.
- The Vite module runner bridge between the RSC and browser graphs.

Vitest owns the test harness:

- Browser project bootstrapping.
- DOM setup, cleanup, and Testing Library integration.
- Optional MSW routing for browser fetches.

Consequence: Next SWC must stay narrow. It is good for source-level compiler features such as `next/font`, `next/dynamic`, styled-jsx/compiler options, modularized imports, and `next/server` CJS optimization. It must not globally enable Next `serverComponents` or `serverActions` transforms until we have a separate design that proves it does not fight the Vite RSC graph.

## Runtime Shape

The environment names are inherited from the base plugin and are slightly confusing:

- `client` is the RSC/edge-server environment. It uses `react-server` and `edge-light` conditions and defines `process.env.NEXT_RUNTIME` as `"edge"`.
- `react_client` is the browser App Router environment. It uses browser conditions, Next's browser React aliases, and defines `process.env.NEXT_RUNTIME` as `""`.
- `react_ssr` is the browser-ish SSR environment used to turn a Flight stream into HTML for hydration.

The intended flow is:

```text
Next app source
  -> Vite transforms
  -> narrow Next SWC pass for source-level compiler features
  -> @vitejs/plugin-rsc transforms RSC directives and references
  -> Next route matcher / next-app-loader build loader trees
  -> Next app-render renders Flight or HTML
  -> Vite RSC deserializes client references in the browser graph
  -> Testing Library renders or hydrates the result
```

We are not running webpack. We do invoke selected Next webpack loader functions in-process because those loaders are where Next's JS implementation lives.

## What Is Implemented

### Config and Env

`packages/vitest-plugin-rsc/src/nextjs/config.ts` loads the user's Next config, `jsconfig`/`tsconfig`, `appDir`, `pagesDir`, supported browsers, page extensions, and image config via Next internals.

`packages/vitest-plugin-rsc/src/nextjs/plugin.ts` calls `next/dist/build/define-env.js#getDefineEnv` for the RSC and browser environments. This is the right direction. `process.env.NEXT_RUNTIME = "edge"` in the RSC environment is intentional because the plugin is imitating an edge App Router render path.

Remaining weakness: we still pass simplified routing options such as `hasRewrites: false` and empty `rewrites`. That means Next config fidelity is incomplete for rewrites, redirects, headers, basePath/trailingSlash combinations, i18n, assetPrefix, and some adapter/runtime fields.

### Aliases and Runtime Polyfills

The plugin imports Next's compiler alias helpers where possible:

- `createVendoredReactAliases` for Next's vendored React builds.
- `createAppRouterApiAliases` for app-router API wrappers.
- Next compiled packages for edge-compatible `buffer`, `events`, `assert`, `util`, `process`, and OpenTelemetry.

It also aliases React Server DOM webpack imports to `@vitejs/plugin-rsc`'s vendor copies so the Vite RSC graph stays in charge.

Remaining weakness: `treatNextInternalsAsServerInRsc` rewrites `process.env.NEXT_RUNTIME` and `typeof window` inside Next internals. This may be necessary for the Vite optimized chunks, but it is still a code rewrite hack. The next step is to reduce it to the smallest proven set, or replace it with environment/condition/define configuration.

### Entry-base Client References

`next/dist/server/app-render/entry-base.js` is now imported as the real installed Next module. We no longer build a local `entry-base` export-surface adapter.

The remaining adapter is `next-rsc-entry-base-client-references`. It exists because Next's server-layer `entry-base` is CJS and re-exports client components through relative `require()` calls. Next webpack/Turbopack layer metadata keeps those imports as client references. Vite/Rolldown dep optimization would otherwise inline the CJS `"use client"` modules into the RSC optimized chunk, causing client modules such as `app-router-context.shared-runtime` to execute with React Server aliases.

This adapter should stay narrow:

- keep the real Next `entry-base`;
- intercept only imports from that `entry-base` module;
- derive the proxied modules from the installed Next files by resolving `entry-base` imports and checking their real `"use client"` directive;
- return `registerClientReference` proxies in the RSC environment;
- return real Next client modules in browser/SSR environments.

Exit path: upstream `@vitejs/plugin-rsc` could preserve CJS `"use client"` dependency boundaries during RSC dep optimization by externalizing/proxying those modules instead of inlining them into the server optimized chunk. If that lands, delete this Next-specific adapter or reduce it to any remaining Next-only layer metadata cases.

### Next SWC

`swc-transform-plugin.ts` imports:

- `next/dist/build/swc/index.js#transform`
- `next/dist/build/swc/options.js#getLoaderSWCOptions`

It currently runs only when source contains `next/font` or `next/dynamic`. This correctly fixed exported font declarations because Next SWC rewrites both local bindings and exported const font calls into `next/font/*/target.css?...` imports.

It deliberately sets `serverComponents: false`. That is correct for now because Vite RSC owns `use client` and `use server`.

Remaining weakness: Next's own webpack SWC loader force-transpiles files containing `next/font`, `next/dynamic`, `use server`, `use client`, or `use cache`. We intentionally do less. That should stay true for RSC directives, but we still need a deliberate decision and tests for `use cache` and other Next 16 cache-component compiler features.

The Turbopack/Rust sources are also useful, especially for understanding the real compiler contracts. The important parts found so far are `next-custom-transforms` for font imports, RSC directive validation, server actions, and `use cache`, plus `next-core` import-map/font code for Turbopack's equivalent runtime wiring. We should use those sources to guide behavior and import/invoke their exposed JS/N-API surfaces when practical, but not hand-port large Rust transforms into this plugin.

Review guard: Turbopack code is a source of truth for compiler behavior, not permission to reimplement Turbopack in Vite. Do not introduce a Turbopack module graph, layer graph, RSC manifest graph, or bundler runtime. Any Turbopack-derived behavior must stay inside a small adapter with a user-visible regression test.

### Cache Components and `use cache`

`cacheComponents: true` is not just a directive transform. In Next it changes app-render semantics, cache handler initialization, request/work async storage behavior, and the shape of RSC cache entries.

Current state:

- `createNextRenderOpts` reads `__NEXT_CACHE_COMPONENTS` and cache life defines.
- Next SWC receives `isCacheComponents`, `cacheHandlers`, `useCacheEnabled`, and `taintEnabled` options.
- `next/root-params` is gated by `experimental.rootParams` or `cacheComponents`.

Missing before claiming support:

- Initialize Next cache handlers through `next/dist/server/use-cache/handlers` when available.
- Wire custom `cacheHandlers`, `cacheLife`, and `cacheMaxMemorySize` from `next.config`.
- Verify `use cache`, `use cache: private`, and `use cache: remote` behavior with Vite RSC references.
- Expand the client reference manifest shim to cover the module mappings Next cache wrappers decode against.
- Add negative tests for dynamic APIs inside public cache scopes and flag-disabled behavior.

Preferred direction: let `@vitejs/plugin-rsc` own directive hoisting/reference mechanics, but use Next's cache runtime semantics where the wrapper/cache handler behavior is Next-specific. Do not let Next SWC partially own RSC directives unless tests prove it does not conflict with Vite RSC.

### Fonts

`font-loader-plugin.ts` resolves `next/font/google/target.css?...` and `next/font/local/target.css?...` generated by Next SWC. It calls Next's compiled Google/local font loaders and then calls `next-font-loader/postcss-next-font.js`.

Done:

- Uses Next SWC for the AST transform.
- Uses Next's real compiled font loaders.
- Uses Next's real `postcss-next-font` behavior for fallback metrics, class rules, variable rules, and `style` export data.

Remaining weakness:

- It still creates a custom Vite CSS module shape by string replacement and manual style injection.
- It emits font files as data URLs in `emitFontFile`, so it does not match Next's static media path or font manifest/preload behavior.
- Runtime coverage is thin. Current unit coverage checks the SWC rewrite, not all browser-visible font outcomes.

This is the most important feature gap. The better direction is to copy/import more of `next-font-loader`'s loader result contract and bridge it to Vite CSS/assets with the smallest possible adapter, not invent a parallel font module.

### Images

`image-plugin.ts` handles two separate surfaces:

- `next/image` resolves to an RSC-safe module that keeps `getImageProps` callable on the server and makes the `Image` component a client reference.
- Static image imports go through `next/dist/build/webpack/loaders/next-image-loader/index.js`.

Done:

- Uses Next's real image component for browser rendering.
- Copies the small `getImageProps` wrapper from Next's `image-external` implementation.
- Uses Next's real static image loader for width, height, blur metadata, and generated static-media URLs.
- Serves dev static assets through Vite middleware and emits build assets through Rollup.

Remaining weakness:

- No Next image optimizer endpoint is implemented. Remote/default-loader URLs, `remotePatterns`, `localPatterns`, `qualities`, default optimization behavior, and headers are not fully covered.
- Preload/priority behavior depends on App Router head integration and needs more tests.
- `next/legacy/image` is not covered by this adapter.

### Metadata Images

`metadata-image-loader-plugin.ts` invokes `next/dist/build/webpack/loaders/next-metadata-image-loader.js` for Next metadata image loader requests.

Done:

- Uses the real Next loader for static metadata image files when the generated app loader requests it.

Remaining weakness:

- We need coverage for `icon`, `apple-icon`, `favicon`, `opengraph-image`, `twitter-image`, generated image metadata, `robots`, `sitemap`, and `manifest` conventions.

### Routes and Loader Trees

`route-manifest-plugin.ts` scans routes using Next's dev app-page route matcher provider and invokes `next-app-loader` to produce the actual loader tree.

Done:

- Route groups.
- Dynamic segments.
- Catch-all and optional catch-all segments.
- Parallel route default slots.
- Templates.
- Metadata and generated metadata.
- Segment static info via `get-static-info-including-layouts`.
- Route-level `not-found` in the notes demo.
- Route-level `forbidden`, `unauthorized`, `error`, and root `global-error` conventions in the notes demo.

Remaining weakness:

- The plugin extracts only the `const tree = ...` block out of `next-app-loader` output and rewrites imports for Vite. This is a pragmatic adapter, but still string extraction. It needs tests that lock it against current Next loader output and should be replaced with a smaller imported helper if Next ever exposes one.
- Coverage is missing or thin for `loading`, intercepting routes, nested parallel routes, route groups with collisions, default-null behavior, and proxy/middleware interactions.
- Route manifest generation is still page-focused. If `route.ts` handlers become render targets, they should run through Next route module/request code, not through a local route-handler runner.

### App Render and Request Stores

`app-render.ts` calls `next/dist/server/app-render/app-render.js#renderToHTMLOrFlight` with a synthetic `WebNextRequest`, `WebNextResponse`, route module, loader tree, render options, cache, and manifest state.

Done:

- Uses Next app-render for route Flight responses, HTML responses, and action responses.
- Creates the App Page route module shape expected by Next app-render.
- Installs Next manifest singletons for modern and legacy Next 16 internals.
- Uses Next `IncrementalCache`, `tagsManifest`, request metadata, patched fetch state, and request lifecycle hooks.
- Supports cookies, headers, draft mode, `refresh`, redirects, notFound, Server Actions, and Next cache behavior in the notes demo path.
- Drains nested `waitUntil` work scheduled by `after()` tasks before closing the request lifecycle.

Remaining weakness:

- `clientReferenceManifest` and server action manifests are proxy/minimal shims. They are needed because Vite RSC owns references, but they should be documented as adapters and tested more directly.
- The Buffer handling has two layers: `ProvidePlugin`-like imports and a `Buffer.prototype.indexOf` patch for `Uint8Array` needles. The import is reasonable because Next webpack also provides Buffer in edge/client bundles. The prototype patch needs a failing upstream case or should be replaced with a narrower adapter.
- `process.env.NEXT_RUNTIME` defaulting to `edge` is correct for this target, but it must be set by env configuration as much as possible, not by broad source rewrites.

### Browser Hydration and Router

`client.tsx` uses Next App Router internals rather than a local router. It creates initial router state from the Next RSC payload and passes it to `NextAppRouter`.

`testing-library.tsx` supports two modes:

- Direct React node render, wrapped in a synthetic Next route.
- Route render with `renderServer({ url })`, which goes through the real Next loader tree and app-render path.

Done:

- Uses Next App Router, reducer, action queue, initial router state, and app-index payload shape.
- Preserves Next global error payload data.
- Supports document hydration through a custom tester HTML.
- Supports MSW-routed Next RSC/action fetches through `nextRscRequestHandlers`.
- Direct React node renders are treated as private fake routes so the initial payload still comes from Next app-render.

Remaining weakness:

- Document fallback parsing is still custom. It parses inline `self.__next_f.push(...)` scripts, detects `NEXT_HTTP_ERROR_FALLBACK` by string search, and patches fallback seed data. That is a fragile part of the adapter.
- The no-op WebSocket for Next dev HotReload is a version-compat shim. It should stay isolated and covered by a targeted test.
- Whole-document hydration must preserve Vitest's browser harness scripts while applying Next's head/body output. This belongs in the plugin-level tester HTML/head merge, not in the notes demo app.
- HTML responses are not required for every render. They are only needed where full document/head/error-fallback fidelity matters. The plugin should hydrate through its own controlled React/Vitest path, parse Next Flight bootstrap data without executing arbitrary Next inline scripts, and keep Vitest's harness scripts alive.
- Do not reintroduce `router-element.ts` or a user-visible local router element. The user-facing route path should go through `NextAppRouter`.

### App Router API Modules

Covered or partially covered:

- `next/link`: custom RSC wrapper plus real Next client component.
- `next/form`: client reference to real Next form component.
- `next/script`: client reference to real Next script component.
- `next/navigation`: Next app-router aliases for server and client layers.
- `next/cache`: real Next cache module in the RSC environment.
- `next/headers`: real Next request APIs through Next request stores.
- `next/server`: real Next server APIs plus SWC CJS optimizer support.
- `next/root-params`: real Next root-params loader when the Next version and config support it.
- `next/error` and `next/web-vitals`: optimized as App Router client API deps.

Not honestly complete yet:

- Full `next/navigation` hook matrix: `useParams`, `useSearchParams`, `usePathname`, `useRouter`, `useSelectedLayoutSegment(s)`, `redirect`, `permanentRedirect`, `notFound`, `forbidden`, `unauthorized`.
- Full `next/cache` and request lifecycle matrix: `revalidatePath`, `revalidateTag`, `updateTag`, `cacheLife`, `cacheTag`, `unstable_cache`, `unstable_noStore`, `connection`, `after`, `refresh`, `fetch` cache semantics, cache-components, and `use cache` variants.
- Full `next/server` matrix: `NextRequest`, `NextResponse`, `userAgent`, `ImageResponse`, route handler streaming, cookies, redirects, rewrites, and middleware/proxy-adjacent behavior.
- Full error/control-flow matrix: `unstable_rethrow`, `catchError`, thrown redirects/notFound/forbidden/unauthorized across RSC render, action responses, route handlers, and document hydration.
- Route Handlers as first-class render targets. The docs make `route.ts` a major App Router surface; we currently test some `NextRequest`/`NextResponse` behavior, but the route rendering helper is page-oriented.

## Test Coverage We Have

Focused unit tests in `packages/vitest-plugin-rsc/src/nextjs`:

- SWC font rewrite, exported font declarations, local font rewrite, `next/dynamic` metadata, and not transforming RSC directives.
- `next/image` client reference split and static image loader build asset output.
- React/Next aliasing, define env, tester HTML default, `next/root-params`, and entry-base client references.
- Route static info collection.

Notes demo acceptance coverage includes realistic combinations of:

- App routes and layouts.
- Dynamic route replacement.
- Route groups, catch-all, optional catch-all, templates, parallel default slots, selected layout segments, metadata, generated metadata, not-found, forbidden, and unauthorized.
- Route-only `renderServer({ url })` coverage for `/notes`, `/notes/new`, `/notes/[id]`, `/notes/[id]/edit`, auth pages, and `/profile` so Next resolves the page module, params, search params, and loader tree itself.
- `next/link`, `next/form`, `next/script`, `next/image`, `getImageProps`, `next/dynamic`, `next/head` ignored by App Router, and client error boundaries.
- Cookies, headers, draft mode, cache, Server Actions, redirects, refresh, and MSW-routed RSC/action transport.
- Next `after()` request lifecycle behavior, including nested `waitUntil` work scheduled by an after task.
- Route handler URLs are detected through Next's app-route matcher and reported as unsupported `renderServer({ url })` targets instead of being treated as missing pages.

This is useful coverage, but it is not full Next.js API coverage. It is still centered around the notes demo and a small number of focused unit tests.

## Missing Coverage Matrix

Add focused tests in `playground/nextjs-notes-demo` before claiming more fidelity. Package-level tests are useful for transforms, aliases, loader adapters, and manifest shims, but user-visible Next.js behavior should be proven in the notes demo unless the feature specifically belongs to the no-MSW transport path.

- `next/font`: exported declarations, default export, shared font definition module, Google variable font, Google non-variable weights/styles, local single file, local multi-file, `className`, `variable`, `style.fontFamily`, `style.fontWeight`, `style.fontStyle`, fallback fonts, `adjustFontFallback`, `declarations`, browser CSS injection, build asset output, and route-scoped preload behavior.
- `next/image`: static png/jpeg/webp/avif/svg imports, `placeholder="blur"`, `fill`, `sizes`, `priority`/`preload`, remote URL config, custom loader, default loader URL generation, `unoptimized`, invalid prop errors, and image config from `next.config`.
- App route conventions: `loading`, `error`, `global-error`, `not-found`, `forbidden`, `unauthorized`, `default`, `template`, route groups, parallel routes, intercepting routes, metadata files, `metadata`, `generateMetadata`, `viewport`, `generateViewport`, `generateStaticParams`, `generateImageMetadata`, `generateSitemaps`, static/dynamic params, `mdx-components`, `instrumentation`, `instrumentation-client`, and route segment config exports such as `dynamic`, `dynamicParams`, `revalidate`, `fetchCache`, `runtime`, `preferredRegion`, and `maxDuration`.
- Route Handlers: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `NextRequest`, `NextResponse`, cookies, redirects, streaming, params, and route segment config.
- `next/navigation`: all hooks and control-flow functions in both route-render and direct-node modes.
- `next/cache`: cache invalidation, tags, `unstable_cache`, no-store, `connection`, `after`, cache components, `fetch` cache semantics, and `use cache` directives.
- `next/server`: `NextRequest`, `NextResponse`, `userAgent`, `ImageResponse`, route handler streaming, cookies, redirects, and rewrite behavior.
- Client hooks and diagnostics: `useLinkStatus`, `useReportWebVitals`, `next/error`, `next/web-vitals`, `unstable_rethrow`, and `catchError`.
- `next.config`: rewrites, redirects, headers, basePath, trailingSlash, assetPrefix, image config, env, transpilePackages, modularizeImports, optimizePackageImports, compiler options, typed routes where applicable, and root params.
- Browser hydration: document fallback, route-level notFound, global-error, action redirects, form progressive enhancement, refresh, and navigation state after action responses.
- Entry-base and RSC optimizer boundary: direct import of real `next/dist/server/app-render/entry-base.js`, CommonJS `"use client"` dependency preservation, devtools segment explorer references, no direct execution of client modules under React Server aliases, and an upstream `@vitejs/plugin-rsc` repro.
- Manifest contracts: `clientModules`, `ssrModuleMapping`, `edgeSSRModuleMapping`, `rscModuleMapping`, `edgeRscModuleMapping`, server action manifest workers, layer shape, and cache wrapper decode paths.
- Test harness stability: custom tester HTML, preserved Vitest scripts, whole-document React expando cleanup, server action caller cleanup, and non-default Vitest API ports.
- Version compatibility: supported stable Next, latest stable Next, canary Next, and optional-internal fallbacks for missing loaders such as `next-root-params-loader`.
- Adapter/runtime behavior: streaming boundaries, Suspense/loading fallback behavior, partial-prerendering/PPR scope, dynamic IO/cache-components scope, and adapter entrypoint assumptions.

## Highest Priority Fixes

This section is deliberately prioritized. Do not treat the missing coverage matrix as a flat task list. P0 items are the current execution gate; P1 items should follow only after the relevant P0 foundation is stable or explicitly deferred; P2 items are non-goals or support decisions until promoted.

P0: keep removing glue around real Next entrypoints.

- Replace local adapters with direct Next imports whenever the installed Next module can run under Vite environments.
- Centralize every `next/dist/...` internal path behind a helper that can feature/version-gate optional internals.
- Add compatibility coverage for the supported Next range, latest stable Next, and canary Next.
- Track an upstream `@vitejs/plugin-rsc` issue or fixture for CommonJS `"use client"` dependencies hidden behind RSC dep optimization, using the `entry-base` failure as the repro.
- Explicitly avoid rebuilding the old `request-context`, `component-tree`, `flight-router-state`, and `router-element` layers. If a feature seems to require them again, first look for a higher Next route module, loader, app-render, or app-index entrypoint.

P0: make `next/font` closer to Next.

- Keep Next SWC. That part is right.
- Keep Next compiled loaders and `postcss-next-font`. That part is right.
- Replace the custom CSS module/global style injection shape with a more faithful Vite bridge for Next's loader output.
- Stop using data URL font files as the final behavior unless this is explicitly documented as a test-only fallback. Build output should emit assets closer to Next's static media path and preserve enough metadata for route-scoped preload tests.

P0: design Cache Components support before expanding it.

- Decide the boundary between Vite RSC `use cache` hoisting/reference mechanics and Next `cacheComponents` runtime semantics.
- Initialize Next cache handlers where available instead of inventing a local cache runtime.
- Add notes-demo tests for `cacheComponents: true`, cached async functions, cached components with children, `cacheLife`, `cacheTag`, private cache, dynamic API errors, and disabled flag behavior.
- Do not claim support until the cache manifest/module mapping path is tested.

P0: reduce document fallback and manifest magic.

- Isolate the inline Flight parser as a copied/adapted block from Next app-index if possible.
- Replace broad string matching for `NEXT_HTTP_ERROR_FALLBACK` with Next helpers where they exist.
- Keep expanding notes-demo coverage for route-level fallbacks and document hydration. Done: route-level notFound, global-error, and error boundary document hydration.
- Document why proxy manifests are necessary when Vite RSC owns references, and test the exact proxy contract.
- Preserve Vitest harness scripts through plugin-level tester HTML/head merging. Do not solve this in the notes demo app.

P0: prove or remove Buffer/process/runtime patches.

- Keep `process.env.NEXT_RUNTIME = "edge"` for RSC. That is required for edge App Router fidelity.
- Prefer define/env/alias configuration over source rewrites.
- Keep the Buffer ProvidePlugin-style import because Next webpack does this for edge/client bundles.
- Do not keep the `Buffer.prototype.indexOf` patch without a targeted regression test and a note pointing to the Next code path that needs it.

P1: broaden API and convention coverage.

- Add focused notes-demo tests for each official App Router component/function/convention we claim.
- Add small notes-demo fixture routes instead of relying only on broad demo flows.
- Keep the notes demo as the in-tree acceptance app, not the only specification.
- Prefer the notes demo for realistic App Router state, request stores, cookies, cache, actions, and MSW-routed transport.
- Keep a visible gap list for App Router docs features that are intentionally unsupported, especially instrumentation, proxy/middleware, route handlers, PPR, image optimization, and Node runtime parity.

P1: handle Next config fidelity.

- Stop passing empty rewrites/`hasRewrites: false` unconditionally.
- Load and feed Next rewrites, redirects, headers, basePath, trailingSlash, image config, assetPrefix, and cache config into define env and render opts where Next expects them.
- Add plugin options for an explicit Next project root or config path only when real projects need more than the Vite root.

P1: decide route-handler and middleware/proxy scope.

- Decide whether `renderServer({ url })` should execute `route.ts` handlers or whether route handlers need a separate helper.
- If supported, execute them through Next route module/request code, not a local handler runner.
- Decide whether middleware/proxy is a non-goal, setup-time concern, or future request-pipeline feature.

P1: reduce broad source rewrites.

- Audit `treatNextInternalsAsServerInRsc`, `disableNextDevServerRuntime`, and any Buffer/runtime patches.
- Replace broad rewrites with defines, aliases, conditions, or targeted adapters where possible.
- Keep only rewrites that have a failing regression test and an upstream behavior note.

P2: decide explicit non-goals.

- Pages Router is currently not the architectural target.
- `next/legacy/image` is not covered.
- Middleware/proxy is not covered as an execution surface.
- `instrumentation.ts`, `instrumentation-client.ts`, and `mdx-components.tsx` need an explicit support decision before being claimed.
- PPR/production adapter output behavior is not covered until we design a test-runtime equivalent.
- Node.js runtime parity is not the default browser-mode target. The edge-shaped App Router runtime is the pragmatic default unless we design a separate Node test mode.
- Production Next build output is not the same as this test adapter. When we mimic build-only behavior, tests must state the exact compatibility goal.

## Concrete Task Backlog

1. Add a focused test that imports the real `next/dist/server/app-render/entry-base.js` in the RSC environment and proves the optimized chunk contains client-reference proxies, not inlined client modules.
2. Draft an upstream `@vitejs/plugin-rsc` issue or failing fixture for CommonJS `"use client"` modules required from server dependencies during RSC dependency optimization.
3. Add notes-demo tests for route conventions. Done: `loading.tsx`, `error.tsx`, root `global-error.tsx`, `forbidden.tsx`, and `unauthorized.tsx`.
4. Justify the `Buffer.prototype.indexOf` patch with a minimal regression test pointing at the Next stream-utils path that needs it. Done.
5. Extend static image tests for dev serving, build emission, SVG policy, blur placeholder behavior, and image config loaded from `next.config`.
6. Start next/font asset/preload work: emitted font files, CSS module contract, route-scoped preload metadata, and browser-visible `className`, `variable`, and `style` assertions.
7. Add a `cacheComponents: true` fixture route and decide the `use cache` transform/runtime boundary before implementing cache handlers.
8. Feed rewrites, redirects, and headers from real Next config into define/render options, or document them as explicitly out of scope.
9. Add latest/canary Next compatibility jobs or scripts that exercise the focused unit suite and notes demo smoke tests.
10. Add a plugin-level test that whole-document Next rendering preserves Vitest harness scripts while applying Next head/meta/title output.
11. Done for the current scope: `renderServer({ url })` detects `route.ts` handlers through Next's app-route matcher and throws a clear unsupported-target error. Future support should execute them through Next route module/request code, not a local handler runner.
12. Add coverage that `renderServer(<ReactNode />)` uses the fake-route/app-render path and that `renderServer({ url })` can replace the matched page entry without bypassing Next's loader tree.
13. Add route-only `renderServer({ url })` coverage for important existing notes demo pages that still render direct components with manual props.
14. Add coverage for App Router page exports: `metadata`, `generateMetadata`, `viewport`, `generateViewport`, `generateStaticParams`, `dynamic`, `dynamicParams`, `revalidate`, `fetchCache`, `runtime`, `preferredRegion`, and `maxDuration`.
15. Add metadata route coverage for `generateImageMetadata`, `generateSitemaps`, static metadata files, `robots`, `sitemap`, `manifest`, `opengraph-image`, `twitter-image`, `icon`, `apple-icon`, and `favicon`.
16. Add `next/server` coverage for `userAgent`, `ImageResponse`, route handler streaming, redirects, rewrites, and cookie mutation semantics.
17. Add error/control-flow coverage for `unstable_rethrow`, `catchError`, and thrown control-flow errors across render, action, route handler, and hydration paths.
18. Decide support for `instrumentation.ts`, `instrumentation-client.ts`, and `mdx-components.tsx`; add tests or explicit unsupported errors.
19. Decide PPR/adapter-runtime scope and add streaming/Suspense fallback tests that document what the browser-mode test adapter does and does not emulate.
20. Add coverage for `useLinkStatus`, `useReportWebVitals`, `next/error`, and `next/web-vitals` in the browser/client graph.

## Review Checklist For Future Work

Before merging a Next.js fidelity change, ask:

1. Can this be a direct import from the installed Next package?
2. If not, can this be a direct invocation of a real Next loader/transform/helper?
3. If not, is the copied block minimal, source-linked, and adapted only at the Vite boundary?
4. Does it leave `@vitejs/plugin-rsc` in charge of RSC directives and references?
5. Does it work outside the notes demo fixture?
6. Is there a focused notes-demo test for the exact Next API or file convention being claimed?
7. Is every remaining shim named as a shim with a reason and an exit path?
8. Does the change reduce local glue, or does it clearly explain why the remaining glue is unavoidable?

The current direction is good, but the merge bar should be: fewer local approximations, more Next imports, more targeted tests, and no broad claim of full Next.js fidelity until the missing matrix above is materially covered.
