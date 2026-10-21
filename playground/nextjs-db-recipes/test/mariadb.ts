import { Lite4MariaDB, type ExecResult, type SqlParam } from "lite4mariadb";

// MariaDB compiled to WebAssembly, lite4mariadb, in place of the app's MySQL
// server: one for the page, as starting one takes seconds. Each recipe has a
// database of its own on it, as apps have on a server, and `reset()` gives it
// back the rows and AUTO_INCREMENT counters it had after its migrations,
// before every test, which takes a few milliseconds a table.
//
// The app's ORM keeps its production driver: `mysql2Pool` stands in for a
// pool of mysql2 (Drizzle) and `mariadbPool` for one of mariadb (Prisma).
// They answer from this server with what those drivers answer.
const server = await Lite4MariaDB.create();
// UTC, as most servers are, rather than the time zone of the machine.
server.exec("SET time_zone = '+00:00'");

// The database the session is on: a recipe's query goes to its own.
let using = server.query<{ name: string }>("SELECT DATABASE() AS name")[0]!.name;
// The time the server's clock was set to.
let clock: number | undefined;

// The codes of the errors an app most often looks for, by their number.
const codes: Record<number, string> = {
  1048: "ER_BAD_NULL_ERROR",
  1062: "ER_DUP_ENTRY",
  1146: "ER_NO_SUCH_TABLE",
  1205: "ER_LOCK_WAIT_TIMEOUT",
  1213: "ER_LOCK_DEADLOCK",
  1364: "ER_NO_DEFAULT_FOR_FIELD",
  1451: "ER_ROW_IS_REFERENCED_2",
  1452: "ER_NO_REFERENCED_ROW_2",
};

/** A query that failed, with what mysql2 and mariadb have on their errors. */
class DriverError extends Error {
  code: string | undefined;
  errno: number;
  sqlState: string | null;
  sqlMessage: string;
  constructor(error: { message: string; errno?: number; sqlstate?: string }) {
    super(error.message, { cause: error });
    this.errno = error.errno ?? 0;
    this.code = codes[this.errno];
    this.sqlState = error.sqlstate ?? null;
    this.sqlMessage = error.message;
  }
}

type Result = ExecResult & { insertId?: number };

// A statement without the comments before it.
const statementOf = (sql: string) => sql.replace(/^(\s|--[^\n]*|\/\*[\s\S]*?\*\/)+/, "");

// The names that mariadb has for the types of MySQL's protocol.
const typeNames: Record<number, string> = {
  0: "DECIMAL",
  1: "TINY",
  2: "SHORT",
  3: "INT",
  4: "FLOAT",
  5: "DOUBLE",
  6: "NULL",
  7: "TIMESTAMP",
  8: "BIGINT",
  9: "INT24",
  10: "DATE",
  11: "TIME",
  12: "DATETIME",
  13: "YEAR",
  14: "NEWDATE",
  15: "VARCHAR",
  16: "BIT",
  17: "TIMESTAMP2",
  18: "DATETIME2",
  19: "TIME2",
  245: "JSON",
  246: "NEWDECIMAL",
  247: "ENUM",
  248: "SET",
  249: "TINY_BLOB",
  250: "MEDIUM_BLOB",
  251: "LONG_BLOB",
  252: "BLOB",
  253: "VAR_STRING",
  254: "STRING",
  255: "GEOMETRY",
};

function fieldsOf(result: Result) {
  return (result.fields ?? []).map((name, i) => {
    const [type, charset, flags] = result.types?.[i] ?? [253, 45, 0];
    return {
      name,
      type: typeNames[type] ?? "VAR_STRING",
      columnType: type,
      flags,
      collation: { index: charset },
    };
  });
}

// lite4mariadb has a row as an object: two columns of one name are one.
function arrayOf(result: Result, row: Record<string, unknown>): unknown[] {
  return (result.fields ?? []).map((name) => row[name]);
}

function okPacket(result: Result) {
  return { affectedRows: result.affected ?? 0, insertId: result.insertId ?? 0, warningStatus: 0 };
}

