# Next.js Fidelity Architecture Tracker

Status: 2026-05-17, P0 file placement completed for the public Next.js
surface; P1 Edge App Page/App Route focused browser gates pass through generated
Edge entries, including redirect coverage without local Flight sniffing or
direct-node fallback paths. Notes-demo browser probes now use real App Page URLs,
including focused `next/link`, `router.push`, and `router.replace` client
navigation, except explicit P2 client-bootstrap/protocol-worker TODOs.

Architecture references:
[nextjs-app-router-fidelity-architecture.md](nextjs-app-router-fidelity-architecture.md)
and the P1 Edge App Page plan in
[nextjs-edge-app-page-delegation.md](nextjs-edge-app-page-delegation.md).

This tracker starts from one agreed rule:

> Only public package entrypoints and non-Next adapter plumbing may stay directly
> under `packages/vitest-plugin-rsc/src/nextjs/`. Any file that imitates Next.js
> semantics, adapted equivalents, artifact shapes, loaders, manifests, runtime
> modules, compiler behavior, or app-render behavior must live under the matching
> `packages/vitest-plugin-rsc/src/nextjs/src/...` mirror path.
> Vite virtual-module transport can stay top-level, but a payload generator that
> preserves a Next-owned module/source/runtime shape belongs in the mirror path.

The matching mirror path is owned by the upstream source file, not by local
convenience. Code adapted from `build/templates/edge-ssr-app.ts` goes in
`nextjs/src/build/templates/edge-ssr-app.ts`; code adapted from
`server/app-render/manifests-singleton.ts` goes in
`nextjs/src/server/app-render/manifests-singleton.ts`. Do not group unrelated
upstream owners under a local bucket such as manifest setup, dispatcher, request
runtime, or cache wiring.

That rule is only the P0 cleanup. It is not the final architecture. The real
goal is to make local Next mirrors temporary and removable by going higher up in
Next's own pipeline: real Next entrypoints, templates, loaders, route modules,
runtime helpers, and `@next/routing` data should own behavior whenever they can.

The tracker has two jobs:

1. Make current glue readable by placing it under the exact Next source file it
   imitates.
2. Track which placed mirrors should disappear once a higher Next layer works.

## North Star

Every slice should move one of these directions:

- **Place**: move copied/adapted Next behavior under the matching
  `nextjs/src/...` mirror path without changing behavior.
- **Delegate higher**: replace lower local logic with a higher installed Next
  layer, such as `next-app-loader`, `next-edge-ssr-loader`,
  `edge-ssr-app`, `edge-app-route`, `AppPageRouteModule`,
  `AppRouteRouteModule`, `server/web/adapter`, or `@next/routing`.
- **Delete**: remove mirror files and compatibility shims once the higher owner
  works.

A mirror file is a liability with documentation, not a success state. Keeping a
mirror is justified only when the higher Next owner is blocked by Vite graph
ownership, `.next` production output, Node server lifecycle, or Vitest document
ownership.

## Migration Phases

### P0: File Placement Without Behavior Changes

P0 is copy/move only:

- create the `nextjs/src/...` mirror directory structure;
- move existing files or extracted functions to the matching Next source path;
- fix imports, exports, tests, and compatibility aliases only;
- add or preserve upstream `Source:`, `Adaptation:`, and copy/adapted markers
  around copied/adapted implementation;
- do not redesign logic, rename Next-owned payload fields, or switch to higher
  Next code paths in the same step.

Strict marker requirement for `nextjs/src`:

- every non-test implementation file under `packages/vitest-plugin-rsc/src/nextjs/src/`
  must contain explicit source-linked marker blocks;
- use `Begin copy` / `End copy` only for code copied from upstream Next with
  mechanical changes such as imports, formatting, types, or export boundaries;
- use `Begin adapted` / `End adapted` for Next glue that is deliberately
  adapted to the Vite/Vitest boundary but still mirrors a concrete upstream Next
  glue layer, module output, manifest shape, bootstrap module, or runtime
  contract;
- the default expectation is that roughly 90% of each `nextjs/src` implementation
  file is inside source-linked copy or adapted blocks;
- local glue is not allowed in `nextjs/src` unless that glue is itself copied or
  directly adapted from a concrete Next glue layer: loader code, template code,
  adapter code, manifest plugin code, compiler option code, or route/build
  conversion code. A Vite virtual-module generator is allowed there when its
  payload is the adapted equivalent of that upstream Next output;
- `Source:` markers in a mirror file must name the same upstream source path the
  local file mirrors. A `server/app-render/manifests-singleton.ts` mirror may not
  host adapted `build/templates/edge-ssr-app.ts` code, even if the code touches
  manifest singleton setup;
- if a helper cannot point at a concrete upstream Next glue file and line range,
  do not put it under `nextjs/src`; keep it as top-level Vite/Vitest adapter
  plumbing or delete it through a P1 higher-owner spike;
- if one helper spans multiple upstream files, split it by upstream file or keep
  top-level boundary glue that calls the correctly placed source-linked helpers;
- Vite/Vitest boundary code inside a mirror file must be inside an adapted block
  that names the exact Next glue being preserved and the boundary that forces the
  adaptation. If the boundary code has no upstream Next glue counterpart, it is
  not allowed in `nextjs/src`.

P0 is complete only when top-level public files are thin composition wrappers
and copied/adapted Next behavior has an exact upstream source path.

### P1: Higher-Up Delegation And Deletion

P1 is the architectural cleanup:

