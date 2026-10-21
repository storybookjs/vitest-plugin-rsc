import { PGlite, type Results } from "@electric-sql/pglite";
import pg from "pg";
// The files of test/pglite-files.ts, by URLs that Vite serves.
import dataDirUrl from "#test/pglite/db.tgz?url";
import fsBundleUrl from "#test/pglite/pglite.data?url";
import pgliteWasmUrl from "#test/pglite/pglite.wasm?url";
import initdbWasmUrl from "#test/pglite/initdb.wasm?url";

// Postgres compiled to WebAssembly, PGlite, in place of the app's Postgres
// server: one for the page. Each recipe has a schema of its own on it, as it
// would have a database on a server, and `reset()` gives it back the rows and
// sequences it had after its migrations, before every test. Its clock is the
// page's `Date.now()`, which `vi.setSystemTime()` sets: for `now()`.
//
// The app's ORM keeps its production driver, pg: `pool` is a `pg.Pool`, as
// Prisma's adapter takes only a pool that is one, which answers from this
// server with what pg answers. pg loads in a browser, and makes no
// connection until it is asked a query.
//
// It starts as the notes demo's does: from a data dir that Node.js made, so
// PGlite runs no initdb in the page, with its files fetched once and handed
// to it, so the page keeps them in its memory once.
async function fetchFile(url: string): Promise<Response> {
  // Made absolute, as on a server: the `fetch` of the server has no page to
  // resolve a path against.
  const response = await fetch(new URL(url, import.meta.url));
  if (!response.ok) throw new Error(`${url} of the database: ${response.status}`);
  return response;
}
const [loadDataDir, pgliteWasmModule, initdbWasmModule, fsBundle] = await Promise.all([
  fetchFile(dataDirUrl).then((response) => response.blob()),
  WebAssembly.compileStreaming(fetchFile(pgliteWasmUrl)),
  WebAssembly.compileStreaming(fetchFile(initdbWasmUrl)),
  fetchFile(fsBundleUrl).then((response) => response.blob()),
]);
// Shared buffers of 16 MB, where initdb writes 128 MB, which Postgres takes
// as it starts.
const server = await PGlite.create({
  loadDataDir,
  pgliteWasmModule,
  initdbWasmModule,
  fsBundle,
  startParams: [...PGlite.defaultStartParams, "-c", "shared_buffers=16MB"],
});

// What goes to the server and what comes back, as text: pg makes the text of
// a value, as it does for its own server, and parses what comes back, with
// its own parsers or the ones the ORM gives it. By the ids of all types, as
// PGlite has a parser and a serializer of its own for some of them.
let asText: Record<number, (value: string) => string> = {};
async function readTypes() {
  const { rows } = await server.query<{ oid: number }>("SELECT oid FROM pg_type");
  asText = Object.fromEntries(rows.map(({ oid }) => [oid, (value: string) => value]));
}
await readTypes();

