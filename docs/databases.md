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

## A whole app: the notes demo

`playground/nextjs-notes-demo` does the same for a full app with Better Auth. It uses Drizzle's PGlite driver in place of `pg`. Since Drizzle Kit runs in Node.js, the demo's Vitest config prepares the tables before the tests start.

And because the database lives in the tab, Storybook can have it too. With [`@storybook/nextjs-vite-rsc`](../packages/storybook-nextjs-vite-rsc), the notes demo's static Storybook carries its database along: in the deployed Storybook, forms really submit and write to it, and every story starts from an empty one.