- replace lower-level copied/local code with higher-level installed Next
  imports, real loader invocation, or Edge entry/template code where that
  deletes glue;
- keep Vite and `@vitejs/plugin-rsc` as the graph owners;
- add or update focused package and notes-demo coverage for any semantic change;
- delete mirror files instead of leaving wrappers around direct imports.

P1 examples:

- a working Edge App Page entry deletes local App Page render/request shims;
- a working Edge App Route entry deletes direct userland route-handler runners;
- a working `next-app-loader` path deletes local loader-tree construction;
- a working generic RSC CJS client-reference boundary deletes the Next-specific
  `entry-base` proxy;
- working `@next/routing` plus Next-produced routing data deletes local rewrite,
  redirect, and dynamic-route ordering code.

### P2: Fidelity Claims And User Coverage

P2 turns delegated behavior into supported user-visible claims:

- notes-demo browser coverage for App Router behavior users observe;
- package-level tests for adapter boundaries that remain;
- README/API docs updated only for behavior that is actually supported;
- unsupported behavior documented as unsupported instead of approximated locally.

P2 should not expand local glue. If a fidelity claim needs more local Next
logic, first ask whether a higher Next layer can own it.

## Architecture Dependency Map

The work is not a flat refactor. The files move into the phase that owns their
contract:

1. Build-time files decide what exists: `webpack-config.ts`, `entries.ts`,
   route matcher providers, `next-app-loader`, edge loaders, static-info helpers,
   manifest plugins, and `build-complete.ts`.
2. Request-runtime files decide what a URL does: serialized routing data,
   `@next/routing`, `server/web/adapter`, Edge App Page entries, Edge App Route
   entries, middleware/proxy hooks, redirects, rewrites, and app-render action
   responses.
3. Browser-runtime files consume output: `client/app-index.tsx` semantics,
   inline Flight bootstrap parsing, `createInitialRouterState`,
   `createMutableActionQueue`, `NextAppRouter`, navigation, refresh, and Server
   Action responses.

Virtual modules are Vite transport addresses only. The payload generator belongs
under the Next source file that would have produced the webpack output,
template, manifest, or adapter data. Move it out only when it is purely plugin
infrastructure with no upstream Next owner.

## Virtual Module Contracts

| Virtual module or payload                         | Owning mirror file                                              | Contract to preserve                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `virtual:vitest-plugin-rsc/next-entrypoints`      | `src/build/entries.ts`                                          | Uses installed `entries.ts#getAppEntry()` import serialization when available; the `next-app-loader?${AppLoaderOptions}!` fallback is a tested transport boundary with React Server Components layer intent.                                                                                      |
| `virtual:vitest-plugin-rsc/next-route-tree?...`   | `src/build/webpack/loaders/next-app-loader/index.ts`            | Tree-only representation of `next-app-loader` + `app-page`: `tree`, `__next_app_require__`, `__next_app_load_chunk__`, and convention module imports. Do not expand this ID to full App Page output without an explicit full-output mode.                                                         |
| `virtual:vitest-plugin-rsc/next-app-page?...`     | `src/build/webpack/loaders/next-app-loader/index.ts`            | Wired isolated full App Page userland representation of the same `next-app-loader?<AppLoaderOptions>!` artifact. The Edge App Page entry consumes this full output; the tree-only ID remains separate.                                                                                            |
| `virtual:vitest-plugin-rsc/next-routes`           | `src/build/adapter/build-complete.ts`                           | Imitates `build-complete.ts#onBuildComplete({ routing })`: export `routing`; compatibility aliases may exist but request routing consumes `routing`.                                                                                                                                              |
| `virtual:vitest-plugin-rsc/next-edge-ssr-app?...` | `src/build/webpack/loaders/next-edge-ssr-loader/index.ts`       | Imitates `next-edge-ssr-loader`: `pageModPath`/`VAR_USERLAND` is `getAppEntry().import + pagePath + ?__next_edge_ssr_entry__`, then `VAR_PAGE`, cache handler injection, exported `ComponentMod`, and exported `handler`. Initial SSR and browser App Page request gates consume this same entry. |
| future App Page Edge template fallback            | `src/build/templates/edge-ssr-app.ts`                           | Imitates `edge-ssr-app.ts` only if the loader/template cannot run directly.                                                                                                                                                                                                                       |
| App Route Edge virtual entry                      | `src/build/webpack/loaders/next-edge-app-route-loader/index.ts` | Imitates `next-edge-app-route-loader`: `modulePath`/`VAR_USERLAND`, `VAR_PAGE`, cache handler injection, exported `ComponentMod`, exported `handler`. Unit dispatch and the focused browser App Route fixture select this artifact for App Route API targets through MSW.                         |
| future App Route Edge template fallback           | `src/build/templates/edge-app-route.ts`                         | Imitates `edge-app-route.ts` only if the loader/template cannot run directly.                                                                                                                                                                                                                     |

The query, exports, and serialized objects are the Next contract. Do not rename
Next-owned payload fields into local convenience names before the adapter
boundary.

## Public Surface That Stays Top-Level

These are package entrypoints or Vitest/Vite adapter entrypoints. They may
compose mirror files, but they should not own copied Next behavior:

