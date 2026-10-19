import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "#db/schema.ts";
import { env } from "#env/server.ts";

// The app's Postgres, at DATABASE_URL: see README.md. The tests and the
// stories have a database of their own in its place: see __mocks__/db.ts.
export const db = drizzle({ connection: { connectionString: env.DATABASE_URL }, schema });
