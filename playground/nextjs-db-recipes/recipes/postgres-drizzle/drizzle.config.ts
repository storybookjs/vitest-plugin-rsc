import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./recipes/postgres-drizzle/schema.ts",
  out: "./recipes/postgres-drizzle/migrations",
});
