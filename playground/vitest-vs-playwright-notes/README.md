# Vitest vs Playwright: notes

A notes app in the style of the notes demo, Next.js on Postgres with Drizzle: accounts with a password and a session cookie, pages that need a signed-in user, notes with search, favorites and forms with `useActionState`, and a profile. The same 500 tests in 22 files twice: 150 short tests of one page or one form, and 350 longer flows of 8 to 25 interactions each (`flow-*`), each flow in 50 variants of its data.

- `tests/vitest/*.test.tsx`: Vitest browser mode with `renderServer({ url })`. The database is PGlite in the page (`lib/__mocks__/db.ts`). `isolate: false`, Next and React in production by default.
- `tests/vitest-user-event/*.test.tsx`: the tests of `tests/vitest/`, with their clicks and fills in the page, by Testing Library's `user-event` (`test/user-event.ts`), where `locator.click()` and `locator.fill()` send each to Node.js, which has Playwright do it. Generated from `tests/vitest/` (`test/user-event-column.ts`), which turns `await locator.click()` into `await click(locator)` and `await locator.fill(text)` into `await fill(locator, text)`. `fill()` clears the field and pastes the text, one input event, as Playwright's `fill()` does.
- `tests/dom-locators/*.test.tsx`: the tests of `tests/vitest/`, with `page` of [dom-locators](../../packages/dom-locators/README.md), which queries, waits and acts in the page itself, instead of `vitest/browser`'s: only the import changed. Generated from `tests/vitest/` (`test/dom-locators-column.ts`), and its helpers `test/dom-locators.ts` from `test/vitest.ts`. `bench/oracle.test.tsx` holds dom-locators' locators to Vitest's own on the app's routes, as the plugin renders them.
- In the plugin's fast mode, `VITEST_PLUGIN_RSC_MODE=fast` (`mode` of `vitestPluginNext()`), the same Vitest tests render each page in the app of the test file from its Flight payload, without HTML of the server, and prefetch no link: a quick feedback loop, like an agent's. Both modes see a change of the page as it happens (`watchDom`). CI runs `tests/vitest-user-event/` in fast mode too, and then in fidelity mode, the default, on the same runner, for the ratio of the two.
- `tests/playwright/*.spec.ts`: Playwright against `next start` after `next build`, or against `next dev` with `PLAYWRIGHT_SERVER=dev`, on Postgres in Docker, in RAM.

The generated columns are never edited by hand: change `tests/vitest/` or `test/vitest.ts`, then `pnpm write-columns` (`test/write-columns.ts`) writes `tests/vitest-user-event/`, `tests/dom-locators/` and `test/dom-locators.ts` again. A column that differs from a fresh generation fails its check in `tests/zz-checks/` (`*-column.test.tsx`), so it can't measure an older version of the tests than the others. Any other action, one that isn't `await page.….click()` or `await page.….fill(text)` on one line (a `clear()`, a `hover()`, `userEvent.keyboard()`, a click with options, a locator in a variable), fails the generation, rather than stay Playwright's in the user-event column.

Each Playwright test is the Vitest test of the same name in the file of the same name, step for step: `page.goto(url)` for `renderServer({ url })`, `toBeVisible()` for `toBeInTheDocument()`. Both seed and read the database with `test/db.ts`, on the app's own `db`, and nothing empties it between tests: each test signs up and signs in as people of its own, `person(ada)` of `test/people.ts`, Ada with an email no other test has; it opens its notes by the ids that `seedNotes()` returns, and reads back the rows of its own users alone. Both sign a user in the same way, with a session in the database and its cookie: `document.cookie` in Vitest, `context.addCookies()` in Playwright. Both wait for the page to hydrate before they use it: `renderServer()` does, and so does `page.goto()` of `tests/playwright/test.ts`, with Next's test mode (`__NEXT_TEST_MODE`).

