# Next.js Adapter Architecture

Status: 2026-05-16
Scope: App Router support in `vitest-plugin-rsc/nextjs` for browser-mode Vitest RSC tests.

This is a reference document, not a roadmap. It records the architecture we want contributors to preserve after the Next.js fidelity work in this PR: what owns which behavior, where the adapter intentionally bridges framework internals into Vite/Vitest, what is supported, and what is explicitly outside the current browser-mode contract.

The central goal is high-fidelity App Router tests without building a second Next.js. When the adapter needs Next behavior, prefer installed Next/Vite/Vitest/`@vitejs/plugin-rsc` entrypoints. Local code should be a narrow boundary adapter, not a parallel framework implementation.

## Ownership Boundaries

Do not run two RSC bundlers at the same time.

Next.js owns framework semantics:

- App Router route discovery, route conventions, loader trees, route modules, metadata, static info, and app render behavior.
- Request stores, cookies, headers, draft mode, redirects, notFound/access fallbacks, cache state, fetch patching, and request lifecycle hooks.
- `next/font`, `next/image`, metadata image loading, `next/link`, `next/form`, `next/script`, `next/navigation`, `next/cache`, `next/headers`, `next/server`, `next/error`, and related App Router APIs.
- Next-specific aliases, define env, compiler options, runtime globals, and version-dependent internal module shape.

`@vitejs/plugin-rsc` owns the RSC graph:

- `"use client"` references.
- `"use server"` references and Server Action loading.
- Flight serialization/deserialization.
- The Vite module runner bridge between server, browser, and SSR environments.
- Browser/client reference resolution for Vite module graphs.

Vitest owns the test harness:

- Browser project startup.
- DOM lifecycle and Testing Library integration.
- Browser API ports and websocket runtime.
- Optional MSW transport used by demo tests.

This package adapts those systems to each other. It should not reintroduce local versions of Next request context, component-tree rendering, flight-router-state management, router elements, webpack layer graphs, Turbopack graphs, or RSC manifests.

## Runtime Shape

The environment names come from the base RSC plugin:

- `client` is the RSC/edge-server environment. It uses `react-server` and `edge-light` conditions and defines `process.env.NEXT_RUNTIME` as `"edge"`.
- `react_client` is the browser App Router environment. It uses browser conditions, Next browser React aliases, and defines `process.env.NEXT_RUNTIME` as `""`.
- `react_ssr` is the browser-ish SSR environment used to turn Flight data into HTML for hydration.

The intended render path is:

```text
Next app source
  -> Vite transforms
  -> narrow Next SWC pass for source-level Next features
  -> @vitejs/plugin-rsc transforms RSC directives and references
  -> Next route matcher / next-app-loader loader tree
  -> Next app-render produces Flight or HTML
  -> Vite RSC deserializes client references in the browser graph
  -> Testing Library renders or hydrates the result
```

The adapter does not run webpack. It does invoke selected Next webpack loaders in-process where those loaders are the JavaScript implementation layer Next itself uses.

## Source Of Truth Order

Use this order whenever adding or changing fidelity behavior:

1. Import and call the installed framework/runtime module directly.
2. Invoke the real Next loader, compiler transform, runtime helper, Vite helper, Vitest helper, or `@vitejs/plugin-rsc` helper through a narrow adapter.
3. If the behavior exists only inside a non-importable upstream block, copy the smallest block with source links, `Begin copy`/`End copy` markers, and an adaptation note.
4. Add local behavior only as the last resort, with a regression test for the user-visible behavior and a clear reason the upstream path cannot be used.

Next internals are acceptable here because fidelity is the point of the adapter. They must be treated as version-sensitive: optional internals need feature checks, optimizer includes must only include modules that resolve from the installed Next package, and compatibility CI must cover supported stable Next versions plus latest and canary.

## Config And Request Routing

The adapter loads Next config through Next internals, then feeds the resulting values into aliases, defines, render options, and request routing:

- `next.config` is loaded from the Vite project root.
- Custom routes come from `next/dist/lib/load-custom-routes.js`.
- Defines come from `next/dist/build/define-env.js#getDefineEnv`.
- Render options include base path, trailing slash, asset prefix, image config, cache components, cache handlers, cache memory size, and cache life profiles.

`renderServer({ url })` applies same-origin `next.config` redirects and rewrites in Next request order:

1. Redirects.
2. `beforeFiles` rewrites.
3. Exact app route match.
4. `afterFiles` rewrites.
5. Dynamic app route match.
6. `fallback` rewrites.

Array rewrites normalize to `afterFiles`. An `afterFiles` rewrite must not hide an existing exact app route.

