import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { createBuilder, createServer } from "vite";

// Opens the host page in a browser and checks that the app runs in it: against
// the dev server, or with `--build` against a static build. With `--base=./`
// the build has that base, and is served from a directory of the site.
//
// A check fails on what it looks for, and on any error of the page: one that
// is not caught, a `console.error`, a request that fails or gets a 4xx or 5xx.
const root = fileURLToPath(new URL("./", import.meta.url));
// The config imports the source of the plugin, which is TypeScript.
const configLoader = "native";
const option = (name: string) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const built = process.argv.includes("--build");
const only = option("view");
const base = option("base");
// Where a build with a base is served: at that base, or for one that is
// relative at a path of its own.
const servedAt = !base ? "/" : base.startsWith("/") ? base : "/nested/site/";

const contentTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

type Host = { url: string; close(): Promise<void> };

// A server of files and nothing else, like the host of a static site: a URL
// without a file is a 404, and so is one outside the directory it serves at.
function serveFiles(directory: string, at: string): Promise<Host> {
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    const relative = pathname.startsWith(at) ? pathname.slice(at.length) : undefined;
    const file =
      relative === undefined
        ? undefined
        : path.join(directory, relative === "" || relative.endsWith("/") ? "index.html" : relative);
    if (!file?.startsWith(directory) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": contentTypes[path.extname(file)] ?? "application/octet-stream",
    });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => {
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      resolve({
        url: `http://localhost:${port}${at}`,
        close: () => new Promise((closed) => server.close(() => closed())),
      });
    });
  });
}

