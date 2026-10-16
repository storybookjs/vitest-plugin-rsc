import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";

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

// What Vitest sets in the environment of a worker. The dev server runs the
// plugin without Vitest: with a NODE_ENV of `test`, Vite and Next make
// another app of it. Not NODE_OPTIONS, which has the condition that runs the
// source of the plugin, when the suite does.
const ofVitest = /^(VITEST(_.*)?|TEST|NODE_ENV|MODE|DEV|PROD|SSR|BASE_URL)$/;
const env: NodeJS.ProcessEnv = { ...process.env };
for (const name of Object.keys(env)) if (ofVitest.test(name)) delete env[name];

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });

type Site = { url: string; output(): string; close(): Promise<void> };

/** Starts the dev server of the project, as `vite` does, and waits for it to answer. */
async function serve(): Promise<Site> {
  const port = await freePort();
  const command = [
    "exec",
    "vite",
    "--configLoader",
    "native",
    "--port",
    String(port),
    "--strictPort",
  ];
  // In a process group of its own, so that killing it takes its children with it.
  const child = spawn("pnpm", command, { cwd: root, env, detached: true, stdio: "pipe" });
  let output = "";
  child.stdout.on("data", (data: Buffer) => (output += data.toString()));
  child.stderr.on("data", (data: Buffer) => (output += data.toString()));
  const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()));
  const url = `http://localhost:${port}/`;
  const site: Site = {
    url,
    output: () => output,
    async close() {
      try {
        process.kill(-child.pid!, "SIGTERM");
      } catch {
        // It has exited already.
      }
      await exited;
    },
  };
  for (const end = Date.now() + 60_000; Date.now() < end; ) {
    if (child.exitCode !== null) break;
    const response = await fetch(url).catch(() => undefined);
    if (response?.ok) return site;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await site.close();
  throw new Error(`vite did not answer at ${url}:\n${output}`);
}

let site: Site;
let browser: Browser;

beforeAll(async () => {
  [site, browser] = await Promise.all([serve(), chromium.launch()]);
});

afterAll(async () => {
  await Promise.all([browser?.close(), site?.close()]);
});

type HostWindow = {
  __hostState?: "ready" | "error";
  __hostError?: unknown;
  __hostResponse?: { status: number; url: string };
  __hostReports?: unknown[];
};

/**
 * Opens the host page with a view (see host/main.tsx), and fails the test on
 * an error of the page: one that is not caught, a `console.error`, a request
 * that fails or gets a 4xx or 5xx. Resolves with what the host left on `window`.
 */
async function open(view: string, run: (page: Page) => Promise<void>): Promise<HostWindow> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack ?? error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  page.on("requestfailed", (request) =>
    errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()}: ${response.url()}`);
  });
  try {
    await page.goto(`${site.url}?view=${view}`);
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
    return host;
  } finally {
    const found = [...errors];
    await page.close();
    expect(found, `the errors of the page of ?view=${view}\n${site.output()}`).toEqual([]);
  }
}

const style = (page: Page, selector: string, property: string) =>
  page.evaluate(
    ([element, name]) =>
      getComputedStyle(document.querySelector(element!)!).getPropertyValue(name!),
    [selector, property],
  );

test("renders a page of the app", async () => {
  const host = await open("page", async (page) => {
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
  expect(host.__hostResponse).toEqual({ status: 200, url: `${site.url}` });
});

test("renders a node of the host in a container of the host", async () => {
  await open("node", async (page) => {
    // In the container, with the document of the host around it.
    await page
      .locator("#host-root")
      .getByRole("heading", { name: "Hello from the host" })
      .waitFor();
    await page.getByText("Loading the host…").waitFor();
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
    // The stylesheets of the node, which the dev server tells the page of.
    expect(await style(page, "[data-testid=greeting]", "border-left-color")).toBe(
      "rgb(0, 112, 243)",
    );
  });
});

test('runs a file of the host with "use client" in the browser layer', async () => {
  const host = await open("client", async (page) => {
    // The Client Component the file rendered, in a root it made itself.
    await page.locator("#client-root").getByRole("button", { name: "Count: 0" }).click();
    await page.locator("#client-root").getByRole("button", { name: "Count: 1" }).waitFor();
    // The CSS the file imports, linked by the page.
    expect(await style(page, "#client-root button", "color")).toBe("rgb(0, 112, 243)");
  });
  // With Next's React for the browser, and with the page's own instance of
  // the package of the host: the host read what the file reported.
  expect(host.__hostReports).toEqual([{ from: "host/client.tsx", react: nextReact }]);
});
