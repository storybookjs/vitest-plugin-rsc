import type { DB } from "#lib/db.types.ts";

export let db: DB;

export function reset(value: DB) {
  db = value;
}
