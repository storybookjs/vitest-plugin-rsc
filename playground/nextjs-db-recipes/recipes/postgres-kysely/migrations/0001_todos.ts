import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("todos")
    .addColumn("id", "serial", (column) => column.primaryKey())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("done", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("created_at", sql`timestamptz(3)`, (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("todos").execute();
}
