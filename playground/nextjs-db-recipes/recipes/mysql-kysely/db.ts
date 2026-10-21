import { Kysely, MysqlDialect } from "kysely";
import { createPool } from "mysql2";
import type { Database } from "./schema.ts";

// oxlint-disable-next-line no-process-env
const pool = createPool({
  uri: process.env.MYSQL_URL ?? "mysql://root:root@localhost:3306/todos",
  timezone: "Z",
});

export const db = new Kysely<Database>({ dialect: new MysqlDialect({ pool }) });
