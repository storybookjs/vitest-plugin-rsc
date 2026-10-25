import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DevEnvironment } from "vite";
import { expect, onTestFinished, test } from "vitest";
import { preBundlesOf } from "./pre-bundles.ts";

// An environment whose optimizer has pre-bundled React into `dir`, at a
// version, as Vite's metadata of them says.
function environmentWith(dir: string, browserHash: string) {
  const metadata = { browserHash, optimized: { react: { file: path.join(dir, "react.js") } } };
  return {
    config: { cacheDir: path.dirname(dir) },
    depsOptimizer: { metadata },
  } as unknown as DevEnvironment;
}

test("are the same for the same pre-bundles, and others once the optimizer writes them again", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-deps-"));
  onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
  const metadata = path.join(dir, "_metadata.json");
  fs.writeFileSync(metadata, "{}");
  fs.utimesSync(metadata, 1_000, 1_000);
  const first = environmentWith(dir, "abc");

  expect(preBundlesOf(first)).toBe(preBundlesOf(first));
  expect(preBundlesOf(environmentWith(dir, "abc"))).toBe(preBundlesOf(first));
  expect(preBundlesOf(environmentWith(dir, "def"))).not.toBe(preBundlesOf(first));

  // The optimizer bundles from its scan again: the same version, and a
  // module compiled against the first may import what these do not have.
  fs.utimesSync(metadata, 2_000, 2_000);
  expect(preBundlesOf(environmentWith(dir, "abc"))).not.toBe(preBundlesOf(first));
});

test("are none without an optimizer", () => {
  const environment = { config: { cacheDir: "/app/node_modules/.vite" } } as DevEnvironment;

  expect(preBundlesOf(environment)).toBe("/app/node_modules/.vite::");
});
