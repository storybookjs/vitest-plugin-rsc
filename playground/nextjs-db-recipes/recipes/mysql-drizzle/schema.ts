import { sql } from "drizzle-orm";
import { boolean, datetime, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const todos = mysqlTable("todos", {
  id: int().primaryKey().autoincrement(),
  title: varchar({ length: 200 }).notNull(),
  done: boolean().notNull().default(false),
  // The database's clock, not the app's: see __mocks__/db.ts for a test's.
  createdAt: datetime("created_at", { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
});
