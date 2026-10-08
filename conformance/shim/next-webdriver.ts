// Stands in for `test/lib/next-webdriver.ts`, which the tests of Next import
// as `next-webdriver`.
import type { BrowserOptions } from "./browser.ts";
import { currentNext } from "./next-instance.ts";
import { getFullUrl } from "./next-test-utils.ts";

export type { Browser as Playwright } from "./browser.ts";

// Of the app of the test: its port is the tab's.
export default function webdriver(
  appPortOrUrl: string | number,
  url: string,
  options?: BrowserOptions,
) {
  return currentNext().browser(getFullUrl(appPortOrUrl, url, "localhost"), options);
}
