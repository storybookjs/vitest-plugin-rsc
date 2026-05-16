# Next Fidelity PR Architecture Trial

Status: 2026-05-16 (stacked branch initialized)
Scope: stacked architecture cleanup work based on the current Next.js fidelity PR.

This document is the source of truth and progress tracker for the next Codex
agent working on the Next fidelity architecture cleanup. The stable contract
lives in [new-architecture.md](new-architecture.md). This file records the
architecture we want to try in a new stacked PR to reduce local Next.js glue
while keeping the current user-facing behavior green.

## Codex Goal

Refactor the Next.js fidelity implementation into the cleaner adapter
architecture described in this document.

Create a new stacked branch and draft PR based on
`codex/next-fidelity-transforms-pr36`. Do not continue this refactor directly on
the base fidelity PR unless the user explicitly asks for that. Use this document
as the live progress tracker throughout the work. Before starting each coherent
slice, update the tracker below to show the active subgoal. After each slice,
record the result, tests run, commit or PR reference, CI status, and any
remaining follow-up.

Recommended branch:

```sh
git checkout codex/next-fidelity-transforms-pr36
git pull
git checkout -b codex/next-fidelity-architecture-cleanup
```

Recommended draft PR title:

```text
refactor: split Next fidelity adapter architecture
```

Active workspace for this stacked PR:

- Branch: `codex/next-fidelity-architecture-cleanup`
- Worktree: `/Users/kasperpeulen/.cursor/worktrees/vitest-plugin-rsc/next-fidelity-architecture-cleanup`
- Base branch: `codex/next-fidelity-transforms-pr36`
- Initial state: documentation-only handoff; implementation has not started.

Work in priority order. Commit and push small, reviewable increments. After each
pushed slice, check CI and keep it green before moving to the next major slice.
If an experiment only wraps existing glue without deleting, narrowing, or
isolating it, reject that experiment and document why.

## Progress Tracker

Status values: `Not started`, `In progress`, `Blocked`, `Deferred`, `Rejected`,
`Done`.

| Subgoal                                     | Status      | Branch/PR/Commit | Required Tests                                                          | Notes                                                                                                                         |
| ------------------------------------------- | ----------- | ---------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1. Request router split                     | In progress | PR #47 / pending | `request-router.test.ts`; notes-demo routing/redirect/header tests      | Review cleanup tightened the request-router boundary and explicit route override behavior. Local tests green; CI pending.     |
| 2. Routing data adapter                     | Not started |                  | `routing-data.test.ts`; rewrite ordering tests                          | Convert discovered routes and Next config into `@next/routing`-compatible data if it materially reduces glue.                 |
| 3. App page invoker                         | Not started |                  | `app-page-invoker.test.ts`; notes-demo render/action coverage           | Try real `AppPageRouteModule`; keep direct app-render only if smaller and explicitly isolated.                                |
| 4. App route invoker decision               | Not started |                  | `app-route-invoker.test.ts` if implemented                              | Either use `AppRouteRouteModule.handle()` or keep route-handler render targets explicitly unsupported.                        |
| 5. Optimizer entry architecture             | Not started |                  | optimizer entry tests; no-MSW app-shell regression                      | Replace broad `app/**` scan roots with discovered route or virtual entrypoint warmup.                                         |
| 6. Generic CJS browser transform evaluation | Not started |                  | package CJS transform tests; real integration proving deleted Next glue | Evaluate PR #45 only if it removes or substantially narrows Next-specific client-reference glue.                              |
| 7. Manifest bridge cleanup                  | Not started |                  | manifest bridge unit tests                                              | Move manifest construction out of render helpers and source-link every mirrored Next manifest shape.                          |
| 8. Module readability pass                  | Not started |                  | package unit tests for touched modules                                  | Keep adapter responsibilities in dedicated modules instead of growing `testing-library.tsx`, `plugin.ts`, or `app-render.ts`. |
| 9. Acceptance coverage and docs             | Not started |                  | notes-demo, no-MSW, package tests, build, typecheck, lint, CI matrix    | Keep README and architecture docs aligned with final behavior and support matrix.                                             |

