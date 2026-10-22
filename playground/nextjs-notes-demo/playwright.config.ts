import { defineConfig, devices } from "@playwright/test";

// The Playwright half of speed/: the tests of speed/vitest/, one for one,
// against `next start` of a production build and the app's Postgres at
// DATABASE_URL, a Postgres in Docker. See speed/README.md.
// The env of the server, and of the tests, which write to the same database
// and sign users in with the app's own Better Auth: see speed/playwright/app.ts.
// oxlint-disable-next-line no-process-env
const env = process.env;
env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/postgres";
env.SUPPORT_EMAIL ??= "support@notes.example";
// As `next start` runs: Better Auth names and secures its cookies by it.
// oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- @types/node types NODE_ENV as readonly.
(env as Record<string, string>).NODE_ENV = "production";
const { CI, DATABASE_URL, SUPPORT_EMAIL } = env;
const port = 3100;

export default defineConfig({
  testDir: "./speed/playwright",
  // Every test signs in a user of its own, so the tests of a file run in
  // parallel too, as fast as Playwright goes.
  fullyParallel: true,
  forbidOnly: Boolean(CI),
  retries: 0,
  reporter: CI ? [["list"], ["github"]] : "list",
  // The wait of `expect.poll()` of the Vitest tests: see vitest.config.ts.
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://localhost:${port}`,
    // The viewport of the Vitest tests.
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    // `next build` is a step of its own, which speed/README.md times apart.
    command: `pnpm start --port ${port}`,
    url: `http://localhost:${port}/healthcheck`,
    reuseExistingServer: !CI,
    env: { DATABASE_URL, SUPPORT_EMAIL },
  },
});
