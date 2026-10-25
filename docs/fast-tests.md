# Fast tests

How to get the quickest feedback loop for the end-to-end scenarios of a Next.js App Router app: what a test costs, where the time goes, and what each way to make it cheaper gives up. Every number was measured, and comes with the conditions it was measured under. This assumes you've read the [quick start](../README.md#quick-start) and the [Next.js guide](nextjs-guide.md).

> [!NOTE]
> **Status, 25 October 2026.** None of this is released yet. Fast mode and its speed features are on [#251](https://github.com/storybookjs/vitest-plugin-rsc/pull/251), the pull request of fast mode, and so is everything below unless it names a draft pull request on top of it:
>
> - On #251: both modes and every speed feature, `watchDom` in both modes, the wait for the next change of the document (#266), the data layer of the notes apps (#262), one CommonJS object per ES module in the pre-bundles (#264), the patch of `@vitest/mocker` (#258), the profile config at any number of workers (#271), the stylesheets of a route asked once per run (#268), the warmup of the ssr layer (#275), and the benchmark on Bun.
> - On a draft pull request: `dom-locators` (#255).
>
> Most numbers were measured on earlier states of #251, and each section says which. The CPU profiles, the runs with several workers and the `dom-locators` column ran on #251 with #255 merged in, which adds the benchmark's `dom-locators` tests and changes nothing in the plugin.

- [The quickest loop](#the-quickest-loop)
- [What a test costs](#what-a-test-costs)
- [The two modes](#the-two-modes)
- [Waiting for the page](#waiting-for-the-page)
- [The test's own code](#the-tests-own-code)
- [The data layer](#the-data-layer)
- [The start of a run](#the-start-of-a-run)
- [Workers](#workers)
- [Measure your own app](#measure-your-own-app)
- [How the numbers were measured](#how-the-numbers-were-measured)

## The quickest loop

On the 500 tests of the notes benchmark, on an M1 Pro:

- **Wait with `expect.element()` and `expect.poll()`, without an `interval`.** With `watchDom`, on in both modes, they look again on the next change of the page: a run of fidelity mode takes about 26 s instead of 60. See [Waiting for the page](#waiting-for-the-page).
- **Fast mode for the loop, fidelity mode in CI.** 15.7–16.3 s instead of 23.6 s. See [The two modes](#the-two-modes).
- **4 workers.** 7.1 s instead of 14.8 s, with `dom-locators`. See [Workers](#workers).
- **Clicks and queries in the page.** A click of Vitest's goes to Playwright and back, about 50 ms; one of `user-event` takes 0.1 ms. `dom-locators` (draft #255) takes another 2.0 ms off a test. See [The test's own code](#the-tests-own-code).
- **Vitest on Bun.** A run of one test file starts its first test 0.86 s sooner than on Node.js with `pnpm exec`. See [The start of a run](#the-start-of-a-run).
- **A warm dependency cache, and a `cacheDir` per config.** Without a cache, one file takes about 1 s longer. See [A cold cache](#a-cold-cache).
- **Fewer queries, prepared once.** Drizzle's prepared statements took 0.7 ms off a test. See [The data layer](#the-data-layer).

Every number on this page ran Next and React in production, `vitestPluginNext({ build: "production" })`, which is still experimental and not the default; the [Next.js guide](nextjs-guide.md#development-or-production) says what changes.

## What a test costs

A run of the 500 tests takes **15.7–16.3 s in fast mode and 23.6 s in fidelity mode**, with the clicks and fills of Testing Library's `user-event`, on #251 before #262. Both come from two A/Bs: 5 runs each in fast mode (σ 0.13 and 0.76 s, at different loads of the machine), 3 and 5 in fidelity mode (σ 0.5–1.3 s). Of a fast run, about 2.2 s is outside the test files and 13.5–14 s are the tests: 27–28 ms per test.

### Where the time goes

Everything runs on one thread, the main thread of the test's tab: the test, the server, the database and the client, one after the other. The thread is busy 95% of a test, so the cost of a test is the sum of what runs on it. A CPU profile of that thread, by who owns the code:

| owner        | ms per test | of which                                                                                                                                            |
| ------------ | ----------: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| the app      |         5.3 | the database 5.1: 19.9 queries, 0.32 ms each (Postgres in WebAssembly 2.2, PGlite's JS 1.1, Drizzle 0.8, the tests' seeds and resets 1.0)           |
| Next.js      |         5.4 | the server 2.5 (routing, rendering, Server Actions, caches), the client 2.9 (router, history, `<Link>`, a forced layout after every navigation 0.7) |
| React        |         4.7 | rendering 2.0, committing to the DOM 1.2, the events of controlled inputs 0.8                                                                       |
| the test     |         4.2 | `user-event` 2.3, Vitest's locators 1.4                                                                                                             |
| the plugin   |         3.8 | the request layer 2.8 (the server's side 1.7, the page's 1.1), leaving a page 0.6, loading one 0.5                                                  |
| Chrome       |         3.1 | task overhead, style, layout, paint, garbage collection 0.6                                                                                         |
| Flight       |         2.0 | rendering the payload on the server 1.35, decoding it 0.6                                                                                           |
| idle         |         1.6 | waiting for the dev server and for timers                                                                                                           |
| Vitest, Vite |         0.6 |                                                                                                                                                     |
| **total**    |    **30.9** | 29.7 on Bun                                                                                                                                         |

That's the median of 6 profiled runs of the `user-event` column, fast mode, on Node.js. The page's work is the same on Bun, which comes to 0.96× the profiled time. It was profiled before #262, #264 and #266, which took about 0.8, 0.2 and 0.8 ms per test off since.

What stays is the app's own stack: its database, Next, React, Flight and Chrome are 20.5 of the 30.9 ms. A server under `next start` does the server's part of that too, and a browser the client's. The plugin, the test's code, the idle time and Vitest are the other 10.4 ms.

### Per request

Most of a test is requests and the renders they cause, about 21 of the 30.9 ms:

|                                     | page load | navigation | Server Action |
| ----------------------------------- | --------: | ---------: | ------------: |
| per test                            |      1.32 |       2.28 |          2.13 |
| ms each, with the render after it   |      ~3.8 |       ~3.0 |          ~4.2 |
| of which the request itself         |       2.1 |        1.9 |           3.1 |
| queries each (after #262)           |      1.87 |       1.77 |          3.54 |
| the database's ms each (after #262) |      0.52 |       0.65 |          1.08 |

The first rows come from the profile above, the last two from a timings run with #262.

The flows are the run: their 350 tests take 88% of the test time, at 38 ms per test, with 1.4 page loads, 3.2 navigations and 2.8 Server Actions each. A short test takes 10 ms: mostly one page load and one assertion.

## The two modes

[Fidelity mode](nextjs-guide.md#fast-mode), the default, gives up nothing for speed: a test sees what a browser shows of your app. Fast mode turns on every speed feature. On the benchmark, a run takes 23.6 s in fidelity mode and 15.7–16.3 s in fast mode. Each speed feature is an option of its own, so you can pick what to give up:

| feature          | gives up                                                                                      | fidelity without `watchDom`: on alone, ms per test saved | fast: off alone, ms per test added | default, fidelity / fast |
| ---------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------: | ---------------------------------: | ------------------------ |
| `watchDom`       | nothing                                                                                       |                                                       74 |                                 70 | on / on                  |
| `cacheDevServer` | an answer of the dev server that changes while a test file runs; none does                    |                                                     13.9 |                                6.2 | off / on                 |
| `keepApp`        | a fresh page per test, the server's HTML, a hydration mismatch, the dev overlay               |                                                      4.5 |                                5.4 | off / on                 |
| `fastCrypto`     | password hashes of the real algorithm, like one in a fixture                                  |                                                      2.1 |                                1.8 | off / on                 |
| `flightLoads`    | the document as the `response`, a 404 or 500 status of a page, `next/font`'s size-adjust meta |                                     1.2 (over `keepApp`) |                                1.2 | off / on                 |
| `skipPrefetch`   | the requests of prefetches, and the routes rendered from them                                 |                                                      1.0 |                                1.4 | off / on                 |
| `immediates`     | the delay a browser adds to a timeout of 0 between the steps of a render                      |                                                     −0.7 |                                0.4 | off / on                 |

The fidelity column turns one feature on over fidelity mode with `watchDom` off, and compares the wall of 3 runs each, on #251 before #262. Without `watchDom`, a test waits for Vitest's 20 ms steps, which hide part of what the other features save; the same table over today's fidelity mode, with `watchDom` on, isn't here yet. The fast column turns one feature off in fast mode, and compares the test time of one run each. A difference under about 2 ms per test is within the noise of either: that's every row from `fastCrypto` down. The [Fast mode](nextjs-guide.md#fast-mode) section of the guide says what each feature does.

What the table says:

- **`watchDom` is most of the difference, and gives up nothing.** That's why it's on in both modes. Its 74 ms here and the 68 ms of [Waiting for the page](#waiting-for-the-page) come from two series of runs.
- **`cacheDevServer` is next.** A request of the page asks the dev server about the stylesheets and modules of its route: with the answers kept, a Server Action costs 1.3 ms less, a navigation 0.7, a page load 0.5. Since #268, a page asks for the stylesheets of a route once per run in both modes, which took 2.9 ms per test off fidelity mode with `watchDom`, measured on its draft (23.55 → 22.08 s, 5 runs each, σ ≤ 0.5 s). What `cacheDevServer` saves on top of that isn't measured yet.
- **`keepApp` and `flightLoads` remove the HTML of a page load:** reading it to the end costs 0.7–1.2 ms per page load, and what follows the Flight payload 0.6 ms.
- **Prefetches run beside the test.** With `watchDom` off, fidelity mode sends 3,357 prefetches in a run, 10 s of request time, but they take only 0.4 s of the tests' time. With `watchDom` on, it sends 1,240–1,410, as the tests end sooner.
- **`immediates` measures nothing**, in either mode: no phase of a request and no wait moves.

So for a quick loop, take fast mode as a whole, or fidelity mode with the features whose price you accept. `cacheDevServer` gives up nothing a test can see:

```ts
vitestPluginNext({ mode: "fidelity", cacheDevServer: true });
```

A suite that passes in fast mode should pass in fidelity mode too. Keep CI in fidelity mode, so it tells you when one doesn't.

## Waiting for the page

A test waits for what the app does: a page to load, a Server Action's result to appear. In the benchmark, a test looks for an element 10.9 times. 6.6 of those find it on the first look; the other 4.3 wait for the app: a request and the render it causes.

### Without `watchDom`

Vitest's `expect.element()` looks for an element, and when it isn't there, looks again after 0, 20, 50, 100 and 100 ms, and then every 500 ms. A Server Action or a navigation takes a few milliseconds, so most changes come between the second look and the third, and the test sees them up to 20 ms late. Without `watchDom`, a find that waits takes 21.6 ms (median) in fidelity mode and 22.9 ms in fast mode: the 20 ms step plus the look. `expect.poll()` waits its interval, 50 ms by default.

### With `watchDom`

The test looks again on the next change of the document: a mutation of the DOM, or an event of what changes without one, `input` and `change` of a field, `focusin` and `focusout`, `load` and `error` of a stylesheet or an image, the end of a transition or an animation. `expect.element()`, `expect.poll()` and the wait of an action for its element all wait so.

Measured on an earlier #251 with #255, before #266, when `expect.poll()` still looked every 5 ms: a find that waits took 5.4 ms (median) in fidelity mode and 3.3 ms in fast mode, which is the app's own time to make the change. Per test, the waits went from 80.7 to 25.0 ms in fidelity mode, and from 70.0 to 15.1 ms in fast mode. A run of fidelity mode took 34 s less, about 60 → 26 s, and a run of fast mode 35 s less, about 52 → 17 s, 5 runs each.

#266 then had `expect.poll()` wait for the next change too, rather than 5 ms. That took 0.8 ms per test off fast mode (16.06 ± 0.10 → 15.66 ± 0.13 s, faster in all 5 pairs) and nothing measurable off fidelity mode. Setting up and taking down the observer, the listeners and the timer costs 0.11 ms per test.

### Writing a wait that's fast

- **Wait with `expect.element()` or `expect.poll()`**, never a fixed time. They look again as soon as the page changes.
- **Don't pass an `interval`.** A poll with an interval of its own, and any poll while the test's timers are fake, keeps Vitest's own wait, at that interval or else at the config's `expect.poll.interval`, which the plugin sets to 5 ms when your config has none: Vitest advances fake timers by that interval. Otherwise the config's interval doesn't count: with `watchDom`, the poll waits for the next change.
- **What changes without a mutation is seen within 5 ms.** A value that a script sets on a property, like a field's, changes no attribute and fires none of those events: the test looks again 5 ms after the last look. In a run of the benchmark, 84 of 4,398 waits ended that way.

## The test's own code

In the `user-event` column, the test's own code costs 4.2 of a test's 30.9 ms: `user-event`'s clicks and fills 2.3, and finding elements with Vitest's locators 1.4.

### What a primitive costs

On the benchmark's notes page, with 20 notes, in fast mode, in the benchmark of primitives (means of 100 iterations):

| primitive                              | Vitest's `page` | Testing Library | `dom-locators` (#255) |
| -------------------------------------- | --------------: | --------------: | --------------------: |
| `getByRole("link", { name })`, a query |        0.167 ms |        0.071 ms |              0.045 ms |
| `getByText()`                          |        0.060 ms |        0.048 ms |              0.043 ms |
| `getByLabelText()`                     |        0.030 ms |        0.016 ms |              0.021 ms |
| a click of a button that sets state    |          ~50 ms |        0.117 ms |              0.136 ms |
| a fill of an input                     |                 |        0.099 ms |              0.099 ms |

A click of the DOM's own, `element.click()`, takes 0.040 ms, and so does a fill of its own. Vitest's click and fill are Playwright's: each goes from the page to Node.js and back. Its click takes about 50 ms, in the micro test of `dom-locators` (the median of 20 batches of 50); its fill takes 8.0 ms on a CI runner, in the benchmark of primitives (the median of 100). The Testing Library column's clicks and fills are `user-event`'s. That primitive hands `user-event` the element, where the click of `dom-locators` first finds it (24 µs) and checks that it's visible and enabled (8 µs); its queries are faster, and that's where it saves time.

### `dom-locators`

`dom-locators`, on draft [#255](https://github.com/storybookjs/vitest-plugin-rsc/pull/255), is `page` of `vitest/browser` answered inside the document: the same locators, the same elements in the same order, its waits and its actions, without a round trip to Playwright and without Testing Library. A test of `vitest/browser` changes one import:

```diff
- import { page } from "vitest/browser";
+ import { page } from "dom-locators";

  await page.getByLabelText("Title").fill("Groceries");
  await page.getByRole("button", { name: "Create note" }).click();
  await expect.element(page.getByText("Note created.")).toBeInTheDocument();
```

On the benchmark, the `dom-locators` column takes 2.0 ms per test less than the `user-event` column: 16.26 → 15.25 s, by the median of 5 interleaved rounds, faster in each, on #251 before #262, #264 and #266. All of it is on the page's side. The package's own code costs about 2.2 ms per test (focusing an element 0.43, the pointer events 0.45, checking that it's visible 0.14), and replaces Vitest's locators, 1.4 ms, and `user-event`, 2.3.

What differs from Playwright's actions: every event is the page's own, so `isTrusted` is `false`, and an action doesn't wait for an element to stop moving or for what covers it to go. The package's README, on #255, has the full table. `dom-locators` is private: the repository's benchmark and playgrounds use it, and it isn't on npm.

### Testing Library's `user-event`

Without `dom-locators`, Testing Library's `user-event` also clicks and fills in the page. The benchmark's `tests/vitest-user-event/` are the tests of `tests/vitest/` with `await locator.click()` turned into `await click(locator)` and `await locator.fill(text)` into `await fill(locator, text)`, from its [`test/user-event.ts`](../playground/vitest-vs-playwright-notes/test/user-event.ts):

```ts
import { userEvent } from "@testing-library/user-event";
import type { Locator } from "vitest/browser";

const user = userEvent.setup({ delay: null });

export async function click(locator: Locator): Promise<void> {
  await user.click((await locator.findElement()) as HTMLElement);
}
```

The benchmark's config lists Testing Library in `host.packages` of `vitestPluginNext()`, so that it loads as the page's own module, as `vitest` does, and not as server code in the page.

## The data layer

The database runs in the tab, on the thread that also clicks and renders: a query is CPU time, not a round trip. In the benchmark it takes 5.1 ms of a test's 30.9, about as much as all of Next. Postgres in WebAssembly is about half of the queries' time in requests; PGlite's JS and Drizzle are the rest. So what makes a data layer fast in production makes it fast here: fewer queries, and less work around each. [A fast data layer in tests](databases.md#a-fast-data-layer-in-tests) has the code.

Two changes of #262, measured on the benchmark with a timings run per side and 5 interleaved rounds:

- **Prepared statements** (Drizzle's `.prepare()`). The queries take as long as before, but the requests 0.10 ms less per page load, 0.09 per navigation and 0.19 per Server Action, about 0.7 ms per test: Drizzle no longer builds their SQL on every call. Of the two changes, this one shows in the wall: the faster side in 4 of 5 rounds.
- **No query for what you already have.** The notes page counted the notes next to listing them; it counts only for a search now. That's 0.34 queries less per page load, and 0.24 ms of the database's time per test, too little to see in the wall.

And two that the notes apps have, with what they cost:

- **The signed-in user once per render**, with React's `cache()`. The layout and the page both ask for the user; a render looks it up once. With Better Auth, that's two queries where it was four. A Server Action isn't a render, so it looks the user up itself.
- **A reset in one round trip.** `resetDb()` before each test takes 0.28 ms.

What a well-built app doesn't do per request: build the same SQL again, query for what an earlier query of the same render has, or look up the session in every component that needs it.

With several workers, the database slows the most of any part of a page's work: with 4 workers, Postgres in WebAssembly takes 1.81× as long per test, against 1.52× for the whole page. See [Workers](#workers). A query less pays more there.

## The start of a run

A run of one test file, the loop of a change and its test, is mostly start. One file of 10 tests takes about 2.3 s on Bun and 3.2 s on Node.js with `pnpm exec`. On Bun, its first test starts after 1.79 s:

| step                                                  |    s |
| ----------------------------------------------------- | ---: |
| Vitest, Vite and Chromium, until the tester page      | 0.73 |
| the tester page's own modules                         | 0.13 |
| Next's server layers, loaded in the page              | 0.33 |
| the app's setup files: PGlite created                 | 0.49 |
| Vitest collects the file, the plugin's `beforeEach()` | 0.12 |

Those are the medians of 5 runs, on #251 before #258. Then the first test takes 0.30 s, where a later one takes 0.03 s: the page fetches the modules of its first route from the dev server while Vite transforms them. In the first test of a run, that's about 100 requests of modules, many at once, at about 11 ms each.

In a run of 500 tests, about 2.2 s is outside the test files: 0.88 s to the first test file, 0.93 s of that file's setup (Next's layers and PGlite), 0.27 s for the 21 other test files, at 12 ms each, and 0.05 s at the end. The first test takes 0.38 s more on top.

### Bun or Node.js

[Bun](nextjs-guide.md#start-sooner-on-bun) runs Vitest's own process, Vite and Playwright; the tests still run in Chromium. On one file, the first test starts at 1.79 s on Bun and at 2.65 s on Node.js with `pnpm exec`. 0.25 s of that is `pnpm exec`, which `./node_modules/.bin/vitest` skips; the rest is Node.js loading its modules more slowly. In a run of 500 tests on a later build, with #258, the wall less the test files' time is 2.06 ± 0.09 s on Bun and 2.82 ± 0.05 s on Node.js (7 runs each). Once the tests run, they take the same time on both.

### What else shortens it

- **The patch of `@vitest/mocker`**, in [A faster start, until Vitest has it](nextjs-guide.md#a-faster-start-until-vitest-has-it), takes 0.27–0.42 s off a one-file run of about 4 s on CI.
- **The warmup of the ssr layer** (#275) has Vite compile Next's ssr layer as the browser launches, before the page asks for it: on one file of the benchmark, warm, the first test starts 53–56 ms sooner, and the wall is 43 ms shorter on Bun and 105 ms on Node.js (3 interleaved runs per side, on its draft).
- **The first route's modules.** Fetching them before the first test took that test from 522 to 142 ms in a run where they were fetched in time, but not in the others, so it isn't on #251.

### A cold cache

Vite pre-bundles your dependencies once, into its dependency cache. Without that cache, one file takes 3.3–3.4 s on Bun, where it takes 2.3–2.4 s warm, and 4.5–4.6 s on Node.js, where it takes 3.2–3.3 s (3 and 4 runs each, on the builds of draft #263, which #275 superseded).

The cache is optimized again when your config, your dependencies or the plugin's code change. The next run of the 500 tests then takes 1.5 s longer on Bun and 3.5 s longer on Node.js. Vitest's `Duration` line shows it as a `worker` share: 5–10% of a run of 500 tests, where it's otherwise 2% or less, and 36–52% of a run of one file, where it's otherwise 3–4%. A few things keep a cache of their own, so switching between them doesn't optimize again:

- Bun and Node.js, when the config gives Bun a `cacheDir` of its own, as the [Bun section](nextjs-guide.md#start-sooner-on-bun) shows.
- Fast and fidelity mode: fast mode's `fastCrypto` pre-bundles other files, into a directory of its own.

Two configs of one project share a cache, and each optimizes it again for itself. In the benchmark, every switch between `vitest.config.ts` and `vitest.bench.config.ts` did: give a second config its own `cacheDir`.

### Watch mode

In watch mode, Vitest keeps its process, the dev server and Chromium between runs, and the dependency cache stays warm. Saving a file of your app reruns every test file that opens a route, plus any that imports the file: see [Watch mode](nextjs-guide.md#watch-mode). What a rerun costs in this app isn't measured yet.

## Workers

Vitest runs test files in parallel on its workers, and every worker has its own tab, with its own server, database, disk and cookies. On the M1 Pro, with `dom-locators`, on #251 before #262:

| workers | wall, s (3 runs each) |
| ------- | --------------------: |
| 1       |          14.78 ± 0.26 |
| 4       |           7.14 ± 0.09 |
| 6       |           7.19 ± 0.39 |

So 4 workers take the run from 15 to 7 s, and 6 add nothing. An earlier series, with 2 workers too, shows why:

| workers                     |    1 |    2 |    4 |    6 |
| --------------------------- | ---: | ---: | ---: | ---: |
| the test files' ms per test | 27.1 | 32.0 | 39.6 | 50.0 |
| cores used, about           |  1.6 |  2.9 |  5.0 |  6.2 |
| memory, GB                  |  1.7 |  2.6 |  3.8 |  5.2 |

Two things stop it:

- **Each page gets slower when others run.** With 4 workers, every test takes 1.46× as long, and with 6, 1.85×. It's not a lack of cores: the run uses 5 of 10. It's the machine's caches and memory bandwidth, which the pages share. A probe without Vitest shows it: arithmetic is 1.05× as slow with 4 copies running, work that allocates a lot of memory 1.29× as slow with 4 and 1.59× with 6. Four separate processes of 1 worker, each with its own dev server and Chromium, are no faster: their flow files take as long per test as with 4 workers in one process: flow-create-many 69 ms in both. The dev server is 12% busy during the tests. Postgres in WebAssembly slows the most, 1.81×; React's rendering hardly slows, 1.02×.
- **A test file runs on one worker.** With 6 workers, the longest file, 50 tests of flows, takes 4.45 s alone, and the run can't end before it does. The start grows too: the first test begins at 2.50 s, where it begins at 2.11 s with 4 workers, as every worker loads Next's layers and PGlite at once.

With 4 workers, Vitest balances the files well: every worker begins its first test at 2.11 s and ends between 6.78 and 6.87 s.

Set the number in your config, or for one run:

```ts
test: { maxWorkers: 4 },
```

```bash
npx vitest run --maxWorkers 4
```

Each worker loads Next's runtime before its first test, so many workers on few cores can time out the first test. The notes demo sets `maxWorkers: 4`. Test files of about the same length, rather than one long one, let more workers help.

The benchmark compares Vitest with Playwright on 1 worker. Playwright's tests share one database there, Postgres in Docker, so they can't run in parallel; every worker of Vitest has a database of its own. A run of Vitest with 4 workers is a different comparison, not the same benchmark faster.

## Measure your own app

The benchmark's configs are in [`playground/vitest-vs-playwright-notes`](../playground/vitest-vs-playwright-notes/). Copy them and adapt them to your app: `test/profile.ts` times the queries through the app's `db` module, and `bench/` opens the notes app's routes.

- **A CPU profile of each page**: `vitest run -c vitest.profile.config.ts` writes a profile per test file to `profiles/`, and `python3 test/profile-summary.py` sums them up by package: yours, the plugin's, Next's, React's, the browser's. It profiles every page of a run with several workers too.
- **A trace of Chrome**: `VITEST_PROFILE=trace` writes `traces/`, and `python3 test/trace-summary.py` sums up what the browser itself did: style, layout, paint, garbage collection, the microtasks of promises.
- **The timings of every request**: `VITEST_PROFILE=timings` writes `timings/`, and `python3 test/timings-summary.py` splits each page load, navigation and Server Action into its phases on the server, with the queries of the database in each.
- **The primitives**: `vitest run -c vitest.bench.config.ts --maxWorkers 1` times a page load, a navigation, a Server Action, a click, a query and a query of the database a hundred times each, and `python3 bench/compare.py old.json new.json` puts two runs side by side. See the [benchmark's README](../playground/vitest-vs-playwright-notes/README.md).

The benchmark's config also prices one speed feature: `VITEST_PLUGIN_RSC_FEATURES="keepApp=false"` turns one off over `VITEST_PLUGIN_RSC_MODE`, and `"cacheDevServer"` turns one on.

To trust a number:

- **Compare on one machine, interleaved.** Run A and B in turns, 3 to 5 times each, and compare the medians. CI runners of one kind differed by 40% in one A/B, so compare runs within one job, not jobs.
- **Warm up after a change.** The first run after a change of the config, the dependencies or the plugin optimizes the dependencies again, 1.5–3.5 s more.
- **Keep the machine quiet.** Another Vitest run on the machine slowed a run by up to 1.5 s; the rest of a desktop varies it by 3–5%.
- **Look at the kind, not just the wall.** A change should move the phase it targets, and the timings show which. A run that's slower everywhere is the machine.

## How the numbers were measured

Unless a section says otherwise, a number comes from the 500 tests of the notes benchmark, [`playground/vitest-vs-playwright-notes`](../playground/vitest-vs-playwright-notes/README.md): a notes app on Postgres with Drizzle, with accounts, sessions, search, favorites and forms, in 22 test files. 150 tests open one page or submit one form; 350 are flows of 8 to 25 interactions each. They ran with Next and React in production, Vitest on Bun, 1 worker and a warm dependency cache, on an M1 Pro with 8 performance and 2 efficiency cores and 32 GB.

A wall time is the mean of 3 to 5 runs with [hyperfine](https://github.com/sharkdp/hyperfine), or of an interleaved A/B. A run of the whole suite varies by 3–5% between identical runs on that machine, so a difference under about 2 ms per test is noise at that count. Some series ran through a script that added 0.5 s to every wall; a difference between two of their runs holds, and their walls appear here only as differences, or as "about" with the 0.5 s taken off.

"ms per test" is a time divided by the 500 tests: 1 ms per test is 0.5 s of a run.
