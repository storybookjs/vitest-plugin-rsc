import type { Kysely } from "kysely";
import { Migrator, type Migration } from "kysely/migration";

/**
 * Runs the app's migrations of Kysely on a test database, with Kysely's own
 * migrator: `migrations` are the modules of the files, by `import.meta.glob`.
 */
export async function migrateToLatest(
  // Of any database, as Kysely's own migrations take one.
  // oxlint-disable-next-line typescript-eslint/no-explicit-any
  db: Kysely<any>,
  migrations: Record<string, Migration>,
): Promise<void> {
  const byName = Object.fromEntries(
    Object.entries(migrations).map(([file, migration]) => [
      file.split("/").pop()!.replace(/\.ts$/, ""),
      migration,
    ]),
  );
  const migrator = new Migrator({ db, provider: { getMigrations: async () => byName } });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}
