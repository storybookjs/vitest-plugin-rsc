# Performance Benchmarks

This repo keeps two benchmark layers:

- Repo-local Vitest command benchmarks are the portable baseline. They run in CI, produce JSON artifacts, and cover every playground that ships with this repository — including the Next.js notes demo, which doubles as the comprehensive acceptance app.
- An optional Vitest bench micro layer for render-helper hotspots. It is supporting evidence only; the main acceptance signal is end-to-end Vitest browser command runtime.

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

`playground/nextjs-notes-demo` is the in-tree acceptance app. It exercises Next.js App Router routing, `headers()` / `cookies()`, `next/cache`, Server Actions, MSW-routed transport, Better Auth, Drizzle, PGlite test databases, and shadcn/ui — the realistic combinations the plugin needs to keep working.

The `nextjs-notes-demo:cold:all-tests` and `nextjs-notes-demo:warm:all-tests` scenarios above run that suite under `hyperfine`, so feature work that could affect runtime behavior should look at those numbers before merging.

For feature PRs, report:

- The `pnpm perf` result and artifact location.
- Optional `pnpm perf:micro` evidence when it helps explain a change.
- Any known environmental caveats, such as a laptop under load or an intentionally small run count.

## CI

The `Performance` workflow is manual via `workflow_dispatch` and scheduled weekly. It installs `hyperfine`, builds the package, runs repo-local benchmarks on Node 24 with pnpm, and uploads `artifacts/perf`.
