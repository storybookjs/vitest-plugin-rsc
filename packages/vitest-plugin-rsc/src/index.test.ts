import { createServer, type Server } from "node:net";
import type { Plugin, ViteDevServer } from "vite";
import { afterEach, expect, test } from "vitest";
import { vitestPluginRSC } from "./index";

const servers: Server[] = [];
const browserPlugin = { name: "vitest:browser:config" };
const configureServer = getHookHandler(getPlugin("rsc:browser-api-port").configureServer);

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

test("moves the Vitest browser API server before Vite falls back from an occupied port", async () => {
  const occupiedPort = await occupyPort();
  const server = createViteServer([browserPlugin], { port: occupiedPort });

  await configureServer.call({} as never, server);

  expect(server.config.server.port).toEqual(expect.any(Number));
  expect(server.config.server.port).not.toBe(occupiedPort);
});

test.each([
  ["strict Vitest browser API ports", [browserPlugin], { strictPort: true }],
  ["non-browser Vite servers", [], {}],
])("leaves %s untouched", async (_name, plugins, options) => {
  const occupiedPort = await occupyPort();
  const server = createViteServer(plugins, { port: occupiedPort, ...options });

  await configureServer.call({} as never, server);

  expect(server.config.server.port).toBe(occupiedPort);
});

function getPlugin(name: string): Plugin {
  const plugin = vitestPluginRSC().find((candidate) => candidate.name === name);
  if (!plugin) throw new Error(`Could not find ${name}.`);
  return plugin;
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}

function createViteServer(
  plugins: Array<{ name: string }>,
  server: { port: number; strictPort?: boolean },
): ViteDevServer {
  return {
    config: { plugins, server },
  } as unknown as ViteDevServer;
}

function occupyPort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      servers.push(server);
      resolve((server.address() as { port: number }).port);
    });
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