### Slice Log

- 2026-05-16 Subgoal 1: moved request routing helpers, route-target
  resolution, custom redirect/rewrite/header handling, route-handler detection,
  and direct-render route matching from `testing-library.tsx` into
  `request-router.ts`. Added `request-router.test.ts` for the extracted
  boundary. Local verification:
  - `pnpm --filter vitest-plugin-rsc test:run src/nextjs/request-router.test.ts`
  - `pnpm test:run --project nextjs-notes-demo-browser --api 52643 app/next-apis/page.test.tsx`
  - `pnpm exec oxlint docs/next-fidelity-pr-architecture.md packages/vitest-plugin-rsc/src/nextjs/request-router.ts packages/vitest-plugin-rsc/src/nextjs/request-router.test.ts packages/vitest-plugin-rsc/src/nextjs/testing-library.tsx`
  - `pnpm build`
  - `pnpm tsgo --build`
  - CI: green on PR #47 for `410b97e`, including build, format, lint,
    typecheck, Vitest, preview, semantic title, and Next.js
    16.0/16.1/latest/canary compatibility.
- 2026-05-16 Subgoal 1 review follow-up: wired `testing-library.tsx` through
  the central `resolveNextRequestTarget()` boundary for initial request routing
  and page-only render-entry lookup. Local verification:
  - `pnpm --filter vitest-plugin-rsc test:run src/nextjs/request-router.test.ts`
  - `pnpm test:run --project nextjs-notes-demo-browser --api 52643 components/next-router.test.tsx app/next-apis/page.test.tsx app/api/next-request-response/route-render.test.tsx app/metadata-routes.browser.test.tsx`
  - `pnpm exec oxlint docs/next-fidelity-pr-architecture.md packages/vitest-plugin-rsc/src/nextjs/testing-library.tsx packages/vitest-plugin-rsc/src/nextjs/request-router.ts packages/vitest-plugin-rsc/src/nextjs/request-router.test.ts`
  - `pnpm build`
  - `pnpm tsgo --build`
  - `git diff --check`
  - CI: green on PR #47 for `ebee496`, including build, format, lint,
    typecheck, Vitest, preview, semantic title, and Next.js
    16.0/16.1/latest/canary compatibility.
- 2026-05-16 Subgoal 1 review cleanup: strengthened the `request-router.ts`
  source/adaptation note, removed test-only routing helper exports, kept
  custom response header routing private, and made explicit `route` overrides
  match the invocation pathname instead of falling back to URL-matched pages.
  Added focused package coverage and a notes-demo regression for the visible
  `renderServer({ url, route })` behavior. Local verification:
  - `pnpm --filter vitest-plugin-rsc test:run src/nextjs/request-router.test.ts`
  - `pnpm build`
  - `pnpm test:run --project nextjs-notes-demo-browser --api 52643 components/next-router.test.tsx app/next-apis/page.test.tsx app/api/next-request-response/route-render.test.tsx app/metadata-routes.browser.test.tsx`
  - `pnpm exec oxlint packages/vitest-plugin-rsc/src/nextjs/testing-library.tsx packages/vitest-plugin-rsc/src/nextjs/request-router.ts packages/vitest-plugin-rsc/src/nextjs/request-router.test.ts playground/nextjs-notes-demo/app/next-apis/page.test.tsx`
  - `pnpm tsgo --build`
  - `git diff --check`
  - CI: pending on PR #47.

## Agent Operating Rules

- Start by checking `pwd`, branch, and `git status --short --branch`.
- Work only from the intended stacked branch unless the user redirects the work.
- Keep this tracker current. A slice is not done until this document says what
  changed, what tests ran, and whether CI is green.
- Prefer installed Next/Vite/Vitest/@vitejs/plugin-rsc entrypoints over local
  approximations.