export function mariadbTestDatabase(name: string, migrations: Record<string, string> = {}) {
  function useDatabase() {
    if (using === name) return;
    server.exec(`USE \`${name}\``);
    using = name;
  }

  function run(sql: string, params?: unknown[]): Result {
    try {
      useDatabase();
      // The server's clock is the page's, which a test may have set with
      // `vi.setSystemTime()`: for NOW() and CURRENT_TIMESTAMP.
      const now = Date.now();
      if (now !== clock) {
        server.exec(`SET timestamp = ${now / 1000}`);
        clock = now;
      }
      const result: Result = server.exec(sql, params as SqlParam[]);
      // The id of the first row an INSERT made, as the server says it in its
      // OK packet: LAST_INSERT_ID(). Not the id the INSERT itself gave a row.
      if (!result.fields && /^(insert|replace)\b/i.test(statementOf(sql))) {
        result.insertId = Number(
          server.query<{ id: number }>("SELECT LAST_INSERT_ID() AS id")[0]!.id,
        );
      }
      // A binary value is a Buffer, as with both drivers.
      for (const row of result.rows) {
        for (const [key, value] of Object.entries(row)) {
          if (value instanceof Uint8Array) row[key] = Buffer.from(value);
        }
      }
      return result;
    } catch (error) {
      throw new DriverError(error as { message: string });
    }
  }

  server.exec(`CREATE DATABASE \`${name}\``);
  // In the order of their files, as the ORM's migrator runs them. Drizzle
  // separates the statements of one with a comment.
  for (const file of Object.keys(migrations).sort()) {
    useDatabase();
    server.execMulti(migrations[file]!.replaceAll("--> statement-breakpoint", ""));
  }
  // A copy of every table in another database, and the counters of
  // AUTO_INCREMENT: the statements that put them back. The columns that a
  // table generates itself are left out.
  const snapshot = `${name}_snapshot`;
  let restore: string[] | undefined;
  function takeSnapshot(): string[] {
    const tables = run(
      "SELECT table_name AS name, auto_increment AS next FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'",
    ).rows;
    server.exec(`CREATE DATABASE \`${snapshot}\``);
    return tables.flatMap((row) => {
      const table = String(row.name);
      const next = row.next === null ? null : Number(row.next);
      const columns = run(
        "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND extra NOT LIKE '%GENERATED%' ORDER BY ordinal_position",
        [table],
      ).rows.map((column) => `\`${String(column.name)}\``);
      const list = columns.join(", ");
      run(`CREATE TABLE \`${snapshot}\`.\`${table}\` AS SELECT ${list} FROM \`${table}\``);
      return [
        `DELETE FROM \`${table}\``,
        `INSERT INTO \`${table}\` (${list}) SELECT ${list} FROM \`${snapshot}\`.\`${table}\``,
        ...(next === null ? [] : [`ALTER TABLE \`${table}\` AUTO_INCREMENT = ${next}`]),
      ];
    });
  }

  type Options = string | { sql: string; values?: unknown[]; rowsAsArray?: boolean };
  const optionsOf = (options: Options) =>
    typeof options === "string" ? { sql: options } : options;

  // mysql2: `rows, fields` for a query, an OK packet otherwise. A DATETIME
  // is a Date, in UTC, as with mysql2's `timezone: "Z"`, unless a `typeCast`
  // of the query says otherwise, as Drizzle's does.
  type Mysql2Options = Exclude<Options, string> & {
    typeCast?: (field: object, next: () => unknown) => unknown;
  };
  function mysql2Result(options: Options, values?: unknown[]): [unknown, unknown] {
    const { sql, values: own, rowsAsArray, typeCast } = optionsOf(options) as Mysql2Options;
    const result = run(sql, values ?? own);
    if (!result.fields) return [okPacket(result), undefined];
    const fields = fieldsOf(result);
    const convert = fields.map((field) => {
      const toDate = /^(DATETIME|TIMESTAMP|DATE|NEWDATE)2?$/.test(field.type);
      return (value: unknown) => {
        const next = () =>
          toDate && typeof value === "string" ? new Date(`${value.replace(" ", "T")}Z`) : value;
        if (!typeCast) return next();
        return typeCast(
          {
            ...field,
            string: () => (value === null ? null : String(value)),
            buffer: () => value,
          },
          next,
        );
      };
    });
    const rows = result.rows.map((row) => {
      const values = arrayOf(result, row).map((value, i) => convert[i]!(value));
      return rowsAsArray
        ? values
        : Object.fromEntries(fields.map((field, i) => [field.name, values[i]]));
    });
    return [rows, fields];
  }
  type Mysql2Callback = (error: Error | null, rows?: unknown, fields?: unknown) => void;
  // The callback of a call, if it has one, and the rest of its arguments.
  function callbackOf(args: unknown[]) {
    const callback = typeof args.at(-1) === "function" ? (args.pop() as Mysql2Callback) : undefined;
    return [callback, args] as const;
  }
  const mysql2Promise = {
    query: (options: Options, values?: unknown[]) => {
      try {
        return Promise.resolve(mysql2Result(options, values));
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
    release() {},
  };
  // The callback API, with `promise()` for the other one, as mysql2 has them:
  // Kysely and TypeORM call the first, Drizzle the second.
  const mysql2Connection = {
    query(options: Options, ...rest: unknown[]) {
      const [callback, [values]] = callbackOf(rest);
      let rows: unknown;
      let fields: unknown;
      try {
        [rows, fields] = mysql2Result(options, values as unknown[] | undefined);
      } catch (error) {
        queueMicrotask(() => callback?.(error as Error));
        return undefined;
      }
      queueMicrotask(() => callback?.(null, rows, fields));
      return undefined;
    },
    promise: () => ({ ...mysql2Promise, execute: mysql2Promise.query }),
    release() {},
    on() {},
    listeners: () => [],
  };
  const mysql2Pool = {
    ...mysql2Connection,
    getConnection(callback: (error: Error | null, connection: typeof mysql2Connection) => void) {
      queueMicrotask(() => callback(null, mysql2Connection));
    },
    promise: () => ({
      ...mysql2Promise,
      execute: mysql2Promise.query,
      getConnection: () =>
        Promise.resolve({
          ...mysql2Promise,
          execute: mysql2Promise.query,
          beginTransaction: () => mysql2Promise.query("START TRANSACTION"),
          commit: () => mysql2Promise.query("COMMIT"),
          rollback: () => mysql2Promise.query("ROLLBACK"),
          release() {},
        }),
      end: () => Promise.resolve(),
    }),
    end(callback?: () => void) {
      queueMicrotask(() => callback?.());
    },
  };

  // mariadb: the rows with their columns in `meta`, or an OK packet.
  function mariadbQuery(options: Options, values?: unknown[]) {
    const { sql, values: own, rowsAsArray } = optionsOf(options);
    const result = run(sql, values ?? own);
    if (!result.fields) return Promise.resolve(okPacket(result));
    const meta = fieldsOf(result).map((field) => ({ ...field, name: () => field.name }));
    const rows = rowsAsArray ? result.rows.map((row) => arrayOf(result, row)) : result.rows;
    return Promise.resolve(Object.assign(rows, { meta }));
  }
  const mariadbConnection = {
    query: mariadbQuery,
    execute: mariadbQuery,
    release: () => Promise.resolve(),
    end: () => Promise.resolve(),
    on() {},
    off() {},
  };
  const mariadbPool = {
    ...mariadbConnection,
    getConnection: () => Promise.resolve(mariadbConnection),
  };

  // For SQL migrations now; an ORM that runs its own calls it after them.
  if (Object.keys(migrations).length) restore = takeSnapshot();

  return {
    mysql2Pool,
    mariadbPool,
    /** Takes the copy that `reset()` puts back: after the migrations. */
    snapshot: async () => {
      restore = takeSnapshot();
    },
    // The rows and AUTO_INCREMENT counters after the migrations: the next
    // test's first row is #1 again, as in a new database.
    reset: async () => {
      if (!restore) throw new Error(`No snapshot of ${name}: call snapshot() after migrating.`);
      run("SET FOREIGN_KEY_CHECKS = 0");
      try {
        for (const statement of restore) run(statement);
      } finally {
        run("SET FOREIGN_KEY_CHECKS = 1");
        // LAST_INSERT_ID() of the session, which the next test's first
        // INSERT should not find.
        run("SELECT LAST_INSERT_ID(0)");
      }
    },
  };
}
