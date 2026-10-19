# Performance Benchmarks

This repo keeps three benchmark layers:

- Repo-local Vitest command benchmarks are the portable baseline. They run in CI, produce JSON artifacts, and cover `playground/rsc-vitest-demo` and the Next.js notes demo, which doubles as the comprehensive acceptance app.
- An optional Vitest bench micro layer for render-helper hotspots. It is supporting evidence only; the main acceptance signal is end-to-end Vitest browser command runtime.
- An optional page load benchmark of the static build of `playground/nextjs-e2e-demo`, `pnpm perf:static`: see [A Static Build Per Page Load](#a-static-build-per-page-load).

The suite is intentionally informational for now. It fails when benchmark commands fail, but it does not enforce timing thresholds or block PRs on small regressions.

## Prerequisites

- Node 24 and pnpm for this repository.
- Chromium for Vitest browser mode: `pnpm --dir playground/rsc-vitest-demo exec playwright install --with-deps --only-shell chromium`.
- `hyperfine` on your PATH for whole-command benchmarks.

## Repo-Local Benchmarks

Run the portable suite:

```sh
pnpm perf
```

This writes ignored artifacts under `artifacts/perf/local`:

- `commands/*.hyperfine.json` for whole-command timings.
- `commands/summary.md` for a concise command benchmark summary.

The whole-command layer currently covers:

- Cold and warm browser-mode `vitest run` for `playground/rsc-vitest-demo`.
- A warm focused RSC action, payload, and client-boundary scenario for `playground/rsc-vitest-demo`.
- Cold and warm full `vitest run` for `playground/nextjs-notes-demo` (the in-tree acceptance baseline).

Cold scenarios use `hyperfine --prepare` to clear Vite/Vitest cache directories outside the measured command. Warm scenarios use `hyperfine --warmup` to prime caches before measured runs.

The optional micro layer currently covers:

- Server component rendering through `renderServer`.
- Client component rendering plus a browser update.

You can tune runs without editing committed files:

```sh
PERF_HYPERFINE_RUNS=5 pnpm perf:commands
VITE_PERF_BENCH_TIME_MS=500 VITE_PERF_BENCH_ITERATIONS=20 pnpm perf:micro
```

## A Static Build Per Page Load

A host that publishes a static build can load every page of it in an iframe of its own, as a visual test service does, so what a build costs is the cost of one fresh page load, route by route:

```sh
pnpm perf:static
pnpm perf:static --iterations 3 --builds production --routes /,/fonts
```

It builds `playground/nextjs-e2e-demo` with `vite build` twice, with `VITEST_PLUGIN_RSC_BUILD=development` and `production`, the default of `vite build`, into `artifacts/perf/local/static-build/dist-*`. It serves each from a server of files and opens the host page with Playwright's Chromium, for six routes of the build test and for a node of the host. Each iteration opens a route twice: cold, in a new browser context, and warm, in a new page of the same context. It writes `results.json`, with every request of every load, and `summary.md`, the medians, which it also prints.

- Bytes and requests come from CDP's Network domain: what came over the wire, headers included, and what came from the cache. The server of files does not compress, so the bytes are uncompressed. The gzip column is what the same files would be gzipped, computed with `node:zlib`, and the build table has the gzip and brotli sizes of each `modules.json`.
- The server sends every file with an `ETag`. The files under `assets/` and `_next/static/` have a hash in their names and are immutable for the browser. Any other file is `no-cache`, so a warm load gets a 304 for it, as for `modules.json`.
- Ready is the time from the start of the navigation until the host sets `__hostState` to `"ready"`. The load counts what the page fetches after that until the network is quiet, as a visual test service waits for images and fonts. Busy time is how long Chromium's main thread was busy until then, its `TaskDuration`. `results.json` also has its `ScriptDuration`, which leaves out what runs after an `await` of a fetch, most of the host, so take a CPU profile to see what the time is spent on. In production the load includes Next's prefetch of the links on the page.
- The server is on localhost, so the times are about the CPU. Bytes and requests are what a network adds.
- The run fails when the host reports an error, with the errors of the page. Other errors of a page are in the summary. `--skip-build` measures the builds that are there.

## Comparing Branches

Capture `main` first:

```sh
git switch main
pnpm install --frozen-lockfile
pnpm build
PERF_OUTPUT_DIR=artifacts/perf/main pnpm perf
```

Then capture the candidate branch:

```sh
git switch <candidate-branch>
pnpm install --frozen-lockfile
pnpm build
PERF_OUTPUT_DIR=artifacts/perf/candidate pnpm perf
```

For Vitest bench comparisons, use the saved JSON from `main`:

```sh
PERF_OUTPUT_DIR=artifacts/perf/candidate \
  pnpm perf:micro -- --compare artifacts/perf/main/vitest-bench/render.json
```

For command-level comparisons, compare the two `commands/summary.md` files and keep the raw hyperfine JSON artifacts attached to the PR or CI run.

## Acceptance: nextjs-notes-demo

`playground/nextjs-notes-demo` is the in-tree acceptance app. Its tests open the routes of the app with `renderServer({ url })`. It exercises Next.js App Router routing, `headers()` / `cookies()`, Server Actions, Better Auth, Drizzle, PGlite test databases, and shadcn/ui — the realistic combinations the plugin needs to keep working.

The `nextjs-notes-demo:cold:all-tests` and `nextjs-notes-demo:warm:all-tests` scenarios above run that suite under `hyperfine`, so feature work that could affect runtime behavior should look at those numbers before merging.

For feature PRs, report:

- The `pnpm perf` result and artifact location.
- Optional `pnpm perf:micro` evidence when it helps explain a change.
- Any known environmental caveats, such as a laptop under load or an intentionally small run count.

## CI

The `Performance` workflow is manual via `workflow_dispatch` and scheduled weekly. It installs `hyperfine`, builds the package, runs repo-local benchmarks on Node 24 with pnpm, and uploads `artifacts/perf`.
