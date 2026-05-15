# Next.js Fidelity Architecture 2

Status: 2026-05-16
Branch: `codex/next-architecture-less-glue`
Base: `1b4acdc docs: clarify completed architecture scope`

This document is the working plan for reducing custom Next.js logic on top of the current Next fidelity PR. The goal is not to rewrite the PR for its own sake. Every step has to remove, isolate, or replace local behavior with a real Next, Vite, Vitest, React, or `@vitejs/plugin-rsc` responsibility.

The first rule for this branch: stay critical. A refactor only counts as progress when it makes the next deletion or delegation easier. Moving code to another file is not enough unless it creates a clear boundary that can be tested or replaced.

The second rule: do not focus on optimizer mechanics in this effort. Optimizer warmup may still be necessary for Vite, but it is not the architecture target here. This branch should focus on deleting custom Next request/render logic and keeping only the bridge code required to stay an in-process Vitest plugin that uses Vite RSC.

## Current Assessment

The current PR is better than it first looks. It already delegates important work to Next:

- route discovery uses Next dev route matcher providers;
- loader trees come from the real `next-app-loader`;
- page rendering calls real Next app-render code;
- config, env, SWC, font, image, cache, and alias setup mostly use installed `next/dist/...` modules.

The weak spot is where the adapter builds a local request/render runtime around those pieces:

- `testing-library.tsx` owns custom request routing, redirect/rewrite following, route target selection, document fallback hydration, and Testing Library orchestration;
- `app-render.ts` owns direct `renderToHTMLOrFlight` invocation, render opts construction, fake manifests, lifecycle hooks, and Vite RSC stream substitution;
- route handlers are now invoked through the browser/MSW request path, but not as first-class `renderServer({ url })` targets;
- several helpers encode Next request/render semantics locally instead of delegating them to Next route modules or upstream routing helpers.

That means the problem is not "this PR reinvented all of Next". The problem is narrower: the local glue is concentrated in a few large files, and some of it should eventually become a real request adapter around Next route modules.

## Better Target Shape

The target architecture should have explicit layers:

1. `route-discovery`
   - Uses Next route matcher providers and `next-app-loader`.
   - Produces app page entries, app route entries, loader trees, and custom-route metadata.
   - Does not render, hydrate, or follow redirects.

2. `next-request-routing`
   - Takes a URL, headers, and discovered routes.
   - Resolves redirects, rewrites, headers, and page/route-handler targets.
   - This is the boundary that should later move toward `@next/routing` or `next/server/testing` where possible.

3. `app-page-invoker`
   - Invokes pages through Next's `AppPageRouteModule` shape rather than directly growing a bespoke `renderToHTMLOrFlight` call site.
   - Keeps the Vite RSC bridge explicit: client-reference manifests, server action manifests, and `renderToReadableStream` substitution.

4. `app-route-invoker`
   - Invokes route handlers through `AppRouteRouteModule.handle()`.
   - Replaces direct test imports of route handlers for fidelity tests where the user-visible behavior depends on Next's production route module stores.
   - Keeps the CJS `"use client"` boundary visible for Next app-route shared modules so `@vitejs/plugin-rsc` can transform the real `app-router-context.shared-runtime.js` module instead of this plugin hand-writing app-router context exports.

5. `test-hydration`
   - Owns Testing Library DOM/hydration integration only.
   - Should not own Next route matching or custom-route semantics.

## First Step Already Done

Commit `d29ef70 refactor: isolate Next request routing glue` extracted request/custom-route matching out of `testing-library.tsx` into `next-request-routing.ts`.

This is not yet less runtime glue. It is a boundary commit. It is still worthwhile because:

- `testing-library.tsx` no longer hides route matching inside hydration logic;
- the request-routing glue has one import surface and can be unit-tested directly;
- future replacement with `@next/routing` or `next/server/testing` has one file to target.

Verification for that step:

- `pnpm build`
- `pnpm exec oxfmt --check packages/vitest-plugin-rsc/src/nextjs/testing-library.tsx packages/vitest-plugin-rsc/src/nextjs/next-request-routing.ts`
- `pnpm exec oxlint packages/vitest-plugin-rsc/src/nextjs/testing-library.tsx packages/vitest-plugin-rsc/src/nextjs/next-request-routing.ts`
- `pnpm test:run --project vitest-plugin-rsc --api 52643 packages/vitest-plugin-rsc/src/nextjs/route-manifest-plugin.test.ts packages/vitest-plugin-rsc/src/nextjs/plugin-aliases.test.ts`

## Next Small Steps

### 1. Add Focused Tests For `next-request-routing`

Before changing behavior, add direct package tests for:

- same-origin redirect resolution;
- external redirect rejection;
- `beforeFiles`, `afterFiles`, and `fallback` rewrite order;
- static route match before dynamic route match;
- response header interpolation;
- `has` and `missing` predicates.

