import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.ts";

// The app's Postgres, at DATABASE_URL: Postgres in Docker for the Playwright
// tests. The Vitest tests mock this module with __mocks__/db.ts.
// oxlint-disable-next-line no-process-env
export const db = drizzle({
  client: new Pool({ connectionString: process.env.DATABASE_URL }),
  schema,
});
