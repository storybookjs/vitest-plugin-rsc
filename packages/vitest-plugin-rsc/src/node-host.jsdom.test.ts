// @vitest-environment jsdom
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
// What a worker of the Node host loads with `--import`, before the DOM.
import "./worker-web-apis.ts";

const { nodeHost } = await import("./node-host.ts");

test("has a directory of the worker's own for the server's files, in the system's temporary directory", () => {
  const host = nodeHost("http://127.0.0.1:1/");
  const dir = host.serverDir;
  expect(path.dirname(dir)).toBe(os.tmpdir());
  expect(path.basename(dir)).toMatch(/^vitest-plugin-rsc-/);
  expect(fs.statSync(dir).isDirectory()).toBe(true);
  // One for the worker: every page of it, and every host made in it.
  expect(host.serverDir).toBe(dir);
  expect(nodeHost("http://127.0.0.1:2/").serverDir).toBe(dir);
});

test("runs an immediate of the server with the stores of Node's AsyncLocalStorage, which a message drops", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const host = nodeHost("http://127.0.0.1:1/");
  const storage = new AsyncLocalStorage<string>();
  const seen = await new Promise((resolve) =>
    storage.run("request", () => host.serverImmediate(() => resolve(storage.getStore()))),
  );
  expect(seen).toBe("request");

  // And what it returns cancels it.
  const ran = vi.fn();
  host.serverImmediate(ran)();
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(ran).not.toHaveBeenCalled();
});

test("runs an immediate of the server while the test's timers are fake", async () => {
  const host = nodeHost("http://127.0.0.1:1/");
  vi.useFakeTimers();
  try {
    await new Promise<void>((resolve) => host.serverImmediate(resolve));
  } finally {
    vi.useRealTimers();
  }
});
