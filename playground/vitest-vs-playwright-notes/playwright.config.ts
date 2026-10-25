import { defineConfig, devices } from "@playwright/test";

// The tests of tests/playwright/, against `next start` after `next build`, or
// `next dev`, on Postgres at DATABASE_URL: Postgres in Docker, see README.md.
// oxlint-disable-next-line no-process-env
const env = process.env;
env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/postgres";
// Next marks a hydrated page with `window.__NEXT_HYDRATED_AT` in its test
// mode, as for its own e2e tests: tests/playwright/test.ts waits for it, as
// `renderServer()` waits for the page to hydrate. `next build` needs it too.
env.__NEXT_TEST_MODE ??= "1";
// With PLAYWRIGHT_ISOLATION=worker, each worker runs its own server, on port
// 3400 + its index, on a database of its own: tests/playwright/
// worker-server.ts. A worker evaluates this file with its index before the
// test files import lib/db.ts, which connects test/db.ts to DATABASE_URL.
const perWorker = env.PLAYWRIGHT_ISOLATION === "worker";
// Apart from the one server's 3300: a run of each, on `next start`, can share
// a machine (Next starts one `next dev` in a directory).
const port = perWorker ? 3400 : 3300;
const dev = env.PLAYWRIGHT_SERVER === "dev";
if (perWorker && env.TEST_PARALLEL_INDEX) {
  const database = new URL(env.DATABASE_URL);
  database.pathname = `/notes_w${env.TEST_PARALLEL_INDEX}`;
  env.DATABASE_URL = database.href;
}

export default defineConfig({
  testDir: "./tests/playwright",
  // The tables, on the one database; with a server per worker, on each.
  globalSetup: perWorker ? undefined : "./tests/playwright/global-setup.ts",
  // One worker: the tests share one database, which each empties first, as
  // each Vitest test empties its own. With a database per worker, any number,
  // and the tests of a file in parallel too; but one with `next dev`, as Next
  // starts one `next dev` in a directory.
  workers: perWorker && !dev ? undefined : 1,
  fullyParallel: perWorker,
  forbidOnly: Boolean(env.CI),
  reporter: "list",
  expect: { timeout: 5_000 },
  use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${port}` },
  webServer: perWorker
    ? undefined
    : {
        // `next start` after `next build`, or `next dev` with
        // `PLAYWRIGHT_SERVER=dev`: as Vitest runs Next in production or in
        // development.
        command: `pnpm ${dev ? "dev" : "start"} --port ${port}`,
        port,
        reuseExistingServer: !env.CI,
        env: { DATABASE_URL: env.DATABASE_URL, __NEXT_TEST_MODE: env.__NEXT_TEST_MODE },
      },
});
