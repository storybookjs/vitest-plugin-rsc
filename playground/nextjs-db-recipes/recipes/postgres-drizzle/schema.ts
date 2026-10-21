import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const todos = pgTable("todos", {
  id: serial().primaryKey(),
  title: text().notNull(),
  done: boolean().notNull().default(false),
  // The database's clock, not the app's.
  createdAt: timestamp("created_at", { precision: 3, withTimezone: true }).notNull().defaultNow(),
});
