// Stands in for `test/lib/next-webdriver.ts`, which the tests of Next import
// as `next-webdriver`.
import { openBrowser, type BrowserOptions } from "./browser.ts";
import { getFullUrl } from "./next-test-utils.ts";

export type { Browser as Playwright } from "./browser.ts";

export default function webdriver(
  appPortOrUrl: string | number,
  url: string,
  options?: BrowserOptions,
) {
  return openBrowser(getFullUrl(appPortOrUrl, url, "localhost"), options);
}