| File                        | Decision       | Reason                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plugin.ts`                 | Keep top-level | Public Vite plugin composition entrypoint. It wires mirror adapters into Vite.                                                                                                                                                                                                                                                                                                                                           |
| `testing-library.tsx`       | Keep top-level | Public test helper surface. Done in this worktree: this file is now a thin composition wrapper; render/request runtime plumbing moved to `testing-library-runtime.tsx`, and document Flight bootstrap parsing moved to `src/client/app-index.ts`. The later Edge App Page cleanup deleted the direct-render LoaderTree helpers, app-render access-fallback seed recovery, and manual font layer asset injection helpers. |
| `testing-library-client.ts` | Keep top-level | Public/client helper entrypoint.                                                                                                                                                                                                                                                                                                                                                                                         |
| `client.tsx`                | Internal only  | `vitest-plugin-rsc/nextjs/client` has no published/default export and is removed from build entrypoints; the source-condition entry remains only for the internal RSC client-reference handoff until full Next `app-index.tsx` bootstrap can own document hydration.                                                                                                                                                     |
| `msw.ts`                    | Keep top-level | Public MSW integration entrypoint. It should call mirror/runtime adapters, not own Next internals. For browser-originated Edge App Page/App Route requests, it is the only supported runtime transport.                                                                                                                                                                                                                  |
| `virtual.d.ts`              | Keep top-level | Public virtual module declarations.                                                                                                                                                                                                                                                                                                                                                                                      |
| `tester.html`               | Keep top-level | Vitest tester document, not a Next source mirror.                                                                                                                                                                                                                                                                                                                                                                        |

## Adapter Plumbing That Can Stay Top-Level

These are not concrete Next source mirrors. Keep them top-level unless they start
owning Next semantics:

| File                          | Decision                            | Reason                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plugin-utils.ts`             | Keep top-level                      | Local Vite/package utility helpers.                                                                                                                                                                                                                                                                                                        |
| `virtual-ids.ts`              | Keep top-level                      | Vite virtual ID constants, transport-only.                                                                                                                                                                                                                                                                                                 |
| `next-routing.ts`             | Keep top-level temporarily          | CJS/default interop shim for `@next/routing`, not a Next source mirror. Delete defensive interop if Next 16.2-only support makes it unnecessary.                                                                                                                                                                                           |
| `next-compiled.d.ts`          | Keep top-level or `types/` later    | Type declarations for compiled packages, not behavior.                                                                                                                                                                                                                                                                                     |
| `routing-types.ts`            | Keep top-level for now              | Serializable cross-boundary type shared by plugin/runtime. If it becomes a Next-routing mirror, move near `build-complete.ts`.                                                                                                                                                                                                             |
| `testing-library-runtime.tsx` | Keep top-level temporarily          | Private Vitest render/request orchestration split out of the public helper. After P0 it composes mirror files and local Vitest document/request flow; no copied/adapted Next implementation block is intentionally owned here. P1 deletion target: replace this orchestration with a higher Next App Page/Edge entry path where practical. |
| `buffer-compat.ts`            | Keep top-level unless source-linked | Runtime compatibility shim. If it mirrors a concrete Next/bootstrap behavior, move to that source path.                                                                                                                                                                                                                                    |
| `os-browser.ts`               | Keep top-level unless source-linked | Runtime compatibility shim. If it mirrors a concrete Next/bootstrap behavior, move to that source path.                                                                                                                                                                                                                                    |

## P0 File Placement Targets

These targets are for source placement, not permanent design. Every moved file
must keep a P1 deletion note: which higher Next layer could remove it, and what
test would prove that deletion is safe.

### Build And Config

