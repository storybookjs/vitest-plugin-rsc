# Fast testing patterns

How to make the tests of a Next.js App Router app fast: what a test costs, the patterns that make it cheaper with what each gives up, how to find where your own suite spends its time, and what didn't pay. Read it once, before you tune anything. Every number was measured, and its footnote says on what, when and how often. [Fast tests](fast-tests.md) has the full measurements behind most of them.

> [!NOTE]
> **Status, 25 October 2026.** Fast mode and its features are on [#251](https://github.com/storybookjs/vitest-plugin-rsc/pull/251), not released yet. `dom-locators` (#255) is on #251 too; the host of the page in Node.js (#261 and the PRs on top of it) is on draft pull requests. A pattern that needs the host in Node.js says so. Several numbers ran on a build with both merged in; the host in Node.js also changes the browser's side of the plugin, and what that does to a run in Chromium isn't measured on its own.

- [What costs what](#what-costs-what)
- [The patterns](#the-patterns)
  - [Fast mode for the loop, fidelity mode in CI](#fast-mode-for-the-loop-fidelity-mode-in-ci)
  - [Next and React in production](#next-and-react-in-production)
  - [One server per worker: `isolate: false`](#one-server-per-worker-isolate-false)
  - [The database in the page](#the-database-in-the-page)
  - [Wait for the page, never for a time](#wait-for-the-page-never-for-a-time)
  - [Clicks and queries in the page](#clicks-and-queries-in-the-page)
  - [Vitest on Bun](#vitest-on-bun)
  - [Workers, up to the knee](#workers-up-to-the-knee)
  - [Without a browser: happy-dom or jsdom](#without-a-browser-happy-dom-or-jsdom)
  - [Screenshots on failure only](#screenshots-on-failure-only)
- [Find your own time](#find-your-own-time)
- [What didn't pay](#what-didnt-pay)
- [Sources](#sources)

## What costs what

Everything runs on one thread, the main thread of the test's tab: the test, Next's server, the database, React and the DOM, one after the other. So a test costs the sum of what it does. On the 500 tests of the notes benchmark, [`playground/vitest-vs-playwright-notes`](../playground/vitest-vs-playwright-notes/README.md), on an M1 Pro:

| what                                                        |                    costs | source           |
| ----------------------------------------------------------- | -----------------------: | ---------------- |
| the start of a run of 500 tests, Bun, warm cache            |                   ≈2.2 s | [^run-split]     |
| a run of one test file of 10 tests, Bun / Node.js           |            2.3 s / 3.3 s | [^one-file]      |
| a test, fast mode, 1 worker, with `dom-locators`            |                  23.4 ms | [^stand-3]       |
| the same with `user-event`                                  |                  24.5 ms | [^modes]         |
| the same test, Playwright against `next start`              |                   ≈0.4 s | [^playwright]    |
| a page load, the server's side / with its render            |          1.5 ms / 4.3 ms | [^requests]      |
| a navigation                                                |          1.3 ms / 3.1 ms | [^requests]      |
| a Server Action                                             |          2.5 ms / 4.5 ms | [^requests]      |
| a query of the database, Postgres in WebAssembly            |             0.21–0.26 ms | [^requests]      |
| emptying the tables before a test                           |                  0.30 ms | [^reset]         |
| a click: Vitest's `page`, `user-event`, `dom-locators`      | ≈50 ms, 0.12 ms, 0.14 ms | [^primitives]    |
| a wait for a change, without `watchDom`, with it            |       ≈22 ms, 3.3–5.4 ms | [^watch-dom]     |
| `page.screenshot()`                                         |                   ≈70 ms | [^screenshot]    |
| the DOM in happy-dom instead of Chromium, per test, Node.js |                  +1.5 ms | [^node-host]     |
| the same on Bun, 1 worker                                   |                   ≈−1 ms | [^node-host-bun] |
| one more worker                                             |       ≈0.6–0.7 GB memory | [^workers]       |

What that means for a suite:

- **A test is its requests and its clicks.** A test of the benchmark makes 1.3 page loads, 2.3 navigations and 2.1 Server Actions, and they take 44% of its time; the page itself, React, Next's router, the clicks and the assertions, the rest.[^requests]
- **The start counts for a short run, the tests for a long one.** One file is mostly start. 500 tests are mostly tests: 2.2 s of start against about 12 s of tests.
- **Anything that leaves the tab is expensive.** A click of Vitest's `page` goes to Playwright in Node.js and back: about 50 ms, the time of two whole tests. A screenshot is three.
- **A fixed wait adds up fast.** A test of the benchmark waits for the app 4.3 times. At 20 ms a wait, that's about 86 ms, against a test of 23 ms.[^watch-dom]

## The patterns

### Fast mode for the loop, fidelity mode in CI

Fidelity mode, the default, gives up nothing for speed: a test sees what a browser shows of your app. Fast mode gives up a few things a test rarely looks at, and takes about 8–9 ms off each test of the benchmark: 19.07 s against 14.73 s for 500 tests with `user-event`, 1 worker.[^modes] Use it where you wait for the result, like a watch run or a coding agent's loop, and keep CI in fidelity mode, so CI tells you when a test passes only in fast mode.

Turn it on for one run, and leave `mode` out of the config:

```bash
VITEST_PLUGIN_RSC_MODE=fast npx vitest
```

A `mode` in the config wins over the variable, so `vitestPluginNext({ mode: "fast" })` would run CI in fast mode too.

Fast mode is a set of speed features, each an option of its own. What each saved on top of fidelity mode with `watchDom`, on an earlier build, and what it gives up:[^features]

| feature          | ms per test | gives up                                                                                                                                       |
| ---------------- | ----------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `keepApp`        |         3.5 | a fresh page per test: module state carries over within a file, no server HTML, no hydration mismatch, no 404 or 500 of a page, no dev overlay |
| `flightLoads`    |  2.7 on top | the document as the `response`                                                                                                                 |
| `skipPrefetch`   |         3.0 | the requests of prefetches, and the routes rendered from them, in production                                                                   |
| `fastCrypto`     |         1.6 | password hashes of the real algorithm, like one in a fixture                                                                                   |
| `cacheDevServer` |   see below | a change through another connection than the page's is seen later                                                                              |
| `immediates`     |         0.1 | the delay a browser adds to a timeout of 0 between the steps of a render                                                                       |

`cacheDevServer` saved 5.4 ms per test there. Since #284 the dev server tells the page of every change of its modules, which took most of that wait off fidelity mode too.[^push] What `cacheDevServer` still saves on top of #284 isn't measured: the one comparison ran on a version that didn't read the option. `immediates` measures nothing in either mode. Whether to keep either option is open on #251 (#279, #280).

Pick what you give up: an option you set overrides the mode, in either direction.

```ts
vitestPluginNext({ fastCrypto: false });
vitestPluginNext({ skipPrefetch: true });
```

What each feature does is in [Fast mode](nextjs-guide.md#fast-mode).

### Next and React in production

`vitestPluginNext({ build: "production" })` runs Next and React as `next start` does, and every number on this page was measured so. React's development build records where each element was created, and Strict Mode renders a Client Component twice. In one app's suite of 1034 browser tests, production took the suite from 51 to 41 seconds, and the median test that opens a page from 115 to 64 ms.[^production]

```ts
vitestPluginNext({ build: "production" });
```

What a test gives up in production:

- **React's warnings**, like a missing key or the rules of hooks: not logged.
- **React's error messages**: a number and a link instead.
- **The message of a server error in the browser**: a deployment's `digest` instead, which is what a user would see.
- **Owner stacks**, and Strict Mode's second render and effects: an impure render goes unnoticed.
- **React's `act()`**: Testing Library's `render()` throws without it.

It's still experimental. The full list is in [Development or production](internals/next-routes.md#development-or-production).

### One server per worker: `isolate: false`

With `isolate: false`, a worker loads Next's server layers and the database once, for its first test file, and keeps them for the files after it. In the benchmark, the first file's setup takes 0.93 s, Next's layers 0.34 of it and PGlite 0.49; each file after it starts in about 12 ms.[^run-split] With `isolate: true`, every file would load them again.

```ts
// vitest.config.ts
test: {
  isolate: false,
  setupFiles: ["./vitest.setup.ts"],
},
```

What it gives up: the test files of a worker share modules. A `vi.mock()` belongs in the setup file, where every file gets it ([Mocks](nextjs-guide.md#mocks)), and state of your own, like a `Map` in a module, is yours to reset in a `beforeEach()`. The plugin resets the disk, Next's cache, cookies and storage before every test.

Each test file still starts its routes again. A run of 500 tests has 105 first requests of a route in a file, and they cost about 0.5 s more than later ones: about 1 ms per test.[^first-request] Keeping them across files would mean module state that depends on which worker ran which file, so the plugin doesn't.

### The database in the page

Your database runs in the tab, as an engine in WebAssembly, so a query is CPU time on the thread that also clicks and renders, not a round trip. [Databases](databases.md) has a recipe per database and ORM. The notes apps use PGlite: their Vitest config makes a data dir in Node.js, with the tables in it, and the mock of `db.ts` starts PGlite from it in the tab, so the tab runs no `initdb` and no migrations.

**Empty the tables before each test, in one round trip.** Every worker has a database of its own, so emptying it is all the isolation a test needs. One string of `DELETE`s takes 0.30 ms:[^reset]

```ts
// playground/nextjs-notes-demo/lib/__mocks__/db.ts
const emptyAllTables = [
  "SET session_replication_role = replica",
  ...tables.map((table) => `DELETE FROM ${table}`),
  "SET session_replication_role = DEFAULT",
].join(";\n");

export async function resetDb(): Promise<void> {
  await client.exec(emptyAllTables);
}
```

`TRUNCATE` is slower: it gives every table new files, 1.4 ms per test.[^reset]

**Fewer queries.** A query takes 0.21–0.26 ms, about half of it Postgres itself. What makes a data layer fast in production makes it fast here. The benchmark kept the signed-in user in a signed cookie, as Better Auth's cookie cache does, and took 1.4–1.5 ms off each test; Drizzle's prepared statements took about 0.7 ms.[^data-layer] [A fast data layer in tests](databases.md#a-fast-data-layer-in-tests) has the code of each.

**Data per test, where workers share a database.** Playwright's tests share one server and one database, so emptying it before a test would delete another worker's rows. Every column of the benchmark gives each test data of its own instead (#298): a user with a unique email, and the ids of the notes its seed returns. Nothing is emptied between tests.

```ts
// playground/vitest-vs-playwright-notes/test/db.ts
export function seedNotes(ownerId: number, list: NewNote[]) {
  return db
    .insert(notes)
    .values(list.map((note) => ({ ownerId, ...note })))
    .returning();
}
```

With `PLAYWRIGHT_ISOLATION=worker` (#297), the benchmark does the other thing: a server and a database per worker of Playwright, and the tables emptied before each test, as before #298. The table of [the benchmark's README](../playground/vitest-vs-playwright-notes/README.md) has the two side by side. In Vitest every worker has its own database already, and the reset takes 0.30 ms a test, 0.15 s of a run of 500 tests at 1 worker,[^reset] so data per test can win little more than that there; the two haven't run side by side in Vitest yet.

**Pin the clock before the database starts.** PGlite's Postgres times its own timeouts with the page's `Date.now()`. A clock pinned months back after the database armed a timeout puts the timeout months away, longer than a `setTimeout()` can wait. In the host in Node.js, Node.js then fires it at once, and Postgres, which sees that it isn't due, arms it again: 4,037 times in one test.[^clock] It's not measured in Chromium. So call `vi.setSystemTime()` at the top of the setup file, before anything imports the database, rather than in a `beforeEach()` after the reset, as the recipes in [Databases](databases.md) still do:

```ts
// vitest.setup.ts
import { TEST_NOW } from "#test/now.ts";

vi.setSystemTime(new Date(TEST_NOW));

const db = await import("#lib/db.ts");
```

### Wait for the page, never for a time

Wait with `expect.element()` or `expect.poll()`, and don't pass an `interval`. With `watchDom`, on in both modes, they look again on the next change of the document, so a wait ends when the app is done: 3.3–5.4 ms after a Server Action or a navigation. Without it, Vitest looks again after 0, 20, 50 and 100 ms, and a test sees most changes up to 20 ms late. On the benchmark, that is the difference between about 60 s and 26 s for a run in fidelity mode.[^watch-dom]

```ts
await page.getByRole("button", { name: "Archive" }).click();
await expect.element(page.getByText("Archived.")).toBeVisible();
```

- **No `await new Promise((r) => setTimeout(r, 100))`.** It waits 100 ms whether the app took 3 or 300.
- **No `interval` of a poll.** A poll with one keeps Vitest's own wait, at that interval. So does any poll while the test's timers are fake: Vitest advances them by the interval.
- **What changes without a mutation is seen within 5 ms.** A value a script sets on a property changes no attribute and fires no event: the test looks again 5 ms after the last look.

### Clicks and queries in the page

Vitest's `page.getByRole(...).click()` sends the click to Playwright, in Node.js, and back: about 50 ms. Testing Library's `user-event` clicks in the page, in 0.12 ms.[^primitives] A test of a few clicks spends more on Playwright's round trips than on everything else it does.

`dom-locators` (#255, on #251) is Vitest's `page` answered in the document: the same locators, waits and actions, without the round trip. A test changes one import:

```diff
- import { page } from "vitest/browser";
+ import { page } from "dom-locators";
```

On the benchmark, it took 2.0 ms per test off the column with `user-event`, faster in each of 5 interleaved rounds: its queries are faster than Vitest's locators.[^dom-locators] What it gives up against Playwright: every event is the page's own, so `isTrusted` is `false`, and an action doesn't wait for an element to stop moving or for what covers it to go. It's private: the repository uses it, and it isn't on npm.

Without it, `user-event` gets most of the gain. The benchmark wraps it for a locator in [`test/user-event.ts`](../playground/vitest-vs-playwright-notes/test/user-event.ts):

```ts
const user = userEvent.setup({ delay: null });

export async function click(locator: Locator): Promise<void> {
  await user.click((await locator.findElement()) as HTMLElement);
}
```

List Testing Library in `host.packages` of `vitestPluginNext()`, so it loads as the page's own module, as `vitest` does. Any other package is server code in the page:

```ts
vitestPluginNext({
  host: { packages: ["@testing-library/user-event", "@testing-library/dom"] },
});
```

### Vitest on Bun

Bun can run Vitest's own process, with Vite and Playwright; the tests still run in Chromium. A run of one test file takes 2.3 s on Bun and 3.3 s on Node.js with `pnpm exec`, about 0.25 s of which is `pnpm exec` itself. In a run of 500 tests, the time outside the test files is 2.06 ± 0.09 s on Bun and 2.82 ± 0.05 s on Node.js. Once the tests run, they take the same time on both.[^one-file]

```bash
bun --bun vitest run --configLoader native
```

Give Bun a dependency cache of its own. Vite's hash of the config includes its functions as text, which Bun prints differently, so each runtime would find the other's cache stale and optimize the dependencies again: about 1 s more for a run of one file, and 1.5–3.5 s for a run of 500 tests.[^cold-cache]

```ts
// playground/test-helpers/vite-cache.ts
export const cacheDir = process.versions.bun ? "node_modules/.vite-bun" : undefined;
```

Vitest is made for Node.js, not Bun, so keep a run on Node.js in CI. See [Start sooner on Bun](nextjs-guide.md#start-sooner-on-bun).

### Workers, up to the knee

Every Vitest worker has its own tab, with its own server, database, disk and cookies, so test files run in parallel without sharing anything. On the M1 Pro, 10 cores, Bun, fast mode, the 500 tests take, in one session:[^workers]

| workers |    wall | memory, GB |
| ------: | ------: | ---------: |
|       2 | 10.05 s |    2.4–2.5 |
|       3 |  8.47 s |    3.1–3.2 |
|       4 |  7.76 s |    3.7–3.8 |
|       5 |  7.28 s |    4.2–4.3 |
|       6 |  7.37 s |    4.7–5.2 |
|       8 |  8.75 s |    5.9–6.2 |

The knee is at 4 to 5 workers: 5 is the fastest, 4 is about as fast with 0.5 GB less, and 8 is 1.4 s slower than 5. That session was a busy one. In a quieter one, 1 worker took 14.21 s and 4 workers 6.85 s.[^stand-3]

```ts
test: { maxWorkers: 4 },
```

Why it stops there:

- **Each page gets slower when others run.** With 4 workers a test takes 1.46× as long, and Postgres in WebAssembly 1.81×. It's not a lack of cores: the run used 5 of 10. It's the machine's caches and memory bandwidth, which the pages share. Four separate processes of 1 worker are no faster.[^scaling]
- **A test file runs on one worker.** The run can't end before its longest file does. Splitting a file pays only when it's longer than all files together divided by the workers: in the benchmark, from 6 workers up.[^flow-split]
- **Every worker loads Next's runtime before its first test.** With as many workers as cores, a first test can time out. The notes demo sets `maxWorkers: 4`.

On your machine the knee is elsewhere: measure 2, 4 and 6 workers, and take the fewest that are as fast.

Playwright's workers on the same 500 tests, against one `next start` or a server per worker, are in the table of [the benchmark's README](../playground/vitest-vs-playwright-notes/README.md), with both runners on 3000 tests, each at its best worker count.

### Without a browser: happy-dom or jsdom

The draft host of the page in Node.js (#261, and the PRs on top of it) runs the page in a worker of Node.js or Bun, with happy-dom or jsdom as its DOM, without Browser Mode: for a machine without a browser, like a container of CI without Chromium.

Whether it's faster depends on the runtime and the workers. On two builds of #290, 1 worker and 4 each:[^node-host-bun]

| the page in    | 1 worker | 4 workers |
| -------------- | -------: | --------: |
| Chromium, Bun  |  13.90 s |    6.80 s |
| happy-dom, Bun |  13.29 s |    7.46 s |

On 1 worker, happy-dom on Bun was at least as fast as Chromium, likely a little faster: the page's own work took 5.6 s against Chromium's 6.2 s, which includes Vitest's round trips to the page. The gap is within the spread of 3 runs. With 4 workers, happy-dom was 10% slower, in each of 3 rounds. A worker of either takes about 0.7 GB on Bun.

On Node.js, happy-dom took 1.5 ms per test more than Chromium, and a worker of it 1.2 GB. jsdom took 22 ms per test more on #261; two fixes of leaks on #290 took about 10 ms of that off, with Chromium not measured beside them.[^node-host]

What a DOM in Node.js doesn't do:

- **No layout.** Every box is empty: what is visible is told by the style alone, and a click reaches an element under an overlay.
- **No stylesheets that the document links.** A rule of the app's CSS, like `display: none`, hides nothing.
- **No loads of a document.** `form.submit()` and a traversal of the history aren't heard.
- **No screenshots.**

So use it where a browser isn't there, and check what it can't see in Chromium.

### Screenshots on failure only

A `page.screenshot()` costs about 70 ms: one in an `afterEach()` made the 500 tests take 51.10 s instead of 17.70 s.[^screenshot] Vitest takes one of a failed test anyway, into `.vitest/`. Take one in a passing test only when the image is what the test checks.

## Find your own time

A suite isn't the benchmark: measure your own before you change anything.

**Read Vitest's `Duration` line.** It splits a run into `tests`, `setup`, `import` and `worker`, among others. The `worker` share is 2% or less of a warm run of 500 tests, and 3–4% of a run of one file. Far more, 36–52% of a run of one file, means Vite optimized the dependencies again: a changed config, two configs sharing one cache, or Bun and Node.js sharing one.[^cold-cache]

**Profile what the tab does.** The benchmark's [`vitest.profile.config.ts`](../playground/vitest-vs-playwright-notes/vitest.profile.config.ts) is `vitest.config.ts` with a CPU profile of the page per test file, through Chrome's DevTools protocol. It needs `test/profile.ts`, which wraps the app's `db` module for the timings, and the `*-summary.py` scripts beside it. Copy them and adapt them to your app:

```bash
vitest run -c vitest.profile.config.ts --maxWorkers 1
python3 test/profile-summary.py
VITEST_PROFILE=trace vitest run -c vitest.profile.config.ts
VITEST_PROFILE=timings vitest run -c vitest.profile.config.ts
```

`profile-summary.py` sums the profiles up by owner: your code, the plugin, Next, React, the browser. A trace shows what Chrome did itself, like style, layout and garbage collection. The timings split every page load, navigation and Server Action into its phases on the server, with the queries of the database in each. See [Measure your own app](fast-tests.md#measure-your-own-app).

**Compare A and B in turns, in one session.** A run varies by 3–5% on one machine, and drifts by up to a second between sessions: only an A/B within one session holds.[^measure] hyperfine runs all runs of one command before the next, so call it once per round:

```bash
for i in 1 2 3 4 5; do
  hyperfine -N --runs 1 \
    'npx vitest run --config a.config.ts' \
    'npx vitest run --config b.config.ts'
done
```

- **Compare the medians** of 3 to 5 rounds, after a warmup of each.
- **Warm up after every change** of the config, the dependencies or the plugin: the first run optimizes the dependencies again.
- **Keep the machine quiet.** Another Vitest run on the machine slowed a run by up to 1.5 s.
- **Compare runs of one machine, not CI jobs.** CI runners of one kind differed by 40% in one A/B.
- **Look at the kind, not just the wall.** A change should move the phase it targets. A run that's slower everywhere is the machine.

## What didn't pay

Measured or estimated, and not worth doing:

- **PGlite without durability.** `synchronous_commit` and `full_page_writes` off changed nothing: 15.26 against 15.34 s, by the median of 5 interleaved rounds. PGlite doesn't sync to disk in a test already.[^data-layer]
- **`TRUNCATE` instead of `DELETE`.** 1.4 ms per test instead of 0.30, and the first query of the next test took twice as long.[^reset]
- **A preload of the app's client while the setup files run.** The first test took 57–58 ms less, the run as long: it waits for the same modules, before the test instead of in it.[^one-file]
- **Keeping a route's state from one test file to the next.** Estimated, not measured: 0.1–0.5 s of a run of 500 tests, at the price of leaks between files that depend on which worker runs which file. Not built.[^first-request]
- **Separate processes instead of workers.** Four processes of 1 worker, each with its own dev server and Chromium, took 7.9–8.0 s, no faster than 4 workers in one.[^scaling]
- **More workers than the knee.** 8 workers took 1.4 s longer than 5.[^workers]
- **Splitting long test files below the knee.** Seven files of 50 tests split into files of 25 added 0.11 s with 4 workers and nothing with 1: every file pays its setup. With 6 workers it took 0.26 s off.[^flow-split]
- **A DOM in Node.js for speed, on Node.js.** happy-dom took 1.5 ms per test longer than Chromium, and more memory.[^node-host]
- **Fewer forced layouts.** Of the layout that code forces, about 1.9 ms per test, almost all is the layout of the new DOM, which whoever reads first pays. Taking Next's scroll out would save at most 0.15 ms, and changes what a test sees.[^layout]
- **A screenshot in every test.** About 70 ms each.[^screenshot]

## Sources

Every measurement ran on an M1 Pro with 8 performance and 2 efficiency cores and 32 GB, on the 500 tests of the notes benchmark, with Next and React in production, unless the note says otherwise. A wall time is a mean or a median of several runs, as the note says, after a warmup.

[^run-split]: 25 Oct 2026. #251 before #258, #262 and #275, Bun, fast mode, 1 worker, 3 runs. Outside the test files' own time, a run spends 0.88 s until the first file, 0.93 s on that file's setup and 0.27 s on 21 more files, plus about 0.38 s in its first test. [The start of a run](fast-tests.md#the-start-of-a-run).

[^one-file]: 25 Oct 2026. One file of 10 tests, `note-create.test.tsx`, warm cache, medians of 3 runs, on #251 with #275: 2.31 s on Bun, 3.30 s with `pnpm exec` on Node.js. The time outside the test files of a run of 500 tests: 7 runs each, on #251 with #258. The preload: on #251 with #258, before #262 and #275. [The start of a run](fast-tests.md#the-start-of-a-run).

[^stand-3]: 25 Oct 2026. The `dom-locators` column, fast mode, Bun: 14.21 ± 0.16 s for 500 tests with 1 worker and 6.85 ± 0.16 s with 4, 3 runs each, on #251 at c03a1ab3 with #276, with `dom-locators` (#255) and the host in Node.js merged in. Less 2.49 s of start, that's 23.4 ms per test, or 26.60 ms under the CPU profiler. The 2.49 s is worked out, not measured on this build: the 2.2 s outside the test files of [The start of a run](fast-tests.md#the-start-of-a-run), plus the first test's extra 0.38 s, less what #268 and #275 took off. [What a test costs](fast-tests.md#what-a-test-costs).

[^modes]: 25 Oct 2026. The `user-event` column, Bun, 1 worker, both modes with `watchDom`, on #251 with #284 (76aeedb9), in one session: fast mode's 5 rounds, then fidelity mode's 3, each interleaved with #251 before #284. Means 14.73 ± 0.47 s and 19.07 ± 0.79 s, medians 14.78 and 18.80 s. 24.5 ms per test is 14.73 s less the same 2.49 s of start, over 500.

[^playwright]: 25 Oct 2026. The wall of the 500 tests with 1 worker, start included, over 500: the table of [the benchmark's README](../playground/vitest-vs-playwright-notes/README.md), which has both of its Playwright setups and Vitest at 1, 2, 4 and 5 workers.

[^requests]: 25 Oct 2026. One timings run of the `dom-locators` column, on the build of the 1-worker run of [What a test costs](fast-tests.md#what-a-test-costs), at a resolution of 0.1 ms. "With its render" is the CPU profile of that build, idle time included. About 11 queries per test. [Per request](fast-tests.md#per-request), [Where the time goes](fast-tests.md#where-the-time-goes).

[^reset]: 25 Oct 2026. `DELETE` against `TRUNCATE`, the `user-event` column, 5 interleaved rounds: 0.30 against 1.42 ms per test, and 0.31 ms more in the next test. [A fast data layer in tests](databases.md#a-fast-data-layer-in-tests).

[^primitives]: 25 Oct 2026. The benchmark of primitives, fast mode, on the notes page with 20 notes, means of 100: a click of a button that sets state. [What a primitive costs](fast-tests.md#what-a-primitive-costs).

[^watch-dom]: 25 Oct 2026. A find that waits: 21.6 ms (fidelity) and 22.9 ms (fast) without `watchDom`, 5.4 and 3.3 ms with it, medians. A test looks for an element 10.9 times, and 4.3 of those wait. The walls: about 60 → 26 s in fidelity mode and 52 → 17 s in fast mode, 5 runs each, on #251 with #255 before #266. [Waiting for the page](fast-tests.md#waiting-for-the-page).

[^screenshot]: 25 Oct 2026. One `page.screenshot()` of `vitest/browser` in an `afterEach()`, default options, against none: 17.70 → 51.10 s by the median of 3 interleaved rounds, +67 ms per test by the wall and +70 ms by the mean of the timings run. The `dom-locators` column, Bun and Chromium, fast mode, 1 worker, on #251 with the host in Node.js (97e0203d).

[^node-host]: 25 Oct 2026. The `dom-locators` column, fast mode, 1 worker, Vitest on Node.js, 3 interleaved runs each, on #251 before #262 with #261 and #267: Chromium 15.96 ± 0.18 s, happy-dom 16.70 ± 0.32 s, jsdom 27.12 ± 1.77 s; memory 1.7, 2.2 and 2.1 GB. 1.2 GB per extra worker of happy-dom with 4 workers. jsdom on #290: 30.08 → 25.09 s with the two fixes of leaks. [Without a browser](fast-tests.md#without-a-browser).

[^node-host-bun]: 25 Oct 2026. The host in Node.js of #290, the `dom-locators` column, fast mode. 1 worker at 5d7d7bcc, medians of 3 interleaved rounds: Bun with happy-dom 13.29 s for 496 tests (4 skipped: happy-dom's `<output>`), Bun with Chromium 13.90 s for 500, Node.js with happy-dom 16.33 s. 4 workers at b8244337, medians of 3 interleaved rounds: Chromium 6.80 s, happy-dom 7.46 s; memory per extra worker about 0.7 GB for either.

[^features]: 25 Oct 2026. Each feature on alone over fidelity mode with `watchDom`, the wall of 3 runs each against fidelity mode's 24.52 ± 0.62 s, the `user-event` column, on #251 at 8b5dc1ae, before #258 and every pull request after it. `flightLoads` went on over `keepApp`, which it needs. A difference under about 2 ms per test is noise. [The two modes](fast-tests.md#the-two-modes).

[^push]: 25 Oct 2026. #284: fidelity mode 20.73 → 18.44 s by the median of 5 interleaved rounds, faster in each. [The two modes](fast-tests.md#the-two-modes).

[^production]: Before 25 Oct 2026, on another app's suite, not the benchmark. [Development or production](internals/next-routes.md#development-or-production).

[^first-request]: 25 Oct 2026. The `user-event` column, fast mode, on #251 before #262 with #268: 105 first requests of a route per run, about 0.5 s more than the same requests later in a file. A design note on keeping module state across files estimated 0.1–0.5 s per run with 1 worker. [The first request of a route in a test file](fast-tests.md#the-first-request-of-a-route-in-a-test-file).

[^data-layer]: 25 Oct 2026. The signed cookie of #276: 1.4 ms per test in the `user-event` column (15.34 → 14.64 s) and 1.5 ms in the `dom-locators` column (14.83 → 14.08 s), medians of 5 interleaved rounds. Prepared statements: 0.7 ms per test in one timings run per side, faster in 4 of 5 interleaved rounds by the wall. PGlite without durability: medians of 5 interleaved rounds. [A fast data layer in tests](databases.md#a-fast-data-layer-in-tests).

[^clock]: 25 Oct 2026. Not a measurement of speed: one run of one test file of the notes demo in the host in Node.js with happy-dom (`wip/node-host-3`, cca4d2ad), in development and fidelity mode, with `--trace-warnings`. The test timed out at 15 s with 4,037 `TimeoutOverflowWarning`s, all from PGlite's `setitimer`. The clock was pinned 172 days back.

[^dom-locators]: 25 Oct 2026. The `dom-locators` column against the `user-event` column: 16.26 → 15.25 s by the median of 5 interleaved rounds, on #251 before #262, #264 and #266. [`dom-locators`](fast-tests.md#dom-locators).

[^workers]: 25 Oct 2026. The `dom-locators` column, Bun and Chromium, fast mode, on #251 with the host in Node.js (97e0203d), medians of 3 runs after a warmup, peak memory of the process tree, under a load of 12–18 that the workers mostly made themselves.

[^scaling]: 25 Oct 2026. A CPU profile per test with 1 and 4 workers, before #262; a probe without Vitest: work that allocates a lot of memory ran 1.29× as slow with 4 copies, arithmetic 1.05×. Four processes of 1 worker: 7.98 and 7.91 s. [Workers](fast-tests.md#workers).

[^flow-split]: 25 Oct 2026. Draft #285, the `dom-locators` column, Bun, fast mode: 6.79 → 6.53 s with 6 workers, 6.54 → 6.65 s with 4, 3 runs each.

[^cold-cache]: 25 Oct 2026. On Bun and Node.js, 3 and 4 runs each, on the builds of #263. [A cold cache](fast-tests.md#a-cold-cache).

[^measure]: 25 Oct 2026. On the benchmark, within and between sessions. [Measure your own app](fast-tests.md#measure-your-own-app).

[^layout]: 25 Oct 2026. One trace of Chrome per column, without the cost of capturing JavaScript stacks, Bun, fast mode, 1 worker, on #255's branch at 1965555d.
