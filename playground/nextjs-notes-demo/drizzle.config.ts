import { defineConfig } from "drizzle-kit";
import "#env/load-next.ts";
import { env } from "#env/server.ts";

const databaseUrl = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Drizzle Kit commands.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
});
