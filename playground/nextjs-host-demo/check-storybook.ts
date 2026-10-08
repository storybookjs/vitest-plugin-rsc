import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Frame, type Page } from "playwright";

// Opens the stories in Storybook and checks that they render: against
// `storybook dev`, or with `--build` against `storybook build`. With
// `--screenshots=<directory>` it saves what it sees of the client stories.
const root = fileURLToPath(new URL("./", import.meta.url));
const built = process.argv.includes("--build");
const argument = (name: string) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const only = argument("story");
const screenshots = argument("screenshots");
const port = Number(argument("port") ?? 6016);

type Server = { url: string; close(): Promise<void> };

// Storybook, as the scripts of package.json start it. In a process group of
// its own, so that closing it takes its children with it.
function storybook(args: string[]): { exited: Promise<number | null>; kill(): void } {
  const child = spawn("pnpm", ["exec", "storybook", ...args], {
    cwd: root,
    detached: true,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      STORYBOOK_DISABLE_TELEMETRY: "1",
      NODE_OPTIONS: "--conditions=vitest-plugin-rsc-source",
    },
  });
  return {
    exited: new Promise((resolve) => child.on("exit", resolve)),
    kill: () => process.kill(-child.pid!, "SIGTERM"),
  };
}

const contentTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

// A server of files and nothing else, like the host of a static site.
function serveFiles(directory: string): Promise<Server> {
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    const file = path.join(directory, pathname.endsWith("/") ? `${pathname}index.html` : pathname);
    if (!file.startsWith(directory) || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
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
      const { port: listening } = server.address() as { port: number };
      resolve({
        url: `http://localhost:${listening}/`,
        close: () => new Promise((closed) => server.close(() => closed())),
      });
    });
  });
}

async function start(): Promise<Server> {
  if (built) {
    if (!process.argv.includes("--no-build")) {
      const status = await storybook(["build", "--quiet"]).exited;
      if (status !== 0) throw new Error(`storybook build exited with ${status}`);
    }
    return serveFiles(path.join(root, "storybook-static"));
  }
  const dev = storybook(["dev", "-p", String(port), "--no-open", "--ci", "--exact-port"]);
  const url = `http://localhost:${port}/`;
  const stopped = dev.exited.then((status) => {
    throw new Error(`storybook dev exited with ${status}`);
  });
  const ready = async () => {
    for (;;) {
      const response = await fetch(`${url}index.json`).catch(() => undefined);
      if (response?.ok) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };
  await Promise.race([ready(), stopped]);
  return {
    url,
    async close() {
      stopped.catch(() => {});
      dev.kill();
      await dev.exited;
    },
  };
}

function expect(actual: unknown, expected: unknown, what: string): void {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// The canvas of a story, in the manager: the way a user opens it.
async function open(page: Page, url: string, story: string): Promise<Frame> {
  await page.goto(`${url}?path=/story/${story}`);
  const iframe = await page.locator("#storybook-preview-iframe").elementHandle();
  return (await iframe!.contentFrame())!;
}

type Channel = {
  emit(event: string, payload: object): void;
  on(event: string, listener: (id: string) => void): void;
  off(event: string, listener: (id: string) => void): void;
};

// Another story in the same preview, as a click in the sidebar selects it.
// Resolves once Storybook has rendered it.
async function select(canvas: Frame, story: string): Promise<void> {
  await canvas.evaluate((storyId) => {
    const { channel } = (window as unknown as { __STORYBOOK_PREVIEW__: { channel: Channel } })
      .__STORYBOOK_PREVIEW__;
    return new Promise<void>((resolve) => {
      const rendered = (id: string) => {
        if (id !== storyId) return;
        channel.off("storyRendered", rendered);
        resolve();
      };
      channel.on("storyRendered", rendered);
      channel.emit("setCurrentStory", { storyId, viewMode: "story" });
    });
  }, story);
}

// What the Actions panel has logged, by the name of the action.
async function actions(page: Page, name: string): Promise<number> {
  await page.getByRole("tab", { name: /Actions/ }).click();
  return page.locator("#storybook-panel-root").getByText(`${name}:`).count();
}

async function capture(page: Page, name: string): Promise<void> {
  if (!screenshots) return;
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, `${name}-${built ? "build" : "dev"}.png`) });
}