Every column runs the same 500 tests with the same assertions. Playwright parallelizes them as its docs describe, with nothing of its own: `fullyParallel: true`, as many workers as `--workers` asks for, or Playwright's default, half the cores, and no retries. It runs them in two setups that teams use. In the first, every worker shares one `next start` after `next build`, the `webServer` of `playwright.config.ts`, and one Postgres, whose tables `globalSetup` empties once, before the run; each test creates its own user and its own notes and asserts on those alone, and nothing is emptied between tests. In the second, each worker has a `next start` and a database of its own, which each test empties first: the opt-in of #297. The first isolates the tests by their data, the second by process and database. Vitest runs with `--maxWorkers`, each worker a page with a PGlite of its own, and empties nothing between tests either. At 1 worker the numbers compare the runners test by test; at 4 they compare what each needs to run the suite on one machine.

The 500 tests, Next and React in production, on an M1 Pro with 10 cores, the wall of a run in seconds:

| Runner and setup                                                     |    1 worker |           2 |          4 | 5, Playwright's default |
| -------------------------------------------------------------------- | ----------: | ----------: | ---------: | ----------------------: |
| Playwright, one `next start`, each test on its own data              | 206.3 ± 3.5 | 107.4 ± 0.6 | 62.5 ± 2.3 |              56.2 ± 3.2 |
| Playwright, a `next start` and a database per worker, reset per test | 205.1 ± 0.9 | 107.7 ± 0.4 | 62.2 ± 0.7 |              53.9 ± 0.1 |
| Vitest, fast mode, dom-locators                                      |             |             |            |                         |
| Vitest, fast mode, user-event                                        |             |             |            |                         |

