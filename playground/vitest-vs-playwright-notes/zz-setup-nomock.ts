import { beforeEach } from "vitest";
import { resetDb } from "#test/db.ts";
// As vitest.setup.ts, without vi.mock: #lib/db.ts is aliased to lib/__mocks__/db.ts (ZZ_NOMOCK).
beforeEach(async () => {
  await resetDb();
});
