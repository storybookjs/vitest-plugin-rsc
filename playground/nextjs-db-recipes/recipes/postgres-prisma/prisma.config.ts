import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./schema.prisma",
  migrations: { path: "./migrations" },
  // oxlint-disable-next-line no-process-env
  datasource: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/todos",
  },
});