// pg's text of a value: a Date in the time zone of the page, an array or an
// object as Postgres reads one. A Buffer, which pg sends as bytes, as the
// text of a `bytea`.
function textOf(value: unknown): unknown {
  // `pg.utils`, which pg's types do not have.
  const { utils } = pg as unknown as { utils: { prepareValue(value: unknown): unknown } };
  const prepared = utils.prepareValue(value);
  if (!(prepared instanceof Uint8Array)) return prepared;
  return `\\x${Array.from(prepared, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

// One query at a time on the one session of the server: a recipe's query
// goes to its schema, which the session is switched to first.
let using = "public";
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

type Parsers = { getTypeParser(oid: number, format?: string): (value: string) => unknown };
type QueryConfig = { text: string; values?: unknown[]; rowMode?: "array"; types?: Parsers };
type Callback = (error: Error | null, result?: unknown) => void;

// What a callback of pg gets of a promise.
async function settle(promise: Promise<unknown>, callback: Callback) {
  let result: unknown;
  try {
    result = await promise;
  } catch (error) {
    callback(error as Error);
    return;
  }
  callback(null, result);
}

// The command of a statement, as pg has it: the first word, past comments,
// or the one that writes in a statement that starts with `WITH`.
function commandOf(text: string): string {
  const statement = text.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, " ").trim();
  const first = statement.split(/\s/)[0]!.toUpperCase();
  if (first !== "WITH") return first;
  return /\b(INSERT|UPDATE|DELETE|MERGE)\b/i.exec(statement)?.[1]!.toUpperCase() ?? "SELECT";
}

export async function pgliteTestDatabase(schema: string, migrations: Record<string, string> = {}) {
  const snapshot = `${schema}_snapshot`;
  // The rows and sequences after the migrations: what `reset()` puts back.
  let restore: string | undefined;

  async function useSchema() {
    if (using === schema) return;
    using = schema;
    await server.exec(`SET search_path TO "${schema}"`);
  }

  async function run(config: QueryConfig) {
    await useSchema();
    const options = { rowMode: "array" as const, parsers: asText, serializers: asText };
    // Without values pg sends the text as it is, which may be more than one
    // statement: the result is the last one's.
    const result = (
      config.values?.length
        ? await server.query<unknown[]>(config.text, config.values.map(textOf), options)
        : (await server.exec(config.text, options)).at(-1)!
    ) as Results<unknown[]>;
    if (/^\s*(create|alter|drop)\s/i.test(config.text)) await readTypes();
    const parsers = config.types ?? pg.types;
    const parse = result.fields.map(({ dataTypeID }) => parsers.getTypeParser(dataTypeID, "text"));
    const rows = result.rows.map((row) =>
      row.map((value, i) => (value === null ? null : parse[i]!(value as string))),
    );
    return {
      command: commandOf(config.text),
      rowCount: result.fields.length ? rows.length : (result.affectedRows ?? 0),
      fields: result.fields,
      rows:
        config.rowMode === "array"
          ? rows
          : rows.map((row) =>
              Object.fromEntries(result.fields.map(({ name }, i) => [name, row[i]])),
            ),
    };
  }

  // pg's `query(text, values, callback)`, or with a config, with or without
  // a callback, as TypeORM calls it.
  function query(textOrConfig: string | QueryConfig, ...rest: unknown[]) {
    const callback = typeof rest.at(-1) === "function" ? (rest.pop() as Callback) : undefined;
    const config =
      typeof textOrConfig === "string"
        ? { text: textOrConfig, values: rest[0] as unknown[] | undefined }
        : { ...textOrConfig, values: (rest[0] as unknown[] | undefined) ?? textOrConfig.values };
    const result = exclusive(() => run(config));
    if (callback) void settle(result, callback);
    return callback ? undefined : result;
  }

  const client = {
    query,
    release() {},
    on() {
      return client;
    },
    removeListener() {
      return client;
    },
  };

  class PGlitePool extends pg.Pool {
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- pg's many signatures.
    override query = query as never;
    // pg's `connect()`, with a callback, as TypeORM calls it, or without.
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- pg's many signatures.
    override connect(callback?: any): never {
      if (callback) callback(null, client, () => {});
      // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- pg's two signatures.
      return (callback ? undefined : Promise.resolve(client)) as never;
    }
    override end(): never {
      // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- pg's two signatures.
      return Promise.resolve() as never;
    }
  }

  // A copy of every table of the schema in another one, and the sequences'
  // values: the SQL that puts them back. The columns that a table generates
  // itself are left out, and an identity column takes the copy's value.
  async function takeSnapshot(): Promise<string> {
    const { rows: tables } = await server.query<{ name: string }>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
      [schema],
    );
    const { rows: sequences } = await server.query<{ name: string }>(
      "SELECT sequence_name AS name FROM information_schema.sequences WHERE sequence_schema = $1",
      [schema],
    );
    await server.exec(`CREATE SCHEMA "${snapshot}"`);
    const statements: string[] = [];
    for (const { name } of tables) {
      const { rows: columns } = await server.query<{ name: string }>(
        "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND is_generated = 'NEVER' ORDER BY ordinal_position",
        [schema, name],
      );
      const list = columns.map((column) => `"${column.name}"`).join(", ");
      await server.exec(
        `CREATE TABLE "${snapshot}"."${name}" AS SELECT ${list} FROM "${schema}"."${name}"`,
      );
      statements.push(
        `DELETE FROM "${schema}"."${name}"`,
        `INSERT INTO "${schema}"."${name}" (${list}) OVERRIDING SYSTEM VALUE SELECT ${list} FROM "${snapshot}"."${name}"`,
      );
    }
    for (const { name } of sequences) {
      const { rows } = await server.query<{ value: string; called: boolean }>(
        `SELECT last_value AS value, is_called AS called FROM "${schema}"."${name}"`,
      );
      statements.push(
        `SELECT setval('"${schema}"."${name}"', ${rows[0]!.value}, ${rows[0]!.called})`,
      );
    }
    // The replica role turns off the triggers of the foreign keys, so the
    // order of the tables does not matter.
    return [
      "SET session_replication_role = replica",
      ...statements,
      "SET session_replication_role = DEFAULT",
    ].join(";\n");
  }

  await exclusive(async () => {
    await server.exec(`CREATE SCHEMA "${schema}"`);
    await useSchema();
    // In the order of their files, as the ORM's migrator runs them. Drizzle
    // separates the statements of one with a comment.
    for (const file of Object.keys(migrations).sort()) {
      await server.exec(migrations[file]!.replaceAll("--> statement-breakpoint", ""));
    }
    await readTypes();
  });

  /** Takes the copy that `reset()` puts back: after the migrations. */
  const snapshotNow = () =>
    exclusive(async () => {
      await useSchema();
      restore = await takeSnapshot();
    });
  // For SQL migrations now; an ORM that runs its own calls it after them.
  if (Object.keys(migrations).length) await snapshotNow();

  return {
    pool: new PGlitePool(),
    snapshot: snapshotNow,
    reset: () =>
      exclusive(async () => {
        if (!restore) throw new Error(`No snapshot of ${schema}: call snapshot() after migrating.`);
        await useSchema();
        await server.exec(restore);
      }),
  };
}
