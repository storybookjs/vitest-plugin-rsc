import { vi, beforeAll, beforeEach, afterEach, afterAll, expect, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { setupWorker } from "msw/browser";
import * as dbModule from "#lib/db.ts";
import { nextCacheProbeFetchHandler } from "#components/next-cache-msw.ts";
import { TEST_NOW } from "#test/now.ts";

// The one module the tests mock: the database, which is the app's Postgres,
// and a PGlite in memory here. Everything else of the app is real: Better
// Auth on that database, its cookies, the flash cookies. The plugin starts
// each test without the app's cookies.
vi.mock("#lib/db.ts");

const { resetDb } = dbModule as typeof import("#lib/__mocks__/db.ts");

// No motion in the tests, for all of the app at once. So the app needs no
// option of a library for it, like `disableTransitionOnChange` of
// next-themes, whose timer would outlive its page: see "A timer that
// outlives its page" in docs/nextjs-guide.md. The stories keep the app's
// motion, as its users see it.
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

beforeAll(async () => {
  await worker.start({
    onUnhandledRequest: "bypass",
    quiet: true,
    serviceWorker: { url: "/mockServiceWorker.js" },
  });
});

let consoleError: MockInstance<typeof console.error>;

beforeEach(async () => {
  consoleError = vi.spyOn(console, "error");
  consoleError.mockClear();
  // The plugin has left the page of the previous test by now, so the pointer
  // moves in a document that no longer changes.
  await resetInteractiveState();
  worker.resetHandlers();
  await resetDb();

  // The page's clock stopped at TEST_NOW, as in the stories: the date of a
  // note that a test writes is the same on every run.
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

afterAll(() => {
  worker.stop();
});