| Current file                   | Target path                                                 | Source it mirrors                                            | Notes                                                                                                                                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`                    | Stay top-level unless copied config behavior is found       | `next/dist/server/config`, `load-jsconfig`, `find-pages-dir` | Preferred state is a top-level adapter that composes installed helpers. Do not create `src/server/config.ts` just to wrap imports. Move only copied/adapted config semantics to an exact source path.                                                         |
| `config.test.ts`               | Same directory as `config.ts`                               | Same                                                         | Move with implementation.                                                                                                                                                                                                                                     |
| `plugin/aliases.ts`            | `src/build/webpack-config.ts`                               | Next webpack alias/condition config                          | Done in this worktree. It selects Next aliases/conditions for Vite, so it belongs under the webpack-config mirror. P1 deletion target: delete local alias tables when direct Next compiler/webpack config helpers can provide Vite-ready aliases and defines. |
| `plugin/aliases.test.ts`       | `src/build/webpack-config.test.ts` or adjacent focused test | Same                                                         | Done in this worktree. Test follows implementation.                                                                                                                                                                                                           |
| `swc-transform-plugin.ts`      | `src/build/webpack/loaders/next-swc-loader.ts`              | `next-swc-loader` / SWC options                              | Done in this worktree. Vite transform adapter for Next compiler behavior. P1 deletion target: replace this Vite hook with a real Next SWC loader invocation path if Vite can host it directly.                                                                |
| `swc-transform-plugin.test.ts` | `src/build/webpack/loaders/next-swc-loader.test.ts`         | Same                                                         | Done in this worktree. Test follows implementation.                                                                                                                                                                                                           |

### Route Discovery, Entries, Route Trees, Routing Data

| Current file                                                         | Target path                                                                                                                                                          | Source it mirrors                                         | Notes                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route-manifest-plugin.ts`                                           | Split across multiple files below                                                                                                                                    | Multiple Next build sources                               | This file currently mixes too many Next artifacts. It should become thin Vite virtual-module dispatcher or be renamed as transport plumbing.                                                                               |
| route matcher scan code from `route-manifest-plugin.ts`              | `src/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts` and `src/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts` | Next dev matcher providers                                | Done in this worktree. P1 deletion target: replace the direct scan adapters with a higher Next route matcher manager or `@next/routing` route data source when it can run without a Next dev server.                       |
| file-reader setup used by route discovery                            | `src/server/route-matcher-providers/dev/helpers/file-reader/default-file-reader.ts`                                                                                  | Next dev matcher file reader                              | Done in this worktree. P1 deletion target: delete the wrapper if route discovery can instantiate the installed provider through a higher Next route matcher owner.                                                         |
| empty/missing app module handling from `route-manifest-plugin.ts`    | likely top-level Vite plumbing or `src/build/webpack/loaders/next-app-loader/index.ts`                                                                               | Next app-loader missing/default convention modules        | Only put under app-loader if it mirrors default convention module behavior.                                                                                                                                                |
| entrypoint virtual source generation from `route-manifest-plugin.ts` | `src/build/entries.ts`                                                                                                                                               | `entries.ts#getAppEntry()`                                | Done in this worktree. Owns `next-entrypoints` and `next-route-tree?...AppLoaderOptions` request generation. P1 deletion target: let a higher Next entries/loader pipeline provide the scan roots directly.                |
| route-tree generation from `route-manifest-plugin.ts`                | `src/build/webpack/loaders/next-app-loader/index.ts`                                                                                                                 | `next-app-loader` and `app-page` template injection names | Done in this worktree. Owns invoking real loader, extracting `tree`, and import rewriting. P1 deletion target: delete local extraction once a real `next-app-loader` Vite bridge can expose the app-page entry directly.   |
| loader-tree tuple/types/helpers, if locally named                    | Deleted                                                                                                                                                              | Generated `next-app-loader` output                        | Done in this cleanup. Testing-library no longer needs local direct-node, wrapper, fallback, or layer-asset traversal helpers.                                                                                              |
| static route info loading from `route-manifest-plugin.ts`            | `src/build/analysis/get-page-static-info.ts`                                                                                                                         | static info collector                                     | Done in this worktree. Owns `preferredRegion`, `middlewareConfig`, route segment config feeding loader options. P1 deletion target: delete the wrapper when a higher Next entries path supplies static info.               |
| `plugin/routing-data.ts`                                             | `src/build/adapter/build-complete.ts`                                                                                                                                | `build-complete.ts#onBuildComplete()`                     | Already moved in this worktree. Must keep copy/adapt markers.                                                                                                                                                              |
| `routing-data.test.ts`                                               | `src/build/adapter/build-complete.test.ts`                                                                                                                           | Same                                                      | Already moved in this worktree.                                                                                                                                                                                            |
| `request-router.ts`                                                  | Keep top-level temporarily                                                                                                                                           | Runtime adapter around `@next/routing`                    | Must shrink after `build-complete` routing data is Next-shaped. It may dispatch app-page/app-route/not-found targets, but should not own redirect/rewrite ordering once `@next/routing` plus Next routing data can own it. |
| `request-router.test.ts`                                             | Stay with `request-router.ts`                                                                                                                                        | Same                                                      | Test follows runtime adapter.                                                                                                                                                                                              |
| `direct-render-routing.ts`                                           | Keep top-level or move under a clearly local adapter folder                                                                                                          | Direct ReactNode/page-only fallback                       | Not a Next source mirror. It should be isolated as local testing-library behavior.                                                                                                                                         |

### App Render And Manifests

