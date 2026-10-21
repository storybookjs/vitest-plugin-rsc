import { createClient } from "@libsql/client";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import { Kysely } from "kysely";
import type { Database } from "./schema.ts";

// oxlint-disable-next-line no-process-env
const client = createClient({ url: process.env.SQLITE_URL ?? "file:local.db" });

export const db = new Kysely<Database>({
  // The dialect has the types of an older libsql client.
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
  dialect: new LibsqlDialect({ client: client as never }),
});
