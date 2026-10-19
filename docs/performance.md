# Performance Benchmarks

This repo keeps three benchmark layers:

- Repo-local Vitest command benchmarks are the portable baseline. They run in CI, produce JSON artifacts, and cover `playground/rsc-vitest-demo` and the Next.js notes demo, which doubles as the comprehensive acceptance app.
- An optional Vitest bench micro layer for render-helper hotspots. It is supporting evidence only; the main acceptance signal is end-to-end Vitest browser command runtime.
- Optional page load benchmarks of a static build: of `playground/nextjs-e2e-demo`, `pnpm perf:static`, and of the Storybook of `playground/nextjs-notes-demo`, `pnpm perf:storybook`. See [A Static Build Per Page Load](#a-static-build-per-page-load).

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
pnpm perf:static --iterations 3 --builds production --routes /,/fonts --profiles cable
```

It builds `playground/nextjs-e2e-demo` with `vite build` twice, with `VITEST_PLUGIN_RSC_BUILD=development` and `production`, the default of `vite build`, into `artifacts/perf/local/static-build/dist-*`. It serves each from a server of files and opens the host page with Playwright's Chromium, for six routes of the build test, for a node of the host, and for `client.html`, a page of the host that renders a Client Component with `loadClientModule()` and opens no page of the app. Each iteration opens a route twice: cold, in a new browser context, and warm, in a new page of the same context. It writes `results.json`, with every request of every load, and `summary.md`, the medians, which it also prints.

- Each load runs over each network of `--profiles`, both by default. `local` is localhost as it is: a request costs next to nothing, so the times are about the CPU. `cable` is a fast line as CDP's `Network.emulateNetworkConditions` makes one: 50 Mbit/s down, 10 up, and 20 ms more for every request, so the round trips show.
- The server serves the build as the README has a static host serve it, in [A Static Build](../README.md#a-static-build): compressed with brotli, the files under `assets/`, `_next/static/` and `vitest-plugin-rsc/*/assets/` immutable, every other file with an `ETag` and `no-cache`, so a warm load gets a 304 for it, as for `modules.json`. Bytes and requests come from CDP's Network domain: what came over the wire, headers included, and what came from the cache. The build table has the gzip and brotli sizes of each `modules.json`.
- Ready is the time from the start of the navigation until the host sets `__hostState` to `"ready"`. Styled is the first frame with text of the page, beyond the host's status line, and every stylesheet of the document loaded. The load counts what the page fetches after ready until the network is quiet, as a visual test service waits for images and fonts. Busy time is how long Chromium's main thread was busy until ready, its `TaskDuration`. `results.json` also has its `ScriptDuration`, which leaves out what runs after an `await` of a fetch, most of the host, so take a CPU profile to see what the time is spent on. In production the load includes Next's prefetch of the links on the page.
- Round trips: the host marks when it asks for the page of the app, `performance.mark("host-open")` in `host/main.tsx`. From there the summary has how long after it the page asked for the first script of the route, how long its first stylesheet, which comes with the HTML of the route, waited after that (negative when it comes first), and the serial waves of scripts in between: a script that starts after one of its wave has ended may have waited for it, and starts the next wave. A route without CSS counts its waves until ready. It also has the requests of each layer's `modules.json`, the 304s among them, and when the last ended. `client.html` fetches a file of its own, `host.json`, as a framework fetches its index: the summary has when that request started after the ssr layer's file ended, negative when the page did not wait for the layer.
- Transfer-bound and chain-bound apart, until ready: wire ms is the time the bytes on the wire take at the download rate of the network (none on localhost), and only fewer bytes make it shorter. Load waves are the serial waves of the requests to the server, and idle ms the time between them in which no request was in flight; fewer round trips make those shorter. A request that the cache answers costs no round trip and is no wave.
- The server of files speaks HTTP/1.1, so Chromium sends at most six requests to it at once: a host with HTTP/2 gains more from requests that start together. The probe of the styled mark reads the page's text every frame, which the busy time includes.
- The order of the loads in an iteration is shuffled with `--seed`, 1 by default, so that a slow minute of the machine falls on no load in particular, and a run can be made again in the same order. The browser is the Chromium of the `playwright` of the lockfile; the summary names its version.
- The run fails when the host reports an error, with the errors of the page. Other errors of a page are in the summary. `--skip-build` measures the builds that are there.

The same for the Storybook of the notes demo, which loads a story in a tab of its own, `iframe.html?id=…`, as Chromatic does:

```sh
pnpm perf:storybook
pnpm perf:storybook --stories ui-button--pressed --profiles local
```

It builds it as the Chromatic workflow does, `pnpm build` of the packages and `storybook build` against them, into `artifacts/perf/local/storybook/storybook-static`, and measures a story of a file with `"use client"`, `ui-button--pressed`, a story of a page of the app, `pages-notes--with-notes`, and a docs page, `ui-button--docs`. Each loads cold and warm over each network, from the same server and in an order of the seed, as above. Styled is the first frame with text of the story, and not Storybook's "preparing", with every stylesheet loaded, and done is when the render ended with its play function, or the docs page shows every story on it rendered, as the notes demo's `e2e/stories.ts` waits for them. The summary has the bytes by kind, the requests of each `modules.json`, wire ms, waves and idle ms until done, and when Storybook asked for its `index.json` after the ssr layer's file ended; `results.json` has every request. The run fails on a story that does not end as `finished`. `--skip-build` measures the build that is there.

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