Redirects are an observable contract. Tests must prove the redirect branch was hit by asserting target-route content and a redirect-specific marker, such as a preserved `from=` query value. Form and Server Action redirects must also prove client-side App Router navigation through the hydrated React tree; a hard document navigation that leaves Vitest on a blank page is a regression.

Response headers from matching `next.config` header routes are exposed for same-origin page renders. Middleware/proxy execution, external rewrites, locale/basePath edge cases, and full custom-route response metadata are outside the current browser-mode `renderServer` request pipeline.

## Routes, Loader Trees, And App Render

Route discovery uses Next's App Router matchers. Loader trees are produced by invoking Next's `next-app-loader`; the Vite adapter extracts the loader tree and rewrites imports only at the bundler boundary.

The app render path calls `next/dist/server/app-render/app-render.js#renderToHTMLOrFlight` with a synthetic App Page route module, `WebNextRequest`, `WebNextResponse`, loader tree, render options, cache state, and manifest proxies.

Supported page-route behavior includes:

- Route groups.
- Dynamic, catch-all, and optional catch-all segments.
- Parallel default slots.
- Templates and loading boundaries.
- Route-level `not-found`, `forbidden`, `unauthorized`, `error`, and root `global-error`.
- Metadata, generated metadata, viewport, generated viewport, static metadata image conventions, and metadata image modules.
- Segment static info for the covered App Router page exports.
- Direct React node renders through a private synthetic route, so `renderServer(<ReactNode />)` still uses the Next app-render path instead of a local React-only router.

Route handlers are not page render targets. `renderServer({ url })` detects app-route matches, including metadata route endpoints, and reports them as unsupported render targets. Direct route-handler imports cover `NextRequest`, `NextResponse`, `userAgent`, `ImageResponse`, methods, params, streaming, cookies, redirects, and rewrites. If route handlers become a render target, they must run through Next route module/request code, not a local handler runner.

## Browser Hydration And Router

The browser path uses Next App Router internals:

- Initial router state is created from the Next RSC payload.
- The browser tree is rendered with `NextAppRouter`.
- Server Actions and RSC refetches go through the Vite RSC transport.
- Document hydration preserves Vitest harness scripts while applying Next head/body output.

HTML responses are required only for tests that need document/head/error-fallback fidelity. Most tests should use the controlled React/Vitest path and consume the Flight payload to final UI.

The document fallback parser is a boundary adapter. It mirrors Next app-index's `self.__next_f.push(...)` bootstrap segment shape, parses React Flight rows for fallback and redirect digests, and uses Next redirect/access-fallback helpers. It must not scan arbitrary document HTML for broad magic strings.

Do not reintroduce a user-visible local router element. The route path should go through `NextAppRouter`.

## Dependency Client Boundaries And Optimizers

Hidden Vite environments must not discover app-shell dependencies mid-test. The base RSC plugin copies optimizer scan roots from the visible Vitest browser client into hidden `react_client` and `react_ssr` runners, and warms those optimizers before test execution. The Next plugin contributes `app/**` and `src/app/**` scan entries when those directories exist.

Demo apps must not paper over late dependency discovery by adding broad ESM app-shell dependencies to `optimizeDeps.include`. Explicit prebundling should be limited to CJS dependencies, resolvable Next internals, or dependencies with a focused optimizer regression.

Next's installed `next/dist/server/app-render/entry-base.js` remains a real server-layer CJS module. The current PR36 adapter is intentionally Next-specific: `next-rsc-entry-base-client-references` intercepts only known client imports from that entry-base module in the RSC environment, returns client-reference proxies there, and lets browser/SSR graphs load the real Next client modules.

This is not a generic CJS dependency transform. If `@vitejs/plugin-rsc` preserves CJS `"use client"` dependency boundaries during RSC dep optimization, delete the Next-specific entry-base adapter or reduce it to whatever Next-only layer metadata remains.

## Source Transforms

Next SWC runs narrowly for source-level Next features such as `next/font` and `next/dynamic`. It imports Next's real SWC transform and loader option helpers.

Keep `serverComponents: false` and do not globally enable Next's RSC or Server Action transforms. Vite RSC owns directives and references. For `use cache`, the adapter uses a Vite RSC hoist path plus Next's cache runtime wrapper rather than handing the RSC graph to Next's compiler.

Turbopack and Rust Next sources are useful sources of truth for compiler behavior. They are not permission to implement a Turbopack graph inside Vite. Turbopack-derived behavior must stay inside small adapters with tests for user-visible behavior.

Runtime source rewrites are high risk. The current supported rewrite shims are limited to installed Next internals in the RSC environment and covered by package tests:

- `process.env.NEXT_RUNTIME` and `typeof window` handling inside selected Next internals.
- `__NEXT_DEV_SERVER` compatibility for Next internals.

Prefer defines, aliases, conditions, or direct Next/Vite entrypoints when they can preserve the behavior.

