import { boolean, index, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

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

// Every page asks for the notes of one user, among those of every user a run
// of the tests made.
export const notes = pgTable(
  "notes",
  {
    id: serial().primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    content: text().notNull().default(""),
    favorite: boolean().notNull().default(false),
  },
  (table) => [index("notes_owner_id_index").on(table.ownerId)],
);

export type User = typeof users.$inferSelect;
export type Note = typeof notes.$inferSelect;
