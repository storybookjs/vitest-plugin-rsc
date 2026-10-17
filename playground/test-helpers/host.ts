import { spawn } from "node:child_process";
import net from "node:net";
import { chromium } from "playwright";
import { test as base, expect } from "vitest";

// What the node tests of the playgrounds that host an app share: a command of
// a project as its CLI runs it, a dev server of a project, a server of files
// for a static build, and a page of Chromium that fails its test on an error.

import type { Site } from "./serve-files.ts";

export { serveFiles, type Site } from "./serve-files.ts";

/** A dev server the tests open, with what it printed. */
export type DevServer = Site & { output(): string };

// What Vitest sets in the environment of a worker. A CLI runs the plugin
// without Vitest: with a NODE_ENV of `test`, Vite and Next make another app
// of it.
const ofVitest = /^(VITEST(_.*)?|TEST|NODE_ENV|MODE|DEV|PROD|SSR|BASE_URL)$/;
const env: NodeJS.ProcessEnv = { ...process.env };
for (const name of Object.keys(env)) if (ofVitest.test(name)) delete env[name];

type Command = {
  exited: Promise<void>;
  output(): string;
  kill(signal?: NodeJS.Signals): void;
};

// The commands that run, killed when the worker exits: also after a test
// that timed out, or a run that was stopped.
const running = new Set<Command>();
process.once("exit", () => {
  for (const command of running) command.kill();
});

// A command of the project, like `vite build`, as `pnpm exec` runs it, with
// the variables of the project on top. In a process group of its own, so that
// killing it takes its children with it.
function start(root: string, command: string[], variables: Record<string, string>): Command {
  const child = spawn("pnpm", ["exec", ...command], {
    cwd: root,
    env: { ...env, ...variables },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data: Buffer) => (output += data.toString()));
  child.stderr.on("data", (data: Buffer) => (output += data.toString()));
  const started: Command = {
    exited: new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) => {
        running.delete(started);
        if (code === 0) resolve();
        else reject(new Error(`${command.join(" ")} exited with ${code}:\n${output}`));
      });
    }),
    output: () => output,
    kill(signal = "SIGTERM") {
      try {
        process.kill(-child.pid!, signal);
      } catch {
        // It has exited already.
      }
    },
  };
  running.add(started);
  return started;
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });

/**
 * The commands of the project in `root`, a directory of a playground. They
 * run without the variables of Vitest, but for the ones of `env`, like
 * `VITEST_PLUGIN_RSC_BUILD`.
 */
export function createProject(
  root: string,
  { env: variables = {} }: { env?: Record<string, string> } = {},
) {
  return {
    /** Runs a command of the project to its end. Rejects with what it printed when it fails. */
    async run(...command: string[]): Promise<void> {
      await start(root, command, variables).exited;
    },

    /**
     * Starts a dev server of the project on a port that is free, and resolves
     * once it answers. Rejects when it does not within `timeout`, or stops.
     */
    async serve(
      command: (port: number) => string[],
      { timeout = 60_000 } = {},
    ): Promise<DevServer> {
      const port = await freePort();
      const server = start(root, command(port), variables);
      const url = `http://localhost:${port}/`;
      const stopped = server.exited.then(() => {
        throw new Error(`${command(port).join(" ")} stopped:\n${server.output()}`);
      });
      stopped.catch(() => {});
      const close = async () => {
        server.kill();
        // One that does not stop is killed.
        const timer = setTimeout(() => server.kill("SIGKILL"), 5_000);
        await server.exited.catch(() => {});
        clearTimeout(timer);
      };
      const answers = async () => {
        for (const end = Date.now() + timeout; Date.now() < end; ) {
          const response = await fetch(url).catch(() => undefined);
          if (response?.ok) return;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        throw new Error(`${url} did not answer:\n${server.output()}`);
      };
      try {
        await Promise.race([answers(), stopped]);
      } catch (error) {
        await close();
        throw error;
      }
      return { url, output: server.output, close };
    },
  };
}

/** What went wrong on a page: an error, a `console.error`, a request that failed. */
export type PageErrors = { list: string[] };

/**
 * `test` with a `page` of Chromium, in a browser context of its own. The test
 * fails on an error of the page too: one that is not caught, a
 * `console.error`, a request that fails or gets a 4xx or 5xx. So every file
 * the page asks for is there. A test that looks at the errors itself, story
 * by story, takes them from `errors`, which the end of the test checks.
 */
export const test = base
  // oxlint-disable-next-line no-empty-pattern
  .extend("browser", { scope: "file" }, async ({}, { onCleanup }) => {
    const browser = await chromium.launch();
    onCleanup(() => browser.close());
    return browser;
  })
  // oxlint-disable-next-line no-empty-pattern
  .extend("errors", async ({}): Promise<PageErrors> => ({ list: [] }))
  .extend("page", async ({ browser, errors }, { onCleanup }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(60_000);
    page.on("pageerror", (error) => errors.list.push(`pageerror: ${error.stack ?? error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.list.push(`console.error: ${message.text()}`);
    });
    page.on("requestfailed", (request) =>
      errors.list.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`),
    );
    page.on("response", (response) => {
      if (response.status() >= 400) errors.list.push(`${response.status()}: ${response.url()}`);
    });
    onCleanup(async () => {
      // Not what closing the page cuts off.
      const found = [...errors.list];
      await page.close();
      expect(found, "the errors of the page").toEqual([]);
    });
    return page;
  });