| Current file                                                                      | Target path                                                                                                                                                                               | Source it mirrors                                                        | Notes                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-render.ts`                                                                   | Deleted for App Page route runtime; split only tiny non-render residue elsewhere if truly needed                                                                                          | Edge App Page/app-render path                                            | Done in this worktree. Generated `next-edge-ssr-loader`/`edge-ssr-app` entries and `AppPageRouteModule.render()` now own the focused App Page route-runtime gates instead of the top-level local render wrapper.                                                        |
| `app-render.test.ts`                                                              | Follow split modules or keep top-level integration test                                                                                                                                   | Same                                                                     | Unit tests move with split pieces; integration may stay top-level.                                                                                                                                                                                                      |
| `app-render-compat-plugin.ts`                                                     | Deleted; do not replace with another local App Page compatibility shim                                                                                                                    | `server/app-render/app-render.tsx`                                       | Done in this worktree. The generated Edge App Page path owns runtime setup directly. Replacement payload mirrors may only remain where independently imported by real Next mirror code, not as an App Page wrapper compatibility plugin.                                |
| `app-render-manifest.ts`                                                          | Split into `src/build/webpack/plugins/flight-manifest-plugin.ts`, `src/build/webpack/plugins/flight-client-entry-plugin.ts`, and `src/build/webpack/plugins/next-font-manifest-plugin.ts` | Next manifest plugins                                                    | Done in this worktree. Manifest shapes are grouped by the Next plugin whose output they imitate, and the old top-level duplicate was removed. P1 deletion target: delete manifest glue that `@vitejs/plugin-rsc` or real Next route modules can own.                    |
| `client-reference-plugin.ts`                                                      | Split payloads into `src/client/app-dir/link.react-server.ts`, `src/client/app-dir/link.ts`, `src/client/app-dir/form.ts`, and `src/client/script.ts`; keep Vite hook top-level           | App Router client-reference virtual modules                              | Done in this worktree. Vite `resolveId`/`load` wrapper stays top-level adapter plumbing; source payloads live under the matching Next client mirrors. P1 deletion target: let real Next client references or generic `@vitejs/plugin-rsc` boundaries own these modules. |
| `flight-payload.ts`                                                               | `src/client/app-index.ts`                                                                                                                                                                 | Flight bootstrap/payload parsing                                         | Done in this worktree. Flight control-flow digest parsing belongs to the app-index Flight bootstrap mirror; `.ts` is used because the helper has no JSX and is imported from tests/runtime.                                                                             |
| `flight-payload.test.ts`                                                          | `src/client/app-index.test.ts`                                                                                                                                                            | Same                                                                     | Done in this worktree. Test follows implementation.                                                                                                                                                                                                                     |
| `font-manifest.ts`                                                                | `src/build/webpack/plugins/next-font-manifest-plugin.ts`                                                                                                                                  | Next font manifest plugin output                                         | Done in this worktree. In-memory manifest preserves NextFontManifestPlugin output shape. P1 deletion target: let a real Next font manifest plugin/entry path provide the manifest.                                                                                      |
| app-render access-fallback seed recovery from `testing-library-runtime.tsx`       | Deleted                                                                                                                                                                                   | Delegated Edge App Page HTML/Flight payload                              | Done in this cleanup. The runtime no longer recovers fallback boundary nodes locally; initial route rendering uses generated Edge HTML and the router consumes the generated payload.                                                                                   |
| next/font document style and preload injection from `testing-library-runtime.tsx` | Deleted                                                                                                                                                                                   | Generated Edge/App Render path plus `next-font-loader` module evaluation | Done in this cleanup. The runtime no longer injects font styles or preload links after render; Edge render owns manifest consumption and the font module injects CSS when it evaluates in the browser.                                                                  |

### Edge Entries And Request Runtime

This section is mostly P1 target architecture. Do not create fallback template
mirrors just because the path exists in the architecture document. First try the
real Next loader/template/route-module path and only create the mirror if that
higher owner is blocked.

| Current file or planned payload                | Target path                                                     | Source it mirrors                         | Notes                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App Page Edge virtual entry                    | `src/build/webpack/loaders/next-edge-ssr-loader/index.ts`       | `next-edge-ssr-loader`                    | Wired in this worktree through the real loader or `loadEntrypoint("edge-ssr-app")`. This owns the App Page Edge entry shape, not `app-render.ts` as a local wrapper.                                                                                      |
| fallback App Page Edge template                | `src/build/templates/edge-ssr-app.ts`                           | `build/templates/edge-ssr-app.ts`         | Create only if the edge loader/template cannot be invoked. Must preserve `ComponentMod`, `handler`, cache handler injection, and Web response conversion.                                                                                                 |
| App Route virtual entry                        | `src/build/webpack/loaders/next-edge-app-route-loader/index.ts` | `next-edge-app-route-loader`              | Wired in this worktree through the real loader or `loadEntrypoint("edge-app-route")`. Focused browser coverage dispatches through MSW to the generated Edge App Route handler. Do not directly call userland `GET`/`POST` as the render/request contract. |
| fallback App Route Edge template               | `src/build/templates/edge-app-route.ts`                         | `build/templates/edge-app-route.ts`       | Create only if the edge app-route loader/template cannot be invoked. Must preserve `EdgeRouteModuleWrapper.wrap(module.routeModule)`.                                                                                                                     |
| middleware/proxy and Edge request adapter code | `src/server/web/adapter.ts`                                     | `server/web/adapter.ts`                   | Create only if direct `next/dist/server/web/adapter.js` import fails. This owns request stores, RSC rewrite headers, redirect handling, and `FetchEventResult`.                                                                                           |
| App Route Edge wrapper code                    | `src/server/web/edge-route-module-wrapper.ts`                   | `server/web/edge-route-module-wrapper.ts` | Create only if direct import fails. This owns `AppRouteRouteModule.handle()` invocation through Next's Edge wrapper.                                                                                                                                      |

### Fonts, Images, Metadata, Cache, Root Params

`use cache` is not one move. Split it by owner:

- RSC hoist/transform glue stays Vite/RSC adapter code. It may call
  `@vitejs/plugin-rsc`'s `transformHoistInlineDirective`, but it must not live
  under a fake Next compiler file and must not enable Next's RSC/Server Action
  compiler transforms.
- Runtime cache semantics belong to Next. Handler registration and
  `cache(kind, id, boundArgsLength, originalFn, args)` bridging may live under
  `src/server/use-cache/...` only while the Edge App Page/app-render path cannot
  own that setup.
- Unsupported encrypted `boundArgsLength` and cached components with `children`
  must keep failing clearly until delegated to Next compiler output or upstream
  Vite RSC support.

| Current file                           | Target path                                                                                                                                | Source it mirrors                                                        | Notes                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `font-loader-plugin.ts`                | `src/build/webpack/loaders/next-font-loader/index.ts`                                                                                      | `next-font-loader`                                                       | Done in this worktree. Vite loader/transform wrapper delegates to the mirror file. P1 deletion target: invoke the real Next font loader through a shared loader bridge or delete when Next SWC + Vite can consume target CSS directly.                                                                                                                           |
| `font-loader-plugin.test.ts`           | `src/build/webpack/loaders/next-font-loader/index.test.ts`                                                                                 | Same                                                                     | Done in this worktree. Test follows implementation.                                                                                                                                                                                                                                                                                                              |
| `image-plugin.ts`                      | `src/build/webpack/loaders/next-image-loader/index.ts`                                                                                     | `next-image-loader`                                                      | Done in this worktree. Static image import behavior belongs there. P1 deletion target: invoke the real Next image loader through a shared loader bridge and remove local asset URL rewriting.                                                                                                                                                                    |
| `image-plugin.test.ts`                 | `src/build/webpack/loaders/next-image-loader/index.test.ts`                                                                                | Same                                                                     | Done in this worktree. Test follows implementation.                                                                                                                                                                                                                                                                                                              |
| `metadata-image-loader-plugin.ts`      | `src/build/webpack/loaders/next-metadata-image-loader.ts`                                                                                  | `next-metadata-image-loader`                                             | Done in this worktree. Metadata image import behavior belongs there. P1 deletion target: let real Next route/metadata entry generation own metadata image loader requests.                                                                                                                                                                                       |
| `metadata-image-loader-plugin.test.ts` | `src/build/webpack/loaders/next-metadata-image-loader.test.ts`                                                                             | Same                                                                     | Done in this worktree. Test follows implementation.                                                                                                                                                                                                                                                                                                              |
| `plugin/root-params.ts`                | `src/build/webpack/loaders/next-root-params-loader.ts`                                                                                     | Next root params loader                                                  | Done in this worktree. Vite virtual module wrapper invokes Next's own loader. P1 deletion target: invoke the real loader through a shared loader bridge or higher app entry path.                                                                                                                                                                                |
| `plugin/root-params.test.ts`           | `src/build/webpack/loaders/next-root-params-loader.test.ts`                                                                                | Same                                                                     | Done in this worktree. Test follows implementation.                                                                                                                                                                                                                                                                                                              |
| `plugin/cache-handlers.ts`             | `src/server/use-cache/handlers.ts`                                                                                                         | Next cache handler registry                                              | Done in this worktree. Vite virtual module wrapper emits configured handler imports for Next's registry setup. P1 deletion target: let the Edge App Page/app-render path initialize handlers through Next's own runtime.                                                                                                                                         |
| `plugin/cache-handlers.test.ts`        | `src/server/use-cache/handlers.test.ts`                                                                                                    | Same                                                                     | Done in this worktree. Test follows implementation.                                                                                                                                                                                                                                                                                                              |
| `plugin/use-cache.ts`                  | Split: RSC hoist transform remains top-level adapter; runtime wrapper call-shape glue moved to `src/server/use-cache/use-cache-wrapper.ts` | `@vitejs/plugin-rsc` hoist transform plus Next use-cache wrapper/runtime | Done in this worktree. Directive detection and hoisting stay adapter-owned; the bridge from hoist output to Next `cache()` must still use source-linked `Begin adapted` / `End adapted` markers. The virtual runtime module now lives under the Next mirror path. P1 deletion target: delete local runtime setup when Edge App Page/app-render owns cache setup. |
| `plugin/use-cache.test.ts`             | Split: transform tests stay top-level; runtime module test lives in `src/server/use-cache/use-cache-wrapper.test.ts`                       | Same                                                                     | Done in this worktree. Tests separately cover RSC hoist ownership, Next runtime wrapper call shape, unsupported children/boundArgsLength failures, and cache handler registration.                                                                                                                                                                               |

### Client Runtime, Builtins, HTML

| Current file                                  | Target path                                                                               | Source it mirrors                                  | Notes                                                                                                                                                                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin/builtin-global-error.ts`              | `src/client/components/builtin/global-error.ts`                                           | Builtin global error component/reference behavior  | Done in this worktree. Vite virtual module preserves the built-in client reference shape; `.ts` is used because the plugin graph is loaded by Vitest's native config loader. P1 deletion target: let real Next app entries provide the built-in global-error module. |
| `plugin/builtin-global-error.test.ts`         | `src/client/components/builtin/global-error.test.ts`                                      | Same                                               | Done in this worktree. Test follows implementation.                                                                                                                                                                                                                  |
| `plugin/entry-base-client-references.ts`      | `src/server/app-render/entry-base.ts`                                                     | Next app-render entry-base client refs             | Done in this worktree. Vite bridge preserves Next entry-base client reference boundaries. P1 deletion target: let `@vitejs/plugin-rsc` preserve CJS `"use client"` dependency boundaries during RSC dep optimization.                                                |
| `plugin/entry-base-client-references.test.ts` | `src/server/app-render/entry-base.test.ts`                                                | Same                                               | Done in this worktree. Test follows implementation.                                                                                                                                                                                                                  |
| `plugin/server-reference-info.ts`             | `src/shared/lib/server-reference-info.ts`                                                 | Next server reference info helper                  | Done in this worktree. Virtual helper delegates real hex IDs to Next and preserves Vite RSC module IDs. P1 deletion target: remove when Vite RSC action IDs no longer flow through Next's reducer arg-pruning path.                                                  |
| `plugin/server-reference-info.test.ts`        | `src/shared/lib/server-reference-info.test.ts`                                            | Same                                               | Done in this worktree. Test follows implementation.                                                                                                                                                                                                                  |
| `plugin/runtime-rewrites.ts`                  | `src/build/webpack-config.ts`                                                             | Next webpack ProvidePlugin and define-env rewrites | Done in this worktree. Content mirrored webpack/define behavior for installed Next internals, so it was folded into the existing webpack-config mirror. P1 deletion target: replace string rewrites with optimizer defines/conditions.                               |
| `plugin/runtime-rewrites.test.ts`             | `src/build/webpack-config.test.ts`                                                        | Same                                               | Done in this worktree. Tests moved with implementation.                                                                                                                                                                                                              |
| `plugin/tester-html.ts`                       | Keep top-level plugin plumbing unless source-linked                                       | Vitest tester HTML generation                      | Not necessarily a Next mirror. If it parses app-index bootstrap, split that part to `src/client/app-index.tsx`.                                                                                                                                                      |
| `plugin/tester-html.test.ts`                  | Follow implementation                                                                     | Same                                               | Test follows implementation.                                                                                                                                                                                                                                         |
| `plugin/optimizer.ts`                         | `src/build/entries.ts` for Next entry roots; top-level Vite plumbing for optimizer config | `entries.ts` plus Vite optimizer adapter           | Done in this worktree. Route-discovered scan entries moved to `src/build/entries.ts`; Vite optimizeDeps wiring remains top-level plugin plumbing.                                                                                                                    |
| `plugin/optimizer.test.ts`                    | Split with implementation                                                                 | Same                                               | Done in this worktree. Entry scan tests moved to `src/build/entries.test.ts`; optimizeDeps wiring tests stay top-level.                                                                                                                                              |

