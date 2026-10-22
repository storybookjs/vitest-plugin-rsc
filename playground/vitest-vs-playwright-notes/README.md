# Vitest vs Playwright: notes

A notes app in the style of the notes demo, Next.js on Postgres with Drizzle: accounts with a password and a session cookie, pages that need a signed-in user, notes with search, favorites and forms with `useActionState`, and a profile. The same 150 tests in 15 files twice:

- `tests/vitest/*.test.tsx`: Vitest browser mode with `renderServer({ url })`. The database is PGlite in the page (`lib/__mocks__/db.ts`). `isolate: false`, Next and React in production by default.
- `tests/playwright/*.spec.ts`: Playwright against `next start` after `next build`, or against `next dev` with `PLAYWRIGHT_SERVER=dev`, on Postgres in Docker, in RAM.

Each Playwright test is the Vitest test of the same name in the file of the same name, step for step: `page.goto(url)` for `renderServer({ url })`, `toBeVisible()` for `toBeInTheDocument()`. Both seed and read the database with `test/db.ts`, on the app's own `db`, and empty it before each test. Both sign a user in the same way, with a session in the database and its cookie: `document.cookie` in Vitest, `context.addCookies()` in Playwright. Both wait for the page to hydrate before they use it: `renderServer()` does, and so does `page.goto()` of `tests/playwright/test.ts`, with Next's test mode (`__NEXT_TEST_MODE`). Both run with 1 worker: the Playwright tests share one database.

The workflow `.github/workflows/vitest-vs-playwright.yml` runs both and writes what each step took to the summary of the run.

```bash
# Vitest
pnpm --dir ../.. --filter vitest-plugin-rsc build
pnpm exec vitest run --maxWorkers 1
VITEST_PLUGIN_RSC_BUILD=development pnpm exec vitest run --maxWorkers 1

# Playwright
docker run -d --name postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres \
  --tmpfs /var/lib/postgresql/data postgres:17 \
  -c fsync=off -c synchronous_commit=off -c full_page_writes=off
export __NEXT_TEST_MODE=1
PLAYWRIGHT_SERVER=dev pnpm exec playwright test
pnpm build
pnpm exec playwright test
```