Playwright: the mean of 5 runs after a warmup, 3 at 5 workers, in one session on 25 October 2026 that interleaved both setups (#298 at b0ac2d35, #297 at 33abb13d) with the column before them; `next start` after `next build`, Postgres 17 in Docker on tmpfs. Every run passed all 500. The 1-minute load was 3.7 to 6.5 during the runs with 1 worker and 4.2 to 18.1 with 4 and 5. The two setups are within 1% of each other with 1, 2 and 4 workers; with 5, a server per worker is 2.3 s faster, and the process tree takes 5.3 GB against 4.4 GB, up to 0.9 GB more at 4 and 5 workers. The column before them, 1 worker with the tables emptied before each test, took 205.7 ± 1.9 s in the same session: a test costs the same with data of its own. With more workers each test slows, as they share one machine: by 16 to 26% with 4 workers, the short tests the most, and by 29 to 42% with 5, so 4 workers run the suite 3.3× as fast as 1, and 5 workers 3.7×.

A run costs a part that doesn't grow with the suite and a part per test. In Vitest, the first is 2 to 5 s: Vitest, Vite, the browser and the setup files take about 2.2 s with a warm cache, and the pair of runs of 500 and 3000 tests with happy-dom on 1 worker puts all that doesn't grow at 4.7 s. A test takes about 21 ms on 1 worker: 20.2 ms by that pair. In Playwright, the first is 3 to 5 s, the server's start, `globalSetup` and the wait for the slowest worker: 4.9 s with 1 worker and 3.3 s with 4 and 5 in the runs above. A test takes about 400 ms on 1 worker: 180 ms a short test, 496 ms a flow.

The same suite six times, 3000 tests (each file of `tests/dom-locators/` six times), in Vitest's fast mode on Bun, on the build of `kasper/everything-combined` at 01dce093, with the tables emptied before each test as before #298, the wall in seconds:

| Vitest, 3000 tests |   1 worker |          4 |          5 |          6 |          7 |          8 |
| ------------------ | ---------: | ---------: | ---------: | ---------: | ---------: | ---------: |
| Chromium           | 71.4 ± 0.5 | 26.7 ± 0.2 | 23.4 ± 0.1 | 21.6 ± 0.0 | 21.9 ± 0.2 | 23.3 ± 0.9 |
| happy-dom          | 65.4 ± 2.4 | 27.0 ± 0.2 | 27.2 ± 1.2 | 23.6 ± 0.3 | 26.5 ± 3.7 |            |

2 or 3 runs a cell after a warmup; every run passed (happy-dom skips its 4 known gaps in each copy). From 6 workers up the machine is saturated: the 1-minute load reached 13 to 22 with 6 workers and 33 to 40 with 7 and 8, on 10 cores, for no gain. No file and no copy slowed over a run.

The workflow `.github/workflows/vitest-vs-playwright.yml` runs both and writes what each step took to the summary of the run.

Vitest runs on [Bun](https://bun.sh) here: `pnpm test:vitest` and the workflow run `bun --bun vitest run --configLoader native`, and `pnpm test:vitest:node` runs it on Node.js, on a machine without Bun. Bun runs Vitest's own process, with Vite and Playwright, and the tests still run in Chromium. Measured with one test file on an M1 Pro, a run took about 3.3 s with `pnpm exec vitest run` and 2.3 s on Bun, before the patch of `@vitest/mocker`; once started, the tests take the same time. About 0.25 s of that is `pnpm exec` alone, which `./node_modules/.bin/vitest` skips on Node.js too. On Bun, Vite keeps its dependency cache in `node_modules/.vite-bun` (`cacheDir`, in `../test-helpers/vite-cache.ts`): Vite's hash of the config stringifies its functions, which Bun prints differently, so one runtime's cache would be stale for the other, and every switch would optimize the dependencies again. One entry of the workflow's vitest job runs the user-event tests in fast mode on Node.js, to compare; the profile and the benchmark of primitives run on Node.js too.

`vitest.profile.config.ts` profiles each page of a run: a CPU profile per test file in `profiles/` (`test/profile-summary.py`), a trace of Chrome with `VITEST_PROFILE=trace` (`test/trace-summary.py`), or the timings of each request with `VITEST_PROFILE=timings` (`test/timings-summary.py`). It keeps a session per page, so it profiles a run with several workers too: `--maxWorkers 4` profiles four pages at once, each with its own files.

The benchmark of primitives, `pnpm exec vitest run --configLoader native -c vitest.bench.config.ts --maxWorkers 1` (with `VITEST_PLUGIN_RSC_MODE=fast` for fast mode), times what the 500 tests are made of, each a hundred times, in `bench/`: the startup until the first test, a page load (`ssr` on and off), a navigation, a Server Action, an event of each kind (user-event, the DOM's own, Playwright's, dom-locators'), a wait, a query (Vitest's locators, dom-locators', Testing Library's) and a query of the database. It prints min, median, p90 and max of each, and the server's and the client's share, and writes them to `bench-results/<mode>.json` (`BENCH_LABEL` names it otherwise); `python3 bench/compare.py old.json new.json` puts two runs side by side. The workflow runs it in both modes too. With `BENCH_INCLUDE=tests/vitest-user-event/note-create.test.tsx` it runs that file in place of `bench/`, for the table of its startup alone: the marks since the shell started the command (`BENCH_SHELL_START=$(date +%s%3N)`, with GNU `date`: `gdate` on macOS), from the config through Vite's server, the browser and the setup files to the first page and the end of the first test.

```bash
# Vitest
pnpm --dir ../.. --filter vitest-plugin-rsc build
# Without Bun: pnpm exec vitest run, in place of bun --bun vitest run --configLoader native
bun --bun vitest run --configLoader native --maxWorkers 1 tests/vitest/
bun --bun vitest run --configLoader native --maxWorkers 1 tests/vitest-user-event/
VITEST_PLUGIN_RSC_MODE=fast bun --bun vitest run --configLoader native --maxWorkers 1 tests/vitest-user-event/
VITEST_PLUGIN_RSC_MODE=fast bun --bun vitest run --configLoader native --maxWorkers 4 tests/vitest-user-event/
VITEST_PLUGIN_RSC_BUILD=development bun --bun vitest run --configLoader native --maxWorkers 1 tests/vitest/

# Playwright
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres \
  --tmpfs /var/lib/postgresql/data postgres:17 \
  -c fsync=off -c synchronous_commit=off -c full_page_writes=off
export __NEXT_TEST_MODE=1
PLAYWRIGHT_SERVER=dev pnpm exec playwright test --workers 1
pnpm build
pnpm exec playwright test --workers 1
pnpm exec playwright test --workers 4
```