This is not the final architecture, but it prevents accidental regressions while replacing internals.

Critical check: do not spend too much time expanding tests for code we intend to delete. Cover only behavior that current demos rely on.

### 2. Investigate Replacing Custom Routes With Next Routing APIs

Preferred order:

1. Try `@next/routing` if it is usable from installed Next versions supported by this repo.
2. Try `next/server/testing` for `next.config` redirects, rewrites, and headers.
3. Keep the local implementation only for gaps that neither API supports in this test runtime.

Important finding: `next/server/testing` cannot blindly replace the current code today. It expects a `nextConfig` object with route functions, while the virtual manifest currently exports already-loaded `customRoutes`. Passing only serialized custom routes would be a fake Next config and could be lower fidelity than today.

Possible better design:

- route discovery keeps exporting loaded custom routes for fast browser runtime use;
- package tests compare `next-request-routing` behavior against `unstable_getResponseFromNextConfig` for representative config cases;
- if parity is proven, introduce a narrower runtime adapter or source the same upstream helper logic instead of growing local matching code.

Critical check: only call this "less glue" if local matching code shrinks or becomes a thin wrapper around an upstream API.

### 3. Add A Route Handler Invocation Helper

Current route-handler coverage imports handlers directly. That proves `NextRequest` and `NextResponse` primitives work, but it bypasses Next's production `AppRouteRouteModule` path.

A better helper should:

- construct `AppRouteRouteModule` with the userland route module;
- create a real `NextRequest`;
- pass params through `AppRouteRouteModule.handle()`;
- provide the minimal `renderOpts`, `previewProps`, and `sharedContext` that Next's route module expects;
- expose a small API such as `handleRoute({ userland, route, url, method, params, body, headers })`.

This would be a real fidelity improvement because Next's route module owns:

- method normalization;
- request/work/action async storage;
- dynamic API tracking;
- fetch patching;
- route handler `params`;
- cookie mutation handling;
- invalid response handling;
- `NextResponse.next()` and rewrite errors in app route handlers.

Current status: browser `fetch()` to an app route now goes through MSW, `fetchRsc`, the route manifest, and `AppRouteRouteModule.handle()`. Direct route-handler tests remain only for focused `next/server` API coverage where a browser request path is not the point.

Critical check: keep expanding route-handler coverage through the MSW/request path when the behavior depends on Next request stores, params, method handling, or response propagation. Do not add app-local mocks for behavior the route module can own.

### 4. Move Page Invocation Toward `AppPageRouteModule`

Current `app-render.ts` creates a route-module-shaped object and calls `renderToHTMLOrFlight` directly. That is close to Next, but not the same ownership boundary as Next's own `build/templates/app-page.ts`.

Possible improvement:

- generate a virtual app-page entry that exports `routeModule = new AppPageRouteModule(...)`;
- make the app-page invoker call `routeModule.render(...)`;
- keep only the Vite RSC substitutions in the adapter.

This is more invasive than route handlers. Do it only after the request-routing boundary is stable.

Critical check: if the new path still requires the same hand-built `RenderOpts`, fake manifests, and lifecycle hooks, it may not be materially better. The win has to be that the Next route module owns more of the call shape.

## Non-Goals

Do not replace `@vitejs/plugin-rsc` with Next webpack or Turbopack RSC bundling. That would create two RSC graphs and is the wrong direction.

Do not port large chunks of Next server/router code by hand. If an upstream function is importable, import it. If it is not, copy only the smallest block with source markers.

Do not make `testing-library.tsx` the dumping ground for new Next semantics. It should become thinner over time.

Do not call a refactor "less glue" if the same behavior just moved behind a different name without a deletion path.

Do not spend this branch on optimizer entry rewrites. They may be revisited separately, but they are not custom Next semantics and they should not distract from deleting request/render logic.

## Glue That Is Allowed To Remain

Some adapter code is not wheel reinvention. It is the cost of this package's shape:

- Vite virtual modules that let Next loader output import user app files through Vite.
- Manifest bridges from Vite RSC client/server references into the shapes Next app-render expects.
- Thin request conversion between Web `Request`, Next request objects, and Testing Library APIs.
- Hydration handoff from Next Flight/HTML output into Vitest browser tests.
- Small version guards around installed `next/dist/...` internals.

These should stay small and boring. They should not contain framework decisions such as route matching policy, HTTP method semantics, dynamic API behavior, redirect rules, cache behavior, or route handler execution rules. Those belong to Next.

## Commit Policy For This Branch

Use small commits and push after each stable step.

Each commit should answer one of these:

- What local behavior was deleted?
- What upstream Next/Vite/Vitest/RSC behavior now owns more of the work?
- What boundary was created so a later commit can delete glue safely?
- What test now protects an adapter replacement?

If a step fails this test, do not commit it as architecture progress.
