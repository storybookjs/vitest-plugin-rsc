import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./recipes/mysql-drizzle/schema.ts",
  out: "./recipes/mysql-drizzle/migrations",
});
