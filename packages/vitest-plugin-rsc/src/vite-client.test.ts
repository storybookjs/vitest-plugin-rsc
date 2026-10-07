import fs from "node:fs";
import { createServer as createNetServer, type AddressInfo, type Server } from "node:net";
import os from "node:os";
import path from "node:path";
import { createServer, type ViteDevServer } from "vite";
import { afterEach, expect, test } from "vitest";
import { vitestPluginRSC } from "./index.ts";

let holder: Server | undefined;
let server: ViteDevServer | undefined;
let cacheDir: string | undefined;

afterEach(async () => {
  await server?.close();
  await new Promise((resolve) => (holder ? holder.close(resolve) : resolve(undefined)));
  if (cacheDir) fs.rmSync(cacheDir, { recursive: true, force: true });
  holder = server = cacheDir = undefined;
});

// Another Vitest run on the machine: it listens on the port this one would take.
async function holdPort(): Promise<number> {
  holder = createNetServer();
  await new Promise<void>((resolve, reject) => {
    holder!.once("error", reject).listen(0, resolve);
  });
  return (holder.address() as AddressInfo).port;
}

// The dev server as Vitest starts it for browser tests: a port from its config,
// which Vite moves on from when it is taken.
async function startServer(port: number): Promise<number> {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-"));
  server = await createServer({
    configFile: false,
    root: import.meta.dirname,
    cacheDir,
    logLevel: "silent",
    plugins: [vitestPluginRSC()],
    server: { port, hmr: false, watch: null },
  });
  await server.listen();
  return (server.httpServer!.address() as AddressInfo).port;
}

test("nothing the page gets names the port the server was configured with", async () => {
  const takenPort = await holdPort();
  const port = await startServer(takenPort);
  expect(port).not.toBe(takenPort);

  // Vite's part: its client carries the configured port, not the one in use.
  // The page's own instance does not need it, it has the URL it came from.
  const pageClient = await server!.environments.client!.transformRequest("/@vite/client");
  expect(pageClient!.code).toContain(`localhost:${takenPort}/`);

  // A module that a runner evaluates has no such URL, so it must not get a
  // copy of that client. It gets the instance of the page.
  const runnerClient = await server!.environments.react_client!.fetchModule("/@vite/client");
  const { code } = runnerClient as { code: string };
  expect(code).toContain("globalThis.__vitest_plugin_rsc_vite_client__");
  expect(code).toContain("createHotContext = client.createHotContext;");
  expect(code).not.toContain(String(takenPort));

  // And the websocket of the runners follows the page: no host, no port.
  const info = await fetch(`http://localhost:${port}/@vite/react-client-runner-websocket`);
  expect(await info.json()).toMatchObject({ host: null, port: null, path: "/" });
});
