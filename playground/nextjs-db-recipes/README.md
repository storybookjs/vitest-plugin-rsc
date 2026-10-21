# Database recipes

The same todo list on three databases, with three ORMs and with SQL of its own, and on Redis: a page of the App Router that lists the todos, a Server Action that adds one, and one that marks a todo done in a transaction. Each recipe is a test of it in Vitest Browser Mode, on a database in the page.

The driver of the app, which it keeps in the tests:

|          | Drizzle          | Prisma                    | Kysely                  | SQL              |
| -------- | ---------------- | ------------------------- | ----------------------- | ---------------- |
| Postgres | `pg`             | `@prisma/adapter-pg`      | `pg`                    | `pg`             |
| SQLite   | `@libsql/client` | `@prisma/adapter-libsql`  | `@libsql/kysely-libsql` | `@libsql/client` |
| MySQL    | `mysql2`         | `@prisma/adapter-mariadb` | `mysql2`                | `mysql2/promise` |

What the tests have in place of the database server:

- **Postgres**: [PGlite](https://pglite.dev), Postgres in WebAssembly.
- **SQLite**: [`@libsql/client-wasm`](https://www.npmjs.com/package/@libsql/client-wasm), SQLite in WebAssembly, with the API of the app's libsql client.
- **MySQL**: [lite4mariadb](https://github.com/shyim/lite4mariadb), MariaDB with InnoDB in WebAssembly.

And one recipe of a store that is not a database of SQL: **Redis**, with `ioredis`, which keeps a todo as a hash and the ids in a list, and adds and toggles one with a Lua script. Its tests have [ioredis-mock](https://github.com/stipsan/ioredis-mock) in place of the server, with the API of ioredis and a Lua of its own.

The recipes do what the notes demo, `playground/nextjs-notes-demo`, does for its database, for the drivers of the app: the notes demo has Drizzle's driver for PGlite in its tests, where its app has `pg`.

Each recipe stands for an app of its own: their `db.ts` files have the same names for the app's database, `DATABASE_URL`, `MYSQL_URL`, `SQLITE_URL`, `REDIS_URL`, and the same todos. The playground runs its tests, not `next dev`.

## The Rule

The app keeps its ORM and its driver. The tests mock one module of a recipe, `db.ts`, with the file next to it in `__mocks__/`: the same ORM, with a pool or client of the database in the page. A recipe of SQL has no ORM: its `db.ts` is the pool or the client, as it is the client of ioredis for Redis. Everything else is the app's own: its queries, its migrations, its transactions.

- **A database as the migrations left it, for every test.** What an earlier test wrote is gone, and the first row a test adds is #1. Redis has no migrations: its reset is a `FLUSHALL`.
- **The time of the test.** `vi.setSystemTime()` is the clock of Postgres and MySQL too, for `now()` and `CURRENT_TIMESTAMP`. Prisma, the SQLite recipes and Redis take the time from the app's clock, which is the test's.
- **The app's migrations.** The SQL files that Drizzle and Prisma make, Kysely's own migrator, or the SQL files of a recipe of SQL.

```tsx
// app/postgres-drizzle/page.test.tsx
todoRecipeTests({
  url: "/postgres-drizzle",
  seed: async (titles) => {
    await db.insert(todos).values(titles.map((title) => ({ title })));
  },
  addTodos,
  read: () => db.select().from(todos).orderBy(todos.id),
});
```

The test seeds and reads with the app's own `db`, the module instance its Server Components query. The tests, the same for every recipe, are in `test/todo-recipe.ts`: an empty list, the todos a test seeds, a Server Action at the time of the test, a toggle in a transaction, a transaction that rolls back, and a test that finds nothing of the one before it.

## A Recipe

The files of one, `postgres-drizzle`:

- `recipes/postgres-drizzle/db.ts`: the app's `db`, Drizzle on a `pg.Pool`.
- `recipes/postgres-drizzle/__mocks__/db.ts`: the tests' `db`, Drizzle on a `pg.Pool` of PGlite.
- `recipes/postgres-drizzle/schema.ts`, `migrations/`: the app's schema, and what `drizzle-kit generate` made of it.
- `recipes/postgres-drizzle/todos.ts`: the queries.
- `app/postgres-drizzle/page.tsx`, `page.test.tsx`: the page and its tests.
- `vitest.setup.ts`: `vi.mock("#recipes/postgres-drizzle/db.ts")`, and the reset before every test.

The test databases are in `test/`:

- **`test/pglite.ts`**: one PGlite for the page, a schema for each recipe.
  - It starts as the notes demo's does, from a data dir that Node.js made, `test/pglite-files.ts`, with its files fetched once.
  - `pool` is a `pg.Pool`, as Prisma's adapter takes only a pool that is one.
  - pg makes the text of each value, and parses what PGlite sends back as text, with pg's parsers or the ones the ORM gives it.
  - `reset()` puts back the rows and sequences of a copy it takes after the migrations: of SQL files as it makes the schema, or when the mock calls `snapshot()` after the ORM's own migrator, as the Kysely recipes do.
  - Its clock is the page's `Date.now()`, which PGlite's WebAssembly reads: `vi.setSystemTime()` sets `now()` too.
- **`test/libsql.ts`**: a new SQLite database for every test, made from the migrations. `client` is a libsql client that goes to the database of the test.
- **`test/mariadb.ts`**: one MariaDB for the page, a database for each recipe.
  - `mysql2Pool` stands in for a pool of mysql2, with its callbacks and its `promise()`: Drizzle, Kysely, SQL.
  - `mariadbPool` stands in for one of mariadb: Prisma.
  - `reset()` puts back the rows and AUTO_INCREMENT counters of a copy it takes after the migrations, as `test/pglite.ts` does.
  - Before a query it sets the server's `timestamp` to the page's `Date.now()`. Its time zone is UTC.

## In vitest.config.ts

- **The drivers that need Node.js as they load.** `mysql2` and `mariadb` are `test/drivers/`: the ORM imports them, and gets a pool of the test instead. `pg` loads in a browser, and makes no connection until it is asked a query.
- **Cross-origin isolation.** lite4mariadb runs MariaDB on threads, which a page has with `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`. `credentialless`, so that the page can still load what another origin has.
- **A time zone that is not UTC**, `Pacific/Auckland`: a value that a driver writes or reads in the wrong one moves by hours.
- **`optimizeDeps`.** What the files in `__mocks__/` import is in `include`. lite4mariadb and libsql's WebAssembly are in `exclude`, as they load their files from their own URLs.
- **ioredis-mock's build for browsers.** As it loads, it calls `require()` for `fs` and `path`, which throws in any page. And it sets `window.Buffer` to a polyfill of its own, in place of the plugin's, which Next's server uses. `test/ioredis-mock.ts` takes both out of `browser.js`, in the dependency optimizer and in Vite. It throws when a version of ioredis-mock has other code there, which is why it is pinned to 8.13.1.

## What Is Not Here Yet

- **`better-sqlite3` and `node:sqlite`.** They are synchronous and native: a test would need a stand-in of their API on SQLite's WebAssembly.
- **TypeORM.** In the server layers the plugin takes a dependency's `browser` field, and TypeORM's points to its build for browsers, which has no driver for Postgres or MySQL. Next's server build does not read that field.
- **Storybook.** The databases run in the page, so a static build of Storybook could have them too, with the same mocks, as the notes demo has with `sb.mock()`.

## Limits

- **One session per server.** All recipes of a database share the session of its server, and take turns on it. Two transactions at the same time would be one.
- **lite4mariadb**:
  - It is 0.1, of one author, and GPL-2.0.
  - It is MariaDB 13, not MySQL 8: `JSON` is `LONGTEXT`, some functions differ, and Prisma uses no joins of relations on it, where it does on MySQL 8.
  - An UPDATE counts the rows it changed, where the drivers count the rows it found: an UPDATE to the value a row has is 0 rows here.
  - The `insertId` of an INSERT that gives the id itself is the id of the last one that did not.
  - A row with two columns of one name has one of them.
  - The field that a `typeCast` gets has no `length`.
  - It starts in a few seconds: one for the page.
- **`@libsql/client-wasm` is experimental.**
  - Its transaction takes the client's connection, and the client opens the file again, so each database is a file in the memory of SQLite's WebAssembly, not `:memory:`. The files of earlier tests stay there.
  - It has no types of the columns.
- **ioredis-mock**:
  - Its Lua has a number that a command gives as a float: `"todo:" .. id` is `todo:1.0`. The Redis recipe's script makes the id with `string.format("%d", ...)`, which is the same on Redis.
  - It has no `eval()` in a MULTI. A script that ioredis defines with `defineCommand()` is there.
  - Its EXEC does not end a WATCH: the EXEC's own write makes the next EXEC fail, so a toggle with WATCH fails every other time. The recipe toggles a todo with a Lua script.
  - Its Lua has no `redis.error_reply()`: the toggle's script answers `false` for no todo.
  - A command that fails in its MULTI rejects the EXEC. Redis answers the error of each command in the answer of EXEC, which `addTodos()` checks.
- **Prisma's engines.** `pnpm install` does not run their download, which `prisma generate` does not need. `prisma migrate diff`, for a change of a Prisma schema, does.
