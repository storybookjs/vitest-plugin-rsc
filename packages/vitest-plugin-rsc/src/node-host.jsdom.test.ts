// @vitest-environment jsdom
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";

const { nodeHost } = await import("./node-host.ts");

test("has a directory of the worker's own for the server's files, in the run's", () => {
  const serverFiles = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-test-"));
  try {
    const host = nodeHost(serverFiles);
    const dir = host.serverDir;
    expect(path.dirname(dir)).toBe(serverFiles);
    expect(path.basename(dir)).toMatch(/^worker-/);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
    // One for the worker: every page of it, and every host made in it.
    expect(host.serverDir).toBe(dir);
    expect(nodeHost(serverFiles).serverDir).toBe(dir);
  } finally {
    fs.rmSync(serverFiles, { recursive: true, force: true });
  }
});

test("runs an immediate of the server with the stores of Node's AsyncLocalStorage, which a message drops", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks");
  const host = nodeHost(os.tmpdir());
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
  const host = nodeHost(os.tmpdir());
  vi.useFakeTimers();
  try {
    await new Promise<void>((resolve) => host.serverImmediate(resolve));
  } finally {
    vi.useRealTimers();
  }
});
