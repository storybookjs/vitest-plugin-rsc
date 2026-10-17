import { createRequire } from "node:module";
import type { Page } from "playwright";
import { expect } from "vitest";
import type { PageErrors } from "../../test-helpers/host.ts";

// What the tests of the host share, with its dev server (host.test.ts) and
// with its static build (../build-test/static-build.test.ts): a view of a
// page of the host, see ../host/main.tsx.

type HostWindow = import("../host/state.ts").HostWindow;

/** A site that serves the host: its URL, and what its server printed, if it is a dev server. */
export type HostSite = { url: string; output?(): string };

// The version of the React that Next comes with, which its layers run on, and
// not the `react` of the app.
export const nextReact = (
  createRequire(new URL("../package.json", import.meta.url))("next/dist/compiled/react") as {
    version: string;
  }
).version;

/**
 * Opens a page of the host with a view (see host/main.tsx), and fails the
 * test on an error of the page, with what the dev server printed: see `test`
 * in test-helpers/host.ts. Resolves with what the host left on `window`.
 */
export async function open(
  page: Page,
  errors: PageErrors,
  site: HostSite,
  view: string,
  run: (page: Page) => Promise<void>,
  document = "",
): Promise<HostWindow> {
  await page.goto(`${site.url}${document}?view=${view}`);
  await page.waitForFunction(() => (window as HostWindow).__hostState, null, {
    timeout: 60_000,
  });
  const host = await page.evaluate(() => {
    const {
      __hostState,
      __hostError,
      __hostResponse,
      __hostReports,
      __hostModule,
      __hostCalloutLinked,
    } = window as HostWindow;
    return {
      __hostState,
      __hostError: __hostError === undefined ? undefined : String(__hostError),
      __hostResponse,
      __hostReports,
      __hostModule,
      __hostCalloutLinked,
    };
  });
  expect(host.__hostState, `the host of ?view=${view}: ${host.__hostError}`).toBe("ready");
  await run(page);
  expect(errors.list, `the errors of the page of ?view=${view}\n${site.output?.() ?? ""}`).toEqual(
    [],
  );
  return host;
}

/** The computed value of a CSS property of the element of a selector. */
export const style = (page: Page, selector: string, property: string) =>
  page.evaluate(
    ([element, name]) =>
      getComputedStyle(document.querySelector(element!)!).getPropertyValue(name!),
    [selector, property],
  );

/** The stylesheets of the greeting, and none of the callout. */
export async function expectGreetingStylesheets(page: Page) {
  await page.locator("#host-root").getByRole("heading", { name: "Hello from the host" }).waitFor();
  await page
    .locator("link[rel=stylesheet][href*='greeting.module']")
    .waitFor({ state: "attached" });
  expect(await page.locator("link[rel=stylesheet][href*='callout.module']").count()).toBe(0);
}