- Keep `@vitejs/plugin-rsc` responsible for the RSC graph: `"use client"`,
  `"use server"`, client references, server references, Server Actions, and graph
  separation.
- Do not add a parallel Next.js implementation.
- Do not preserve dead experiments, temporary files, obsolete APIs, or stale docs.
- Any copied upstream block must include Begin/End copy markers, source links,
  and an adaptation note.

The main question for the stacked architecture PR is:

> Can we replace the growing local request/render pipeline with smaller adapters around real Next.js routing and route modules?

The answer should be proven in code, tests, and CI. If an experiment only wraps the existing glue without deleting or isolating it, reject that experiment.

## Success Criteria

This architecture trial is successful when:

1. `testing-library.tsx` no longer owns request routing details.
2. Custom routes use real Next-provided routing behavior where practical.
3. Optimizer scan roots come from discovered routes or test entries, not blind `app/**` globs.
4. App page rendering is closer to Next route-module invocation, or the remaining direct `renderToHTMLOrFlight` path is explicitly isolated as temporary.
5. Route handlers are either still clearly unsupported as `renderServer({ url })` targets, or they run through `AppRouteRouteModule.handle()`.
6. The support matrix, README, architecture docs, and CI matrix agree.
7. All existing notes-demo/no-MSW/package tests stay green, and new tests cover every changed routing or optimizer behavior.

## Current Pressure Points

The base fidelity PR already delegates a lot of behavior to Next:

- Route discovery uses Next dev route matcher providers.
- Loader trees come from the real `next-app-loader`.
- App rendering calls Next app-render.
- Fonts, images, metadata image routes, defines, aliases, and cache behavior use installed Next internals where possible.

The remaining pressure points are the places where local code starts resembling a small Next server:

- `testing-library.tsx` resolves redirects, rewrites, headers, exact routes, dynamic routes, fallback routes, and route-handler rejection.
- `app-render.ts` builds a synthetic app-page route module and a minimal `RenderOpts` subset.
- Route handlers are tested mostly through direct imports, not the route-handler request pipeline.
- Optimizer entries include broad `app/**/*` and `src/app/**/*` globs.
- Manifest bridge shapes are partly colocated with render helpers instead of having obvious ownership boundaries.

These areas are the target of the trial.

## Support Matrix Decision

If `@next/routing` becomes part of the runtime architecture, the Next App Router helper support floor should move to Next `>=16.2.0`.

Reason:

- Stable `@next/routing` releases start at `16.2.x`.
- The package is the official direction for adapter request routing.
- Supporting `16.0` and `16.1` while using `@next/routing` would require keeping local compatibility routing or a fallback router, which is exactly the glue we want to remove.

Required changes if this decision is accepted:

- README: document `next >=16.2` for `vitest-plugin-rsc/nextjs/*`.
- Package peer range: make the Next peer range reflect the supported helper floor, while keeping bare `vitestPluginRSC()` framework-agnostic.
- CI matrix: use `16.2`, `latest`, and `canary`; remove `16.0` and `16.1`.
- CI install step: install matching `next` and matching `@next/routing` for the matrix target.
- PR title/description: keep this a breaking change.

If `@next/routing` does not materially simplify request routing, keep the wider matrix and do not bump support only for cosmetic reasons.

## Proposed Module Layout

Keep the public API stable. The split is internal.

```text
packages/vitest-plugin-rsc/src/nextjs/
  route-discovery.ts
  route-manifest-plugin.ts
  routing-data.ts
  request-router.ts
  app-page-invoker.ts
  app-route-invoker.ts
  manifest-bridge/
    client-reference-manifest.ts
    server-action-manifest.ts
    font-manifest.ts
    asset-manifest.ts
  optimizer/
    next-entrypoints.ts
    optimize-deps.ts
  testing-library.tsx
```

This is a target shape, not a requirement to rename every file at once. It is acceptable to split only the modules touched by the PR, as long as ownership boundaries become clear.

## Layer 1: Route Discovery

Ownership:

