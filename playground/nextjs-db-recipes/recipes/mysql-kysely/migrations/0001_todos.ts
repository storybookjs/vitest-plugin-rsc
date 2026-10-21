import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("todos")
    .addColumn("id", "integer", (column) => column.primaryKey().autoIncrement())
    .addColumn("title", "varchar(200)", (column) => column.notNull())
    .addColumn("done", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("created_at", sql`datetime(3)`, (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP(3)`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("todos").execute();
}
