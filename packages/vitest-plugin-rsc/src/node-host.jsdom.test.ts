// @vitest-environment jsdom
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
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