- Next owns app route discovery.
- Next owns route-handler discovery.
- Next owns loader-tree generation.
- Vite owns virtual module resolution and import rewriting at the bundler boundary.

Current good direction:

- Use `DevAppPageRouteMatcherProvider`.
- Use `DevAppRouteRouteMatcherProvider`.
- Invoke `next-app-loader` for page loader trees.

Target responsibilities:

- Discover app pages.
- Discover app route handlers.
- Produce route metadata used by request routing and optimizer warming.
- Produce route-tree virtual modules.
- Expose raw route handler files, but do not execute route handlers directly.

This layer must not decide request behavior. It returns facts:

```ts
type NextDiscoveredAppPage = {
  kind: "app-page";
  route: string;
  appPath: string;
  pageFile: string;
  loaderTree: LoaderTree;
};

type NextDiscoveredAppRoute = {
  kind: "app-route";
  route: string;
  appPath: string;
  routeFile: string;
};
```

Do not add new local route matching here except small normalization needed to feed Next's own utilities.

## Layer 2: Routing Data Adapter

This layer converts discovered routes and loaded Next config into the shape expected by `@next/routing`.

Inputs:

- Discovered app page pathnames.
- Discovered app route pathnames.
- Loaded Next config.
- Loaded custom routes from Next internals.
- Base path and i18n config when supported.

Outputs:

```ts
type NextRoutingData = {
  pathnames: string[];
  routes: {
    beforeMiddleware: NextRoutingRoute[];
    beforeFiles: NextRoutingRoute[];
    afterFiles: NextRoutingRoute[];
    dynamicRoutes: NextRoutingRoute[];
    onMatch: NextRoutingRoute[];
    fallback: NextRoutingRoute[];
    shouldNormalizeNextData?: boolean;
  };
};
```

Implementation notes:

- Prefer using Next route-building helpers to create `sourceRegex`, status, `has`, `missing`, and destination interpolation.
- Redirect routes passed to `@next/routing` must include the status and redirect headers shape it expects, not just a destination string.
- Headers should flow as response headers returned from request routing.
- Array rewrites normalize to `afterFiles`, matching Next behavior.
- Dynamic routes should come from the route manifest using Next's route regex utilities, not ad hoc path parsing.

Acceptance tests:

- `afterFiles` rewrite does not shadow an existing exact app route.
- `beforeFiles` rewrite can target an app route.
- Dynamic route is selected after `afterFiles`.
- Fallback rewrite only runs after no exact or dynamic route match.
- Redirect result preserves destination query params.
- Headers from `next.config` are exposed on the returned render result.

## Layer 3: Request Router

This is the central replacement for routing logic currently spread through `testing-library.tsx`.

Target API:

```ts
type NextRequestTarget =
  | {
      kind: "app-page";
      entry: NextRouteManifestEntry;
      requestedUrl: URL;
      invocationUrl: URL;
      routeMatches: Record<string, string | string[]>;
      responseHeaders: Headers;
      status?: number;
    }
  | {
      kind: "app-route";
      entry: NextRouteHandlerManifestEntry;
      requestedUrl: URL;
      invocationUrl: URL;
      routeMatches: Record<string, string | string[]>;
      responseHeaders: Headers;
      status?: number;
    }
  | {
      kind: "redirect";
      url: URL;
      status: number;
      responseHeaders: Headers;
    }
  | {
      kind: "external-rewrite";
      url: URL;
      responseHeaders: Headers;
      status?: number;
    }
  | {
      kind: "not-found";
      requestedUrl: URL;
      responseHeaders: Headers;
      status?: number;
    };

async function resolveNextRequestTarget(options: {
  url: string;
  route?: string;
  headers?: Headers | Record<string, string>;
  manifest: NextRouteManifest;
}): Promise<NextRequestTarget>;
```

Expected implementation:

1. Build `NextRoutingData` from route discovery and config.
2. Call `resolveRoutes()` from `@next/routing`.
3. Translate its result into the `NextRequestTarget` union.
4. Match `resolvedPathname` to a discovered app page or route handler.
5. Return redirect/external rewrite/not-found results without rendering.

