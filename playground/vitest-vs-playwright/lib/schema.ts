import { boolean, pgTable, serial, text } from "drizzle-orm/pg-core";

// The table of schema.sql, which makes it on both databases.
export const todos = pgTable("todos", {
  id: serial().primaryKey(),
  title: text().notNull(),
  done: boolean().notNull().default(false),
});

export type Todo = typeof todos.$inferSelect;
