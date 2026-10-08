// Stands in for `test/lib/next-test-utils.ts`: the helpers that work on a
// page or a response. The ones that start a process, read a build or open a
// socket have no place in a tab; the runner gives each of those a stub that
// says so (see `stubsFor()` in src/vite-plugin.ts).
//
// The bodies follow Next's own, so that a test waits and retries as it does
// there.
import type * as cheerio from "cheerio";
import { expect } from "vitest";
import type { Browser } from "./browser.ts";
import { currentNext, withQuery, type Query } from "./next-instance.ts";
import { isUnsupported } from "./unsupported.ts";

// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;

export { withQuery };

export const debugPrint = (..._args: unknown[]) => {};
export const shouldUseTurbopack = () => false;

export function getFullUrl(appPortOrUrl: string | number, url?: string, hostname?: string): string {
  let fullUrl =
    typeof appPortOrUrl === "string" && appPortOrUrl.startsWith("http")
      ? appPortOrUrl
      : `http://${hostname ? hostname : "localhost"}:${appPortOrUrl}${url}`;
  if (typeof appPortOrUrl === "string" && url) {
    const parsedUrl = new URL(fullUrl);
    if (url === "//") {
      parsedUrl.pathname = "//";
    } else {
      const parsedPathQuery = new URL(url, fullUrl);
      parsedUrl.hash = parsedPathQuery.hash;
      parsedUrl.search = parsedPathQuery.search;
      parsedUrl.pathname = parsedPathQuery.pathname;
    }
    if (hostname && parsedUrl.hostname === "localhost") parsedUrl.hostname = hostname;
    fullUrl = parsedUrl.toString();
  }
  return fullUrl;
}

export function getFetchUrl(appPort: string | number, pathname: string, query?: Query): string {
  return getFullUrl(appPort, query ? withQuery(pathname, query) : pathname);
}

// Of the app of the test: its port is the tab's. So the request is the app's
// `next.fetch()`, with what that refuses and where that sends it.
export function fetchViaHTTP(
  appPort: string | number,
  pathname: string,
  query?: Query,
  init?: RequestInit,
): Promise<Response> {
  return currentNext().fetch(getFetchUrl(appPort, pathname, query), init);
}

export function renderViaHTTP(
  appPort: string | number,
  pathname: string,
  query?: Query,
  init?: RequestInit,
): Promise<string> {
  return fetchViaHTTP(appPort, pathname, query, init).then((response) => response.text());
}

export async function waitFor(millisOrCondition: number | (() => boolean)): Promise<void> {
  if (typeof millisOrCondition === "number") {
    return new Promise((resolve) => setTimeout(resolve, millisOrCondition));
  }
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (millisOrCondition()) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

export async function check(
  contentFn: () => unknown,
  regex: boolean | number | string | RegExp,
): Promise<boolean> {
  let content: unknown;
  let lastErr: unknown;
  for (let tries = 0; tries < 30; tries++) {
    try {
      content = await contentFn();
      if (typeof regex !== "object") {
        if (regex === content) return true;
      } else if (regex.test("" + content)) {
        return true;
      }
      await waitFor(1000);
    } catch (err) {
      // Waiting does not bring what this runner does not have.
      if (isUnsupported(err)) throw err;
      await waitFor(1000);
      lastErr = err;
    }
  }
  throw new Error("TIMED OUT: " + regex + "\n\n" + content + "\n\n" + lastErr);
}

export async function retry<T>(
  fn: () => T | Promise<T>,
  duration = 3000,
  interval = 500,
  _description: string = fn.name,
): Promise<T> {
  if (duration < 0) throw new Error("Duration cannot be less than 0.");
  const started = performance.now();
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (isUnsupported(err)) throw err;
      const waited = performance.now() - started;
      if (waited + interval > duration) throw err;
      await waitFor(interval);
    }
  }
}

// Next's dev overlay. A run in `start` mode has none, in Next's own runs as
// here, and a test may still make sure of that.
export async function waitForRedbox(browser: Browser, { waitInMs = 5000 } = {}): Promise<void> {
  try {
    await browser.locateRedbox().waitFor({ timeout: waitInMs });
  } catch {
    throw new Error("Expected Redbox but found no visible one.");
  }
}