const checks: Record<string, (page: Page, url: string) => Promise<void>> = {
  // A Server Component, with a Client Component in it.
  async "server-greeting--default"(page, url) {
    const canvas = await open(page, url, "server-greeting--default");
    await canvas.getByRole("heading", { name: "Hello from Storybook" }).waitFor();
    await canvas.getByText("The server read the request.").waitFor();
    await canvas.getByRole("button", { name: "Count: 0" }).click();
    await canvas.getByRole("button", { name: "Count: 1" }).waitFor();
  },
  // A page of the app, in its layouts, with what the story seeded.
  async "pages-note--note"(page, url) {
    const canvas = await open(page, url, "pages-note--note");
    await canvas.getByRole("heading", { name: "Seeded by the story" }).waitFor();
    await canvas.getByRole("navigation", { name: "Main" }).waitFor();
  },
  // A story of a file with "use client": the arg is a spy, which its play
  // function clicks and asserts on, and the Actions panel logs.
  async "client-button--default"(page, url) {
    const canvas = await open(page, url, "client-button--default");
    await canvas.getByRole("button", { name: "Press" }).waitFor();
    await page.getByRole("tab", { name: /Interactions/ }).click();
    await page.locator("#storybook-panel-root").getByText("toHaveBeenCalledOnce").waitFor();
    await capture(page, "04-storybook-client-story");
    expect(await actions(page, "onClick"), 1, "the actions the play function logged");
    await canvas.getByRole("button", { name: "Press" }).click();
    await page.locator("#storybook-panel-root").getByText("onClick:").nth(1).waitFor();
    await capture(page, "04-storybook-client-story-actions");
  },
  // A render function with state, in Next's router at the URL of the story.
  async "client-button--counting"(page, url) {
    const canvas = await open(page, url, "client-button--counting");
    await canvas.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
    await page.getByRole("tab", { name: /Interactions/ }).click();
    await page.locator("#storybook-panel-root").getByText("toHaveBeenCalledTimes").waitFor();
    await capture(page, "04-storybook-client-story-state");
    expect(await actions(page, "onClick"), 2, "the actions the play function logged");
    await canvas.getByRole("button", { name: "Press at /notes/7: 2" }).click();
    await canvas.getByRole("button", { name: "Press at /notes/7: 3" }).waitFor();
  },
  // The CSS module and the image of a Client Component that a client story
  // renders.
  async "client-button--with-badge"(page, url) {
    const canvas = await open(page, url, "client-button--with-badge");
    const badge = canvas.getByTestId("badge");
    await badge.waitFor();
    await canvas.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("[data-testid=badge]")!).backgroundColor ===
        "rgb(0, 112, 243)",
      null,
      { timeout: 10_000 },
    );
    await canvas.waitForFunction(
      () => {
        const image = document.querySelector<HTMLImageElement>('img[alt="Badge logo"]');
        return image?.complete && image.naturalWidth > 0;
      },
      null,
      { timeout: 10_000 },
    );
  },
  // A Client Component that is no story file and imports a spy of
  // `storybook/test`: the preview's own module, also in a build.
  async "server-spiedbutton--default"(page, url) {
    const canvas = await open(page, url, "server-spiedbutton--default");
    await canvas.getByRole("button", { name: "Spied presses: 0" }).click();
    await canvas.getByRole("button", { name: "Spied presses: 1" }).waitFor();
  },
  // What the manager stores on the origin of the preview is its own: a story
  // that loads does not take it.
  async "the manager's storage"(page, url) {
    const canvas = await open(page, url, "server-greeting--default");
    // Once the story has rendered, which is once it has hydrated.
    await canvas.getByRole("button", { name: "Count: 0" }).click();
    await canvas.getByRole("button", { name: "Count: 1" }).waitFor();
    await page.evaluate(() => localStorage.setItem("manager-setting", "kept"));
    await select(canvas, "server-greeting--other-name");
    await canvas.getByRole("heading", { name: "Hello from a story with other args" }).waitFor();
    expect(
      await page.evaluate(() => localStorage.getItem("manager-setting")),
      "kept",
      "what the manager stored",
    );
  },
  // From story to story in one preview, as in a session: every story is a
  // page load, and a client story reads its imports from the page it is on.
  // Each one has rendered before the next is selected.
  async "from story to story"(page, url) {
    const canvas = await open(page, url, "server-greeting--default");
    await canvas.getByRole("button", { name: "Count: 0" }).click();
    await canvas.getByRole("button", { name: "Count: 1" }).waitFor();
    await select(canvas, "client-button--counting");
    await canvas.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
    await select(canvas, "client-button--default");
    await canvas.getByRole("button", { name: "Press", exact: true }).waitFor();
    await select(canvas, "pages-note--note");
    await canvas.getByRole("heading", { name: "Seeded by the story" }).waitFor();
    await select(canvas, "client-button--counting");
    await canvas.getByRole("button", { name: "Press at /notes/7: 2" }).waitFor();
    await select(canvas, "server-greeting--other-name");
    await canvas.getByRole("heading", { name: "Hello from a story with other args" }).waitFor();
  },
};

const server = await start();
const browser = await chromium.launch();
let failed = false;
try {
  for (const [name, check] of Object.entries(checks)) {
    if (only && only !== name) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.stack ?? error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
    });
    try {
      await check(page, server.url);
      // A file the page could not load, or an error it caught, fails it too.
      if (errors.length > 0) throw new Error("the page had errors");
      console.log(`ok   ${name}`);
    } catch (error) {
      failed = true;
      console.log(`FAIL ${name}\n     ${String(error)}\n     ${errors.join("\n     ")}`);
      if (process.argv.includes("--screenshot")) {
        await page.screenshot({ path: `/tmp/storybook-${name.replace(/\W+/g, "-")}.png` });
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
