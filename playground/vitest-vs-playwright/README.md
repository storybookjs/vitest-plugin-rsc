# Vitest vs Playwright

A small Next.js app, todos on Postgres with Drizzle, and the same 25 tests in 5 files twice:

- `tests/vitest/*.test.tsx`: Vitest browser mode with `renderServer({ url })`. The database is PGlite in the page (`lib/__mocks__/db.ts`). `isolate: false`, Next and React in production by default.
- `tests/playwright/*.spec.ts`: Playwright against `next start` after `next build`, or against `next dev` with `PLAYWRIGHT_SERVER=dev`, on Postgres in Docker, in RAM.

Each Playwright test is the Vitest test of the same name in the file of the same name, step for step: `page.goto(url)` for `renderServer({ url })`, `toBeVisible()` for `toBeInTheDocument()`. Both write and read their data with `test/db.ts`, on the app's own `db`, and empty the table before each test, with `DELETE`, not `TRUNCATE`. Both wait for the page to hydrate before they use it: `renderServer()` does, and so does `page.goto()` of `tests/playwright/test.ts`, with Next's test mode (`__NEXT_TEST_MODE`). Both run with 1 worker.

The workflow `.github/workflows/vitest-vs-playwright.yml` runs Vitest in development and Playwright against `next dev`, and Vitest in production and Playwright against `next build` and `next start`, and writes what each step took to the summary of the run.

Vitest runs on [Bun](https://bun.sh) here: `bun --bun vitest run`, which `pnpm test:vitest` and the workflow run, has Bun run Vitest's own process, with Vite and Playwright; the tests still run in Chromium. Measured on the notes app, `../vitest-vs-playwright-notes`, with one test file, it starts about 2.8 s sooner than `pnpm exec vitest run` (10.4 s), and `bun vitest`, Vitest still on Node.js, about 1.9 s; once started, the tests take the same time. `pnpm exec` alone costs about 1.1 s, so `./node_modules/.bin/vitest` starts sooner too. On Bun, Vite keeps its dependency cache in `node_modules/.vite-bun` (`cacheDir` in `vitest.config.ts`): Vite's hash of the config stringifies its functions, which Bun prints differently, so one runtime's cache would be stale for the other, and every switch would optimize the dependencies again. `pnpm test:vitest:node` runs Vitest on Node.js.

```bash
# Vitest
pnpm --dir ../.. --filter vitest-plugin-rsc build
bun --bun vitest run --maxWorkers 1
VITEST_PLUGIN_RSC_BUILD=development bun --bun vitest run --maxWorkers 1

# Playwright
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres \
  --tmpfs /var/lib/postgresql/data postgres:17 \
  -c fsync=off -c synchronous_commit=off -c full_page_writes=off
export __NEXT_TEST_MODE=1
PLAYWRIGHT_SERVER=dev pnpm exec playwright test
pnpm build
pnpm exec playwright test
```
