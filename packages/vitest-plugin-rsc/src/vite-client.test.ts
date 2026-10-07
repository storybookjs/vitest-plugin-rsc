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

test("a module runner environment gets the page's Vite client, not a copy", async () => {
  const takenPort = await holdPort();
  expect(await startServer(takenPort)).not.toBe(takenPort);

  // A copy would carry the address Vite wrote into its client before the
  // server listened, which is the taken port for as long as Vite does that.
  const runnerClient = await server!.environments.react_client!.fetchModule("/@vite/client");
  const { code } = runnerClient as { code: string };
  expect(code).toContain("globalThis.__vitest_plugin_rsc_vite_client__");
  expect(code).toContain("client.createHotContext;");
  expect(code).not.toContain(String(takenPort));
});