async function start(): Promise<Host> {
  if (built) {
    if (!process.argv.includes("--no-build")) {
      const builder = await createBuilder({ root, configLoader, logLevel: "warn", base });
      await builder.buildApp();
    }
    return serveFiles(path.join(root, "dist"), servedAt);
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

type HostResponse = { status: number; url: string; redirected: boolean };

// Opens the host page with what it is to show in its query: a page of the
// app by its URL, or the node of the host. Resolves with the response of the
// server in the tab.
async function open(page: Page, host: Host, query: string): Promise<HostResponse> {
  await page.goto(`${host.url}?${query}`);
  await page.waitForFunction(() => (window as { __hostState?: string }).__hostState, null, {
    timeout: 60_000,
  });
  const state = await page.evaluate(() => {
    const host = window as {
      __hostState?: string;
      __hostError?: unknown;
      __hostResponse?: HostResponse;
    };
    return {
      state: host.__hostState,
      error: String(host.__hostError),
      response: host.__hostResponse,
    };
  });
  expect(state.state, "ready", `the host of "${query}" (${state.error})`);
  return state.response!;
}

const pathname = (page: Page) => page.evaluate(() => window.location.pathname);
const heading = (page: Page, name: string) => page.getByRole("heading", { name }).waitFor();

const checks: Record<string, (page: Page, host: Host) => Promise<void>> = {
  async home(page, host) {
    const response = await open(page, host, "url=/");
    expect(response.status, 200, "the status");
    await heading(page, "Home");
    expect(await pathname(page), "/", "the pathname");
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
  },
  // `next/font/local` in the root layout: its class is on the body, and the
  // browser has loaded the file its CSS names.
  async font(page, host) {
    await open(page, host, "url=/");
    await heading(page, "Home");
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(/^"?geist"?,/i.test(family), true, `the font family of the body, ${family},`);
    await page.waitForFunction(
      () =>
        Array.from(document.fonts).some(
          (face) => /^"?geist"?$/i.test(face.family) && face.status === "loaded",
        ),
      null,
      { timeout: 10_000 },
    );
  },
  // `next/image` with an imported file, in a Server Component and in a Client
  // Component.
  async image(page, host) {
    await open(page, host, "url=/");
    for (const alt of ["Logo", "Badge logo"]) {
      await page.waitForFunction(
        (name) => {
          const image = document.querySelector<HTMLImageElement>(`img[alt="${name}"]`);
          return image?.complete && image.naturalWidth > 0;
        },
        alt,
        { timeout: 10_000 },
      );
    }
  },
  // The global CSS of the layout, and the CSS module of a Client Component.
  async styles(page, host) {
    await open(page, host, "url=/");
    const style = (selector: string, property: string) =>
      page.evaluate(
        ([element, name]) =>
          getComputedStyle(document.querySelector(element!)!).getPropertyValue(name!),
        [selector, property],
      );
    expect(await style("body", "margin-top"), "32px", "the margin of the body");
    expect(
      await style("[data-testid=badge]", "background-color"),
      "rgb(0, 112, 243)",
      "the background of the badge",
    );
  },
  // `next/dynamic` without SSR: a chunk the browser asks for, with CSS of its own.
  async dynamic(page, host) {
    await open(page, host, "url=/");
    await page.getByText("Panel: loaded in a browser").waitFor();
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("[data-testid=panel]")!).borderLeftColor ===
        "rgb(121, 40, 202)",
      null,
      { timeout: 10_000 },
    );
  },
  // A page that waits for data. Its first load has all of it. A navigation
  // shows `loading.tsx`, and then the fallback of the boundary in the page.
  async loading(page, host) {
    await open(page, host, "url=/slow");
    await heading(page, "Slow");
    await page.getByText("Report: ready").waitFor();
    await page.getByRole("link", { name: "Home" }).click();
    await heading(page, "Home");
    await page.getByRole("link", { name: "Slow" }).click();
    await page.getByText("Loading the slow page…").waitFor();
    await page.getByText("Loading the report…").waitFor();
    await page.getByText("Report: ready").waitFor();
    expect(await page.title(), "Slow | Host demo", "the title");
  },
  // A route handler, asked by the `fetch` of a Client Component. It reads
  // what the host seeded.
  async routeHandler(page, host) {
    await open(page, host, "url=/");
    await page.getByRole("button", { name: "Load notes" }).click();
    await page.getByText("Notes: Seeded by the host").waitFor();
  },
  async redirect(page, host) {
    const response = await open(page, host, "url=/old");
    await heading(page, "Seeded by the host");
    expect(await pathname(page), "/notes/7", "the pathname");
    expect(response.redirected, true, "whether the response was redirected");
  },
  async notFound(page, host) {
    const response = await open(page, host, "url=/notes/unknown");
    await heading(page, "No such page");
    expect(response.status, 404, "the status");
    expect(await pathname(page), "/notes/unknown", "the pathname");
  },
  // A Server Action sets a cookie, and the next render reads it: the one of
  // the action, and the one of a navigation after it.
  async cookies(page, host) {
    await open(page, host, "url=/settings");
    await page.getByText("Theme: light").waitFor();
    await page.getByRole("button", { name: "Use the dark theme" }).click();
    await page.getByText("Theme: dark").waitFor();
    expect(
      await page.evaluate(() => document.cookie.includes("theme=dark")),
      true,
      "whether the tab has the cookie",
    );
    await page.getByRole("link", { name: "Home" }).click();
    await heading(page, "Home");
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByText("Theme: dark").waitFor();
  },
  // Next's router, there and back: with links, and with the history of the
  // tab. The document stays the one that loaded.
  async navigation(page, host) {
    await open(page, host, "url=/");
    await page.evaluate(() => void ((window as { __loadedOnce?: boolean }).__loadedOnce = true));
    await page.getByRole("link", { name: "Note 7" }).click();
    await heading(page, "Seeded by the host");
    expect(await page.title(), "Seeded by the host | Host demo", "the title");
    expect(await pathname(page), "/notes/7", "the pathname");
    await page.getByRole("link", { name: "Home" }).click();
    await heading(page, "Home");
    expect(await pathname(page), "/", "the pathname");
    await page.evaluate(() => window.history.back());
    await heading(page, "Seeded by the host");
    expect(await pathname(page), "/notes/7", "the pathname after going back");
    await page.evaluate(() => window.history.forward());
    await heading(page, "Home");
    expect(
      await page.evaluate(() => (window as { __loadedOnce?: boolean }).__loadedOnce),
      true,
      "whether the document is the one that loaded",
    );
  },
  async note(page, host) {
    await open(page, host, "url=/notes/7");
    await heading(page, "Seeded by the host");
    // A Server Action, and the page it revalidates.
    await page.getByRole("button", { name: "Likes: 0" }).click();
    await page.getByRole("button", { name: "Likes: 1" }).waitFor();
  },
  async node(page, host) {
    await open(page, host, "view=node");
    await heading(page, "Hello from the host");
    await page.getByText("The server read the request.").waitFor();
    await page.getByRole("button", { name: "Count: 0" }).click();
    await page.getByRole("button", { name: "Count: 1" }).waitFor();
    // The host's own document stays: a node renders in a container.
    await page.getByText("Loading the host…").waitFor();
  },
};

const host = await start();
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
      await check(page, host);
      // Also what no check looks at: every file the page asks for is there.
      if (errors.length > 0) throw new Error("the page had errors");
      console.log(`ok   ${name}`);
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
  await host.close();
}
process.exit(failed ? 1 : 0);
