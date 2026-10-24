import { vi, beforeAll, beforeEach, afterEach, afterAll, expect, type MockInstance } from "vitest";
import { setupServer } from "msw/node";
import * as dbModule from "#lib/db.ts";
import { nextCacheProbeFetchHandler } from "#components/next-cache-msw.ts";
import { TEST_NOW } from "#test/now.ts";

// What vitest.setup.ts is to the browser projects, for the node project: MSW
// intercepts the requests of the worker itself, where in a browser its service
// worker does.
vi.mock("#lib/db.ts");

const { resetDb } = dbModule as typeof import("#lib/__mocks__/db.ts");

const server = setupServer(...nextCacheProbeFetchHandler);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});

let consoleError: MockInstance<typeof console.error>;

beforeEach(async () => {
  consoleError = vi.spyOn(console, "error");
  consoleError.mockClear();
  server.resetHandlers();
  await resetDb();
  vi.setSystemTime(new Date(TEST_NOW));
  return () => {
    vi.useRealTimers();
  };
});

afterEach(() => {
  expect(consoleError.mock.calls).toEqual([]);
});

afterAll(() => {
  server.close();
});