Important behavior:

- Same-origin redirects may be followed by `renderServer` only when the current testing contract requires rendering the final page. The redirect branch must still be observable in tests through target content and a redirect-specific marker.
- External redirects and external rewrites should fail clearly unless we add an explicit helper for them.
- Route handlers remain unsupported render targets until `app-route-invoker.ts` exists. The request router should still detect them and return `kind: "app-route"` so `testing-library.tsx` can throw a precise error.
- `testing-library.tsx` should not import `prepareDestination`, `matchHas`, route regex helpers, or custom-route helpers directly after this split.

Do not use `next/experimental/testing/server` as the main router. It is useful for unit comparisons against `next.config` behavior, but Next documents that it does not consider filesystem routes. It also does not model the complete app-page/app-route invocation target.

## Layer 4: App Page Invoker

Current path:

- Build `WebNextRequest`.
- Build `WebNextResponse`.
- Create a synthetic route module object.
- Create render options.
- Call `renderToHTMLOrFlight()`.

Target experiment:

- Try creating a real `AppPageRouteModule` instance, mirroring Next's `build/templates/app-page.ts`.
- Prefer `routeModule.render(nextReq, nextRes, context)` over calling `renderToHTMLOrFlight()` directly.
- Keep Vite RSC responsible for `renderToReadableStream` and client-reference resolution.

Expected target API:

```ts
async function renderAppPageTarget(options: {
  target: Extract<NextRequestTarget, { kind: "app-page" }>;
  loaderTree: LoaderTree;
  mode: "flight" | "html" | "action";
  action?: NextActionInvocation;
  componentMod?: NextEntryBaseComponentMod;
}): Promise<Response>;
```

What this may improve:

- The route module definition shape is owned by Next.
- Future Next route-module behavior has a natural place to hook in.
- Render code reads as "invoke a Next app page" rather than "manually configure app-render".

What it will not magically remove:

- We still need `RenderOpts`.
- We still need manifest bridge data because Vite RSC owns the module graph.
- We still need request lifecycle hooks such as `waitUntil`, `onClose`, and `onAfterTaskError`.
- We still need Next globals/cache-handler initialization for browser-mode execution.

Acceptance rule:

Use `AppPageRouteModule` only if it reduces local shape copying or makes route invocation clearer. If it only wraps the same `renderToHTMLOrFlight` call with more code, keep the current app-render path but move it into `app-page-invoker.ts` and document it as the remaining temporary boundary.

## Layer 5: App Route Invoker

This is not required to keep current behavior, but it is the correct architecture if route handlers become supported render targets.

Target:

- Generate or load a virtual app-route module shaped like Next's `build/templates/app-route.ts`.
- Create `AppRouteRouteModule`.
- Convert the browser test request to `NextRequest`.
- Invoke `routeModule.handle(request, context)`.

Target API:

```ts
async function invokeAppRouteTarget(options: {
  target: Extract<NextRequestTarget, { kind: "app-route" }>;
  method?: string;
  headers?: Headers | Record<string, string>;
  body?: BodyInit | null;
}): Promise<Response>;
```

Why direct route imports are insufficient:

- They bypass method normalization.
- They bypass `NextRequest` construction.
- They bypass request/work/action async storage.
- They bypass dynamic tracking.
- They bypass route module redirect/access-fallback handling.
- They bypass response validation and mutable-cookie merging.

Current PR option:

- Keep route handlers unsupported as `renderServer({ url })` targets.
- Preserve direct-import tests for public `next/server` primitives.
- Add this layer only if route-handler render support becomes a PR goal.

Required tests if implemented:

- GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS method behavior.
- Dynamic route params.
- `cookies()`, `headers()`, `NextRequest.nextUrl`, and `userAgent`.
- Redirect response.
- Streaming response.
- Mutable cookies merged into the response.
- Clear error when a handler returns a non-Response.

## Layer 6: Manifest Bridge

