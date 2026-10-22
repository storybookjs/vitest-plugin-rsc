import { expect } from "vitest";

/**
 * For a page that the app loads itself, like the page a node links to. A test
 * awaits the page that `renderServer()` opens, but not that one. Call this
 * before the page loads, and await what it returns before the test ends: it
 * waits until the page has hydrated.
 */
export function watchPageLoad(): () => Promise<void> {
  // Next's own mark of a hydrated page, for its e2e tests.
  const hydratedAt = () => (window as { __NEXT_HYDRATED_AT?: number }).__NEXT_HYDRATED_AT;
  const before = hydratedAt();
  return async () => {
    await expect
      // A page load starts the app's client code from scratch, which takes
      // a while when every core runs a worker.
      .poll(hydratedAt, {
        message: "the app did not load and hydrate another page",
        timeout: 10_000,
      })
      .not.toBe(before);
  };
}
