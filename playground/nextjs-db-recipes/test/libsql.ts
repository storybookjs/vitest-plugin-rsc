import { createClient, type Client } from "@libsql/client-wasm";

// The databases made so far in the page, for the name of the next one.
let made = 0;

/**
 * A SQLite database in memory for the tests, which `reset()` throws away and
 * makes again from the app's migrations, before every test: every test has a
 * database of its own. `client` is a libsql client, the one the app has in
 * production, that goes to the database of the test, so that the ORM can keep
 * it. The migrations are SQL, or `migrate`, for an ORM that runs its own.
 */
export function libsqlTestDatabase(
  migrations: Record<string, string>,
  migrate?: () => Promise<void>,
) {
  // In the order of their files, as the ORM's migrator runs them. Drizzle
  // separates the statements of one with a comment.
  const scripts = Object.keys(migrations)
    .sort()
    .map((file) => migrations[file]!.replaceAll("--> statement-breakpoint", ""));
  // A file, in the memory of SQLite's WebAssembly, rather than `:memory:`:
  // libsql gives a transaction the connection it has, and opens the file
  // again for the next query. A database in `:memory:` would be a new one.
  const create = () => createClient({ url: `file:test-${++made}.db` });
  let database = create();

  async function reset(): Promise<void> {
    database.close();
    database = create();
    for (const script of scripts) await database.executeMultiple(script);
    await migrate?.();
  }

  const client = new Proxy({} as Client, {
    get(_, key) {
      const value: unknown = Reflect.get(database, key);
      return typeof value === "function" ? value.bind(database) : value;
    },
  });
  return { client, reset };
}
