import { vi } from "vitest";

// The one module the tests mock: the database. See lib/__mocks__/db.ts.
vi.mock("#lib/db.ts");
