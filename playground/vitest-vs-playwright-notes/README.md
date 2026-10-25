# Vitest vs Playwright: notes

A notes app in the style of the notes demo, Next.js on Postgres with Drizzle: accounts with a password and a session cookie, pages that need a signed-in user, notes with search, favorites and forms with `useActionState`, and a profile. The same 500 tests in 22 files twice: 150 short tests of one page or one form, and 350 longer flows of 8 to 25 interactions each (`flow-*`), each flow in 50 variants of its data.

- `tests/vitest/*.test.tsx`: Vitest browser mode with `renderServer({ url })`. The database is PGlite in the page (`lib/__mocks__/db.ts`). `isolate: false`, Next and React in production by default.
- `tests/vitest-user-event/*.test.tsx`: the tests of `tests/vitest/`, with their clicks and fills in the page, by Testing Library's `user-event` (`test/user-event.ts`), where `locator.click()` and `locator.fill()` send each to Node.js, which has Playwright do it. Made from `tests/vitest/` by turning `await locator.click()` into `await click(locator)` and `await locator.fill(text)` into `await fill(locator, text)`. `fill()` clears the field and pastes the text, one input event, as Playwright's `fill()` does.
- `tests/dom-locators/*.test.tsx`: the tests of `tests/vitest/`, with `page` of [dom-locators](../../packages/dom-locators/README.md), which queries, waits and acts in the page itself, instead of `vitest/browser`'s: only the import changed, by `node test/write-dom-locators-tests.ts`, which writes the directory and `test/dom-locators.ts` again from `tests/vitest/` and `test/vitest.ts`. `bench/oracle.test.tsx` holds dom-locators' locators to Vitest's own on the app's routes, as the plugin renders them.
- `VITEST_DOM=happy-dom` or `VITEST_DOM=jsdom` runs `tests/dom-locators/` without a browser: in a worker of Node.js, with the DOM of happy-dom or jsdom, where the plugin is the page's host itself (see [the Node host](../../docs/internals/architecture.md#the-node-host)). happy-dom on Bun too, `bun --bun vitest run --configLoader native`, whose runtime then runs the worker; jsdom on Node.js only, `pnpm exec vitest run`, as Vitest's environment of jsdom does not start on Bun. `vitest.setup.node.ts` adds what Browser Mode has of Vitest's own: `expect.element()`, from dom-locators, and the matchers of the DOM, from `@testing-library/jest-dom`. The other columns query with `vitest/browser`'s `page`, which needs the browser.
- In the plugin's fast mode, `VITEST_PLUGIN_RSC_MODE=fast` (`mode` of `vitestPluginNext()`), the same Vitest tests render each page in the app of the test file from its Flight payload, without HTML of the server, and prefetch no link: a quick feedback loop, like an agent's. Both modes see a change of the page as it happens (`watchDom`). CI runs `tests/vitest-user-event/` in fast mode too, and then in fidelity mode, the default, on the same runner, for the ratio of the two.
- `tests/playwright/*.spec.ts`: Playwright against `next start` after `next build`, or against `next dev` with `PLAYWRIGHT_SERVER=dev`, on Postgres in Docker, in RAM.

Each Playwright test is the Vitest test of the same name in the file of the same name, step for step: `page.goto(url)` for `renderServer({ url })`, `toBeVisible()` for `toBeInTheDocument()`. Both seed and read the database with `test/db.ts`, on the app's own `db`, and empty it before each test. Both sign a user in the same way, with a session in the database and its cookie: `document.cookie` in Vitest, `context.addCookies()` in Playwright. Both wait for the page to hydrate before they use it: `renderServer()` does, and so does `page.goto()` of `tests/playwright/test.ts`, with Next's test mode (`__NEXT_TEST_MODE`). Both run with 1 worker: the Playwright tests share one database.

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
VITEST_PLUGIN_RSC_BUILD=development bun --bun vitest run --configLoader native --maxWorkers 1 tests/vitest/
# Without a browser, in a DOM of Node.js
VITEST_DOM=happy-dom VITEST_PLUGIN_RSC_MODE=fast pnpm exec vitest run --configLoader native --maxWorkers 1 tests/dom-locators/
VITEST_DOM=jsdom VITEST_PLUGIN_RSC_MODE=fast pnpm exec vitest run --configLoader native --maxWorkers 1 tests/dom-locators/

# Playwright
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres \
  --tmpfs /var/lib/postgresql/data postgres:17 \
  -c fsync=off -c synchronous_commit=off -c full_page_writes=off
export __NEXT_TEST_MODE=1
PLAYWRIGHT_SERVER=dev pnpm exec playwright test
pnpm build
pnpm exec playwright test
```
