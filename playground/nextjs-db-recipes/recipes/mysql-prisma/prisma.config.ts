import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./schema.prisma",
  migrations: { path: "./migrations" },
  // oxlint-disable-next-line no-process-env
  datasource: { url: process.env.MYSQL_URL ?? "mysql://root:root@localhost:3306/todos" },
});
