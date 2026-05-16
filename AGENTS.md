# Repository Guidance

## Commit And PR Titles

Use Conventional Commits for PR titles and for commits that land on `main`. Release Please reads commits on `main` to decide versions, generate changelogs, create GitHub releases, and publish npm packages.

Every commit that lands on `main` should be meaningful for the changelog or review history. Squash noisy, mechanical, or intermediate commits when they are better represented as one release note.

Good title examples for this repo:

- `feat: add RSC test helper`
- `fix: resolve Next.js cache mock`
- `perf: reduce plugin startup work`
- `chore: update Vite and Vitest tooling`
- `feat!: remove deprecated testing API`

While the package is pre-1.0, breaking changes are acceptable when intentional. Mark them with `!` in the type, such as `feat!: ...`, or add a `BREAKING CHANGE:` footer to the relevant commit body.

## Releases

Official npm `latest` releases are created by Release Please after its release PR is merged. Do not add long-lived npm token publishing or publish PR commits to npm `latest`.

Preview packages for PR commits are handled by `pkg.pr.new`, which publishes installable preview URLs outside the npm registry.

## Testing

Vitest projects that import `vitest-plugin-rsc` use the package exports. From the root, prefer the buildless test path: `pnpm test` (or `pnpm test:run`), which runs Vitest with `NODE_OPTIONS='--conditions=vitest-plugin-rsc-source'` so workspace tests load source files through the package export condition. Use `pnpm test:dist` when you specifically need to validate the built package output, and run `pnpm build` first if you intentionally run a command that consumes `dist` without that source condition.

Keep Vitest project definitions and coverage settings in the root `vitest.config.ts`. Vitest coverage is process-level config, so do not add `coverage` blocks to individual project configs.

For bigger feature work, run the full Next.js notes demo suite from the root (`pnpm test --project nextjs-notes-demo-browser --project nextjs-notes-demo-node`) before merging. It is the in-tree acceptance app and covers the realistic combinations of routing, cookies, cache, Server Actions, and MSW-routed transport.

## Plugin Architecture Mental Model

This repo is a Vitest Browser Mode RSC runtime. Do not assume a normal Node test runner and do not assume a running Next dev server. `renderServer` runs the React Server Components pipeline inside the Vitest browser process, with server modules evaluated through Vite environments and their output serialized as React Flight.

The important runtime shape is:

1. Server/RSC code is transformed and executed in the Vite `client` environment.
2. Client Components are resolved and hydrated in the Vite `react_client` browser environment.
3. SSR/document HTML for hydration is produced through the Vite `react_ssr` environment.
4. The final UI is asserted through `vitest/browser` in a real browser page.

The environment names are easy to misread:

- `client` is the RSC/edge-server environment, not the visible browser UI. It uses `react-server` and `edge-light` conditions and should define `process.env.NEXT_RUNTIME` as `"edge"`.
- `react_client` is the browser App Router/Client Component environment. It uses browser conditions, Next browser React aliases, and `process.env.NEXT_RUNTIME` as `""`.
- `react_ssr` is the browser-ish SSR environment used to turn Flight data into HTML for document hydration.

Because the "server" side runs in a browser-mode runtime, server code should be browser/edge-compatible. Prefer Web APIs (`fetch`, `Request`, `Response`, `Headers`, `URL`, `FormData`, Web Streams, Web Crypto) and in-memory test infrastructure. Do not add real filesystem, process, TCP, or Node server assumptions to tests or runtime code. Node compatibility shims are acceptable only when they mirror Next/Vite behavior and stay narrowly scoped.

`@vitejs/plugin-rsc` owns the RSC protocol. It is responsible for `"use client"`, `"use server"`, client references, server references, Server Action loading, Flight serialization/deserialization, and the Vite ModuleRunner bridge between environments. Do not replace that with Next webpack/Turbopack RSC bundling, webpack layers, RSC manifests, or a parallel module graph.

`"use cache"` is different from `"use client"` and `"use server"`, but it still goes through the RSC plugin transform path. `@vitejs/plugin-rsc` hoists inline `"use cache"` functions with `transformHoistInlineDirective`; Next owns the cache semantics, request/cache stores, cache handlers, tags, and invalidation behavior. This plugin must not hand the RSC graph to Next's RSC compiler to get there. Do not globally enable Next's RSC or Server Action transforms for `use cache`; add focused coverage and keep unsupported call shapes explicit instead.

The transport differs from production but preserves the same protocol shape. In production, the browser fetches Flight from a server endpoint. Here, Flight streams and client-reference resolution move between Vite environments inside the Vitest browser runtime. The bridge relies on Vite's ModuleRunner and browser/HMR websocket infrastructure. Do not start a Next dev server, add Next's webpack/Turbopack HMR client, or bypass the Vite environment bridge with ad hoc HTTP endpoints.

Next.js integration should feed real Next behavior into that Vite RSC graph:

