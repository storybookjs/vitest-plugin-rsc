import path from "node:path";
import { createRequire } from "node:module";
import { expect, test } from "vitest";
import { fixtureRoot } from "../../../../../plugin/test-utils.ts";
import type { NextAppLoaderOptions, NextAppRouteLoaderOptions } from "../../../entries.ts";
import type { NextRouteManifestBuildEntry } from "../../../../server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts";
import type { NextRouteHandlerManifestBuildEntry } from "../../../../server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts";
import {
  extractRouteTreeImportSources,
  generateNextAppRouteModule,
  generateNextAppPageModule,
  generateNextRouteTreeModule,
  rewriteNextAppLoaderFullOutput,
} from "./index.ts";

type NextAppLoaderContext = {
  getOptions(): NextAppLoaderOptions;
  _module: { buildInfo: Record<string, unknown> };
  _compiler: { context: string };
  _compilation: undefined;
  context: string;
  rootContext: string;
  addMissingDependency(file: string): void;
  getResolve(): (context: string, request: string) => Promise<string>;
};

const requireFromFixture = createRequire(path.join(fixtureRoot, "package.json"));
const { default: nextAppLoader } = requireFromFixture(
  "next/dist/build/webpack/loaders/next-app-loader/index",
) as {
  default: (this: NextAppLoaderContext) => Promise<string>;
};
const { encodeToBase64 } = requireFromFixture("next/dist/build/webpack/loaders/utils") as {
  encodeToBase64(value: object): string;
};

