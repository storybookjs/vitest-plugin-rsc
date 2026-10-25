# Fast tests

How to get the quickest feedback loop for the end-to-end scenarios of a Next.js App Router app: what a test costs, where the time goes, and what each way to make it cheaper gives up. Every number was measured, and comes with the conditions it was measured under. This assumes you've read the [quick start](../README.md#quick-start) and the [Next.js guide](nextjs-guide.md).

> [!NOTE]
> **Status, 25 October 2026.** None of this is released yet. Fast mode and its speed features are on [#251](https://github.com/storybookjs/vitest-plugin-rsc/pull/251), the pull request of fast mode, and so is everything below unless it names a draft pull request on top of it:
>
> - On #251: both modes and every speed feature, `watchDom` in both modes, the wait for the next change of the document (#266), the data layer of the notes apps (#262), one CommonJS object per ES module in the pre-bundles (#264), the patch of `@vitest/mocker` (#258), the profile config at any number of workers (#271), the stylesheets of a route asked once per run (#268), the server layer compiled while Chromium launches (#275), the benchmark's signed-in user from a signed cookie (#276), the `import.meta` of a module once per file (#277), and the benchmark on Bun.
> - On draft pull requests: `dom-locators` (#255) and the host of the page in Node.js without a browser (#261, and #267 for the benchmark in happy-dom and jsdom). Without a pull request: a preload of the app's client during the setup files (`wip/lifecycle-3-preload`).
>
> The headline numbers come from one build, **#251 after #276, before #277, with `dom-locators` (#255) and the host in Node.js merged in**: the walls of a run with 1 and 4 workers, and the time of each kind of request. Both columns of the benchmark sign in through one helper, with the signed cookie of #276. The host in Node.js also changes the browser's side of the plugin; what that does to a run in Chromium isn't measured on its own. A section that uses an earlier build says which.

- [The quickest loop](#the-quickest-loop)
- [What a test costs](#what-a-test-costs)
- [The two modes](#the-two-modes)
- [Waiting for the page](#waiting-for-the-page)
- [The test's own code](#the-tests-own-code)
- [The data layer](#the-data-layer)
- [The start of a run](#the-start-of-a-run)
- [Workers](#workers)
- [Without a browser](#without-a-browser)
- [Measure your own app](#measure-your-own-app)
- [How the numbers were measured](#how-the-numbers-were-measured)

## The quickest loop

On the 500 tests of the notes benchmark, on an M1 Pro:

- **Wait with `expect.element()` and `expect.poll()`, without an `interval`.** With `watchDom`, on in both modes, they look again on the next change of the page: a run of fidelity mode takes about 26 s instead of 60. See [Waiting for the page](#waiting-for-the-page).
- **Fast mode for the loop, fidelity mode in CI.** Its features take about 16 ms off each test of fidelity mode: on an earlier build, a run of 24.5 s took about 16.6 s. See [The two modes](#the-two-modes).
- **4 workers.** 6.85 s instead of 14.21 s, with `dom-locators`. See [Workers](#workers).
- **Clicks and queries in the page.** A click of Vitest's goes to Playwright and back, about 50 ms; one of `user-event` takes 0.1 ms. `dom-locators` (draft #255) takes another 2.0 ms off a test. See [The test's own code](#the-tests-own-code).
- **Vitest on Bun.** A run of one test file starts its first test 0.88 s sooner than on Node.js with `pnpm exec`. See [The start of a run](#the-start-of-a-run).
- **A warm dependency cache, and a `cacheDir` per config.** Without a cache, one file takes about 1 s longer. See [A cold cache](#a-cold-cache).
- **Fewer queries, prepared once.** The signed-in user from a signed cookie took 1.4 ms off a test (#276), Drizzle's prepared statements 0.7 ms. See [The data layer](#the-data-layer).
- **Watch mode.** After a save, the result of one file is there in about 0.8 s, a `Duration` of about 0.55 s, against 1.8–2.2 s for its first run. See [Watch mode](#watch-mode).

Every number on this page ran Next and React in production, `vitestPluginNext({ build: "production" })`, which is still experimental and not the default; the [Next.js guide](nextjs-guide.md#development-or-production) says what changes.

## What a test costs

A run of the 500 tests in fast mode, with 1 worker, takes **14.21 ± 0.16 s with `dom-locators`** and **at most 15.55 ± 0.23 s with the clicks and fills of Testing Library's `user-event`**, 3 runs each after a warmup. Of a run with `dom-locators`, Vitest's `Duration` is 13.4–13.7 s, of which the tests take 93% and the setup of the test files 6%: about 25 ms per test. The `user-event` runs had a busier machine, so read theirs as an upper bound. Between sessions, a wall holds to about a second, as the machine drifts; a gain holds only from an interleaved A/B, see [Measure your own app](#measure-your-own-app).

The signed cookie of #276 took 0.75 s off a run of the `dom-locators` column by the median, 14.83 → 14.08 s, and 0.48 s by the mean, 14.85 ± 0.32 → 14.37 ± 0.55 s: 1.0–1.5 ms per test, faster in each of 5 interleaved rounds, on the headline build's code without and with #276. On #276's own branch, on #251 before #268, it took 1.4 ms off a test of the `user-event` column (15.34 → 14.64 s by the median of 5 interleaved rounds).

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

That's the median of 6 profiled runs of the `user-event` column, fast mode, on Node.js. The page's work is the same on Bun, which comes to 0.96× the profiled time. It was profiled on an earlier build, before #262, #264 and #266, which took about 0.8, 0.2 and 0.8 ms per test off since, and before the signed cookie of #276, 1.4 ms, most of it the database's.

What stays is the app's own stack: its database, Next, React, Flight and Chrome are 20.5 of the 30.9 ms. A server under `next start` does the server's part of that too, and a browser the client's. The plugin, the test's code, the idle time and Vitest are the other 10.4 ms.

### Per request

Of the tests' time, 44% is in requests of the page, and 56% is the page itself: the clicks, Next's router, decoding Flight, React and the assertions. The server's side of each request:

|                                       | page load | navigation | Server Action |
| ------------------------------------- | --------: | ---------: | ------------: |
| per test                              |      1.32 |       2.28 |          2.13 |
| the server's ms each                  |       1.5 |        1.3 |           2.5 |
| before Flight: routing, the action    |       0.7 |        0.5 |           1.5 |
| the Flight render                     |       0.8 |        0.8 |           0.8 |
| after Flight, until the response ends |         0 |          0 |           0.1 |

That's one timings run of the `dom-locators` column on the headline build's code, the cookie's side of its A/B, at a resolution of 0.1 ms; a run with the CPU profiler on takes 0.1–0.4 ms more per request. In that A/B, a request without it took 0.10 ms more for a page load, 0.16 for a navigation and 0.31 for a Server Action, as it looked the session up. With the render that follows, the CPU profile above, on its earlier build, puts a page load at about 3.8 ms, a navigation at 3.0 and a Server Action at 4.2. What the database takes of each request is in [A fast data layer in tests](databases.md#a-fast-data-layer-in-tests).

In that profile, the flows are the run: their 350 tests take 88% of the test time, at 38 ms per test, with 1.4 page loads, 3.2 navigations and 2.8 Server Actions each. A short test takes 10 ms: mostly one page load and one assertion.

### The first request of a route in a test file

Each test file starts its routes again, so the first page load, navigation and Server Action of a route in a file cost more than the ones after it. In the `user-event` column, fast mode, on #251 before #262 with the stylesheets of #268, a run has 105 such first requests: 43 page loads, 30 navigations and 32 Server Actions. They take about 0.5 s more than the same requests do later in the file: about 1 ms per test. The server's phase before Flight, ms each:

|                              | page load | navigation | Server Action |
| ---------------------------- | --------: | ---------: | ------------: |
| the first request of a route |      5.35 |       2.59 |          5.73 |
| a later one                  |      0.41 |       0.60 |          1.75 |

About 0.27 s of it is idle: Next prepares the route for the first time (`resolveEnsureStaticConfig`, `collectAppPageSegments`) and waits for the modules of the route, from the module runner and the dev server. The other 0.2 s is CPU: Next's server, the plugin, and the first query of a route. That's one CPU profile per side, in an A/B of #268's change to the stylesheets, which took 0.17 ms per test off the first requests. Keeping a route's state from one test file to the next would save up to the rest; nothing does that yet.

## The two modes

[Fidelity mode](nextjs-guide.md#fast-mode), the default, gives up nothing for speed: a test sees what a browser shows of your app. Fast mode turns on every speed feature. Each is an option of its own, so you can pick what to give up:

| feature          | gives up                                                                                      | fidelity: on alone, ms per test saved | fast: off alone, ms per test added | default, fidelity / fast |
| ---------------- | --------------------------------------------------------------------------------------------- | ------------------------------------: | ---------------------------------: | ------------------------ |
| `watchDom`       | nothing                                                                                       |               on already; off adds 74 |                                 70 | on / on                  |
| `cacheDevServer` | nothing; without an effect since #284, which keeps the answers in both modes                  |                                   5.4 |                                6.2 | – / –                    |
| `keepApp`        | a fresh page per test, the server's HTML, a hydration mismatch, the dev overlay               |                                   3.5 |                                5.4 | off / on                 |
| `flightLoads`    | the document as the `response`, a 404 or 500 status of a page, `next/font`'s size-adjust meta |                  2.7 (over `keepApp`) |                                1.2 | off / on                 |
| `skipPrefetch`   | the requests of prefetches, and the routes rendered from them                                 |                                   3.0 |                                1.4 | off / on                 |
| `fastCrypto`     | password hashes of the real algorithm, like one in a fixture                                  |                                   1.6 |                                1.8 | off / on                 |
| `immediates`     | the delay a browser adds to a timeout of 0 between the steps of a render                      |                                   0.1 |                                0.4 | off / on                 |

Both columns ran on one build, #251 at 8b5dc1ae, before #258 and every pull request after it, with the `user-event` column. The fidelity column turns one feature on over fidelity mode with `watchDom`, as fidelity mode is now, and compares the wall of 3 runs each with fidelity mode's own, 24.52 ± 0.62 s; `flightLoads` goes on over `keepApp`, which it needs. Its `watchDom` row compares fidelity mode with and without it. The fast column turns one feature off in fast mode, and compares the tests' time of one timings run each. A difference under about 2 ms per test is within the noise of either: that's `fastCrypto` and `immediates` in the fidelity column, and every row from `flightLoads` down in the fast column. One of the three runs of `cacheDevServer` in the fidelity column was slow (σ 2.0 s); its timings run agrees, 5.2 ms per test. The [Fast mode](nextjs-guide.md#fast-mode) section of the guide says what each feature does.

The features add up: the fidelity column's are about 16 ms per test, 8 s of a run, which is the whole difference between fidelity mode, 24.5 s, and fast mode, about 16.6 s on that build. None needs another, but `flightLoads` needs `keepApp`.

What the table says:

- **`watchDom` saves the most by far, and gives up nothing.** That's why it's on in both modes, and not part of the difference between them. Its 74 ms here and the 68 ms of [Waiting for the page](#waiting-for-the-page) come from two series of runs.
- **Of the 16 ms between the modes,** the page without a document, `keepApp` with `flightLoads`, is about 6, `cacheDevServer` about 5, which fidelity mode now has too, and `skipPrefetch` 3.
- **The dev server is off the path of a request, in both modes.** A request asked the dev server about the stylesheets and modules of its route: with `cacheDevServer` keeping the answers, the server's phase before Flight took 1.9 ms instead of 3.2 for a Server Action, 0.4 instead of 1.6 for a navigation, and 0.8 instead of 1.5 for a page load. Since then, #268 has a page ask for the stylesheets of a route once per run, in both modes, for as long as its modules stay: that took 2.9 ms per test off fidelity mode (23.55 ± 0.51 → 22.08 ± 0.10 s, 5 runs each, on #251 before #262). And #284 has the dev server tell the page of every change of its modules, so the page asks for the versions of them once per page load, in both modes, and the requests of a page ask nothing. That took 2.3 s off fidelity mode (20.73 → 18.44 s by the median, 5 runs each): a Server Action waits 0.0 ms before the request and 1.6 before Flight, a navigation 0.6 and 0.4, as with `cacheDevServer`, which now has no effect.
- **`keepApp` and `flightLoads` remove a fresh document and its HTML.** With `keepApp`, the run has 655 page loads instead of 705, and a page load's server takes 0.1 ms after Flight instead of 0.6. With `flightLoads` too, reading the HTML to the end takes 0.1 ms instead of 0.7, and after Flight nothing.
- **Prefetches run beside the test.** Fidelity mode sends 1,262 prefetches in a run. `skipPrefetch` takes 3.0 ms per test off the wall, but in its one timings run none off the tests' time; where the wall's 1.5 s goes isn't measured.
- **`immediates` measures nothing**, in either mode: no phase of a request and no wait moves.

So for a quick loop, take fast mode as a whole, or fidelity mode with the features whose price you accept.

A suite that passes in fast mode should pass in fidelity mode too. Keep CI in fidelity mode, so it tells you when one doesn't.

### A page load in fidelity mode

In the benchmark of primitives, a page load in fidelity mode takes 6.1–7.6 ms, where a page of the kept app in fast mode takes 3.2–3.7 ms (medians of 100, with `watchDom` off, on #251 at 8b5dc1ae, the build of the table above, before #258, #262 and #268). A fidelity page load, by part:

| part                                                              |      ms | a fresh page needs it                           |
| ----------------------------------------------------------------- | ------: | ----------------------------------------------- |
| the server, before Flight and the Flight render                   |     2.5 | yes; a page of the kept app takes 1.7–2.1 of it |
| the server's HTML, after Flight                                   |     1.3 | for the server's HTML                           |
| parsing the document and swapping it in                           |     0.5 | partly                                          |
| the browser layer's modules, evaluated again for the new document |     0.7 | no: they're the same modules for every page     |
| the render, or the hydration of the HTML                          | 1.5–3.0 | yes                                             |

The server's parts come from the timings of the `user-event` column, the document and the modules from a CPU profile of it, both with `watchDom` off, and the render from the benchmark of primitives. So a fresh document and its first render cost about 2–3 ms. The modules, 0.7 ms, and part of the swap, of 0.5, are the plugin's way of making a fresh document, not the price of one: about 1 ms of a fidelity page load is the plugin's to take off. #277 works out the `import.meta` of each module once per file, not per page load: in a profile before it, that was 0.23 of the 0.69 ms that Vite's module runner took per page load.

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

A click of the DOM's own, `element.click()`, takes 0.040 ms, and so does a fill of its own. Vitest's click and fill are Playwright's: each goes from the page to Node.js and back. Its fill takes 8.0 ms on a CI runner, in the benchmark of primitives (the median of 100). The Testing Library column's clicks and fills are `user-event`'s. That primitive hands `user-event` the element, where the click of `dom-locators` first finds it and checks that it's visible and enabled; its queries are faster, and that's where it saves time.

The micro test of `dom-locators`, `packages/dom-locators/test/micro.test.ts` on #255, times each primitive alone on a static copy of the notes page with 20 notes, without Next or React, against Vitest's own in the same run, so its click renders nothing. In µs per call, the median of 5 runs of the test, each the median of 20 batches of 50, at a resolution of 2 µs:

| primitive                     | Vitest's `page` | `dom-locators` |
| ----------------------------- | --------------: | -------------: |
| `getByRole("link", { name })` |             156 |             40 |
| `getByText()`                 |                 |             40 |
| `getByLabelText()`            |                 |             20 |
| `click()`                     |          50,000 |          60–62 |
| `fill()`                      |                 |          24–26 |

Of a click of `dom-locators`, 30–32 µs are its events: the pointer and mouse events and the click. The check that the element is visible takes no measurable time on a page that hasn't changed, and 10 µs right after a change, when the browser lays the page out again first; a fill there takes 50 µs.

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

The database runs in the tab, on the thread that also clicks and renders: a query is CPU time, not a round trip. In the profile of [Where the time goes](#where-the-time-goes), on its earlier build, it took 5.1 ms of a test's 30.9, about as much as all of Next. In a timings run of the `user-event` column on #251 before #268, with #262 and the signed cookie of #276, its queries take 1.9 s of the tests' 13.0 s, about 3.8 ms per test, measured otherwise than the profile's 5.1; Postgres in WebAssembly is about half of a query's time. So what makes a data layer fast in production makes it fast here: fewer queries, and less work around each.

The notes apps look the signed-in user up once per render, with React's `cache()`, and empty the tables before each test with one string of `DELETE`s. The benchmark also keeps the user in a signed cookie for a few minutes (#276), counts the notes only for a search, and prepares its queries. [A fast data layer in tests](databases.md#a-fast-data-layer-in-tests) has the code of each, what it saved in the benchmark, and the database's time per kind of request.

Two that didn't pay in the benchmark: `TRUNCATE` instead of the `DELETE`s, which [the same section](databases.md#a-fast-data-layer-in-tests) explains, and PGlite without durability, with `synchronous_commit` and `full_page_writes` off, which changed nothing (15.26 and 15.34 s by the median of 5 interleaved rounds): PGlite doesn't sync to disk in the tests already.

With several workers, the database slows the most of any part of a page's work: with 4 workers, Postgres in WebAssembly takes 1.81× as long per test, against 1.52× for the whole page. See [Workers](#workers). A query less pays more there.

## The start of a run

A run of one test file, the loop of a change and its test, is mostly start. One file of 10 tests, `note-create.test.tsx`, takes 2.31 s on Bun and 3.30 s on Node.js with `pnpm exec`. Its first test starts at 1.74 s on Bun and at 2.62 s on Node.js:

| step                                                  |  Bun | Node.js | whose                                                   |
| ----------------------------------------------------- | ---: | ------: | ------------------------------------------------------- |
| the shell, until the process starts                   | 0.02 |    0.29 | `pnpm exec`, on Node.js                                 |
| Vitest's config, Vite's server, Chromium launched     | 0.52 |    0.84 | Vitest, Vite, Playwright; Next's config, about 0.1 s    |
| until the tester page                                 | 0.23 |    0.28 | Vitest, Chromium; Vite compiles Next's server layer     |
| the tester page's own modules                         | 0.14 |    0.19 | Vitest                                                  |
| Next's server layers, loaded in the page              | 0.23 |    0.25 | the plugin                                              |
| the app's setup files: PGlite created                 | 0.48 |    0.61 | the app                                                 |
| Vitest collects the file, the plugin's `beforeEach()` | 0.11 |    0.16 | Vitest, the plugin                                      |
| **the first test starts**                             | 1.74 |    2.62 |                                                         |
| the first test                                        | 0.30 |    0.35 | its first page load waits for Vite to compile the route |
| the 9 others, and the end                             | 0.22 |    0.23 |                                                         |

Those are the medians of 3 runs, in seconds, with the marks of the benchmark's start, on #251 before #258 and #262, with the change of #275. The first test takes 0.30 s, where a later one takes 0.01–0.07 s: its first page load waits 0.19 s on Bun and 0.22 s on Node.js for Vite to transform the modules of the first route, on the main thread of Vitest's process. A preload of the app's client while the setup files run (`wip/lifecycle-3-preload`), measured on #251 with #258 and #268's stylesheets, before #262 and #275, took 57–58 ms off the first test in every run, but nothing off the wall of one file: the run waits for the same modules, before the test instead of in it. So it isn't on #251.

#275 has Vite compile Next's server layer while Chromium launches: its first module is ready 0.39 s sooner on Bun and 0.47 s sooner on Node.js. The tester page comes 0.06–0.10 s later, as the two share the start, and the first test starts 53–56 ms sooner. The wall of one file is 43 ms shorter on Bun and 105 ms shorter on Node.js (3 runs each, interleaved).

In a run of 500 tests, about 2.2 s is outside the test files: 0.88 s to the first test file, 0.93 s of that file's setup (Next's layers and PGlite), 0.27 s for the 21 other test files, at 12 ms each, and 0.05 s at the end. The first test takes 0.38 s more on top. That's on #251 before #258, #262 and #275.

### Bun or Node.js

[Bun](nextjs-guide.md#start-sooner-on-bun) runs Vitest's own process, Vite and Playwright; the tests still run in Chromium. On one file, the first test starts 0.88 s sooner on Bun than on Node.js with `pnpm exec`. About 0.25 s of that is `pnpm exec`, which `./node_modules/.bin/vitest` skips; the rest is Node.js loading its modules more slowly. In a run of 500 tests, on #251 with #258, the wall less the test files' time is 2.06 ± 0.09 s on Bun and 2.82 ± 0.05 s on Node.js (7 runs each). Once the tests run, they take the same time on both.

### What else shortens it

- **The patch of `@vitest/mocker`**, in [A faster start, until Vitest has it](nextjs-guide.md#a-faster-start-until-vitest-has-it), takes 0.27–0.42 s off a one-file run of about 4 s on CI.

### A cold cache

Vite pre-bundles your dependencies once, into its dependency cache. Without that cache, one file takes 3.3–3.4 s on Bun, where it takes 2.3–2.4 s warm, and 4.5–4.6 s on Node.js, where it takes 3.2–3.3 s (3 and 4 runs each, on the builds of #263, a closed pull request whose warmup #275 replaced).

The cache is optimized again when your config, your dependencies or the plugin's code change. The next run of the 500 tests then takes 1.5 s longer on Bun and 3.5 s longer on Node.js. Vitest's `Duration` line shows it as a `worker` share: 5–10% of a run of 500 tests, where it's otherwise 2% or less, and 36–52% of a run of one file, where it's otherwise 3–4%. A few things keep a cache of their own, so switching between them doesn't optimize again:

- Bun and Node.js, when the config gives Bun a `cacheDir` of its own, as the [Bun section](nextjs-guide.md#start-sooner-on-bun) shows.
- Fast and fidelity mode: fast mode's `fastCrypto` pre-bundles other files, into a directory of its own.

Two configs of one project share a cache, and each optimizes it again for itself. In the benchmark, every switch between `vitest.config.ts` and `vitest.bench.config.ts` did: give a second config its own `cacheDir`.

### Watch mode

In watch mode, Vitest keeps its process, the dev server and Chromium between runs, and the dependency cache stays warm. Saving a file of your app reruns every test file that opens a route, plus any that imports the file: see [Watch mode](nextjs-guide.md#watch-mode).

On the file of 10 tests above, a save of the test file, of the page it opens, or of a module of `lib/` that the page imports, reruns it with a `Duration` of 0.53–0.55 s on Bun and 0.57–0.59 s on Node.js, where its first run takes 1.8–2.2 s. From the save to the result, it takes 0.76–0.92 s: the watcher waits a moment for more changes, and Vitest schedules the rerun. 50–100 ms of it is the measurement's own polling. Those are the medians of 5 saves of each file, which changed only the time of the file, on #251 before #258 and #262. Most of a rerun is its tests: the first test still loads its page. The runtime matters only for the first run; a rerun takes about as long on both.

## Workers

Vitest runs test files in parallel on its workers, and every worker has its own tab, with its own server, database, disk and cookies. On the M1 Pro, with `dom-locators`:

| workers | wall, s (3 runs each) |
| ------- | --------------------: |
| 1       |          14.21 ± 0.16 |
| 4       |           6.85 ± 0.16 |

So 4 workers take the run from 14.2 to 6.9 s. 6 add nothing: on an earlier build, before #262, a run took 7.19 ± 0.39 s with 6 workers and 7.14 ± 0.09 s with 4. A series on an earlier build still, also before #262, with 2 workers too, shows why:

| workers                     |    1 |    2 |    4 |    6 |
| --------------------------- | ---: | ---: | ---: | ---: |
| the test files' ms per test | 27.2 | 32.0 | 39.6 | 50.0 |
| cores used, about           |  1.6 |  2.9 |  5.0 |  6.2 |
| memory, GB                  |  1.7 |  2.6 |  3.8 |  5.2 |

Two things stop it:

- **Each page gets slower when others run.** With 4 workers, every test takes 1.46× as long, and with 6, 1.85×. It's not a lack of cores: the run uses 5 of 10. It's the machine's caches and memory bandwidth, which the pages share. A probe without Vitest shows it: arithmetic is 1.05× as slow with 4 copies running, work that allocates a lot of memory 1.29× as slow with 4 and 1.59× with 6. Four separate processes of 1 worker, each with its own dev server and Chromium, are no faster: their flow files take as long per test as with 4 workers in one process: flow-create-many 69 ms in both. The dev server is 12% busy during the tests. Postgres in WebAssembly slows the most, 1.81×; React's rendering hardly slows, 1.02×.
- **A test file runs on one worker.** With 6 workers, the longest file, 50 tests of flows, takes 4.45 s alone, and the run can't end before it does. The start grows too: the first test begins at 2.50 s, where it begins at 2.11 s with 4 workers, as every worker loads Next's layers and PGlite at once.

With 4 workers, Vitest balances the files well: on the build of 7.14 s, every worker begins its first test at 2.11 s and ends between 6.78 and 6.87 s.

Set the number in your config, or for one run:

```ts
test: { maxWorkers: 4 },
```

```bash
npx vitest run --maxWorkers 4
```

Each worker loads Next's runtime before its first test, so many workers on few cores can time out the first test. The notes demo sets `maxWorkers: 4`. Test files of about the same length, rather than one long one, let more workers help.

The benchmark compares Vitest with Playwright on 1 worker. Playwright's tests share one database there, Postgres in Docker, so they can't run in parallel; every worker of Vitest has a database of its own. A run of Vitest with 4 workers is a different comparison, not the same benchmark faster.

## Without a browser

Draft #261 runs the page without Browser Mode, and #267 adds jsdom and the benchmark: in a project of Vitest with `environment: "happy-dom"` or `"jsdom"`, the page runs in a worker of Node.js with that DOM, and the plugin is its host. It's for a machine without a browser, like a container of CI without Chromium. It doesn't make a run faster.

On the `dom-locators` column, fast mode, 1 worker, Vitest on Node.js, on #251 before #262 (3 interleaved runs each):

| the page in |      wall, s | per test, against Chromium | memory of the process tree | tests                 |
| ----------- | -----------: | -------------------------: | -------------------------: | --------------------- |
| Chromium    | 15.96 ± 0.18 |                            |                     1.7 GB | 500 passed            |
| happy-dom   | 16.70 ± 0.32 |                    +1.5 ms |                     2.2 GB | 496 passed, 4 skipped |
| jsdom       | 27.12 ± 1.77 |                     +22 ms |                     2.1 GB | 500 passed            |

happy-dom saves what Chromium does in native code, React's writes to the DOM and the style, layout and paint, about 4 ms per test, and spends it on its own DOM in JavaScript, about 4.5 ms. The HTML of a page load is parsed on the server's thread, 0.4 ms more per page load. jsdom's DOM costs about 17 ms per test, and the queries of `dom-locators` are 4× as slow in it. Memory doesn't go down either: one process of Node.js holds the page, the server, the database and the DOM.

With 4 workers, both run 2.2× as fast as with 1: Vitest's `Duration` goes from 15.14 to 6.92 s in Chromium and from 16.13 to 7.42 s in happy-dom (1 run with 1 worker, 3 with 4). Each worker of happy-dom adds about 1.2 GB, where a page of Chromium adds 0.7 GB: 5.7 GB against 3.9 GB with 4 workers.

What a DOM of Node.js does otherwise than a browser:

- **No layout.** Every box is empty: `dom-locators` tells what is visible by the style alone, and a click reaches an element under an overlay.
- **No stylesheets that the document links.** A rule of the app's CSS, like `display: none`, hides nothing.
- **No loads of a document.** `form.submit()` and a traversal of the history aren't heard, and in jsdom neither are `location.assign()`, `replace()`, `reload()` and `href`.
- **Untrusted events.** `isTrusted` is `false`, as with `dom-locators` in Chromium.
- **happy-dom's `<output>`.** Its default value is `""`, not its text, so the reset of a form after its action empties it: the error of the notes app's sign-in form. Those are the 4 tests the benchmark skips.

The architecture notes of #267 have the full list.

## Measure your own app

The benchmark's configs are in [`playground/vitest-vs-playwright-notes`](../playground/vitest-vs-playwright-notes/). Copy them and adapt them to your app: `test/profile.ts` times the queries through the app's `db` module, and `bench/` opens the notes app's routes.

- **A CPU profile of each page**: `vitest run -c vitest.profile.config.ts` writes a profile per test file to `profiles/`, and `python3 test/profile-summary.py` sums them up by package: yours, the plugin's, Next's, React's, the browser's. It profiles every page of a run with several workers too.
- **A trace of Chrome**: `VITEST_PROFILE=trace` writes `traces/`, and `python3 test/trace-summary.py` sums up what the browser itself did: style, layout, paint, garbage collection, the microtasks of promises.
- **The timings of every request**: `VITEST_PROFILE=timings` writes `timings/`, and `python3 test/timings-summary.py` splits each page load, navigation and Server Action into its phases on the server, with the queries of the database in each.
- **The primitives**: `vitest run -c vitest.bench.config.ts --maxWorkers 1` times a page load, a navigation, a Server Action, a click, a query and a query of the database a hundred times each, and `python3 bench/compare.py old.json new.json` puts two runs side by side. See the [benchmark's README](../playground/vitest-vs-playwright-notes/README.md).

The benchmark's config also prices one speed feature: `VITEST_PLUGIN_RSC_FEATURES="keepApp=false"` turns one off over `VITEST_PLUGIN_RSC_MODE`, and `"fastCrypto"` turns one on.

To trust a number:

- **Compare on one machine, interleaved.** Run A and B in turns, 3 to 5 times each, and compare the medians. CI runners of one kind differed by 40% in one A/B, so compare runs within one job, not jobs.
- **Warm up after a change.** The first run after a change of the config, the dependencies or the plugin optimizes the dependencies again, 1.5–3.5 s more.
- **Keep the machine quiet.** Another Vitest run on the machine slowed a run by up to 1.5 s; the rest of a desktop varies it by 3–5%.
- **Measure a reference beside the number.** The same build took 14.28 s by the mean in one session and 15.22 s an hour later: between sessions a wall holds to about a second, and a difference holds only within one interleaved session. Next to an earlier build, in one interleaved session, the headline build took 1.09 s less by the median, faster in each of 5 rounds; measured an hour apart, their walls differed by 0.07 s.
- **Look at the kind, not just the wall.** A change should move the phase it targets, and the timings show which. A run that's slower everywhere is the machine.
- **Check that a change is in effect where you measure.** A change of the app is in the column whose tests use it: in one build, the signed cookie of #276 reached the `user-event` tests and not the `dom-locators` tests, whose copy of the sign-in helper didn't set it. The timings showed it: the requests' queries stayed where they were.

## How the numbers were measured

Unless a section says otherwise, a number comes from the 500 tests of the notes benchmark, [`playground/vitest-vs-playwright-notes`](../playground/vitest-vs-playwright-notes/README.md): a notes app on Postgres with Drizzle, with accounts, sessions, search, favorites and forms, in 22 test files. 150 tests open one page or submit one form; 350 are flows of 8 to 25 interactions each. They ran with Next and React in production, Vitest on Bun, 1 worker and a warm dependency cache, on an M1 Pro with 8 performance and 2 efficiency cores and 32 GB.

The headline build is #251 with #276, before #277, with `dom-locators` (#255) and the host in Node.js (#261, #267) merged in. A section that ran on an earlier build of #251 names the pull requests it ran before.

A wall time is the mean of 3 to 5 runs with [hyperfine](https://github.com/sharkdp/hyperfine), or of an interleaved A/B. A run of the whole suite varies by 3–5% between identical runs on that machine within one session, so a difference under about 2 ms per test is noise at that count. Some series ran through a script that added 0.5 s to every wall; a difference between two of their runs holds, and their walls appear here only as differences, or as "about" with the 0.5 s taken off.

"ms per test" is a time divided by the 500 tests: 1 ms per test is 0.5 s of a run.
