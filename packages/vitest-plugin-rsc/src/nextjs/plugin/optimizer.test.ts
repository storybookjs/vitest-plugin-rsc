import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "vitest";
import { resolveNextOptimizeDeps } from "./optimizer.ts";
import { fixtureRoot } from "./test-utils.ts";

test("only exposes optimizer deps that resolve in the installed Next version", () => {
  const requireFromFixture = createRequire(path.join(fixtureRoot, "package.json"));
  const depsByGroup = resolveNextOptimizeDeps(fixtureRoot);

  for (const dep of Object.values(depsByGroup).flat()) {
    if (dep === "@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client.ts") {
      continue;
    }
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
test("prebundles Next CJS utilities that are required by RSC client helpers", () => {
  const depsByGroup = resolveNextOptimizeDeps(fixtureRoot);

  expect(depsByGroup.clientRouter).toContain("next/dist/client/components/navigation-devtools.js");
  expect(depsByGroup.clientRouter).toContain(
    "next/dist/client/components/router-reducer/create-router-cache-key.js",
  );
  expect(depsByGroup.clientRouter).toContain(
    "next/dist/client/components/router-reducer/fetch-server-response.js",
  );
  expect(depsByGroup.clientRouter).toContain("next/dist/client/components/segment-cache/cache.js");
  expect(depsByGroup.rscClientUtility).toContain("next/dist/client/app-dir/form");
  expect(depsByGroup.rscClientUtility).toContain("next/dist/client/script");
  expect(depsByGroup.rscClientUtility).toContain("next/dist/client/components/not-found.js");
  expect(depsByGroup.rscClientUtility).toContain(
    "next/dist/client/components/readonly-url-search-params.js",
  );
  expect(depsByGroup.browserRuntime).toContain(
    "@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client.ts",
  );
  expect(depsByGroup.browserRuntime).toContain("next/dist/client/dev/noop-turbopack-hmr.js");
  expect(depsByGroup.browserRuntime).toContain("next/dist/compiled/next-devtools");
  expect(depsByGroup.browserRuntime).toContain("next/dist/compiled/next-devtools/index.js");
  expect(depsByGroup.entryBaseClientReference).toContain(
    "next/dist/next-devtools/userspace/app/segment-explorer-node.js",
  );
});