- Route renders use Next route discovery, `next-app-loader` loader trees, `renderToHTMLOrFlight`, and `NextAppRouter`.
- Next config, env defines, runtime aliases, cache/request stores, cookies, headers, redirects, access fallbacks, fonts, images, and metadata should come from installed `next/dist/...` modules whenever practical.
- Local code should be a boundary adapter between Next, Vite, Vitest, and `@vitejs/plugin-rsc`, not a second implementation of Next.

There are two action transports:

- Without MSW, Server Actions are called directly inside the test runtime. This is good for focused action-and-rerender tests.
- With MSW, Next RSC fetches and Server Action POSTs travel as real browser requests through `nextRscRequestHandlers`. Use this path when request headers, router refresh, cache revalidation, or Next's action response protocol matter.

Client navigation and redirects must be tested as real browser behavior. Do not add navigation spy APIs or fake router assertions. Assert `window.location` and target-route UI after clicks, `router.push`/`replace`, form submissions, and Server Action redirects.

Dependency optimization is part of correctness. Hidden Vite environments must not discover app-shell dependencies mid-test because that can trigger reloads or blank pages. The base RSC plugin copies optimizer scan roots from the visible Vitest browser client into hidden `react_client` and `react_ssr` runners, and the Next plugin contributes app directory entries. Do not paper over late discovery by adding broad ESM app-shell dependencies to demo `optimizeDeps.include`; explicit prebundling should be limited to CJS dependencies, resolvable Next internals, or a focused optimizer regression.

When debugging blank screens at the end of a browser test, think first about real browser navigation, Vite optimizer reloads, missing client references, document hydration, or MSW/RSC request handling. Avoid fixes that only silence the symptom, such as app-local mocks, hard redirects, or custom router state.

## Worktree Safety

Before editing, committing, rebasing, or pushing, verify the working directory, branch, and status with `pwd`, `git branch --show-current`, and `git status --short --branch`. If the user names a specific branch or PR worktree, use only that branch/worktree for the task. Stop instead of editing when the current branch does not match the requested work.

For this Next fidelity effort, the stable adapter reference lives in `docs/nextjs-adapter-architecture.md`, the App Router fidelity source map lives in `docs/nextjs-app-router-fidelity-architecture.md`, and the active fidelity architecture tracker lives in `docs/nextjs-fidelity-architecture-tracker.md`. Keep those files updated when adding, completing, or intentionally dropping a Next.js fidelity task.

Treat that backlog as prioritized, not flat. Work on P0 items before expanding scope; only pick P1/P2 work when the related P0 foundation is done or explicitly deferred.

## Next.js Integration Guidelines

This package should behave like Next.js where users observe Next.js behavior, but it should not grow a parallel Next.js implementation. The goal is less glue over time: prefer deleting local adapters when the same behavior can be delegated to Next, React, Vite, Vitest, or `@vitejs/plugin-rsc`.

Use real Next.js code paths whenever possible. Prefer imports from `next/dist/...`, real Next loaders/transforms/helpers, or small copied sections from Next over hand-written approximations, especially for compiler features, routing conventions, metadata, fonts, images, cache, cookies, headers, and App Router behavior. Next internals are acceptable when they buy fidelity, but keep each adapter narrow, version-aware where needed, and covered by tests for the supported Next versions.

Use local source checkouts as references for intent, and installed package files as the runtime import target. Prefer the upstream clones below unless the user explicitly asks to compare a fork or branch:

- Next.js: `~/code/github/vercel/next.js`
- React: `~/code/github/facebook/react`
- Vite: `~/code/github/vitejs/vite`
- Vitest: `~/code/github/vitest-dev/vitest`
- `@vitejs/plugin-rsc`: `~/code/github/vitejs/vite-plugin-react/packages/plugin-rsc`
- Storybook Next.js Vite plugin: `~/code/github/storybookjs/vite-plugin-storybook-nextjs`

There are local forks and duplicate checkouts, including `~/code/github/vite`, `~/code/github/vitest`, and `~/code/github/vite-plugin-react`. Treat those as secondary references for local experiments, not the default source of truth.

When adding or reviewing fidelity work, inspect the relevant upstream source first, then choose the smallest Vite adapter around the matching installed package module such as `next/dist/...`, `vite`, `vitest`, or `@vitejs/plugin-rsc`.

Every adapter that mirrors Next compiler, webpack loader/plugin, Turbopack, or runtime bootstrap behavior must keep a nearby upstream GitHub source link in the code, even when no code is copied verbatim. The link should point at the exact Next/Vite/Vitest/RSC source that defines the behavior being adapted, followed by a short note explaining why the Vite/Vitest adapter exists.

For any missing Next.js behavior, use this decision order. Earlier options are better because they usually mean less local glue:

