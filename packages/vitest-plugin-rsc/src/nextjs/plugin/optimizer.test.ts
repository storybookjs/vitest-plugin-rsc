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
  expect(depsByGroup.browserRuntime).not.toContain("@vitejs/plugin-rsc/ssr");
  expect(depsByGroup.browserRuntime).toContain("@vitejs/plugin-rsc/core/ssr");
  expect(depsByGroup.browserRuntime).toContain("next/dist/compiled/path-browserify");
  expect(depsByGroup.browserRuntime).toContain("next/dist/client/dev/noop-turbopack-hmr.js");
  expect(depsByGroup.browserRuntime).toContain("next/dist/compiled/next-devtools");
  expect(depsByGroup.browserRuntime).toContain("next/dist/compiled/next-devtools/index.js");
  expect(depsByGroup.edgeAppPage).toContain("next/dist/compiled/@opentelemetry/api");
  expect(depsByGroup.edgeAppPage).toContain("next/dist/server/lib/trace/tracer");
  expect(depsByGroup.edgeAppPage).toContain("next/dist/server/lib/trace/tracer.js");
  expect(depsByGroup.edgeAppPage).toContain("next/dist/server/web/adapter");
  expect(depsByGroup.edgeAppPage).toContain("next/dist/server/web/adapter.js");
  expect(depsByGroup.edgeAppPage).toContain("next/dist/lib/metadata/get-metadata-route");
  expect(depsByGroup.edgeAppPage).toContain("next/og");
  expect(depsByGroup.entryBaseClientReference).toContain(
    "next/dist/next-devtools/userspace/app/segment-explorer-node.js",
  );
});

test("prebundles generated Edge App Page runtime dependencies for react_ssr", () => {
  const depsByGroup = resolveNextOptimizeDeps(fixtureRoot);

  expect(depsByGroup.edgeAppPage).toEqual(
    expect.arrayContaining([
      "next/dist/server/route-modules/app-page/module.js",
      "next/dist/server/app-render/entry-base",
      "next/dist/server/app-render/entry-base.js",
      "next/dist/server/send-payload",
      "next/dist/server/stream-utils/node-web-streams-helper",
      "next/dist/server/web/globals",
      "next/dist/shared/lib/no-fallback-error.external",
      "next/dist/client/components/builtin/default.js",
      "next/dist/shared/lib/router/utils/interception-routes",
    ]),
  );
});

test("prebundles generated Edge App Route metadata dependencies for react_ssr", () => {
  const depsByGroup = resolveNextOptimizeDeps(fixtureRoot);

  expect(depsByGroup.edgeAppPage).toEqual(
    expect.arrayContaining([
      "next/dist/build/webpack/loaders/metadata/resolve-route-data",
      "next/dist/server/app-render/manifests-singleton.js",
      "next/dist/server/lib/cache-control",
      "next/dist/server/lib/patch-fetch",
      "next/dist/server/route-modules/app-route/module.compiled",
      "next/dist/server/send-response",
      "next/dist/server/web/edge-route-module-wrapper",
      "next/dist/server/web/spec-extension/adapters/next-request",
      "next/dist/server/web/utils.js",
    ]),
  );
});