Vite RSC owns client references and server references. Next app-render expects webpack-shaped manifests. The bridge remains legitimate, but it should be explicit and small.

Target modules:

- `manifest-bridge/client-reference-manifest.ts`
- `manifest-bridge/server-action-manifest.ts`
- `manifest-bridge/font-manifest.ts`
- `manifest-bridge/asset-manifest.ts`

Rules:

- Do not spread manifest shape construction through render helpers.
- Every manifest proxy should name the Next manifest it mirrors.
- Every proxy should have a package-level unit test.
- Prefer deleting a proxy if a real framework entrypoint can own the contract.

Required tests:

- Client module proxy normalizes Vite RSC module IDs.
- Server action manifest maps action IDs to the route worker expected by Next.
- Cache wrapper `$$cache=` IDs normalize correctly.
- Builtin global-error module IDs normalize correctly.
- Font manifest entries are route scoped and preload only when requested.

## Layer 7: Optimizer Entry Layer

Current problem:

- The Next plugin contributes broad source scan entries: `app/**/*` and `src/app/**/*`.
- That works around late dependency discovery, but it warms files Next did not discover as routes.
- It makes app-level ESM dependencies look like something the user must optimize manually.

Target:

- Replace broad globs with a virtual entry module generated from route discovery.
- The entry should import only discovered route trees and route handler modules.
- Hidden `react_client` and `react_ssr` runners should still inherit scan roots from the visible Vitest browser client.

Target shape:

```ts
const virtualNextEntrypointsId = "virtual:vitest-plugin-rsc/next-entrypoints";

// Generated:
import "virtual:vitest-plugin-rsc/next-route-tree?pageFile=...";
import "/@fs/.../app/api/example/route.ts";
```

Open design question:

- Vite dependency optimization may run before async route discovery is ready. If so, this virtual module must either perform discovery during `config`/`configResolved`, cache discovery by root/mode, or use a sync manifest generated by the route-manifest plugin. Test this before committing to the design.

Acceptance rule:

- Remove `createNextSourceOptimizerEntries()` or make it return the virtual entry only.
- No demo app should need broad ESM `optimizeDeps.include` for app shell dependencies.
- CJS dependencies and resolvable Next internals may remain explicitly optimized.

Required tests:

- A dependency imported only through a discovered app route is warmed before navigation.
- A source file under `app/` that is not a route is not used as an optimizer entry.
- No-MSW demo still works without app-level optimizer overrides.
- Notes demo redirect/navigation trace still works without mid-test reloads.

## Testing Strategy

Prefer tests that fail for the exact architecture regression.

Package-level tests:

- `request-router.test.ts`
- `routing-data.test.ts`
- `app-page-invoker.test.ts`
- `app-route-invoker.test.ts` if route handlers are implemented.
- `manifest-bridge/*.test.ts`
- `optimizer/next-entrypoints.test.ts`

Notes-demo browser tests:

- Request routing through `renderServer({ url })`.
- Next config redirects, rewrites, and headers.
- Client-side form/action redirects that end on real target UI.
- Multi-page navigation flow through notes app with trace view enabled.
- Cache/cookies/headers behavior after the router split.

No-MSW demo tests:

- Direct browser/server integration without MSW transport.
- Fonts and images still load through static media URLs.
- Route hydration still works without app-level optimizer workarounds.

Compatibility tests:

- If `@next/routing` wins: `16.2`, `latest`, `canary`.
- If `@next/routing` is rejected: keep `16.0`, `16.1`, `latest`, `canary`.

## Rollout Plan

Work in small commits. Each commit should keep CI green or be an obviously local checkpoint that is immediately followed by a fix.

### Slice 1: Support Matrix Trial

- Add `@next/routing` in the workspace.
- Change CI matrix to include `16.2`, `latest`, `canary`.
- Update README support section.
- Update package peer range if the architecture depends on `@next/routing`.
- Run package tests and notes demo.

Stop condition:

