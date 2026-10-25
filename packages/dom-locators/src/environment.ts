// What the package takes from its host: the running test's deadline and the
// locator settings of Vitest's config, when Vitest's browser runner is
// there, and the settings of `configure()` otherwise; and whether the DOM
// it runs in renders, as a browser's does and one of Node.js does not. The
// one module that reads Vitest, and only through the global of its browser
// runner, so that the package runs in any DOM, with or without Vitest.

/** The settings of `configure()`. */
export interface DomLocatorsOptions {
  /** The attribute of `getByTestId()`. Default: Vitest's `browser.locators.testIdAttribute`, else `data-testid`. */
  testIdAttribute?: string;
  /**
   * How long a find or an action waits without a timeout of its own, in
   * milliseconds, where no Vitest test is running: within a test, until just
   * before the test times out, as Vitest's own locators. Default: 1000.
   */
  timeout?: number;
}

const settings: Required<DomLocatorsOptions> & { testIdAttributeSet: boolean } = {
  testIdAttribute: "data-testid",
  testIdAttributeSet: false,
  timeout: 1000,
};

const known = new Set(["testIdAttribute", "timeout"]);

/** Sets what `page` and its locators do by default, for every test that follows. */
export function configure(options: DomLocatorsOptions): void {
  for (const key of Object.keys(options)) {
    if (!known.has(key)) {
      throw new TypeError(
        `configure() has no option "${key}": it takes testIdAttribute and timeout.`,
      );
    }
  }
  if (options.testIdAttribute !== undefined) {
    settings.testIdAttribute = options.testIdAttribute;
    settings.testIdAttributeSet = true;
  }
  if (options.timeout !== undefined) settings.timeout = options.timeout;
}

// The global of Vitest's browser runner, as Vitest's own locators read it:
// the task's deadline (`TaskDeadline.derive()`, the time left minus a
// margin, so that the locator fails before the test does) and the config.
type BrowserRunner = {
  runner?: { _deadline?: { derive?(): number } };
  config?: { browser?: { locators?: { exact?: boolean; testIdAttribute?: string } } };
};
const browserRunner = () =>
  (globalThis as { __vitest_browser_runner__?: BrowserRunner }).__vitest_browser_runner__;

// The global of Vitest's worker in Node.js, where the deadline is not
// there: the running test, with its timeout and when it started.
type Worker = { current?: { timeout?: number; result?: { startTime?: number } } };
const worker = () => (globalThis as { __vitest_worker__?: Worker }).__vitest_worker__;
// Vitest's margin of `TaskDeadline.derive()`.
const deadlineMargin = 100;
// The test's own `Date` may be fake.
const now = Date.now.bind(Date);

/** How long a wait without a timeout of the caller's may take: the test's time left, else `configure()`'s. */
export function defaultTimeout(): number {
  try {
    const derived = browserRunner()?.runner?._deadline?.derive?.();
    if (typeof derived === "number" && Number.isFinite(derived)) return derived;
    const test = worker()?.current;
    const start = test?.result?.startTime;
    if (test?.timeout && test.timeout > 0 && typeof start === "number") {
      return Math.max(Math.floor(start + test.timeout - now()) - deadlineMargin, 1);
    }
  } catch {
    // A runner of another shape: the configured timeout.
  }
  return settings.timeout;
}

/**
 * Whether a string matches whole and case-sensitive by default: Vitest's
 * `browser.locators.exact`, which is `true` unless the config says otherwise.
 */
export function exactByDefault(): boolean {
  return browserRunner()?.config?.browser?.locators?.exact ?? true;
}

/** The attribute of `getByTestId()`. */
export function testIdAttribute(): string {
  if (settings.testIdAttributeSet) return settings.testIdAttribute;
  return browserRunner()?.config?.browser?.locators?.testIdAttribute ?? settings.testIdAttribute;
}

/**
 * Whether the DOM is laid out and styled as a browser does it. A DOM of
 * Node.js, jsdom's or happy-dom's, lays nothing out, so every box is empty,
 * and has no styles of pseudo-elements: what is visible is told by the
 * style alone, and a click lands on the element itself. Told by Node.js
 * running the page, not by a box, which a test of jsdom may mock.
 */
export const rendered =
  typeof (globalThis as { process?: { versions?: { node?: unknown } } }).process?.versions?.node !==
  "string";

/**
 * The `view` of the events of `document`: its window, but none in a DOM
 * that does not render, as Vitest's jsdom environment gives a window that
 * jsdom's events do not take.
 */
export function eventView(document: Document): Window | null {
  return rendered ? document.defaultView : null;
}