## Cache Components And `use cache`

`cacheComponents: true` changes more than syntax. It affects app-render semantics, request/work async storage behavior, cache handlers, and RSC cache entries.

The supported browser-mode path:

- Reads cache-components flags and cache life defines from loaded Next config.
- Initializes Next cache handlers through `next/dist/server/use-cache/handlers.js`.
- Registers custom `cacheHandlers` and `cacheMaxMemorySize` through Next's real APIs.
- Gates `next/root-params` through the installed Next version and config.
- Hoists async `"use cache"` functions through a Vite RSC transform.
- Wraps hoisted cache functions with `next/dist/server/use-cache/use-cache-wrapper.js#cache`.
- Leaves `"use cache"` directives untouched when `cacheComponents` is disabled.
- Normalizes cache wrapper `$$cache=` module IDs through the manifest proxies read by Next app-render.

Covered behavior includes default, remote, private, and custom cache handlers; `cacheTag`; custom `cacheLife` profiles; closure-bound cached functions; public-cache errors for `cookies()`, `headers()`, and `connection()`; sequential duplicate hits; force-cache/no-store/tag/revalidate/refresh behavior; and version-tolerant concurrent cold reads.

Cached components with `children` are explicitly unsupported. Next expects the encrypted `boundArgsLength` call shape produced by its transform output. The adapter should throw instead of silently caching the wrong key until support can be delegated to Next or upstream Vite RSC without taking over the RSC graph.

## Fonts

`next/font` support is a Vite bridge around Next's real implementation:

- Next SWC rewrites font declarations to `next/font/*/target.css?...`.
- The adapter calls Next's compiled Google/local font loaders.
- It calls Next's `postcss-next-font` for fallback metrics, class rules, variable rules, and `style` export data.
- Font bytes are emitted or served under Next-style `/_next/static/media/[hash][.p].woff2` URLs.
- A Next-like App Router font manifest records route-scoped preload metadata.
- Browser CSS is injected manually because Vite RSC imports the font module as JavaScript.

The CSS selector bridge must remain selector-aware: run the loader output through PostCSS and rename only the exact `.className` and `.variable` rules to generated class names. Do not use broad string replacement.

The current contract is the tested JS export, visible browser CSS, static-media URL shape, asset emission/dev serving, route-scoped preload behavior, local multi-file fonts, Google variable and non-variable fonts, fallback metrics, declarations, and no data URL final behavior. This does not claim that Vite is running Next's webpack CSS-module chain.

## Images And Metadata Images

`next/image` resolves to an RSC-safe module:

- `getImageProps` remains callable on the server.
- The `Image` component is a client reference.
- Browser rendering uses Next's real image component.

Static image imports go through Next's real `next-image-loader` for dimensions, blur metadata, and generated static-media URLs. Dev serving and build emission are Vite/Rollup boundaries around that loader output.

The current image contract covers real component rendering, static imports, config-loaded URL generation, unoptimized rendering, blur metadata, SVG/static policy coverage, and priority/preload head output.

The Next image optimizer endpoint is not implemented. Remote/default-loader optimization, `remotePatterns`, `localPatterns`, `qualities`, optimizer response headers, and default optimization behavior require a request pipeline. `next/legacy/image` is not part of this App Router adapter.

Metadata images use Next's real `next-metadata-image-loader` when generated app-loader output requests it. Covered behavior includes static metadata image files, segment/basePath URL generation, content type, dimensions, `.alt.txt`, static `icon`/`apple-icon`, and dynamic metadata image export discovery.

## App Router API Modules

Current App Router API coverage is scoped to the browser-mode adapter:

- `next/link`: custom RSC wrapper plus real Next client component.
- `next/form`: client reference to real Next form component.
- `next/script`: client reference to real Next script component.
- `next/navigation`: Next app-router aliases for server and client layers, with covered route-render/navigation probes.
- `next/cache`: real Next cache module in the RSC environment.
- `next/headers`: real Next request APIs through Next request stores.
- `next/server`: real Next server APIs plus SWC CJS optimizer support for direct route-handler imports.
- `next/root-params`: real Next root-params loader when the installed Next version and config support it.
- `next/error` and `next/web-vitals`: App Router client API dependencies, version-gated where the installed Next version does not export newer APIs.

The full hook-by-hook `next/navigation` and diagnostics matrix is not claimed. Add focused coverage before expanding a claim.

## Manifest And Runtime Shims

Some manifests are intentionally proxy/minimal because Vite RSC owns the actual references and Next app-render expects webpack-shaped records:

- `clientModules`.
- `ssrModuleMapping`.
- `edgeSSRModuleMapping`.
- `rscModuleMapping`.
- `edgeRscModuleMapping`.
- Server action manifest worker records.
- Builtin global-error mapping.
- Cache wrapper decode paths.

