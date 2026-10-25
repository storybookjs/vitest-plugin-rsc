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
// made from lib/schema.sql as the worker starts and dropped as it stops. It
// empties that database before each test, as the tests did before each had
// data of its own: the setup of a team that isolates its tests by process and
// database, where the default config isolates them by their data.

// oxlint-disable-next-line no-process-env
const env = process.env;
export const perWorker = env.PLAYWRIGHT_ISOLATION === "worker";
const command = env.PLAYWRIGHT_SERVER === "dev" ? "dev" : "start";

const app = fileURLToPath(new URL("../..", import.meta.url));
const next = fileURLToPath(new URL("../../node_modules/.bin/next", import.meta.url));

/** Playwright's `test`, on the worker's own server and database. */
export const serverPerWorker: typeof base = base.extend<
  { emptyDb: void },
  { port: number; database: URL; server: string }
>({
  // The port of the config's baseURL, plus the worker's index. A server left
  // on it, of a run killed or still running, would answer the tests on its
  // own database, which has the name of this worker's.
  port: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture uses from this pattern.
    async ({}, use, workerInfo) => {
      const port = Number(new URL(workerInfo.project.use.baseURL!).port) + workerInfo.parallelIndex;
      if (await accepts(port)) throw new Error(`Port ${port} is in use: is another run on it?`);
      await use(port);
    },
    { scope: "worker" },
  ],
  // The worker's database: playwright.config.ts points DATABASE_URL at it, for
  // test/db.ts. A fixture of its own, so that it is dropped even when the
  // worker stops while its server starts.
  database: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture uses from this pattern.
    async ({}, use, workerInfo) => {
      const database = new URL(env.DATABASE_URL!);
      const name = database.pathname.slice(1);
      // The drop below forces: never on a database the config did not name.
      if (name !== `notes_w${workerInfo.parallelIndex}`) {
        throw new Error(`DATABASE_URL names ${name}, not notes_w${workerInfo.parallelIndex}`);
      }
      const postgres = new URL(database);
      postgres.pathname = "/postgres";
      const drop = `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`;
      await execute(postgres, drop, `CREATE DATABASE "${name}"`);
      try {
        const schema = await readFile(new URL("../../lib/schema.sql", import.meta.url), "utf8");
        await execute(database, schema);
        await use(database);
      } finally {
        // The pool of test/db.ts first: the drop would end its connections,
        // which pg reports as an `error` of the pool, thrown with no listener.
        await db.$client.end();
        await execute(postgres, drop);
      }
    },
    { scope: "worker" },
  ],
  server: [
    // `port` first: a port in use stops the worker before it drops a database.
    async ({ port, database }, use, workerInfo) => {
      if (command === "dev" && workerInfo.config.workers > 1) {
        throw new Error("`next dev` runs on 1 worker: Next starts one `next dev` in a directory");
      }
      const server = spawn(next, [command, "--port", String(port)], {
        cwd: app,
        env: { ...env, DATABASE_URL: database.href },
        stdio: ["ignore", "ignore", "inherit"],
      });
      // A worker stopped while this waits exits with no teardown of it.
      const kill = () => server.kill();
      process.once("exit", kill);
      try {
        await listening(server, port);
        await use(`http://localhost:${port}`);
      } finally {
        process.off("exit", kill);
        if (server.exitCode === null && server.signalCode === null) {
          server.kill();
          await once(server, "exit");
        }
      }
    },
    { scope: "worker", auto: true },
  ],
  baseURL: async ({ server }, use) => {
    await use(server);
  },
  // The tables of the worker's database emptied before each test, the ids
  // from 1 again: the statements at once, one round trip.
  emptyDb: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a fixture uses from this pattern.
    async ({}, use) => {
      await db.$client.query(emptyTables);
      await use();
    },
    { auto: true },
  ],
});

// DELETE, not TRUNCATE, which rewrites the files of the tables and their
// indexes. And setval for the ids.
const emptyTables = [
  "DELETE FROM sessions",
  "DELETE FROM notes",
  "DELETE FROM users",
  "SELECT setval('users_id_seq', 1, false)",
  "SELECT setval('notes_id_seq', 1, false)",
].join(";\n");

/** Sends the statements to the database, one after the other. */
async function execute(database: URL, ...statements: string[]): Promise<void> {
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
    if (server.exitCode !== null || server.signalCode !== null) {
      const end = server.signalCode ?? `code ${server.exitCode}`;
      throw new Error(`\`next ${command}\` on port ${port} exited with ${end}`);
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