### Tests And Composition

| Current file                 | Target path                             | Source it mirrors            | Notes                         |
| ---------------------------- | --------------------------------------- | ---------------------------- | ----------------------------- |
| `plugin-composition.test.ts` | Keep top-level                          | Vite plugin composition test | Not a Next source mirror.     |
| `plugin/test-utils.ts`       | Keep near tests or top-level test utils | Test helper                  | Not production Next behavior. |

## Execution Order

Before creating or moving any `nextjs/src/...` code, every subagent must answer
this checklist in the change itself:

1. What upstream Next source file and source lines own this behavior?
2. Is the local path the exact mirror of that upstream source path?
3. If the helper spans multiple upstream files, was it split by source owner or
   kept as top-level boundary glue with source-linked calls?
4. Are the `Source:`, `Adaptation:`, and copy/adapted markers next to the code?

Then proceed:

1. Create the `nextjs/src/...` directory structure first.
2. Move one coherent upstream source family at a time with current behavior
   unchanged.
3. During P0, allow only path/import/export/test updates and marker
   additions. Do not switch to higher Next code paths in the same diff.
4. For every moved implementation file under `nextjs/src`, add or preserve
   upstream `Source:` links, `Adaptation:` explanations, and `Begin copy` /
   `End copy` or `Begin adapted` / `End adapted` markers around the implementation
   and glue. A `nextjs/src` file without those markers is invalid unless it is a
   test file. A `nextjs/src` helper that cannot point at upstream Next glue is
   also invalid.
