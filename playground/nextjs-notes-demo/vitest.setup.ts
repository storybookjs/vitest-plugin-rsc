import {
  vi,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  expect,
  inject,
  type MockInstance,
} from "vitest";
import { page } from "vitest/browser";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { setupWorker } from "msw/browser";
import * as schema from "#db/schema.ts";
import * as authSessionModule from "#lib/auth-session.ts";
import * as dbModule from "#lib/db.ts";
import * as flashCookieModule from "#lib/flash-cookie.ts";
import { nextCacheProbeFetchHandler } from "#components/next-cache-msw.ts";

vi.mock("#lib/db.ts");

const { resetDb } = dbModule as typeof import("#lib/__mocks__/db.ts");
const { setCurrentUser } = authSessionModule as typeof import("#lib/__mocks__/auth-session.ts");
const { deleteFlashCookies } = flashCookieModule as typeof import("#lib/__mocks__/flash-cookie.ts");

vi.mock("#lib/auth.ts", () => ({
  auth: {
    api: {
      deletePasskey: vi.fn(),
      listPasskeys: vi.fn(async () => []),
      signInEmail: vi.fn(),
      signInMagicLink: vi.fn(),
      signOut: vi.fn(),
      signUpEmail: vi.fn(),
    },
  },
}));
vi.mock("#lib/auth-session.ts");
vi.mock("#lib/flash-cookie.ts");
const disableMotionStyle = document.createElement("style");
disableMotionStyle.textContent = `
  *,
  *::before,
  *::after {
    animation: none !important;
    scroll-behavior: auto !important;
    transition-property: none !important;
  }
`;
document.head.appendChild(disableMotionStyle);

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const TEST_NOW = "2026-05-06T00:00:00.000Z";

let base: PGlite;
let currentDbClient: PGlite | undefined;
let pointerResetTarget: HTMLElement | undefined;
const worker = setupWorker(...nextCacheProbeFetchHandler);

async function resetInteractiveState() {
  if (!pointerResetTarget) {
    pointerResetTarget = document.createElement("div");
    pointerResetTarget.setAttribute("aria-hidden", "true");
    pointerResetTarget.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "width:1px",
      "height:1px",
      "opacity:0",
      "pointer-events:auto",
      "z-index:2147483647",
    ].join(";");
  }

  if (!pointerResetTarget.isConnected) {
    document.body.appendChild(pointerResetTarget);
  }
  await page.elementLocator(pointerResetTarget).hover();
}

async function closeCurrentDbClient() {
  if (currentDbClient && !currentDbClient.closed) {
    await currentDbClient.close();
  }
  currentDbClient = undefined;
}

beforeAll(async () => {
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: true,
    serviceWorker: { url: "/mockServiceWorker.js" },
  });
  base = await PGlite.create("memory://");
  await base.exec(inject("testSchemaSQL"));
});

let consoleError: MockInstance<typeof console.error>;

beforeEach(async () => {
  consoleError = vi.spyOn(console, "error");
  consoleError.mockClear();
  // The plugin has left the page of the previous test by now, so the pointer
  // moves in a document that no longer changes.
  await resetInteractiveState();
  worker.resetHandlers();
  await closeCurrentDbClient();
  setCurrentUser(null);
  deleteFlashCookies();
  const clone = await base.clone();
  if (!(clone instanceof PGlite)) {
    throw new TypeError("Expected PGlite.clone() to return a PGlite instance");
  }
  currentDbClient = clone;
  resetDb(drizzle(clone, { schema }));

  vi.setSystemTime(new Date(TEST_NOW));

  return () => {
    vi.useRealTimers();
  };
});

afterEach(async () => {
  await page.viewport(MOBILE_VIEWPORT.width, MOBILE_VIEWPORT.height);
  // React reports a hydration mismatch with console.error, and Next a render
  // that failed on the server. A test that expects one silences it with a spy.
  expect(consoleError.mock.calls).toEqual([]);
});

afterAll(async () => {
  await closeCurrentDbClient();
  await base.close();
  worker.stop();
});
