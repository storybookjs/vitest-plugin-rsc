import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { build, createBuilder, createServer, type InlineConfig } from "vite";

// Opens the host page of a playground in a browser and checks that the app
// runs in it: against the dev server, or with `--build` against a static
// build. With `--base=./` the build has that base, and is served from a
// directory of the site.
//
// A check fails on what it looks for, and on any error of the page: one that
// is not caught, a `console.error`, a request that fails or gets a 4xx or 5xx.
//
//   --build          a static build, served by a server of files
//   --vite-build     with `--build`: built with Vite's `build()`, as a script
//                    or a host like Storybook calls it, which builds one
//                    environment, from the config file
//   --no-build       with `--build`: the build that is there
//   --base=<base>    with `--build`: the base of the build
//   --view=<names>   only these checks, separated by commas
//   --jobs=<number>  how many checks run at a time, 4 without it
//   --screenshot     of a check that fails, in the temporary directory

export type Host = {
  /** The URL of the host page. */
  url: string;
  close(): Promise<void>;
};
export type Check = (page: Page, host: Host) => Promise<void>;
/** What the host page says of the response of the server in the browser. */
export type HostResponse = { status: number; url: string; redirected: boolean };

export type ChecksOptions = {
  /** The root of the Vite project that hosts the app. */
  root: string;
  /** Its config file, when that is not the `vite.config.ts` of the root. */
  configFile?: string;
  /** The host page, from the root. */
  page?: string;
  checks: Record<string, Check>;
};

// The config imports the source of the plugin, which is TypeScript.
const configLoader = "native";
const option = (name: string) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);

const contentTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

// A server of files and nothing else, like the host of a static site: a URL
// without a file is a 404, and so is one outside the directory it serves at.
function serveFiles(directory: string, at: string): Promise<Host> {
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    const relative = pathname.startsWith(at) ? pathname.slice(at.length) : undefined;
    const file =
      relative === undefined
        ? undefined
        : path.join(directory, /(^|\/)$/.test(relative) ? `${relative}index.html` : relative);
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

async function start({ root, configFile, page = "index.html" }: ChecksOptions): Promise<Host> {
  // In the URL of the site, a page named `index.html` is its directory.
  const pagePath = page.replace(/(^|\/)index\.html$/, "$1");
  if (flag("build")) {
    const base = option("base");
    if (!flag("no-build")) {
      const config: InlineConfig = { root, configFile, configLoader, logLevel: "warn", base };
      if (flag("vite-build")) await build(config);
      else await (await createBuilder(config)).buildApp();
    }
    // Where a build with a base is served: at that base, or for one that is
    // relative at a path of its own.
    const servedAt = !base ? "/" : base.startsWith("/") ? base : "/nested/site/";
    const site = await serveFiles(path.join(root, "dist"), servedAt);
    return { url: site.url + pagePath, close: site.close };
  }
  const server = await createServer({ root, configFile, configLoader, server: { port: 0 } });
  await server.listen();
  return { url: server.resolvedUrls!.local[0]! + pagePath, close: () => server.close() };
}

export function expect(actual: unknown, expected: unknown, what: string): void {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/**
 * Opens the host page with what it is to show in its query. The page says in
 * `__hostState` that it is ready, or in `__hostError` why not. Resolves with
 * its `__hostResponse`: the response of the server in the browser.
 */
export async function open(page: Page, host: Host, query: string): Promise<HostResponse> {
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

/** Runs the checks, each in a page of its own, and exits: with 1 when one failed. */
export async function runChecks(options: ChecksOptions): Promise<never> {
  const only = option("view")?.split(",");
  const checks = Object.entries(options.checks).filter(([name]) => !only || only.includes(name));
  const host = await start(options);
  const browser = await chromium.launch();
  let failed = false;

  async function run(name: string, check: Check): Promise<void> {
    // A page of a context of its own: with its own cookies.
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
      if (flag("screenshot")) {
        const file = path.join(os.tmpdir(), `check-host-${name}.png`);
        await page.screenshot({ path: file });
        console.log(`     ${file}`);
      }
    }
    await page.close();
  }

  try {
    // A few at a time: a check waits for the page more than it works.
    const jobs = Number(option("jobs") ?? 4);
    await Promise.all(
      Array.from({ length: jobs }, async () => {
        for (let next = checks.shift(); next; next = checks.shift()) await run(...next);
      }),
    );
  } finally {
    await browser.close();
    await host.close();
  }
  process.exit(failed ? 1 : 0);
}
