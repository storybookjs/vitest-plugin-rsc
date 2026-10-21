import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "./generated/client.ts";

// oxlint-disable-next-line no-process-env
const adapter = new PrismaMariaDb(
  process.env.MYSQL_URL ?? "mysql://root:root@localhost:3306/todos",
);

export const prisma = new PrismaClient({ adapter });