export async function waitForNoRedbox(browser: Browser, { waitInMs = 5000 } = {}): Promise<void> {
  await waitFor(waitInMs);
  if (await browser.locateRedbox().isVisible())
    throw new Error("Expected no visible Redbox but found one");
}

export function getBrowserBodyText(browser: Browser) {
  return browser.eval<string>('document.getElementsByTagName("body")[0].innerText');
}

export function normalizeRegEx(src: string): string {
  return new RegExp(src).source.replace(/\^\//g, "^\\/");
}

export function colorToRgb(color: string): string {
  const colors: Record<string, string> = {
    blue: "rgb(0, 0, 255)",
    red: "rgb(255, 0, 0)",
    green: "rgb(0, 128, 0)",
    yellow: "rgb(255, 255, 0)",
    purple: "rgb(128, 0, 128)",
    black: "rgb(0, 0, 0)",
  };
  if (!colors[color]) throw new Error("Unknown color");
  return colors[color];
}

export function getUrlFromBackgroundImage(backgroundImage: string): string[] {
  return backgroundImage.match(/url\("[^)]+"\)/g)!.map((match) => match.slice(5, -2));
}

export const getTitle = (browser: Browser) =>
  browser.elementByCss("title", { state: "attached" }).text();

async function checkMeta(
  browser: Browser,
  queryValue: string,
  expected: RegExp | string | string[] | undefined | null,
  queryKey = "property",
  tag = "meta",
  domAttributeField = "content",
): Promise<void> {
  const values = await browser.eval<(string | null)[]>(
    `[...document.querySelectorAll('${tag}[${queryKey}="${queryValue}"]')].map((el) => el.getAttribute("${domAttributeField}"))`,
  );
  if (expected instanceof RegExp) {
    expect(values[0]).toMatch(expected);
  } else if (Array.isArray(expected)) {
    expect(values).toEqual(expected);
  } else if (expected === undefined) {
    expect(values).not.toContain(undefined);
  } else {
    expect(values).toContain(expected);
  }
}

export function createDomMatcher(browser: Browser) {
  return async (
    tag: string,
    query: string,
    expectedObject: Record<string, string | null | undefined>,
  ) => {
    const props = await browser.eval(`
      const el = document.querySelector('${tag}[${query}]');
      const res = {}
      const keys = ${JSON.stringify(Object.keys(expectedObject))}
      for (const k of keys) {
        res[k] = el?.getAttribute(k)
      }
      res
    `);
    expect(props).toEqual(expectedObject);
  };
}

export function createMultiHtmlMatcher($: ReturnType<typeof cheerio.load>) {
  return (
    tag: string,
    queryKey: string,
    domAttributeField: string,
    expected: Record<string, string | string[] | undefined>,
  ) => {
    const res: Record<string, string | string[] | undefined> = {};
    for (const key of Object.keys(expected)) {
      const el = $(`${tag}[${queryKey}="${key}"]`);
      if (el.length > 1) {
        res[key] = el
          .toArray()
          .map((item) => (item as { attribs: Record<string, string> }).attribs[domAttributeField]!);
      } else {
        res[key] = el.attr(domAttributeField);
      }
    }
    expect(res).toEqual(expected);
  };
}

export function createMultiDomMatcher(browser: Browser) {
  return async (
    tag: string,
    queryKey: string,
    domAttributeField: string,
    expected: Record<string, string | string[] | undefined | null>,
  ) => {
    await Promise.all(
      Object.keys(expected).map((key) =>
        checkMeta(browser, key, expected[key], queryKey, tag, domAttributeField),
      ),
    );
  };
}

export const checkMetaNameContentPair = (
  browser: Browser,
  name: string,
  content: string | string[],
) => checkMeta(browser, name, content, "name");

export const checkLink = (browser: Browser, rel: string, content: string | string[]) =>
  checkMeta(browser, rel, content, "rel", "link", "href");

export async function assertNoConsoleErrors(browser: Browser): Promise<void> {
  const logs = await browser.log();
  const warningsAndErrors = logs.filter(
    (log) =>
      log.source === "warning" ||
      (log.source === "error" &&
        !log.message.startsWith(
          "Failed to load resource: the server responded with a status of 404",
        )),
  );
  expect(warningsAndErrors).toEqual([]);
}

export const getCacheHeader = (response: Response) =>
  response.headers.get("x-nextjs-cache") || response.headers.get("x-vercel-cache");

export function trimEndMultiline(str: string): string {
  return str
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}
