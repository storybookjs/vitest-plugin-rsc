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

For bigger feature work, run the full Next.js notes demo suite (`pnpm --dir playground/nextjs-notes-demo exec vitest run`) before merging. It is the in-tree acceptance app and covers the realistic combinations of routing, cookies, cache, Server Actions, and MSW-routed transport.

## Next.js Integration Guidelines

This package should behave like Next.js where users observe Next.js behavior, but it should not grow a parallel Next.js implementation. The goal is less glue over time: prefer deleting local adapters when the same behavior can be delegated to Next, React, Vite, Vitest, or `@vitejs/plugin-rsc`.

Use real Next.js code paths whenever possible. Prefer imports from `next/dist/...`, real Next loaders/transforms/helpers, or small copied sections from Next over hand-written approximations, especially for compiler features, routing conventions, metadata, fonts, images, cache, cookies, headers, and App Router behavior. Next internals are acceptable when they buy fidelity, but keep each adapter narrow, version-aware where needed, and covered by tests for the supported Next versions.

Use local source checkouts as references for intent, and installed package files as the runtime import target. Prefer the upstream clones below unless the user explicitly asks to compare a fork or branch:

- Next.js: `/Users/kasperpeulen/code/github/vercel/next.js`
- React: `/Users/kasperpeulen/code/github/facebook/react`
- Vite: `/Users/kasperpeulen/code/github/vitejs/vite`
- Vitest: `/Users/kasperpeulen/code/github/vitest-dev/vitest`
- `@vitejs/plugin-rsc`: `/Users/kasperpeulen/code/github/vitejs/vite-plugin-react/packages/plugin-rsc`
- Storybook Next.js Vite plugin: `/Users/kasperpeulen/code/github/storybookjs/vite-plugin-storybook-nextjs`

There are local forks and duplicate checkouts, including `/Users/kasperpeulen/code/github/vite`, `/Users/kasperpeulen/code/github/vitest`, and `/Users/kasperpeulen/code/github/vite-plugin-react`. Treat those as secondary references for local experiments, not the default source of truth.

When adding or reviewing fidelity work, inspect the relevant upstream source first, then choose the smallest Vite adapter around the matching installed package module such as `next/dist/...`, `vite`, `vitest`, or `@vitejs/plugin-rsc`.

For any missing Next.js behavior, use this decision order. Earlier options are better because they usually mean less local glue:

1. Import and call the relevant installed framework/runtime module directly.
2. If direct import is not possible, invoke the real Next loader, compiler transform, webpack/turbopack helper, or runtime helper behind a narrow Vite/Vitest adapter.
3. If the implementation exists only inside Next's compiler/bundler files, import it directly when that works. If it cannot be imported safely, copy the smallest upstream block with `Begin copy` markers, source links, and an adaptation note.
4. Only add local behavior as a last resort. It must explain why upstream code cannot be used and must include a regression test for the user-visible behavior.

Keep ownership boundaries explicit. Next.js owns framework semantics: route discovery, loader trees, metadata conventions, app render behavior, `next/font`, static image imports, Next env defines, and Next runtime/polyfill behavior. `@vitejs/plugin-rsc` owns the RSC module graph: `"use client"`, `"use server"`, client references, server references, Server Action transport, and browser/server graph separation. Vitest owns the test runner and browser harness. This plugin should only adapt those systems to each other.

The Storybook Next.js Vite plugin is useful precedent for loading Next config, env, SWC bindings, `getDefineEnv`, `load-jsconfig`, `find-pages-dir`, and React/Next aliases through `next/dist` imports. Do not copy its lower-fidelity approximations for features where this plugin can use more of Next directly. In particular, Next transforms are desirable: `next/font`, `next/dynamic`, styled-jsx, and compiler-driven imports should use Next's SWC/compiler transform with options aligned to Next's own loader options. Static image imports should use Next's image loader rather than reimplementing image metadata with generic image-size logic.

Do not replace `@vitejs/plugin-rsc` with Next's webpack or Turbopack RSC bundling layer. Vite RSC owns the Vite module graph, `"use client"` handling, client references, server references, and browser/server transport. Next integration code should feed real Next runtime behavior into that layer, not generate webpack manifests, webpack layers, or a second RSC graph.

Webpack/Turbopack compiler files are valid sources of truth. If a Next feature's real implementation lives in a webpack loader, Turbopack transform/helper, or shared compiler file, prefer importing and invoking that real code when it works. Isolate it behind a Vite adapter, document why that compiler path is needed, and add a regression test proving the user-visible Next behavior. Do not build a second webpack/Turbopack RSC graph just to reuse those pieces.

Use Next's transform layer for source-level Next features instead of regex transforms. Do not enable Next's RSC or Server Action transforms globally unless there is a specific test proving it does not conflict with `@vitejs/plugin-rsc`.

Keep compatibility shims small, explicit, and as close to Next.js as possible. If Next installs a global, injects a polyfill, or relies on webpack `ProvidePlugin` behavior, mirror that behavior through the narrowest Vite/Vitest adapter we can. Prefer importing Next's bootstrap/runtime code, or copying the relevant upstream block, over inventing a local substitute. Process, Buffer, WebSocket, document, and browser runtime shims are acceptable when they reflect real Next behavior; custom behavior beyond Next should be treated as high-risk, documented with a source reference, and covered by a regression test that fails without it.

When copying code from Next.js, wrap it in clear copy markers and include the upstream source path or permalink plus a short adaptation note:

```ts
// Begin copy: Next.js <behavior/name>
// Source: https://github.com/vercel/next.js/blob/<sha>/<path>
// Adaptation: <why this differs for Vite/Vitest tests>
...
// End copy
```

Tests should cover framework features, not just demo behavior. Add focused unit coverage for each supported Next API or convention touched by the plugin, and keep the notes demo suite as acceptance coverage for realistic combinations. Do not add app-local mocks to make the notes demo pass when the plugin can provide the behavior for every user.

For Next.js integration work, rebuild before running tests that consume package output. Use non-default Vitest API ports, for example `--api 52643`, to avoid colliding with other local runs. Prefer the notes demo for acceptance coverage over no-MSW fixtures unless the behavior specifically requires a smaller fixture.

Before merging Next.js integration changes, check that:

- no regex transform duplicates a Next SWC transform;
- no notes-demo-only mock replaces behavior the plugin can provide globally;
- no webpack/Turbopack RSC graph, manifest, or layer code replaces `@vitejs/plugin-rsc`;
- glue is being removed or narrowed where real Next/Vite/Vitest/RSC code can own the behavior;
- every shim names the upstream Next/Vite/Vitest behavior it mirrors;
- every copied block has source links and an adaptation note;
- every important Next API or convention touched by the change has focused unit coverage.