These proxies should stay small and tested. If a real framework entrypoint can own a manifest contract, prefer deleting the proxy.

Runtime shims are allowed only when they mirror Next behavior:

- Buffer ProvidePlugin-style imports are acceptable because Next webpack provides Buffer in edge/client bundles.
- The `Buffer.prototype.indexOf` `Uint8Array` needle patch is tied to Next app-render stream helper behavior and covered by regression tests.
- The no-op dev WebSocket/static-indicator compatibility path exists only for Next App Router internals that expect the dev client shape.
- User `global-error` conventions must be loaded into app-render `ComponentMod`; older Next versions may not provide every newer internal fallback module.

## Explicit Non-Goals

These are not current browser-mode adapter claims:

- Pages Router.
- `next/legacy/image`.
- Middleware/proxy execution.
- Route handlers as `renderServer({ url })` targets.
- Production Next build output fidelity.
- PPR/progressive timing fidelity.
- Node.js runtime parity.
- `instrumentation.ts` and `instrumentation-client.ts` startup lifecycles.
- `mdx-components.tsx` without a delegated MDX compiler path.
- Next image optimizer endpoint behavior.
- Cached components with `children` / encrypted `boundArgsLength` cache call shape.

Unsupported behavior should fail clearly or remain unclaimed. Do not add local approximations that make a demo pass while implying unsupported Next semantics.

## Testing Contract

Tests should cover framework behavior, not only demo behavior.

Use notes-demo browser tests for user-visible App Router behavior:

- Route matching, layouts, params, search params, metadata, route conventions, and document/head behavior.
- Cookies, headers, draft mode, cache, redirects, Server Actions, refresh, and request stores.
- Client navigation, form/action redirects, and browser graph behavior.
- MSW-routed transport where the browser request path matters.

Use no-MSW demo tests when the behavior specifically requires proving the no-MSW transport or direct browser/server integration path.

Use package-level tests for plugin internals:

- Transforms.
- Aliases.
- Loader adapters.
- Optimizer behavior.
- Manifest proxies.
- Runtime shims.
- Version gates for optional Next internals.

Before running tests that consume package output, rebuild the package. Use non-default Vitest API ports to avoid collisions in local and CI runs.

Compatibility CI must cover:

- Supported stable Next versions.
- Latest stable Next.
- Canary Next.
- Normal format, lint, type, build, and Vitest checks.

## Review Checklist

Before merging a Next.js fidelity change, verify:

1. The behavior is delegated to an installed Next/Vite/Vitest/`@vitejs/plugin-rsc` entrypoint whenever practical.
2. `@vitejs/plugin-rsc` still owns RSC directives, references, action transport, and browser/server graph separation.
3. No webpack/Turbopack RSC graph, layer graph, manifest graph, or bundler runtime was introduced.
4. Any copied upstream block is minimal, source-linked, wrapped in copy markers, and adapted only at the Vite/Vitest boundary.
5. Optional Next internals are feature-checked and not blindly included in optimizer lists.
6. Demo apps do not include broad ESM app-shell dependencies as optimizer workarounds.
7. Redirect tests prove the redirect branch was hit and form/action redirects prove client-side App Router navigation.
8. Rewrites follow Next order, especially `afterFiles` not shadowing existing exact routes.
9. Route handlers are not executed through `renderServer({ url })` until a Next route-module helper exists.
10. Unsupported behavior is documented as unsupported instead of approximated locally.
11. The notes demo covers user-visible framework behavior; package tests cover internal adapter contracts.
12. CI is green across supported, latest, and canary Next before merge.

## Useful References

Local source checkouts used as references:

- Next.js: `/Users/kasperpeulen/code/github/vercel/next.js`
- React: `/Users/kasperpeulen/code/github/facebook/react`
- Vite: `/Users/kasperpeulen/code/github/vitejs/vite`
- Vitest: `/Users/kasperpeulen/code/github/vitest-dev/vitest`
- `@vitejs/plugin-rsc`: `/Users/kasperpeulen/code/github/vitejs/vite-plugin-react/packages/plugin-rsc`
- Storybook Next.js Vite plugin: `/Users/kasperpeulen/code/github/storybookjs/vite-plugin-storybook-nextjs`

Important upstream areas:

- Next SWC loader and SWC option helpers.
- Next compiler alias and define-env helpers.
- Next app loader and root params loader.
- Next app-render, entry-base, and app-index internals.
- Next use-cache wrapper and cache handlers.
- Next font, image, and metadata-image loaders.
- Next custom transform sources for fonts, server actions, RSC directives, and `use cache`.
- `@vitejs/plugin-rsc` architecture and bundler-comparison docs.
