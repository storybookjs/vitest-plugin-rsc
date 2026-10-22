# Databases

There are no TCP sockets in a browser, so your app's database driver can't reach a database server from a test. Instead, the test gets a real database engine compiled to WebAssembly, running in the same tab as your server code. Your app keeps its ORM, its queries and its migrations. The test seeds and reads with your app's own `db`, the same module instance your Server Components query.

## Recipes

[`playground/nextjs-db-recipes`](../playground/nextjs-db-recipes) has a recipe for each database and ORM:

|                                                                                         | Drizzle | Prisma | Kysely | SQL |
| --------------------------------------------------------------------------------------- | ------- | ------ | ------ | --- |
| Postgres, on [PGlite](https://pglite.dev)                                               | ✅      | ✅     | ✅     | ✅  |
| SQLite, on [`@libsql/client-wasm`](https://www.npmjs.com/package/@libsql/client-wasm)   | ✅      | ✅     | ✅     | ✅  |
| MySQL, on MariaDB in WebAssembly, [lite4mariadb](https://github.com/shyim/lite4mariadb) | ✅      | ✅     | ✅     | ✅  |

The SQL column is hand-written SQL on the app's own driver: `pg`, `@libsql/client` and `mysql2`.

There's a Redis recipe too, for an app on `ioredis`. Its tests use [ioredis-mock](https://github.com/stipsan/ioredis-mock) in place of the client, in the tab. That isn't a real Redis, but it has the ioredis API, including Lua scripts.

Planned: MongoDB with Mongoose, and TypeORM on Postgres and MySQL.

## How a recipe works

On Postgres, the driver in the tests is your app's `pg`, too. On SQLite it's libsql's WebAssembly client, and on MySQL it's a stand-in for a mysql2 pool. The tests mock exactly one module, `db.ts`, with a file next to it in `__mocks__/`. That file gives the same ORM a connection pool to the database in the tab:

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

The setup file mocks the module, then resets the database and fixes the clock before each test:

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

Each test gets the database as your migrations left it, so the first row it inserts is #1. With `isolate: false`, the test files in a worker share one database, and this reset is what keeps their tests apart. On Postgres and MySQL, the database's `now()` follows the clock that `vi.setSystemTime()` sets.

## Using a recipe in your app

Copy three things from the playground:

1. The recipe's `__mocks__/db.ts`.
2. The helper for its database, in `test/`.
3. What the playground's `vitest.config.ts` sets for that database: see [In vitest.config.ts](../playground/nextjs-db-recipes/README.md#in-vitestconfigts).

The [recipes' README](../playground/nextjs-db-recipes/README.md) explains each recipe and its limits.

## A whole app: the notes demo

The notes demo, `playground/nextjs-notes-demo`, mocks its database the same way for a whole app with Better Auth. It uses Drizzle's driver for PGlite in place of the app's `pg`. Drizzle Kit, which turns the schema into SQL, runs in Node.js, so the demo's Vitest config prepares the tables before the tests run.

Because the database runs in the tab, Storybook can have it too. With [`@storybook/nextjs-vite-rsc`](../packages/storybook-nextjs-vite-rsc), the notes demo's static Storybook build carries the database along: in a deployed Storybook, a form submits and its Server Action writes to that database, and every story starts from an empty one.
