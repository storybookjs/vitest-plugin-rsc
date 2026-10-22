# Database recipes

The same little todo app, on every database and ORM we support: a page that lists todos, a Server Action that adds one, and one that marks a todo done in a transaction. Each recipe tests it in Vitest Browser Mode, against a database running in the page.

Your app keeps its own driver. These are the ones the recipes use:

|          | Drizzle          | Prisma                    | Kysely                  | SQL              |
| -------- | ---------------- | ------------------------- | ----------------------- | ---------------- |
| Postgres | `pg`             | `@prisma/adapter-pg`      | `pg`                    | `pg`             |
| SQLite   | `@libsql/client` | `@prisma/adapter-libsql`  | `@libsql/kysely-libsql` | `@libsql/client` |
| MySQL    | `mysql2`         | `@prisma/adapter-mariadb` | `mysql2`                | `mysql2/promise` |

And in the tests, in place of a database server:

- **Postgres**: [PGlite](https://pglite.dev), Postgres in WebAssembly.
- **SQLite**: [`@libsql/client-wasm`](https://www.npmjs.com/package/@libsql/client-wasm), SQLite in WebAssembly, with the same API as libsql's client.
- **MySQL**: [lite4mariadb](https://github.com/shyim/lite4mariadb), MariaDB with InnoDB in WebAssembly.
- **Redis**: [ioredis-mock](https://github.com/stipsan/ioredis-mock), with the ioredis API and its own Lua. The Redis recipe keeps each todo as a hash and the ids in a list, and adds and toggles todos with Lua scripts.

This playground only runs tests, not `next dev`.

## The idea

**Your app keeps its ORM and its driver. The tests mock exactly one module, `db.ts`**, with a file next to it in `__mocks__/`: the same ORM, connected to the database in the page. (For plain SQL or Redis, `db.ts` is just the pool or client.) Everything else is your app's own: queries, migrations, transactions.

Every test gets:

- **A fresh database, as your migrations left it.** What an earlier test wrote is gone, and the first row a test adds is #1. (Redis has no migrations, so it just runs `FLUSHALL`.)
- **A fixed clock.** `vi.setSystemTime()` also sets `now()` and `CURRENT_TIMESTAMP` on Postgres and MySQL. Prisma, SQLite and Redis use the app's clock, which is the test's.
- **Your real migrations.** The SQL files Drizzle and Prisma generate, Kysely's own migrator, or hand-written SQL files.

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

The test seeds and reads with your app's own `db`, the same module the Server Components query. The shared tests live in `test/todo-recipe.ts`: an empty list, seeded todos, a Server Action at the test's time, a toggle in a transaction, a transaction that rolls back, and a check that nothing leaks from the previous test.

## Anatomy of a recipe

Taking `postgres-drizzle` as the example:

| File                                                | What it is                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `recipes/postgres-drizzle/db.ts`                    | The app's `db`: Drizzle on a `pg.Pool`.                                       |
| `recipes/postgres-drizzle/__mocks__/db.ts`          | The tests' `db`: Drizzle on a `pg.Pool` backed by PGlite.                     |
| `recipes/postgres-drizzle/schema.ts`, `migrations/` | The schema, and what `drizzle-kit generate` made of it.                       |
| `recipes/postgres-drizzle/todos.ts`                 | The queries.                                                                  |
| `app/postgres-drizzle/page.tsx`, `page.test.tsx`    | The page and its tests.                                                       |
| `vitest.setup.ts`                                   | `vi.mock("#recipes/postgres-drizzle/db.ts")`, and the reset before each test. |

The test databases live in `test/`:

- **`test/pglite.ts`**: one PGlite per page, with a schema per recipe.
  - It boots from a data dir made in Node.js (`test/pglite-files.ts`), fetched once.
  - `pool` is a real `pg.Pool`, since Prisma's adapter only accepts one.
  - `reset()` restores rows and sequences from a snapshot taken after the migrations.
  - Its clock is the page's `Date.now()`, so `vi.setSystemTime()` sets `now()` too.
- **`test/libsql.ts`**: a new SQLite database for every test, built from the migrations.
- **`test/mariadb.ts`**: one MariaDB per page, with a database per recipe.
  - `mysql2Pool` stands in for a mysql2 pool (for Drizzle, Kysely and SQL), `mariadbPool` for a mariadb one (for Prisma).
  - `reset()` restores rows and `AUTO_INCREMENT` counters from a snapshot, like PGlite's.
  - Before each query it sets the server's `timestamp` to the page's `Date.now()`. Its time zone is UTC.

## In vitest.config.ts

What you'll want to copy, depending on your database:

- **Drivers that need Node.js to load.** `mysql2` and `mariadb` are aliased to `test/drivers/`, so the ORM gets the test pool instead. `pg` loads fine in a browser and connects lazily, so it needs nothing.
- **Cross-origin isolation** for MySQL. lite4mariadb runs MariaDB on threads, which needs `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` (`credentialless`, so the page can still load from other origins).
- **A non-UTC time zone**, `Pacific/Auckland`. A driver that reads or writes in the wrong zone is then off by hours, so you'll notice.
- **`optimizeDeps`.** Whatever `__mocks__/` imports goes in `include`. lite4mariadb and libsql's WebAssembly go in `exclude`, since they load their files from their own URLs.
- **ioredis-mock's browser build** needs patching: it `require()`s `fs` and `path` on load, which throws in a page, and swaps `window.Buffer` for its own polyfill. `test/ioredis-mock.ts` strips both. It's pinned to 8.13.1, and throws if a new version changes that code.

## Not here yet

- **`better-sqlite3` and `node:sqlite`.** They're synchronous and native, so they'd need a stand-in API on SQLite's WebAssembly.
- **TypeORM.** The plugin uses a dependency's `browser` field in the server layers, and TypeORM's points at a build with no Postgres or MySQL driver.
- **Storybook.** The databases run in the page, so a static Storybook could have them too, like the notes demo does with `sb.mock()`.

## Known limits

- **One session per server.** All recipes for one database share its server's session and take turns, so two simultaneous transactions would really be one.
- **lite4mariadb**
  - Version 0.1, one author, GPL-2.0.
  - It's MariaDB 13, not MySQL 8: `JSON` is `LONGTEXT`, some functions differ, and Prisma doesn't use relation joins on it.
  - An `UPDATE` counts rows _changed_, where drivers count rows _found_. Updating a row to its current value reports 0 rows.
  - The `insertId` of an `INSERT` with an explicit id is the id of the last insert that didn't have one.
  - A row with two columns of the same name keeps only one.
  - The field a `typeCast` receives has no `length`.
  - It takes a few seconds to start, once per page.
- **`@libsql/client-wasm` is experimental.**
  - A transaction takes the client's connection, and the client reopens the file. So each database is a file in SQLite's WebAssembly memory rather than `:memory:`, and earlier tests' files stay around.
  - It has no column types.
- **ioredis-mock**
  - Its Lua formats some numbers as floats: `"todo:" .. id` gives `todo:1.0`. The recipe uses `string.format("%d", ...)`, which works the same on real Redis.
  - No `eval()` inside `MULTI`. Scripts defined with `defineCommand()` do work.
  - `EXEC` doesn't end a `WATCH`, so a toggle using `WATCH` fails every other time. The recipe toggles with a Lua script instead.
  - No `redis.error_reply()` in Lua: the toggle script returns `false` when there's no todo.
  - A failing command in `MULTI` rejects the whole `EXEC`, where Redis reports each command's error in the `EXEC` reply. `addTodos()` checks for that.
- **Prisma's engines.** `pnpm install` skips their download, which `prisma generate` doesn't need. `prisma migrate diff`, for changing a Prisma schema, does.
