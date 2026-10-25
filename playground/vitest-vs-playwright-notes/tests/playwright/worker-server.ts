import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test as base } from "@playwright/test";
import { Client } from "pg";
import { db } from "#lib/db.ts";

// With PLAYWRIGHT_ISOLATION=worker, each Playwright worker serves the app
// itself: a `next start` of the one `next build`, or `next dev` with
// PLAYWRIGHT_SERVER=dev, on a port of its own, on a database of its own,
// made from lib/schema.sql as the worker starts and dropped as it stops. Its
// tests still empty that database before each test (test.ts), so they keep
// their ids and counts, on any number of workers and in any order.

// oxlint-disable-next-line no-process-env
const env = process.env;
export const perWorker = env.PLAYWRIGHT_ISOLATION === "worker";
const command = env.PLAYWRIGHT_SERVER === "dev" ? "dev" : "start";

const app = fileURLToPath(new URL("../..", import.meta.url));

/** Playwright's `test`, on the worker's own server and database. */
export const serverPerWorker: typeof base = base.extend<object, { server: string }>({
  server: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture uses from this pattern.
    async ({}, use, workerInfo) => {
      if (command === "dev" && workerInfo.config.workers > 1) {
        throw new Error("`next dev` runs on 1 worker: each `next dev` writes the one .next");
      }
      // The port of the config's baseURL, plus the worker's index.
      const origin = new URL(workerInfo.project.use.baseURL!);
      const port = Number(origin.port) + workerInfo.parallelIndex;
      origin.port = String(port);
      // A server left on the port, of a run killed or still running, would
      // answer the tests on another database.
      if (await accepts(port)) throw new Error(`Port ${port} is in use: is another run on it?`);

      // The worker's database: playwright.config.ts points DATABASE_URL at it.
      const database = new URL(env.DATABASE_URL!);
      const name = database.pathname.slice(1);
      const postgres = new URL(database);
      postgres.pathname = "/postgres";
      const drop = `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`;
      await run(postgres, drop, `CREATE DATABASE "${name}"`);
      await run(database, await readFile(`${app}/lib/schema.sql`, "utf8"));

      const server = spawn(`${app}/node_modules/.bin/next`, [command, "--port", String(port)], {
        cwd: app,
        env: { ...env, DATABASE_URL: database.href },
        stdio: ["ignore", "ignore", "inherit"],
      });
      try {
        await listening(server, port);
        await use(origin.origin);
      } finally {
        if (server.exitCode === null && server.signalCode === null) {
          server.kill();
          await once(server, "exit");
        }
        // The pool of test/db.ts first, which would see its connections end.
        await db.$client.end();
        await run(postgres, drop);
      }
    },
    { scope: "worker", auto: true },
  ],
  baseURL: async ({ server }, use) => {
    await use(server);
  },
});

/** Sends the statements to the database, one after the other. */
async function run(database: URL, ...statements: string[]): Promise<void> {
  const client = new Client({ connectionString: database.href });
  await client.connect();
  try {
    for (const statement of statements) await client.query(statement);
  } finally {
    await client.end();
  }
}

/** Waits until the server accepts connections, as `webServer.port` does. */
async function listening(server: ChildProcess, port: number): Promise<void> {
  while (!(await accepts(port))) {
    if (server.exitCode !== null) {
      throw new Error(`\`next ${command}\` on port ${port} exited with code ${server.exitCode}`);
    }
    await sleep(50);
  }
}

function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "localhost");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}
