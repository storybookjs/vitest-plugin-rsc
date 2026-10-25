import "@testing-library/jest-dom/vitest";
import "dom-locators/expect-element";
import { vi, beforeAll, beforeEach, afterEach, afterAll, expect, type MockInstance } from "vitest";
import { setupServer } from "msw/node";
import { nextCacheProbeFetchHandler } from "#components/next-cache-msw.ts";
import { TEST_NOW } from "#test/now.ts";

// What vitest.setup.ts is to the browser projects, for the node project: MSW
// intercepts the requests of the worker itself, where in a browser its service
// worker does.
vi.mock("#lib/db.ts");

// The clock stopped at TEST_NOW before the database does any work, and kept
// stopped: see vitest.setup.ts. Between files too, where Browser Mode needs
// the real clock, and Node.js does not.
vi.setSystemTime(new Date(TEST_NOW));

const { resetDb } = (await import("#lib/db.ts")) as typeof import("#lib/__mocks__/db.ts");

const server = setupServer(...nextCacheProbeFetchHandler);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});

let consoleError: MockInstance<typeof console.error>;

beforeEach(async ({ onTestFinished }) => {
  consoleError = vi.spyOn(console, "error");
  consoleError.mockClear();
  server.resetHandlers();
  await resetDb();
  onTestFinished(() => {
    vi.useRealTimers();
    vi.setSystemTime(new Date(TEST_NOW));
  });
});

afterEach(() => {
  expect(consoleError.mock.calls).toEqual([]);
});

afterAll(() => {
  server.close();
});
