import { boolean, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

// The tables of schema.sql, which makes them on both databases.
export const users = pgTable("users", {
  id: serial().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});

export const sessions = pgTable("sessions", {
  token: text().primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const notes = pgTable("notes", {
  id: serial().primaryKey(),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text().notNull(),
  content: text().notNull().default(""),
  favorite: boolean().notNull().default(false),
});

export type User = typeof users.$inferSelect;
export type Note = typeof notes.$inferSelect;