- If version alignment for `next@canary` and `@next/routing@canary` is unstable in CI, do not proceed until the matrix story is clear.

### Slice 2: Routing Data Adapter

- Add `routing-data.ts`.
- Convert loaded Next config/custom routes to `@next/routing` route data.
- Add focused unit tests using the notes-demo custom routes.
- Keep `testing-library.tsx` behavior unchanged for this slice.

Stop condition:

- If conversion requires reimplementing most of Next's route-builder logic, prefer importing more Next helpers or reject the approach.

### Slice 3: Request Router

- Add `request-router.ts`.
- Use `resolveRoutes()` to produce `NextRequestTarget`.
- Move page/route-handler matching out of `testing-library.tsx`.
- Delete local custom-route matching from `testing-library.tsx`.
- Preserve existing user behavior for same-origin redirects and headers.

Stop condition:

- If the new request router cannot pass the `afterFiles` exact-route shadow test without local phase-order patches, reject or narrow `@next/routing` use.

### Slice 4: Optimizer Entrypoints

- Add `virtual:vitest-plugin-rsc/next-entrypoints`.
- Drive optimizer entries from discovered route graph.
- Delete broad `app/**` and `src/app/**` optimizer entries.
- Add regression tests that prove non-route app files are not scan roots.

Stop condition:

- If Vite cannot use an async route-discovered virtual module as an optimizer entry, document the blocker and keep the broad glob only behind a clearly named temporary fallback.

### Slice 5: App Page Invoker

- Try real `AppPageRouteModule`.
- Compare code size and test behavior against the current synthetic module path.
- Keep whichever version is smaller and clearer.

Stop condition:

- If `AppPageRouteModule` adds more glue than it removes, isolate current render code into `app-page-invoker.ts` and defer full route-module alignment.

### Slice 6: App Route Invoker Decision

- Decide whether route handlers are part of the stacked architecture PR.
- If yes, implement `AppRouteRouteModule.handle()` path.
- If no, preserve explicit unsupported behavior and document it.

Stop condition:

- Do not add a local route-handler runner. Either use Next route modules or keep route handlers unsupported as render targets.

### Slice 7: Manifest Bridge Cleanup

- Move manifest bridge helpers out of `app-render.ts`.
- Add missing direct tests.
- Keep source links and adaptation notes.

Stop condition:

- Do not split tiny helpers just for file count. Split where ownership becomes easier to review.

## Fallback Plan

If `@next/routing` is not usable enough:

- Keep Next `16.0` and `16.1` compatibility.
- Still extract `request-router.ts` so `testing-library.tsx` shrinks.
- Keep local routing code only inside that module.
- Source-link the Next behavior it mirrors.
- Add tests for every supported phase.
- Mark the local router as temporary until adapter routing data is available across the supported Next matrix.

If `AppPageRouteModule` is not worth it:

- Keep direct `renderToHTMLOrFlight`.
- Move it into `app-page-invoker.ts`.
- Keep the synthetic route module source-linked.
- Avoid expanding render options without a user-visible test.

If route-manifest-driven optimizer entries are not possible:

- Keep a temporary fallback in `optimizer/next-entrypoints.ts`.
- Name it as a fallback, not the desired architecture.
- Add a test that fails if demo apps add broad app-shell ESM optimize includes.

## Merge Checklist

Before merging the PR, verify:

- README says the correct supported Next versions.
- CI matrix matches README.
- `docs/new-architecture.md` reflects the final architecture, not just the trial.
- This trial doc is either updated with final outcomes or replaced by entries in the stable architecture doc.
- `testing-library.tsx` does not contain broad request-routing logic.
- No broad app-source optimizer glob remains unless explicitly documented as temporary.
- No new webpack/Turbopack RSC graph was introduced.
- `@vitejs/plugin-rsc` still owns `"use client"`, `"use server"`, Server Actions, and Flight module references.
- All copied upstream code has source links and adaptation notes.
- Full notes-demo suite, no-MSW suite, package Next tests, typecheck, build, lint, and CI matrix are green.
