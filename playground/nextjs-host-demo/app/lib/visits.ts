import { PGlite } from "@electric-sql/pglite";
import { count } from "drizzle-orm";
import { pgTable, serial } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";

// A database in the browser, as the tests of the notes demo have one: Postgres
// in PGlite, with Drizzle. Made when a page first asks for it.
const visits = pgTable("visits", { id: serial("id").primaryKey() });

let database: Promise<ReturnType<typeof drizzle>> | undefined;

const getDatabase = () =>
  (database ??= (async () => {
    const client = await PGlite.create();
    await client.exec("create table visits (id serial primary key)");
    return drizzle(client);
  })());

export async function countVisits(): Promise<number> {
  const [row] = await (await getDatabase()).select({ total: count() }).from(visits);
  return row?.total ?? 0;
}

export async function addVisit(): Promise<void> {
  await (await getDatabase()).insert(visits).values({});
}
