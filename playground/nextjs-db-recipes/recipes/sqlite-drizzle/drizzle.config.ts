import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./recipes/sqlite-drizzle/schema.ts",
  out: "./recipes/sqlite-drizzle/migrations",
});
