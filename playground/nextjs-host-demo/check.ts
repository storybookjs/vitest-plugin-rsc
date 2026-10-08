import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { build, createServer, preview } from "vite";

// Opens the host page in a browser and checks that the app runs in it: against
// the dev server, or with `--build` against a static build.
const root = fileURLToPath(new URL("./", import.meta.url));
// The config imports the source of the plugin, which is TypeScript.
const configLoader = "native";
const built = process.argv.includes("--build");
const only = process.argv.find((arg) => arg.startsWith("--view="))?.slice("--view=".length);

async function start(): Promise<{ url: string; close(): Promise<void> }> {
  if (built) {
    if (!process.argv.includes("--no-build")) await build({ root, configLoader });
    const server = await preview({ root, configLoader, preview: { port: 0 } });
    return { url: server.resolvedUrls!.local[0]!, close: () => server.close() };
  }
  const server = await createServer({ root, configLoader, server: { port: 0 } });
  await server.listen();
  return { url: server.resolvedUrls!.local[0]!, close: () => server.close() };
}

function expect(actual: unknown, expected: unknown, what: string): void {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function open(page: Page, url: string, view: string): Promise<void> {
  await page.goto(`${url}?view=${view}`);
  await page.waitForFunction(() => (window as { __hostState?: string }).__hostState, null, {
    timeout: 60_000,
  });
  const state = await page.evaluate(() => {
    const host = window as { __hostState?: string; __hostError?: unknown };
    return { state: host.__hostState, error: String(host.__hostError) };
  });
  expect(state.state, "ready", `the host of view "${view}" (${state.error})`);
}

const checks: Record<string, (page: Page, url: string) => Promise<void>> = {
  async home(page, url) {
    await open(page, url, "home");
    await page.getByRole("heading", { name: "Home" }).waitFor();
    expect(await page.evaluate(() => window.location.pathname), "/", "the pathname");
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
    // A navigation with Next's router, to a page that reads what the host seeded.
    await page.getByRole("link", { name: "Note 7" }).click();
    await page.getByRole("heading", { name: "Seeded by the host" }).waitFor();
    expect(await page.title(), "Seeded by the host | Host demo", "the title");
  },
  async note(page, url) {
    await open(page, url, "note");
    await page.getByRole("heading", { name: "Seeded by the host" }).waitFor();
    // A Server Action, and the page it revalidates.
    await page.getByRole("button", { name: "Likes: 0" }).click();
    await page.getByRole("button", { name: "Likes: 1" }).waitFor();
  },
  async node(page, url) {
    await open(page, url, "node");
    await page.getByRole("heading", { name: "Hello from the host" }).waitFor();
    await page.getByText("The server read the request.").waitFor();
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
    // The host's own document stays: a node renders in a container.
    await page.getByText("Loading the host…").waitFor();
  },
};

const server = await start();
const browser = await chromium.launch();
let failed = false;
try {
  for (const [name, check] of Object.entries(checks)) {
    if (only && only !== name) continue;
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
      await check(page, server.url);
      console.log(`ok   ${name}${errors.length ? `\n     ${errors.join("\n     ")}` : ""}`);
    } catch (error) {
      failed = true;
      console.log(`FAIL ${name}\n     ${String(error)}\n     ${errors.join("\n     ")}`);
      if (process.argv.includes("--screenshot")) {
        await page.screenshot({ path: `/tmp/host-demo-${name}.png` });
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
