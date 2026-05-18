import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { cjsBrowserPlugin } from "../../cjs-browser-plugin.ts";
import {
  collectNextCjsBrowserBoundaryFiles,
  createNextCjsBrowserBoundaryOptions,
  isNextEntryBaseModuleFile,
} from "./cjs-browser-boundaries.ts";
import { fixtureRoot } from "./test-utils.ts";

test("discovers the real Next entry-base client boundary files without opting into all next/dist", async () => {
  const files = await collectNextCjsBrowserBoundaryFiles(fixtureRoot);

  expect(hasNextDistFile(files, "server/app-render/entry-base.js")).toBe(true);
  expect(hasNextDistFile(files, "client/app-dir/form.js")).toBe(true);
  expect(hasNextDistFile(files, "client/app-dir/link.js")).toBe(true);
  expect(hasNextDistFile(files, "client/components/builtin/global-error.js")).toBe(true);
  expect(hasNextDistFile(files, "client/components/layout-router.js")).toBe(true);
  expect(hasNextDistFile(files, "client/components/render-from-template-context.js")).toBe(true);
  expect(hasNextDistFile(files, "client/components/client-page.js")).toBe(true);
  expect(hasNextDistFile(files, "client/components/client-segment.js")).toBe(true);
  expect(hasNextDistFile(files, "client/components/http-access-fallback/error-boundary.js")).toBe(
    true,
  );
  expect(hasNextDistFile(files, "lib/framework/boundary-components.js")).toBe(true);
  expect(hasNextDistFile(files, "client/script.js")).toBe(true);
  expect(hasNextDistFile(files, "next-devtools/userspace/app/segment-explorer-node.js")).toBe(true);

  expect(hasNextDistFile(files, "server/app-render/app-render.js")).toBe(false);
  expect(hasNextDistFile(files, "shared/lib/lazy-dynamic/loadable.js")).toBe(false);
  expect(hasNextDistFile(files, "client/components/catch-error.js")).toBe(false);
});

