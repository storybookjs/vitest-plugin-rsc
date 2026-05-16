import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "vitest";
import { resolveNextOptimizeDeps } from "./optimizer.ts";
import { fixtureRoot } from "./test-utils.ts";

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

test("prebundles focused project runtime deps that route entry scans miss", () => {
  const depsByGroup = resolveNextOptimizeDeps(fixtureRoot);

  expect(depsByGroup.projectRuntime).toEqual(
    expect.arrayContaining([
      "@base-ui/react/button",
      "class-variance-authority",
      "next/og",
      "react-transition-progress/next",
      "zod-form-data",
    ]),
  );

  const noMswRoot = path.resolve(fixtureRoot, "../nextjs-no-msw-demo");
  expect(resolveNextOptimizeDeps(noMswRoot).projectRuntime).toEqual(["next/og"]);
});
