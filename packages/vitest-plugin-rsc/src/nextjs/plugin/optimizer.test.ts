import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { createNextSourceOptimizerEntries, resolveNextOptimizeDeps } from "./optimizer";
import { fixtureRoot } from "./test-utils";

test("adds Next app source files as optimizer scan entries", () => {
  expect(createNextSourceOptimizerEntries(fixtureRoot)).toContain(
    "app/**/*.{js,jsx,ts,tsx,md,mdx}",
  );
});

test("does not add app optimizer scan entries when no app directory exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-next-empty-"));
  try {
    expect(createNextSourceOptimizerEntries(root)).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("only exposes optimizer deps that resolve in the installed Next version", () => {
  const requireFromFixture = createRequire(path.join(fixtureRoot, "package.json"));
  const depsByGroup = resolveNextOptimizeDeps(fixtureRoot);

  for (const dep of Object.values(depsByGroup).flat()) {
    expect(() => requireFromFixture.resolve(dep)).not.toThrow();
  }
});

test("prebundles browser request-router dependencies for the testing library", () => {
  const depsByGroup = resolveNextOptimizeDeps(fixtureRoot);

  expect(depsByGroup.testingLibrary).toEqual(
    expect.arrayContaining([
      "@next/routing",
      "next/dist/server/web/utils.js",
      "next/dist/shared/lib/router/utils/route-matcher.js",
      "next/dist/shared/lib/router/utils/route-regex.js",
    ]),
  );
  expect(depsByGroup.testingLibrary).not.toContain(
    "next/dist/compiled/@vercel/routing-utils/superstatic.js",
  );
});
