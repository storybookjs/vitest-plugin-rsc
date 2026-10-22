import { beforeEach, vi } from "vitest";
import { resetDb } from "#test/db.ts";

// The one module the tests mock: the database. See lib/__mocks__/db.ts.
vi.mock("#lib/db.ts");

beforeEach(async () => {
  await resetDb();
});