1. Import and call the relevant installed framework/runtime module directly.
2. If direct import is not possible, invoke the real Next loader, compiler transform, webpack/turbopack helper, or runtime helper behind a narrow Vite/Vitest adapter.
3. If the implementation exists only inside Next's compiler/bundler files, import it directly when that works. If it cannot be imported safely, copy the smallest upstream block with `Begin copy` markers, source links, and an adaptation note.
4. Only add local behavior as a last resort. It must explain why upstream code cannot be used and must include a regression test for the user-visible behavior.

Keep ownership boundaries explicit. Next.js owns framework semantics: route discovery, loader trees, metadata conventions, app render behavior, `next/font`, static image imports, Next env defines, and Next runtime/polyfill behavior. `@vitejs/plugin-rsc` owns the RSC module graph: `"use client"`, `"use server"`, client references, server references, Server Action transport, and browser/server graph separation. Vitest owns the test runner and browser harness. This plugin should only adapt those systems to each other.

The Storybook Next.js Vite plugin is useful precedent for loading Next config, env, SWC bindings, `getDefineEnv`, `load-jsconfig`, `find-pages-dir`, and React/Next aliases through `next/dist` imports. Do not copy its lower-fidelity approximations for features where this plugin can use more of Next directly. In particular, Next transforms are desirable: `next/font`, `next/dynamic`, styled-jsx, and compiler-driven imports should use Next's SWC/compiler transform with options aligned to Next's own loader options. Static image imports should use Next's image loader rather than reimplementing image metadata with generic image-size logic.

Do not replace `@vitejs/plugin-rsc` with Next's webpack or Turbopack RSC bundling layer. Vite RSC owns the Vite module graph, `"use client"` handling, client references, server references, and browser/server transport. Next integration code should feed real Next runtime behavior into that layer, not generate webpack manifests, webpack layers, or a second RSC graph.

Webpack/Turbopack compiler files are valid sources of truth. If a Next feature's real implementation lives in a webpack loader, Turbopack transform/helper, or shared compiler file, prefer importing and invoking that real code when it works. Isolate it behind a Vite adapter, document why that compiler path is needed, and add a regression test proving the user-visible Next behavior. Do not build a second webpack/Turbopack RSC graph, layer graph, manifest graph, or runtime just to reuse those pieces.

Use Next's transform layer for source-level Next features instead of regex transforms. Do not enable Next's RSC or Server Action transforms globally unless there is a specific test proving it does not conflict with `@vitejs/plugin-rsc`.

Keep compatibility shims small, explicit, and as close to Next.js as possible. If Next installs a global, injects a polyfill, or relies on webpack `ProvidePlugin` behavior, mirror that behavior through the narrowest Vite/Vitest adapter we can. Prefer importing Next's bootstrap/runtime code, or copying the relevant upstream block, over inventing a local substitute. Process, Buffer, WebSocket, document, and browser runtime shims are acceptable when they reflect real Next behavior; custom behavior beyond Next should be treated as high-risk, documented with a source reference, and covered by a regression test that fails without it.

When copying or adapting code from Next.js, wrap it in clear markers and include the upstream source path or permalink plus a short adaptation note. Use `Begin copy` / `End copy` only for mechanically copied upstream code. Use `Begin adapted` / `End adapted` for Vite/Vitest boundary code that deliberately translates concrete upstream Next loader, template, runtime, manifest plugin, compiler option, or routing conversion behavior:

```ts
// Begin copy: Next.js <behavior/name>
// Source: https://github.com/vercel/next.js/blob/<sha>/<path>
// Adaptation: <why this differs for Vite/Vitest tests>
...
// End copy

// Begin adapted: Next.js <behavior/name>
// Source: https://github.com/vercel/next.js/blob/<sha>/<path>
// Adaptation: <which Vite/Vitest boundary forces this translation>
...
// End adapted
```

Tests should cover framework features, not just demo behavior. Every supported Next API, route convention, page export, or runtime behavior touched by the plugin should have a focused test in `playground/nextjs-notes-demo`. Package-level unit tests in `packages/vitest-plugin-rsc/src/nextjs` are still useful for plugin internals, transforms, aliases, and loader adapters, but they do not replace notes-demo coverage for user-visible Next behavior. Do not add app-local mocks to make the notes demo pass when the plugin can provide the behavior for every user.

For Next.js integration work, rebuild before running tests that consume package output. Use non-default Vitest API ports, for example `--api 52643`, to avoid colliding with other local runs. Put tests in the notes demo by default. Use no-MSW fixtures only when the behavior specifically requires proving the no-MSW transport path.

Before merging Next.js integration changes, check that:

- no regex transform duplicates a Next SWC transform;
- no notes-demo-only mock replaces behavior the plugin can provide globally;
- no webpack/Turbopack RSC graph, manifest, or layer code replaces `@vitejs/plugin-rsc`;
- glue is being removed or narrowed where real Next/Vite/Vitest/RSC code can own the behavior;
- every shim names the upstream Next/Vite/Vitest behavior it mirrors;
- every copied block has source links and an adaptation note;
- every important Next API or convention touched by the change has focused notes-demo coverage.
