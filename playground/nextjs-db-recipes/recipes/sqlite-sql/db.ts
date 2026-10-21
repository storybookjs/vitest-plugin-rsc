import { createClient } from "@libsql/client";

// oxlint-disable-next-line no-process-env
export const client = createClient({ url: process.env.SQLITE_URL ?? "file:local.db" });
