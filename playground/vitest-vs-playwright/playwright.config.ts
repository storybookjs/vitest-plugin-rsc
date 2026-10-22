import { defineConfig, devices } from "@playwright/test";

// The tests of tests/playwright/, against `next start` after `next build`, or
// `next dev`, on Postgres at DATABASE_URL: Postgres in Docker, see README.md.
// oxlint-disable-next-line no-process-env
const env = process.env;
env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/postgres";
const port = 3200;

export default defineConfig({
  testDir: "./tests/playwright",
  globalSetup: "./tests/playwright/global-setup.ts",
  // One worker: the tests share one database, which each empties first, as
  // each Vitest test empties its own.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(env.CI),
  reporter: "list",
  expect: { timeout: 5_000 },
  use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${port}` },
  webServer: {
    // `next start` after `next build`, or `next dev` with
    // `PLAYWRIGHT_SERVER=dev`: as Vitest runs Next in production or in
    // development.
    command: `pnpm ${env.PLAYWRIGHT_SERVER === "dev" ? "dev" : "start"} --port ${port}`,
    port,
    reuseExistingServer: !env.CI,
    env: { DATABASE_URL: env.DATABASE_URL },
  },
});