test("characterizes Next's full generated App Page userland artifact", async () => {
  const code = await loadGeneratedAppPage();

  expect(code).toMatch(
    /const \w+ = \(\) => import\(\/\* webpackMode: "eager" \*\/ ".+\/app\/page\.tsx"\);/,
  );
  expect(code).toContain("const tree =");
  expect(code).toContain("const __next_app_require__ = __webpack_require__");
  expect(code).toContain("const __next_app_load_chunk__ = () => Promise.resolve()");

  expect(code).toContain("export const __next_app__ = {");
  expect(code).toMatch(/require:\s*__next_app_require__/);
  expect(code).toMatch(/loadChunk:\s*__next_app_load_chunk__/);
  expect(code).toMatch(/const ComponentMod = \{\s*\.\.\.entryBase,[\s\S]*__next_app__\s*\};/);

  expect(code).toContain('import * as entryBase from "next/dist/server/app-render/entry-base"');
  expect(code).toContain("export const routeModule = new AppPageRouteModule({");
  expect(code).toContain("definition: {");
  expect(code).toContain("kind: RouteKind.APP_PAGE");
  expect(code).toMatch(/page:\s*["']\/page["']/);
  expect(code).toMatch(/pathname:\s*["']\/["']/);
  expect(code).toContain("loaderTree: tree");
  expect(code).toContain("handler,");
  expect(code).toContain("routeModule,");
});

test("generates Vite-compatible full App Page userland output", async () => {
  const { code, watchFiles } = await generateNextAppPageModule(
    fixtureRoot,
    createRootPageEntry(),
    createRootPageLoaderOptions(),
  );

  expect(watchFiles).toEqual(expect.arrayContaining([path.join(fixtureRoot, "app/layout.tsx")]));
  expect(code).toContain("const tree =");
  expect(code).toMatch(/export\s+const\s+__next_app__\s*=\s*\{/);
  expect(code).toMatch(/require:\s*__next_app_require__/);
  expect(code).toContain("export const ClientPageRoot = entryBase.ClientPageRoot");
  expect(code).toContain(
    'const __next_app_entry_base_server_module__ = await globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__("react_ssr", "next/dist/server/app-render/entry-base.js")',
  );
  expect(code).toContain('Symbol.for("react.client.reference")');
  expect(code).toContain("$$typeof: { value: __next_app_entry_base_client_reference_tag__ }");
  expect(code).toContain('$$id: { value: id + "#" + name }');
  expect(code).toContain("$$async: { value: false }");
  expect(code).toContain("Object.defineProperties(");
  expect(code).toContain(
    'LayoutRouter: __next_app_entry_base_client_reference__("next/dist/client/components/layout-router.js", "default", __next_app_entry_base_server__.LayoutRouter)',
  );
  expect(code).toContain(
    '["next/dist/client/components/layout-router.js", { "default": entryBase.LayoutRouter, "LoadingBoundaryProvider": entryBase.LoadingBoundaryProvider }]',
  );
  expect(code).toContain("export const createElement = entryBase.createElement;");
  expect(code).not.toContain('from "next/dist/server/app-render/entry-base"');
  expect(code).toMatch(/export\s+const\s+routeModule\s*=\s*new AppPageRouteModule\(\{/);
  expect(code).toContain("loaderTree: tree");
  expect(code).toContain("handler,");
  expect(code).toContain("routeModule,");
  expect(code).toContain("__next_app__");

  expect(code).not.toContain("__webpack_require__");
  expect(code).not.toContain("renderToHTMLOrFlight");
  expect(code).not.toContain("createAppPageRouteModule");
  expect(code).not.toContain("loadEntrypoint");
});

test("keeps route-tree output tree-only for the existing contract", async () => {
  const { code } = await generateNextRouteTreeModule(
    fixtureRoot,
    createRootPageEntry(),
    createRootPageLoaderOptions(),
  );

  expect(code).toContain("export const tree =");
  expect(code).toContain("() => import(");
  expect(code).toContain("/@fs/");
  expect(code).not.toContain("export const routeModule");
  expect(code).not.toContain("export const __next_app__");
  expect(code).not.toContain("const __next_app_require__");
  expect(extractRouteTreeImportSources(code)).toEqual(
    expect.arrayContaining([`/@fs/${path.join(fixtureRoot, "app/page.tsx").slice(1)}`]),
  );
});

test("generates Vite-compatible App Route routeModule userland output", async () => {
  const { code, watchFiles } = await generateNextAppRouteModule(
    fixtureRoot,
    createApiRouteEntry(),
    createApiRouteLoaderOptions(),
  );
  const routeFile = path.join(fixtureRoot, "app/api/next-request-response/route.ts");

  expect(watchFiles).toContain(routeFile);
  expect(code).toContain("import { AppRouteRouteModule");
  expect(code).toContain(
    `import * as userland from ${JSON.stringify(`/@fs/${routeFile.slice(1)}`)}`,
  );
  expect(code).toContain("export {");
  expect(code).toContain("routeModule,");
  expect(code).toContain("new AppRouteRouteModule({");
  expect(code).toContain("kind: RouteKind.APP_ROUTE");
  expect(code).toContain(`page: ${JSON.stringify("/api/next-request-response/route")}`);
  expect(code).toContain(`pathname: ${JSON.stringify("/api/next-request-response")}`);
  expect(code).toMatch(/routeModule\s*\.\s*handle\(nextReq,\s*context\)/);
  expect(code).not.toContain("__webpack_require__");
  expect(code).not.toContain("renderToHTMLOrFlight");
  expect(code).not.toContain("createAppPageRouteModule");
});

test("rewrites __next_app_require__ with generated ids and eager static imports", async () => {
  const { code } = await generateNextAppPageModule(
    fixtureRoot,
    createRootPageEntry(),
    createRootPageLoaderOptions(),
  );
  const pageFile = path.join(fixtureRoot, "app/page.tsx");
  const layoutFile = path.join(fixtureRoot, "app/layout.tsx");

  expect(code).toContain("const __next_app_require_map__ = new Map([");
  expect(code).toContain(`[${JSON.stringify(pageFile)}, __next_app_import_`);
  expect(code).toContain(`[${JSON.stringify(layoutFile)}, __next_app_import_`);
  expect(code).toContain(
    `await globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__("client", ${JSON.stringify(pageFile)});`,
  );
  expect(code).toContain(
    `await globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__("client", ${JSON.stringify(layoutFile)});`,
  );
  expect(code).toMatch(
    /const [A-Za-z_$][\w$]* = \(\) => Promise\.resolve\(__next_app_import_\d+__\);/,
  );
  expect(code).toContain("const __next_app_require__ = (id) => {");
  expect(code).toContain(
    "const __next_app_import_fallback__ = (id, environmentName, importId = id) => {",
  );
  expect(code).toContain("__next_app_require_map__.set(id, mod)");
  expect(code).toContain("const __next_app_normalize_require_id__ = (id) => {");
  expect(code).toContain("const normalizedId = __next_app_normalize_require_id__(id);");
  expect(code).toContain(
    "const mod = __next_app_require_map__.get(id) ?? __next_app_require_map__.get(normalizedId);",
  );
  expect(code).toContain('id.startsWith("virtual:vitest-plugin-rsc/next-server-action-entry?")');
  expect(code).toContain('__next_app_import_fallback__(id, "client")');
  expect(code).toContain('id.startsWith("/@id/__x00__rsc:cjs-browser-esm:")');
  expect(code).toContain('id.startsWith("/@fs/") || id.startsWith("/@id/")');
  expect(code).toContain('__next_app_import_fallback__(id, "react_ssr")');
  expect(code).toContain('id.startsWith("/") && !id.startsWith("/@")');
  expect(code).toContain('__next_app_import_fallback__(id, "react_ssr",');
  expect(code).toContain("+ id");
  expect(code).toContain("Could not find Next app module");
  expect(code).not.toMatch(/^const \w+ = \(\) => import\(\/\* webpackMode: "eager" \*\//m);
  expect(code).not.toContain("next-app-loader?");
});

test("caches generated require fallback imports for async React Flight SSR references", () => {
  const code = rewriteNextAppLoaderFullOutput("const __next_app_require__ = __webpack_require__", {
    rootDir: "/project",
  });

  expect(code).toContain("const mod = globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__");
  expect(code).toContain("__next_app_require_map__.set(id, mod)");
  expect(code).toContain(
    '__next_app_import_fallback__(id, "react_ssr", "/project" + normalizedId)',
  );
});

test("does not strand entry-base import attributes on synthetic const re-exports", () => {
  const code = rewriteNextAppLoaderFullOutput(
    [
      'import * as entryBase from "next/dist/server/app-render/entry-base" with { "turbopack-transition": "next-ssr" };',
      'export * from "next/dist/server/app-render/entry-base" with { "turbopack-transition": "next-ssr" };',
      "const __next_app_require__ = __webpack_require__",
    ].join("\n"),
    { rootDir: fixtureRoot },
  );

  expect(code).toContain(
    'const __next_app_entry_base_server_module__ = await globalThis.__VITE_ENVIRONMENT_RUNNER_IMPORT__("react_ssr", "next/dist/server/app-render/entry-base.js")',
  );
  expect(code).toContain(
    'ClientPageRoot: __next_app_entry_base_client_reference__("next/dist/client/components/client-page.js", "ClientPageRoot", __next_app_entry_base_server__.ClientPageRoot)',
  );
  expect(code).toContain("export const ClientPageRoot = entryBase.ClientPageRoot");
  expect(code).toContain("export const workUnitAsyncStorage = entryBase.workUnitAsyncStorage;");
  expect(code).not.toContain('export * from "next/dist/server/app-render/entry-base"');
  expect(code).not.toMatch(/export const \w+ = entryBase\.\w+;\s*(?:with|assert)\s*\{/);
});

async function loadGeneratedAppPage() {
  const watchedFiles: string[] = [];
  const context: NextAppLoaderContext = {
    getOptions: () => createRootPageLoaderOptions(),
    _module: { buildInfo: {} },
    _compiler: { context: fixtureRoot },
    _compilation: undefined,
    context: fixtureRoot,
    rootContext: fixtureRoot,
    addMissingDependency(file) {
      watchedFiles.push(file);
    },
    getResolve() {
      return async (_context, request) => request;
    },
  };

  const code = await nextAppLoader.call(context);

  expect(watchedFiles).toEqual(expect.arrayContaining([path.join(fixtureRoot, "app/layout.tsx")]));
  return code;
}

function createRootPageLoaderOptions(): NextAppLoaderOptions {
  const appDir = path.join(fixtureRoot, "app");

  return {
    name: "app/page",
    page: "/page",
    pagePath: "private-next-app-dir/page.tsx",
    appDir,
    appPaths: ["/page"],
    allNormalizedAppPaths: ["/page"],
    preferredRegion: undefined,
    pageExtensions: ["tsx", "ts", "jsx", "js"],
    assetPrefix: "",
    rootDir: fixtureRoot,
    tsconfigPath: path.join(fixtureRoot, "tsconfig.json"),
    isDev: true,
    basePath: "",
    nextConfigOutput: undefined,
    middlewareConfig: encodeToBase64({ matchers: [] }),
    isGlobalNotFoundEnabled: undefined,
  };
}

function createApiRouteLoaderOptions(): NextAppRouteLoaderOptions {
  const appDir = path.join(fixtureRoot, "app");

  return {
    name: "app/api/next-request-response/route",
    page: "/api/next-request-response/route",
    pagePath: "private-next-app-dir/api/next-request-response/route.ts",
    appDir,
    routeFile: path.join(appDir, "api/next-request-response/route.ts"),
    preferredRegion: undefined,
    pageExtensions: ["tsx", "ts", "jsx", "js"],
    rootDir: fixtureRoot,
    tsconfigPath: path.join(fixtureRoot, "tsconfig.json"),
    isDev: true,
    nextConfigOutput: undefined,
    middlewareConfig: encodeToBase64({ matchers: [] }),
  };
}

function createRootPageEntry(): NextRouteManifestBuildEntry {
  const appDir = path.join(fixtureRoot, "app");

  return {
    route: "/",
    appDir,
    appPath: "/page",
    appPaths: ["/page"],
    allNormalizedAppPaths: ["/"],
    pageFile: path.join(appDir, "page.tsx"),
  };
}

function createApiRouteEntry(): NextRouteHandlerManifestBuildEntry {
  const appDir = path.join(fixtureRoot, "app");

  return {
    route: "/api/next-request-response",
    appPath: "/api/next-request-response/route",
    routeFile: path.join(appDir, "api/next-request-response/route.ts"),
  };
}
