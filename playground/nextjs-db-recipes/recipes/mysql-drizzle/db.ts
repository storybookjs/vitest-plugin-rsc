import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import * as schema from "./schema.ts";

// oxlint-disable-next-line no-process-env
const pool = createPool(process.env.MYSQL_URL ?? "mysql://root:root@localhost:3306/todos");

export const db = drizzle({ client: pool, schema, mode: "default" });
