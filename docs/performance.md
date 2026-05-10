# Performance Benchmarks

This repo keeps two benchmark layers:

- Repo-local Vitest command benchmarks are the portable baseline. They run in CI, produce JSON artifacts, and cover the fixtures that ship with this repository.
- `epic-rsc-stack` is the comprehensive real-world acceptance benchmark. Run it locally before merging feature PRs that could affect runtime behavior and before cutting `0.1.0`.

There is also an optional Vitest bench micro layer for render-helper hotspots. It is supporting evidence only; the main acceptance signal is end-to-end Vitest browser command runtime.

The suite is intentionally informational for now. It fails when benchmark commands fail, but it does not enforce timing thresholds or block PRs on small regressions.

## Prerequisites

- Node 24 and pnpm for this repository.
- Chromium for Vitest browser mode: `pnpm --dir playground/rsc-vitest-demo exec playwright install --with-deps --only-shell chromium`.
- `hyperfine` on your PATH for whole-command benchmarks.
- For `epic-rsc-stack`, keep a local checkout available. The perf script prepares an ignored generated copy and installs this repo's packed candidate plugin build into that copy before measuring.

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
- Cold and warm focused smoke runs for `playground/nextjs-notes-demo`.

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

## Real-World Acceptance: epic-rsc-stack

The epic stack is the primary confidence signal for runtime-sensitive work. The committed scripts do not depend on a machine-specific absolute path. By default they look for `../epic-rsc-stack`; override that with `--app` or `EPIC_RSC_STACK_PATH`.

Before timing, `pnpm perf:epic`:

- Builds `packages/vitest-plugin-rsc`.
- Packs it with `pnpm pack`.
- Copies the epic app into an ignored generated workspace under `artifacts/perf`, excluding `.git`, `node_modules`, build/cache outputs, coverage, and `.env*` files.
- Rewrites only the generated workspace's `package.json` so `vitest-plugin-rsc` points at the local tarball, then runs `bun install --no-cache --ignore-scripts`.
- Hashes the source package `dist` directory and installed `node_modules/vitest-plugin-rsc/dist` directory, failing if they differ.
- Clears `.vite` for cold scenarios with `hyperfine --prepare` so the cleanup is outside the measured command.

Run the real-world benchmark:

```sh
pnpm perf:epic
```

Run a one-sample acceptance smoke check:

```sh
pnpm perf:epic:smoke
```

Or point at another checkout:

```sh
pnpm perf:epic -- --app ../epic-rsc-stack
EPIC_RSC_STACK_PATH=../epic-rsc-stack pnpm perf:epic
```

The epic mode runs cold and warm browser-project Vitest commands in the generated app copy and writes artifacts under `artifacts/perf/local/commands` unless `PERF_OUTPUT_DIR` is set. `perf:epic:smoke` uses the same setup with one `hyperfine --runs 1 --warmup 0` browser-project command, so it is the quick "does this still work against Epic Stack?" check. `epic-preparation.json` is written before timing starts, so failed acceptance runs still record the source app git SHA, generated workspace path, tarball path/hash, installed package metadata, and matching source/installed dist hashes.

If the app has its coverage provider installed, include a warm coverage scenario:

```sh
pnpm perf:epic -- --coverage
PERF_EPIC_COVERAGE=1 pnpm perf:epic
```

For feature PRs and the `0.1.0` release readiness check, report:

- The repo-local `pnpm perf` result and artifact location.
- The `pnpm perf:epic` result and artifact location.
- Optional `pnpm perf:micro` or epic coverage evidence when it helps explain a change.
- Any known environmental caveats, such as a laptop under load or an intentionally small run count.

## CI

The `Performance` workflow is manual via `workflow_dispatch` and scheduled weekly. It installs `hyperfine`, builds the package, runs repo-local benchmarks on Node 24 with pnpm, and uploads `artifacts/perf`.

CI does not run `epic-rsc-stack` because that app is external to this repository. Use the local epic mode as the comprehensive acceptance benchmark before merging runtime-sensitive work.
