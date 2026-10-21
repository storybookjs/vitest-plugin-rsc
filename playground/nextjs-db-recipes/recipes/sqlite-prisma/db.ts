import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "./generated/client.ts";

// oxlint-disable-next-line no-process-env
const adapter = new PrismaLibSql({ url: process.env.SQLITE_URL ?? "file:local.db" });

export const prisma = new PrismaClient({ adapter });
