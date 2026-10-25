# Vitest vs Playwright

A small Next.js app, todos on Postgres with Drizzle, and the same 25 tests in 5 files twice:

- `tests/vitest/*.test.tsx`: Vitest browser mode with `renderServer({ url })`. The database is PGlite in the page (`lib/__mocks__/db.ts`). `isolate: false`, Next and React in production by default.
- `tests/playwright/*.spec.ts`: Playwright against `next start` after `next build`, or against `next dev` with `PLAYWRIGHT_SERVER=dev`, on Postgres in Docker, in RAM.

Each Playwright test is the Vitest test of the same name in the file of the same name, step for step: `page.goto(url)` for `renderServer({ url })`, `toBeVisible()` for `toBeInTheDocument()`. Both write and read their data with `test/db.ts`, on the app's own `db`, and empty the table before each test, with `DELETE`, not `TRUNCATE`. Both wait for the page to hydrate before they use it: `renderServer()` does, and so does `page.goto()` of `tests/playwright/test.ts`, with Next's test mode (`__NEXT_TEST_MODE`). Both run with 1 worker.

The workflow `.github/workflows/vitest-vs-playwright.yml` runs Vitest in development and Playwright against `next dev`, and Vitest in production and Playwright against `next build` and `next start`, and writes what each step took to the summary of the run.

Vitest runs on [Bun](https://bun.sh) here, `bun --bun vitest run --configLoader native`, as `pnpm test:vitest` and the workflow run it: see why in `../vitest-vs-playwright-notes/README.md`. `pnpm test:vitest:node` runs it on Node.js, on a machine without Bun.

```bash
# Vitest
pnpm --dir ../.. --filter vitest-plugin-rsc build
# Without Bun: pnpm exec vitest run, in place of bun --bun vitest run --configLoader native
bun --bun vitest run --configLoader native --maxWorkers 1
VITEST_PLUGIN_RSC_BUILD=development bun --bun vitest run --configLoader native --maxWorkers 1

# Playwright
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres \
  --tmpfs /var/lib/postgresql/data postgres:17 \
  -c fsync=off -c synchronous_commit=off -c full_page_writes=off
export __NEXT_TEST_MODE=1
PLAYWRIGHT_SERVER=dev pnpm exec playwright test
pnpm build
pnpm exec playwright test
```
