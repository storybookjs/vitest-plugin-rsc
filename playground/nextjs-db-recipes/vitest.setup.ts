import { beforeEach, vi } from "vitest";
import * as mysqlDrizzle from "#recipes/mysql-drizzle/db.ts";
import * as mysqlPrisma from "#recipes/mysql-prisma/db.ts";
import * as postgresDrizzle from "#recipes/postgres-drizzle/db.ts";
import * as postgresPrisma from "#recipes/postgres-prisma/db.ts";
import * as postgresKysely from "#recipes/postgres-kysely/db.ts";
import * as mysqlKysely from "#recipes/mysql-kysely/db.ts";
import * as sqliteKysely from "#recipes/sqlite-kysely/db.ts";
import * as postgresSql from "#recipes/postgres-sql/db.ts";
import * as mysqlSql from "#recipes/mysql-sql/db.ts";
import * as sqliteSql from "#recipes/sqlite-sql/db.ts";
import * as sqliteDrizzle from "#recipes/sqlite-drizzle/db.ts";
import * as sqlitePrisma from "#recipes/sqlite-prisma/db.ts";
import * as redisIoredis from "#recipes/redis-ioredis/db.ts";
import { TEST_NOW } from "#test/todo-recipe.ts";

// The one module of each recipe that the tests mock: its database, with the
// file next to it in __mocks__/. With `isolate: false` the test files of a
// worker share their modules, so a mock is for all of them: it goes here.
vi.mock("#recipes/sqlite-drizzle/db.ts");
vi.mock("#recipes/sqlite-prisma/db.ts");
vi.mock("#recipes/mysql-drizzle/db.ts");
vi.mock("#recipes/mysql-prisma/db.ts");
vi.mock("#recipes/postgres-drizzle/db.ts");
vi.mock("#recipes/postgres-prisma/db.ts");
vi.mock("#recipes/postgres-kysely/db.ts");
vi.mock("#recipes/mysql-kysely/db.ts");
vi.mock("#recipes/sqlite-kysely/db.ts");
vi.mock("#recipes/postgres-sql/db.ts");
vi.mock("#recipes/mysql-sql/db.ts");
vi.mock("#recipes/sqlite-sql/db.ts");
vi.mock("#recipes/redis-ioredis/db.ts");

type Mocked = { resetDb(): Promise<void> };

beforeEach(async () => {
  // Every test has a database of its own, and the same time.
  for (const recipe of [
    sqliteDrizzle,
    sqlitePrisma,
    mysqlDrizzle,
    mysqlPrisma,
    postgresDrizzle,
    postgresPrisma,
    postgresKysely,
    mysqlKysely,
    sqliteKysely,
    postgresSql,
    mysqlSql,
    sqliteSql,
    redisIoredis,
  ]) {
    await (recipe as unknown as Mocked).resetDb();
  }
  vi.setSystemTime(TEST_NOW);
  return () => {
    vi.useRealTimers();
  };
});
