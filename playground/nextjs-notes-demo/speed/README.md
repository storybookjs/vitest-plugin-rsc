# Vitest vs Playwright

The same 25 tests of the notes demo, in 5 files of 5 tests, twice:

- `vitest/*.test.tsx`: Vitest browser mode with `renderServer({ url })`, as the other tests of the app. The database is PGlite in the memory of the page (`lib/__mocks__/db.ts`), emptied before each test. `isolate: false`, and `VITEST_PLUGIN_RSC_BUILD=production`, which runs Next and React with their production code, as `next start` does.
- `playwright/*.spec.ts`: Playwright against `next start` after `next build`, on Postgres in Docker, in RAM (`tmpfs`, `fsync=off`). The tests share that database and run in parallel, `fullyParallel`, so each signs in a user of its own (`playwright/app.ts`).

Each Playwright test is the Vitest test of the same name in the file of the same name, step for step: `page.goto(url)` for `renderServer({ url })`, `toBeVisible()` for `toBeInTheDocument()`. Both sign a user in as Better Auth would have, with a session in the database and its signed cookie, and write their data with the app's own Drizzle schema.

The workflow `.github/workflows/vitest-vs-playwright.yml` runs both with 1 worker each, one test after the other, on a runner of their own, and writes what each step took to the summary of the run.

## Locally

```bash
# Vitest
pnpm build
VITEST_PLUGIN_RSC_BUILD=production pnpm exec vitest run --configLoader runner \
  --config playground/nextjs-notes-demo/vitest.config.ts \
  --project nextjs-notes-demo-browser --maxWorkers 1 speed/vitest

# Playwright, from playground/nextjs-notes-demo
docker run -d --name notes-demo-postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres \
  --tmpfs /var/lib/postgresql/data postgres:17 \
  -c fsync=off -c synchronous_commit=off -c full_page_writes=off
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/postgres"
export SUPPORT_EMAIL="support@notes.example"
pnpm db:push --force
pnpm build
pnpm exec playwright test --workers 1
```