5. Add a P1 deletion note for the moved family: which higher Next layer should
   remove the mirror, and which test proves the deletion.
6. Keep public top-level files as thin composition wrappers.
7. After each family move, run the family unit tests and `pnpm tsgo --build`.
8. Start P1 only after the relevant moved family is green. P1 may replace
   copied/local pieces with higher-level Next imports, real loader invocation,
   Edge entries, route modules, or `@next/routing` behavior, with separate
   semantic tests.

## P0 First Moves

Start with the build-time path because it is already closest to the new
architecture:

1. Done in this worktree: `plugin/routing-data.ts` ->
   `src/build/adapter/build-complete.ts`.
2. Done in this worktree: route-tree generation from `route-manifest-plugin.ts` ->
   `src/build/webpack/loaders/next-app-loader/index.ts`.
3. Done in this worktree: entrypoint/AppLoaderOptions query generation from `route-manifest-plugin.ts`
   -> `src/build/entries.ts`.
4. Done in this worktree: static-info loading from `route-manifest-plugin.ts` ->
   `src/build/analysis/get-page-static-info.ts`.
5. Done in this worktree with provider unit coverage: route matcher
   provider/file-reader extraction from `route-manifest-plugin.ts` ->
   `src/server/route-matcher-providers/dev/...`.

Then move loader/plugin feature families: SWC, font, image, metadata image, root
params, cache, builtins, server-reference info, manifests.

Edge App Page has wired resolver/source coverage for generated artifacts and
focused runtime/browser gates. Initial SSR/document rendering is owned by the
test harness/runtime without MSW and dispatches directly to the generated Edge
App Page handler. Browser-originated RSC/navigation/API requests and Server
Action POSTs go through MSW to generated Edge App Page or Edge App Route
handlers. The top-level `packages/vitest-plugin-rsc/src/nextjs/app-render.ts`
wrapper and local `src/server/app-render/app-render.ts` compatibility path are
deleted history for App Page route runtime. This P1 route-runtime slice is scoped
to real filesystem App Page routes discovered through the route manifest, not
`renderServer(<ReactNode />)` synthetic routes. It has no private probe headers,
dev-server middleware, direct React-node/local app-render compatibility path,
route-entry replacement compatibility mode, fake-route fallback, Cookie-header
side channel, or custom `ModuleRunner` side-channels. Do not preserve old
non-MSW App Page route runtime behavior in the Edge model.

## P1 Edge App Page Order

Use the Edge App Page delegation doc as the gate matrix. Current recommended
order is: keep artifact-generation virtual modules and unit tests green, then
proceed through initial HTML/Flight via the generated Edge handler, MSW RSC GET
to that same handler, Server Action POST, App Route/API through the Edge App
Route path, and old-helper deletion.

