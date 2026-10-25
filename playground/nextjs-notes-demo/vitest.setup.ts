import { vi, beforeAll, beforeEach, afterEach, afterAll, expect, type MockInstance } from "vitest";
import { page } from "vitest/browser";
import { setupWorker } from "msw/browser";
import { nextCacheProbeFetchHandler } from "#components/next-cache-msw.ts";
import { TEST_NOW } from "#test/now.ts";

// The one module the tests mock: the database, which is the app's Postgres,
// and a PGlite in memory here. Everything else of the app is real: Better
// Auth on that database, its cookies, the flash cookies. The plugin starts
// each test without the app's cookies.
vi.mock("#lib/db.ts");

// The page's clock stopped at TEST_NOW, as in the stories: the date of a note
// that a test writes is the same on every run. Stopped before the database
// does any work, here before it loads, and kept stopped through the file's
// tests: Postgres in PGlite times its own timeouts by the page's `Date.now()`
// too. A timeout that it armed by the real clock is months away by the
// stopped one, longer than a `setTimeout` can wait, which fires it early, and
// Postgres arms it again: a busy loop, from 10 s after the arm for as long as
// the clock stays stopped.
vi.setSystemTime(new Date(TEST_NOW));

const { resetDb } = (await import("#lib/db.ts")) as typeof import("#lib/__mocks__/db.ts");

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
  // The real clock between files, after every hook of the file, the plugin's
  // `afterAll` too: Browser Mode imports the setup files again for the next
  // file by a URL with `Date.now()` in it, which a stopped clock would
  // repeat, and an import of the same URL runs nothing.
  return () => {
    vi.useRealTimers();
  };
});

let consoleError: MockInstance<typeof console.error>;

beforeEach(async ({ onTestFinished }) => {
  consoleError = vi.spyOn(console, "error");
  consoleError.mockClear();
  // The plugin has left the page of the previous test by now, so the pointer
  // moves in a document that no longer changes.
  await resetInteractiveState();
  worker.resetHandlers();
  await resetDb();

  // A test's own timers and time go, the stopped clock stays. The last thing
  // the test does: after the test's own `onTestFinished`, which may give the
  // real clock back.
  onTestFinished(() => {
    vi.useRealTimers();
    vi.setSystemTime(new Date(TEST_NOW));
  });
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
