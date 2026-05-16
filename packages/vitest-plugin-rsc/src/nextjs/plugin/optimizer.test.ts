import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "vitest";
import { virtualNextEntrypointsPublicId } from "../virtual-ids";
import { createNextSourceOptimizerEntries, resolveNextOptimizeDeps } from "./optimizer";
import { fixtureRoot } from "./test-utils";

test("uses the route-discovered virtual Next entrypoint as the optimizer scan entry", () => {
  expect(createNextSourceOptimizerEntries(fixtureRoot)).toEqual([virtualNextEntrypointsPublicId]);
});

test("does not use broad app source globs as optimizer scan entries", () => {
  for (const entry of createNextSourceOptimizerEntries(fixtureRoot)) {
    expect(entry).not.toContain("app/**/*");
    expect(entry).not.toContain("src/app/**/*");
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
      "next/dist/shared/lib/router/utils/remove-path-prefix.js",
      "next/dist/shared/lib/router/utils/route-matcher.js",
      "next/dist/shared/lib/router/utils/route-regex.js",
    ]),
  );
  expect(depsByGroup.testingLibrary).not.toContain(
    "next/dist/compiled/@vercel/routing-utils/superstatic.js",
  );
});