For this P1 order, the App Page route target is a real filesystem route through
the generated Edge pipeline. `renderServer(<ReactNode />)` is outside that
architecture, and there is no separate compatibility mode for old
direct-node/local app-render glue, replacement-helper dispatch, or fake routes.
`renderServer({ url })` App Page route behavior must eventually go through the
same request-router/Edge handler path as browser-observed requests, but initial
SSR/document rendering must not use MSW. Server Actions for App Page fidelity go
browser POST -> MSW -> Edge App Page handler.

Coverage ladder:

1. Unit tests first: virtual manifest `edgeAppPage` entry exposure, generated
   Edge handler invocation/context, manifest/cache global installation, initial
   HTML dispatch selection, MSW RSC GET forwarding/dispatch selection, Server
   Action POST request preservation, real action-manifest/action-entry wiring,
   and App Route/API Edge dispatch selection.
2. Focused runtime/browser gates now pass: initial HTML through the Edge handler
   without MSW, browser RSC GET through MSW to the same handler, Server Action
   POST through MSW to the same handler for both the action-not-found checkpoint
   and a focused real action execution, hydrated `next/link` /
   `router.push` / `router.replace` client navigation, and browser App Route/API
   fetches through MSW to the Edge App Route handler. Remaining work is broader
   Server Action protocol coverage, browser/MSW Cookie-header coverage when
   available without side channels, and the P2 legacy no-MSW cleanup TODO:
   migrate or retire `playground/nextjs-no-msw-demo` coverage without treating it
   as P1 Edge App Page acceptance.

Enable the ladder one test at a time. Do not narrow or empty include patterns to
hide failures, and do not treat old non-MSW tests as new Edge App Page
acceptance.

Future fake or synthetic App Page routes are P2 exploration only. If reintroduced
for `renderServer(<ReactNode />)` or similar helpers, they must enter the new
architecture as synthetic file/page module -> real Next `next-app-loader` full
output -> `edge-ssr-app` -> generated Edge handler request path. Browser requests
to such routes would still enter through MSW. They are not a separate
compatibility mode for P1.

File-level deletion/reduction after those gates:

- Initial HTML deleted top-level `app-render.ts` HTML/result helpers and the
  `testing-library-runtime.tsx` document fallback/access-fallback paths plus
  manual font/layer asset injection.
- RSC GET deleted top-level `app-render.ts` Flight/initial-payload helpers and
  the `testing-library-runtime.tsx` GET/`prepareServerRoot()` initial-payload
  path.
- Server Actions deleted top-level `app-render.ts` action helpers, local action
  decoding in `msw.ts`, and action request-shape APIs in
  `testing-library-client.ts` / `testing-library-runtime.tsx`; focused real
  action manifest/protocol execution now goes through the generated Edge handler.
- App Route/API uses `edge-app-route`, `EdgeRouteModuleWrapper`, and
  `AppRouteRouteModule.handle()` through MSW instead of direct userland
  route-handler runners.
- `src/build/templates/app-page.ts#createAppPageRouteModule`, top-level
  `app-render.ts`, and local app-render compatibility files are deleted for App
  Page route runtime. Keep manifest/cache proxy files only while they adapt Vite
  RSC graph data into Next-shaped inputs.

## P1 Deletion Targets

Use this list after each P0 family is green:

- Replace local route ordering and rewrite/redirect matching with
  `@next/routing` over `build-complete`-shaped routing data.
- Replace App Page render wrappers with the real Edge App Page loader/template
  path: `next-edge-ssr-loader`, `edge-ssr-app`, `server/web/adapter`, and
  `AppPageRouteModule`. The deletion target is the whole top-level
  `app-render.ts` App Page route runtime file, not just individual helper
  functions.
- Replace App Route direct calls with the real Edge App Route path:
  `next-edge-app-route-loader`, `edge-app-route`, `EdgeRouteModuleWrapper`, and
  `AppRouteRouteModule.handle()`.
- Replace local loader-tree construction with real `next-app-loader` output.
- Replace Next-specific `entry-base` client-reference proxies with a generic
  `@vitejs/plugin-rsc` CJS `"use client"` boundary if that works.
- Replace local `use cache` runtime setup with the real Edge App Page/app-render
  cache setup while keeping `@vitejs/plugin-rsc` responsible for directive
  hoisting and the RSC graph.
- Delete adapter shims that only wrap direct imports after the supported Next
  version is fixed to 16.2.

## Test Gates

Minimum after each move:

- moved file's unit test;
- affected top-level integration test;
- architecture check: every moved mirror has a direct/higher deletion target;
- manifest/action gate: Edge handlers receive `self.__RSC_MANIFEST`,
  `self.__RSC_SERVER_MANIFEST`, cache handler setup, and raw action POST
  requests in Next-shaped form before local action decode/replay is removed;
- architecture guard TODO: add wrong-source marker detection when a repo-wide
  marker scanner exists. It should fail when a `nextjs/src/...` file contains a
  `Source:` URL for a different mirrored Next path, such as
  `build/templates/edge-ssr-app.ts` inside
  `src/server/app-render/manifests-singleton.ts`;
- `pnpm tsgo --build`;
- `pnpm exec oxfmt --check <moved files>`;
- `git diff --check`.

Before pushing:

- `pnpm build`;
- `pnpm lint:ci`;
- route-manifest/request-router/build-complete tests;
- at least one notes-demo browser smoke when virtual modules or render path
  changes.
