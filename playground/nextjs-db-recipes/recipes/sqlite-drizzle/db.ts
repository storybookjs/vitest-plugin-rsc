import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.ts";

// oxlint-disable-next-line no-process-env
const client = createClient({ url: process.env.SQLITE_URL ?? "file:local.db" });

export const db = drizzle(client, { schema });
