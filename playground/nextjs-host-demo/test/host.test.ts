import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, beforeAll, expect } from "vitest";
import { createProject, test, type DevServer, type PageErrors } from "../../test-helpers/host.ts";

// The app in a page of Vite's own dev server, without Vitest: see
// ../vite.config.ts and ../host/main.tsx. The acceptance test of a host other
// than Vitest, like Storybook's builder: it loads a page of the app, a node in
// a container of its own, and a file of the host with `"use client"`.

const root = fileURLToPath(new URL("../", import.meta.url));

// The version of the React that Next comes with, which its layers run on, and
// not the `react` of the app.
const nextReact = (
  createRequire(new URL("../package.json", import.meta.url))("next/dist/compiled/react") as {
    version: string;
  }
).version;

let site: DevServer | undefined;

// The dev server of the project, as `vite` starts it. Without the
// environment of Vitest, but with NODE_OPTIONS, which has the condition that
// runs the source of the plugin when the suite does: see test-helpers/host.ts.
beforeAll(async () => {
  site = await createProject(root).serve((port) => [
    "vite",
    "--configLoader",
    "native",
    "--port",
    String(port),
    "--strictPort",
  ]);
});

afterAll(() => site?.close());

type HostWindow = import("../host/state.ts").HostWindow;

/**
 * Opens a page of the host with a view (see host/main.tsx), and fails the
 * test on an error of the page, with what the dev server printed: see `test`
 * in test-helpers/host.ts. Resolves with what the host left on `window`.
 */
async function open(
  page: Page,
  errors: PageErrors,
  view: string,
  run: (page: Page) => Promise<void>,
  document = "",
): Promise<HostWindow> {
  await page.goto(`${site!.url}${document}?view=${view}`);
  await page.waitForFunction(() => (window as HostWindow).__hostState, null, {
    timeout: 60_000,
  });
  const host = await page.evaluate(() => {
    const { __hostState, __hostError, __hostResponse, __hostReports } = window as HostWindow;
    return {
      __hostState,
      __hostError: __hostError === undefined ? undefined : String(__hostError),
      __hostResponse,
      __hostReports,
    };
  });
  expect(host.__hostState, `the host of ?view=${view}: ${host.__hostError}`).toBe("ready");
  await run(page);
  expect(errors.list, `the errors of the page of ?view=${view}\n${site!.output()}`).toEqual([]);
  return host;
}

const style = (page: Page, selector: string, property: string) =>
  page.evaluate(
    ([element, name]) =>
      getComputedStyle(document.querySelector(element!)!).getPropertyValue(name!),
    [selector, property],
  );

test("renders a page of the app", async ({ page, errors }) => {
  const host = await open(page, errors, "page", async (page) => {
    await page.getByRole("heading", { name: "Home" }).waitFor();
    await page.getByRole("heading", { name: "Hello from the page" }).waitFor();
    await page.getByText("The server read the request.").waitFor();
    // Next's client has hydrated the page: the Client Component works.
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
    // The CSS of the layout, and the CSS module of the component.
    expect(await style(page, "body", "margin-top")).toBe("32px");
    expect(await style(page, "[data-testid=greeting]", "border-left-color")).toBe(
      "rgb(0, 112, 243)",
    );
  });
  expect(host.__hostResponse).toEqual({ status: 200, url: site!.url });
});

test("renders a node of the host in a container of the host", async ({ page, errors }) => {
  await open(page, errors, "node", async (page) => {
    // In the container, with the document of the host around it.
    await page
      .locator("#host-root")
      .getByRole("heading", { name: "Hello from the host" })
      .waitFor();
    await page.getByText("The document of the host").waitFor();
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
    // The stylesheets of the node, which the dev server tells the page of.
    expect(await style(page, "[data-testid=greeting]", "border-left-color")).toBe(
      "rgb(0, 112, 243)",
    );
  });
});

test("a node has the CSS of the files of the host that render it", async ({ page, errors }) => {
  // A page of the host that renders a node from another file of the host,
  // like a story before this one, in a page of its own: callout.html.
  await open(
    page,
    errors,
    "callout",
    async (page) => {
      await page.locator("#host-root").getByText("From the host").waitFor();
      expect(await style(page, "[data-testid=callout]", "border-top-color")).toBe("rgb(255, 0, 0)");
    },
    "callout.html",
  );
  // The dev server has loaded both files of the host now. A node has the
  // CSS of the file of the host that this page loaded, and not of the other.
  await open(page, errors, "node", async (page) => {
    await page
      .locator("#host-root")
      .getByRole("heading", { name: "Hello from the host" })
      .waitFor();
    await page
      .locator("link[rel=stylesheet][href*='greeting.module.css']")
      .waitFor({ state: "attached" });
    expect(await page.locator("link[rel=stylesheet][href*='callout.module.css']").count()).toBe(0);
  });
});

test("answers 403 for a file of the app in `files`", async () => {
  // What the page asks for the node of a route of a node: see styles.ts.
  // Only a file of the host is the host's to say.
  const ask = (file: string) =>
    fetch(
      `${site!.url}@vitest-plugin-rsc/next-stylesheets?entry=${encodeURIComponent(
        "(vitest-plugin-rsc)/",
      )}&inline=true&file=${encodeURIComponent(file)}`,
    );
  const refused = await ask("app/components/greeting.tsx");
  expect(refused.status).toBe(403);
  expect(await refused.text()).toContain("greeting.tsx is not a file of the host");
  expect((await ask("host/main.tsx")).status).toBe(200);
});

test('runs a file of the host with "use client" in the browser layer', async ({ page, errors }) => {
  const host = await open(page, errors, "client", async (page) => {
    // The Client Component the file rendered, in a root it made itself.
    await page.locator("#client-root").getByRole("button", { name: "Count: 0" }).click();
    await page.locator("#client-root").getByRole("button", { name: "Count: 1" }).waitFor();
    // The CSS module of the component, a stylesheet of the app that the page
    // links once the file has loaded: from the dev server, not Vite's
    // `<style>` of a module.
    await page
      .locator("link[rel=stylesheet][href*='counter.module.css']")
      .waitFor({ state: "attached" });
    expect(await style(page, "#client-root button", "color")).toBe("rgb(0, 112, 243)");
  });
  // With Next's React for the browser, and with the page's own instance of
  // the package of the host: the host read what the file reported.
  expect(host.__hostReports).toEqual([{ from: "host/client.tsx", react: nextReact }]);
});