test("recursively discovers use-client children from discovered Next boundaries", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-next-cjs-boundaries-"));
  try {
    const entryBaseFile = path.join(root, "node_modules/next/dist/server/app-render/entry-base.js");
    const layoutRouterFile = path.join(
      root,
      "node_modules/next/dist/client/components/layout-router.js",
    );
    const childFile = path.join(root, "node_modules/next/dist/client/components/child.js");
    const serverHelperFile = path.join(
      root,
      "node_modules/next/dist/client/components/server-helper.js",
    );
    const unreachedClientFile = path.join(
      root,
      "node_modules/next/dist/client/components/unreached-client.js",
    );
    const globalErrorFile = path.join(
      root,
      "node_modules/next/dist/client/components/builtin/global-error.js",
    );

    fs.mkdirSync(path.dirname(entryBaseFile), { recursive: true });
    fs.mkdirSync(path.dirname(layoutRouterFile), { recursive: true });
    fs.mkdirSync(path.dirname(globalErrorFile), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");
    fs.writeFileSync(
      entryBaseFile,
      `
const layoutRouter = require("../../client/components/layout-router");
const serverOnly = require("../../client/components/server-helper");
exports.LayoutRouter = layoutRouter.LayoutRouter;
exports.serverOnly = serverOnly;
`,
    );
    fs.writeFileSync(
      layoutRouterFile,
      `
"use client";
const child = require("./child");
const serverHelper = require("./server-helper");
exports.LayoutRouter = child.Child;
exports.serverHelper = serverHelper;
`,
    );
    fs.writeFileSync(childFile, '"use client";\nexports.Child = function Child() {};');
    fs.writeFileSync(serverHelperFile, 'exports.value = "server";');
    fs.writeFileSync(
      unreachedClientFile,
      '"use client";\nexports.Unreached = function Unreached() {};',
    );
    fs.writeFileSync(
      globalErrorFile,
      '"use client";\nexports.default = function GlobalError() {};',
    );

    const files = await collectNextCjsBrowserBoundaryFiles(root);

    expect(files.has(real(entryBaseFile))).toBe(true);
    expect(files.has(real(layoutRouterFile))).toBe(true);
    expect(files.has(real(childFile))).toBe(true);
    expect(files.has(real(globalErrorFile))).toBe(true);
    expect(files.has(real(serverHelperFile))).toBe(false);
    expect(files.has(real(unreachedClientFile))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("creates an include predicate for only discovered files and an entry-base parent predicate", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-next-cjs-options-"));
  try {
    const entryBaseFile = path.join(root, "node_modules/next/dist/server/app-render/entry-base.js");
    const appRenderFile = path.join(root, "node_modules/next/dist/server/app-render/app-render.js");
    const compiledOpenTelemetryApiFile = path.join(
      root,
      "node_modules/next/dist/compiled/@opentelemetry/api/index.js",
    );
    const compiledNanoidFile = path.join(root, "node_modules/next/dist/compiled/nanoid/index.cjs");
    const tracerFile = path.join(root, "node_modules/next/dist/server/lib/trace/tracer.js");
    const clientFile = path.join(root, "node_modules/next/dist/client/components/client-page.js");
    const unreachedClientFile = path.join(
      root,
      "node_modules/next/dist/client/components/unreached-client.js",
    );
    const globalErrorFile = path.join(
      root,
      "node_modules/next/dist/client/components/builtin/global-error.js",
    );

    fs.mkdirSync(path.dirname(entryBaseFile), { recursive: true });
    fs.mkdirSync(path.dirname(clientFile), { recursive: true });
    fs.mkdirSync(path.dirname(globalErrorFile), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");
    fs.writeFileSync(
      entryBaseFile,
      'const clientPage = require("../../client/components/client-page");\nexports.ClientPageRoot = clientPage.ClientPageRoot;',
    );
    fs.writeFileSync(appRenderFile, "exports.render = function render() {};");
    fs.writeFileSync(
      clientFile,
      '"use client";\nexports.ClientPageRoot = function ClientPageRoot() {};',
    );
    fs.writeFileSync(
      unreachedClientFile,
      '"use client";\nexports.Unreached = function Unreached() {};',
    );
    fs.writeFileSync(
      globalErrorFile,
      '"use client";\nexports.default = function GlobalError() {};',
    );

    const options = await createNextCjsBrowserBoundaryOptions(root);

    expect(options.boundary?.include?.(`${entryBaseFile}?v=1`)).toBe(true);
    expect(options.boundary?.include?.(clientFile)).toBe(false);
    expect(options.boundary?.include?.(globalErrorFile)).toBe(false);
    expect(options.boundary?.include?.(appRenderFile)).toBe(false);
    expect(options.boundary?.include?.(unreachedClientFile)).toBe(false);
    expect(options.boundary?.includeParent?.(`${entryBaseFile}?v=1`)).toBe(true);
    expect(options.boundary?.includeParent?.(appRenderFile)).toBe(false);
    expect(options.boundary?.includeReferenced?.(clientFile)).toBe(true);
    expect(options.boundary?.includeReferenced?.(globalErrorFile)).toBe(true);
    expect(options.boundary?.includeReferenced?.(unreachedClientFile)).toBe(false);
    expect(options.boundary?.moduleId?.(clientFile)).toBe(
      "next/dist/client/components/client-page.js",
    );
    expect(options.runtime?.include?.(compiledOpenTelemetryApiFile)).toBe(true);
    expect(options.runtime?.include?.(compiledNanoidFile)).toBe(true);
    expect(options.runtime?.include?.(tracerFile)).toBe(true);
    expect(options.runtime?.include?.(appRenderFile)).toBe(false);
    expect(options.runtime?.moduleId?.(compiledOpenTelemetryApiFile)).toBe(
      "next/dist/compiled/@opentelemetry/api/index.js",
    );
    expect(options.runtime?.moduleId?.(compiledNanoidFile)).toBe(
      "next/dist/compiled/nanoid/index.cjs",
    );
    expect(options.runtime?.moduleId?.(tracerFile)).toBe("next/dist/server/lib/trace/tracer.js");
    expect(options.runtime?.resolveBareImport?.("@opentelemetry/api", "client")).toBe(
      "next/dist/compiled/@opentelemetry/api",
    );
    expect(
      options.runtime?.resolveBareImport?.("react-server-dom-webpack/client", "react_client"),
    ).toBe("next/dist/compiled/react-server-dom-webpack/client.browser");
    expect(
      options.runtime?.resolveBareImport?.("react-server-dom-webpack/client", "react_ssr"),
    ).toContain(path.normalize("src/nextjs/react-server-dom-webpack-ssr.ts"));
    expect(options.runtime?.resolveBareImport?.("react-server-dom-webpack/client", "client")).toBe(
      "next/dist/compiled/react-server-dom-webpack/client.edge",
    );
    expect(isNextEntryBaseModuleFile(entryBaseFile)).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("real Next entry-base routes use-client CJS files through directive boundaries", async () => {
  const requireFromFixture = createRequire(path.join(fixtureRoot, "package.json"));
  const entryBaseFile = requireFromFixture.resolve("next/dist/server/app-render/entry-base.js");
  const layoutRouterFile = requireFromFixture.resolve(
    "next/dist/client/components/layout-router.js",
  );
  const options = await createNextCjsBrowserBoundaryOptions(fixtureRoot);
  const plugin = cjsBrowserPlugin({
    ...options,
    boundary: {
      ...options.boundary,
      proxy: false,
    },
    name: "next-rsc:test-cjs-boundary",
  })[0]!;
  const transform = getHookHandler(plugin.transform);
  const context = {
    environment: {
      name: "client",
      config: { cacheDir: path.join(fixtureRoot, "node_modules/.vite") },
    },
  };

  const entryBaseResult = (await transform.call(
    context as never,
    fs.readFileSync(entryBaseFile, "utf8"),
    entryBaseFile,
  )) as { code: string };
  const layoutRouterResult = (await transform.call(
    context as never,
    fs.readFileSync(layoutRouterFile, "utf8"),
    layoutRouterFile,
  )) as {
    code: string;
  };

  expect(entryBaseResult.code).toContain("rsc:cjs-browser-esm:");
  expect(layoutRouterResult.code).toMatch(/^["']use client["'];/);
  expect(layoutRouterResult.code).toContain('from "next/dist/client/components/layout-router.js"');
  expect(layoutRouterResult.code).not.toContain("registerClientReference");
  expect(layoutRouterResult.code).not.toContain("var exports = {}; var module = { exports };");
});

function hasNextDistFile(files: ReadonlySet<string>, relativeFile: string) {
  const suffix = path.normalize(`/next/dist/${relativeFile}`);
  return [...files].some((file) => file.endsWith(suffix));
}

function real(file: string) {
  return fs.realpathSync.native(file);
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
