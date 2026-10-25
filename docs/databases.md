# Databases

Browsers have no TCP sockets, so your database driver can't reach a database server from a test. Instead, the test gets a _real_ database engine compiled to WebAssembly, running in the same tab as your server code.

The best part: your app doesn't change. It keeps its ORM, its queries and its migrations. Your test seeds and reads with your app's own `db`, the same module your Server Components query.

## Recipes

[`playground/nextjs-db-recipes`](../playground/nextjs-db-recipes) has a recipe for each combination:

|                                                                                         | Drizzle | Prisma | Kysely | SQL |
| --------------------------------------------------------------------------------------- | ------- | ------ | ------ | --- |
| Postgres, on [PGlite](https://pglite.dev)                                               | ✅      | ✅     | ✅     | ✅  |
| SQLite, on [`@libsql/client-wasm`](https://www.npmjs.com/package/@libsql/client-wasm)   | ✅      | ✅     | ✅     | ✅  |
| MySQL, on MariaDB in WebAssembly, [lite4mariadb](https://github.com/shyim/lite4mariadb) | ✅      | ✅     | ✅     | ✅  |

"SQL" means hand-written SQL on your app's own driver: `pg`, `@libsql/client` or `mysql2`.

There's also a **Redis** recipe for `ioredis`. It uses [ioredis-mock](https://github.com/stipsan/ioredis-mock), which isn't a real Redis, but has the full ioredis API, Lua scripts included.

Coming later: MongoDB with Mongoose, and TypeORM on Postgres and MySQL.

## How a recipe works

The tests mock exactly one module: `db.ts`. The mock lives next to it in `__mocks__/`, and gives the same ORM a connection to the database in the tab:

```ts
// recipes/postgres-drizzle/__mocks__/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { pgliteTestDatabase } from "#test/pglite.ts";
import * as schema from "../schema.ts";

const database = await pgliteTestDatabase(
  "postgres_drizzle",
  import.meta.glob<string>("../migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

export const resetDb = database.reset;
export const db = drizzle({ client: database.pool as never, schema });
```

A setup file turns on the mock, and resets the database and the clock before each test:

```ts
// vitest.setup.ts
import { beforeEach, vi } from "vitest";
import * as dbModule from "#recipes/postgres-drizzle/db.ts";

vi.mock("#recipes/postgres-drizzle/db.ts");

beforeEach(async () => {
  await (dbModule as unknown as { resetDb(): Promise<void> }).resetDb();
  vi.setSystemTime(new Date("2026-05-06T00:00:00.000Z"));
});
```

So every test gets the database exactly as your migrations left it. The first row it inserts is #1. And on Postgres and MySQL, even `now()` follows the clock you set with `vi.setSystemTime()`.

## Using a recipe in your app

Copy three things from the playground:

1. The recipe's `__mocks__/db.ts`.
2. The helper for its database, from `test/`.
3. The bits of the playground's `vitest.config.ts` for that database. See [In vitest.config.ts](../playground/nextjs-db-recipes/README.md#in-vitestconfigts).

The [recipes README](../playground/nextjs-db-recipes/README.md) goes into each recipe and its limits.

## A faster PGlite, until upstream has it

PGlite's `parseResults()` copies its map of about 300 type parsers into a new object for every `query()` and `exec()`, which costs more than parsing the rows of a small result: 113–124 µs per query on a 2.8 GHz Xeon, about 1.4 s of the 500-test notes benchmark. This repository patches that line with [`pnpm patch`](https://pnpm.io/cli/patch) (`patches/@electric-sql__pglite@0.5.10.patch`, applied through `patchedDependencies` in `pnpm-workspace.yaml`): the query's parsers sit on top of the defaults by prototype instead of a copy. Lookups resolve the same way, so nothing else changes. To use it in your app, apply the same one-line change with your package manager's patch command, or wait for the change to land in PGlite.

## A whole app: the notes demo

`playground/nextjs-notes-demo` does the same for a full app with Better Auth. It uses Drizzle's PGlite driver in place of `pg`. Since Drizzle Kit runs in Node.js, the demo's Vitest config prepares the tables before the tests start.

And because the database lives in the tab, Storybook can have it too. With [`@storybook/nextjs-vite-rsc`](../packages/storybook-nextjs-vite-rsc), the notes demo's static Storybook carries its database along: in the deployed Storybook, forms really submit and write to it, and every story starts from an empty one.

## A fast data layer in tests

In a test, your server runs in the same tab as the test, and so does the database. A query is no round trip over a network: it is CPU time on the tab's main thread, the thread that also clicks and renders. A run of the 500 tests of the notes benchmark (`playground/vitest-vs-playwright-notes`) sends about 9,000 queries, 18 for each test, and they take 2.6 s of its 13.4 s of tests, on an M1 Pro:

| in a run of the 500 tests      | count | queries each | database, ms each |
| ------------------------------ | ----: | -----------: | ----------------: |
| Server Actions                 | 1,065 |          3.5 |              1.08 |
| navigations                    | 1,141 |          1.8 |              0.65 |
| page loads                     |   662 |          1.9 |              0.52 |
| the tests' own seeds and reads |   500 |            3 |              0.50 |
| `resetDb()`, before each test  |   500 |            1 |              0.28 |

About 70% of a query's time is Postgres itself, running in WebAssembly; the rest is the driver and the ORM. So what makes a data layer fast in production makes it fast here: fewer queries, and less work around each. The notes apps do four things.

**Look the signed-in user up once per render.** The layout's header and the page both ask for the user. Wrap the lookup in React's `cache()`, as [Next's guide on authentication](https://nextjs.org/docs/app/guides/authentication#creating-a-data-access-layer-dal) does for its data access layer, and a render looks it up once:

```ts
// playground/nextjs-notes-demo/lib/auth-session.ts
export const getOptionalUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
});
```

With Better Auth, a lookup is a check of the cookie's signature and two queries, the session and then its user, so a render of the notes demo runs two queries where it ran four. A Server Action isn't a render, so `cache()` does nothing there: the action looks the user up itself, and so does the render of the page it redirects to.

**Don't query what you already have.** The benchmark's notes page counted the user's notes next to listing them. Without a search, the list has every note, so its length is the count: the page counts only for a search. That is one query less on about 1,150 renders of `/notes` in a run of the benchmark: its page loads and navigations, and the renders after a delete, a sign-up or a sign-in, which redirect to it. The database's time per test went down by 0.24 ms.

**Prepare the queries of every request.** Drizzle's [`.prepare()`](https://orm.drizzle.team/docs/perf-queries) builds the SQL of a query once, where a query built in place builds it on every call. On a server, node-postgres also has Postgres parse it once per connection. PGlite parses every query again, so in a test the gain is Drizzle's. In the benchmark, a page load and a navigation take 0.1 ms less and a Server Action 0.19 ms less, about 0.7 ms per test.

**Reset the tables in one round trip.** The notes apps send one string of `DELETE`s, and the recipes send the `DELETE`s and `INSERT`s that put back the rows of their migrations. A few rows are gone in 0.3 ms, before each test. `TRUNCATE` is slower here: it gives every table and index new files, which took 1.4 ms per test in the benchmark, and the first query of the next test took twice as long.

The rest is done already:

- Your driver talks to PGlite directly. No query passes through the plugin.
- With `isolate: false`, PGlite starts once per worker, from a data dir that Node.js made, so the tab runs no `initdb`. The notes apps' data dir has their tables in it. The recipes run their migrations as PGlite starts.
- The [patch of PGlite](#a-faster-pglite-until-upstream-has-it) takes about 0.1 ms off every query.
- In [fast mode](nextjs-guide.md#fast-mode), the password hash that signs a user up or in costs microseconds, not a tenth of a second (see [Fast crypto](nodejs-in-the-browser.md#fast-crypto)).
