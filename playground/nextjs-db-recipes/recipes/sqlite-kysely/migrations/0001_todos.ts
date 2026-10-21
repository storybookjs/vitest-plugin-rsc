import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("todos")
    .addColumn("id", "integer", (column) => column.primaryKey().autoIncrement())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("done", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("created_at", "text", (column) => column.notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("todos").execute();
}
