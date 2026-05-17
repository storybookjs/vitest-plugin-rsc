import path from "node:path";
import type { Alias } from "vite";
import { expect, test } from "vitest";
import {
  createAppRouterApiAliasesFromNext,
  createNextDefineEnvs,
  createNextEdgeNativeAliases,
  createNextImageConfig,
  createNextVendoredReactAliases,
  createOptimizeDepsResolveAliases,
  createReactServerDomWebpackAliases,
  disableNextDevServerRuntime,
  provideBufferLikeNextWebpack,
  treatNextInternalsAsServerInRsc,
  useNextReactDomServerAlias,
  useNextServerOnlyAlias,
  useNextSharedAsyncStorageLayer,
} from "./webpack-config.ts";
import { fixtureRoot, getHookHandler } from "../../plugin/test-utils.ts";

test("creates app-router API aliases from Next's compiler aliases", () => {
  expect(createAppRouterApiAliasesFromNext(fixtureRoot, true)).toEqual(
    expect.objectContaining({
      "next/form": "next/dist/client/app-dir/form",
      "next/link": "next/dist/client/app-dir/link.react-server",
      "next/link.js": "next/dist/client/app-dir/link.react-server",
      "next/navigation": "next/dist/client/components/navigation.react-server",
      "next/navigation.js": "next/dist/client/components/navigation.react-server",
      "next/script": "next/dist/client/script",
    }),
  );

  expect(createAppRouterApiAliasesFromNext(fixtureRoot, false)).toEqual(
    expect.objectContaining({
      "next/form": "next/dist/client/app-dir/form",
      "next/link": "next/dist/client/app-dir/link",
      "next/navigation": "next/dist/client/components/navigation",
      "next/script": "next/dist/client/script",
    }),
  );
});

test("aliases React packages through Next's vendored React layers", () => {
  const rscAliases = createNextVendoredReactAliases({
    root: fixtureRoot,
    layer: "rsc",
    isBrowser: false,
    isEdgeServer: true,
  });
  const browserAliases = createNextVendoredReactAliases({
    root: fixtureRoot,
    layer: "app-pages-browser",
    isBrowser: true,
    isEdgeServer: false,
  });

  expect(findAlias(rscAliases, "react")).toContain("next/dist/compiled/react/react.react-server");
  expect(findAlias(rscAliases, "react-dom/server")).toContain(
    "next/dist/build/webpack/alias/react-dom-server",
  );
  expect(findAlias(browserAliases, "react")).toContain("next/dist/compiled/react/index.js");
  expect(findAlias(browserAliases, "react-dom/server")).toContain(
    "next/dist/compiled/react-dom/server.browser",
  );
});

test("creates Next edge native aliases with resolved local shims", () => {
  const aliases = createNextEdgeNativeAliases(fixtureRoot);

  expect(findAlias(aliases, "async_hooks")).toContain("vitest-plugin-rsc");
  expect(findAlias(aliases, "path")).toContain("next/dist/compiled/path-browserify");
  expect(findAlias(aliases, "node:path")).toContain("next/dist/compiled/path-browserify");
  expect(findAlias(aliases, "os")).toContain("os-browser.js");
  expect(findAlias(aliases, "util")).toContain("next/dist/compiled/util");
  expect(findAlias(aliases, "node:util")).toContain("util-edge.js");
  expect(findAlias(aliases, "buffer")).toContain("next/dist/compiled/buffer");
  expect(findAlias(aliases, "@opentelemetry/api")).toContain(
    "next/dist/compiled/@opentelemetry/api",
  );
});

test("creates react-server-dom-webpack aliases from installed Next entries", () => {
  const aliases = createReactServerDomWebpackAliases(fixtureRoot);

  expect(aliases).toEqual(
    expect.objectContaining({
      browser: expect.stringContaining(
        "next/dist/compiled/react-server-dom-webpack/client.browser",
      ),
      edge: expect.stringContaining("next/dist/compiled/react-server-dom-webpack/client.edge"),
      serverEdge: expect.stringContaining(
        "next/dist/compiled/react-server-dom-webpack/server.edge",
      ),
      staticEdge: expect.stringContaining(
        "next/dist/compiled/react-server-dom-webpack/static.edge",
      ),
    }),
  );
  expect(aliases.ssr).toContain("react-server-dom-webpack-ssr.ts");
});

test("aliases server-only to Next's empty marker in Edge-like environments", async () => {
  const plugin = useNextServerOnlyAlias(fixtureRoot);
  const resolveId = getHookHandler(plugin.resolveId);

  expect(plugin.applyToEnvironment?.({ name: "client" } as never)).toBe(true);
  expect(plugin.applyToEnvironment?.({ name: "react_ssr" } as never)).toBe(true);
  expect(plugin.applyToEnvironment?.({ name: "react_client" } as never)).toBe(false);
  expect(resolveId.call({} as never, "server-only", undefined, {} as never)).toContain(
    "next/dist/compiled/server-only/empty",
  );
  expect(await resolveId.call({} as never, "client-only", undefined, {} as never)).toBeUndefined();
});

test("creates optimizeDeps resolve aliases from edge, app-router, and React aliases", () => {
  const aliases = createOptimizeDepsResolveAliases(
    [{ find: "buffer", replacement: "/next/buffer" }],
    { "next/navigation": "next/dist/client/components/navigation.react-server" },
    [{ find: "react", replacement: "/next/react" }],
  );

  expect(aliases).toEqual({
    buffer: "/next/buffer",
    "next/navigation": "next/dist/client/components/navigation.react-server",
    react: "/next/react",
  });
});

test("loads Next define envs and runtime config defines from next.config", async () => {
  const imageConfig = await createNextImageConfig(fixtureRoot, "test");
  const defineEnvs = await createNextDefineEnvs(fixtureRoot, "test", imageConfig);

  expect(defineEnvs.edge["process.env.NEXT_RUNTIME"]).toBe('"edge"');
  expect(defineEnvs.edge["process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS"]).toBe("true");
  expect(defineEnvs.edge["process.env.__NEXT_HAS_REWRITES"]).toBe("true");
  expect(defineEnvs.edge["process.env.__NEXT_BUNDLER"]).toBe('"Webpack"');
  expect(defineEnvs.edge["process.env.__NEXT_DEV_SERVER"]).toBe('""');
  expect(JSON.parse(defineEnvs.edge["process.env.__NEXT_CACHE_HANDLERS"]!)).toEqual({
    "notes-custom": expect.stringContaining("cache-handler.mjs"),
  });
  expect(defineEnvs.edge["process.env.__NEXT_PROJECT_ROOT"]).toBe(JSON.stringify(fixtureRoot));

  expect(defineEnvs.browser["process.env.NEXT_RUNTIME"]).toBe('""');
  expect(defineEnvs.browser["process.browser"]).toBe("true");
});

test("resolves react-dom/server through Next's app-render SSR alias", async () => {
  const plugin = useNextReactDomServerAlias(fixtureRoot);
  const resolveId = getHookHandler(plugin.resolveId);

  expect(plugin.applyToEnvironment?.({ name: "client" } as never)).toBe(true);
  expect(plugin.applyToEnvironment?.({ name: "react_ssr" } as never)).toBe(true);
  expect(
    resolveId.call(
      {} as never,
      "react-dom/server",
      path.join(fixtureRoot, "node_modules/next/dist/server/app-render/app-render.js"),
      {} as never,
    ),
  ).toContain("next/dist/build/webpack/alias/react-dom-server");
});

test("resolves AppPageRouteModule React through Next's SSR layer aliases", async () => {
  const plugin = useNextReactDomServerAlias(fixtureRoot);
  const resolveId = getHookHandler(plugin.resolveId);

  const appPageRouteModule = path.join(
    fixtureRoot,
    "node_modules/next/dist/server/route-modules/app-page/module.js",
  );

  expect(plugin.applyToEnvironment?.({ name: "client" } as never)).toBe(true);
  expect(plugin.applyToEnvironment?.({ name: "react_ssr" } as never)).toBe(true);
  expect(resolveId.call({} as never, "react", appPageRouteModule, {} as never)).toContain(
    "next/dist/compiled/react/index.js",
  );
  expect(
    resolveId.call({} as never, "next/dist/compiled/react", appPageRouteModule, {} as never),
  ).toContain("next/dist/compiled/react/index.js");
});

test("shares Next async-storage modules from react_ssr with the RSC graph", async () => {
  const plugin = useNextSharedAsyncStorageLayer();
  const transform = getHookHandler(plugin.transform);
  const code = `
    const _asynclocalstorage = require("./async-local-storage");
    const workAsyncStorageInstance = (0, _asynclocalstorage.createAsyncLocalStorage)();
  `;

  expect(plugin.applyToEnvironment?.({ name: "react_ssr" } as never)).toBe(true);
  expect(plugin.applyToEnvironment?.({ name: "client" } as never)).toBe(true);
  expect(plugin.applyToEnvironment?.({ name: "react_client" } as never)).toBe(false);

  const result = (await transform.call(
    { environment: { name: "client" } } as never,
    code,
    path.join(
      fixtureRoot,
      "node_modules/next/dist/server/app-render/work-async-storage-instance.js",
    ),
  )) as { code: string };

  expect(result.code).toContain(
    'Symbol.for("vitest-plugin-rsc.next.shared-async-storage.workAsyncStorageInstance")',
  );
  expect(result.code).toContain("const workAsyncStorageInstance = (globalThis[Symbol.for");
  expect(
    await transform.call(
      {} as never,
      code,
      path.join(fixtureRoot, "node_modules/next/dist/server/request/search-params.js"),
    ),
  ).toBeUndefined();
});

test("shares ESM Next async-storage instance modules too", async () => {
  const plugin = useNextSharedAsyncStorageLayer();
  const transform = getHookHandler(plugin.transform);
  const result = (await transform.call(
    {} as never,
    `import { createAsyncLocalStorage } from './async-local-storage';
export const workUnitAsyncStorageInstance = createAsyncLocalStorage();`,
    path.join(
      fixtureRoot,
      "node_modules/next/dist/esm/server/app-render/work-unit-async-storage-instance.js",
    ),
  )) as { code: string };

  expect(result.code).toContain(
    'Symbol.for("vitest-plugin-rsc.next.shared-async-storage.workUnitAsyncStorageInstance")',
  );
  expect(result.code).toContain(
    "export const workUnitAsyncStorageInstance = (globalThis[Symbol.for",
  );
});

test("rewrites Next server-runtime checks only for Next internals in the RSC environment", async () => {
  const plugin = treatNextInternalsAsServerInRsc();
  const transform = getHookHandler(plugin.transform);
  const code = `
    export const runtime = process.env.NEXT_RUNTIME;
    export const hasWindow = typeof window !== "undefined";
    export const indexedWindow = typeof window.document;
  `;

  expect(plugin.applyToEnvironment?.({ name: "client" } as never)).toBe(true);
  expect(plugin.applyToEnvironment?.({ name: "react_client" } as never)).toBe(false);

  const result = (await transform.call(
    {} as never,
    code,
    path.join(fixtureRoot, "node_modules/next/dist/server/app-render/work-async-storage.js"),
  )) as { code: string };

  expect(result.code).toContain('export const runtime = "edge";');
  expect(result.code).toContain('export const hasWindow = "undefined" !== "undefined";');
  expect(result.code).toContain("export const indexedWindow = typeof window.document;");
  expect(
    await transform.call(
      { environment: { name: "client" } } as never,
      code,
      path.join(fixtureRoot, "node_modules/react/index.js"),
    ),
  ).toBeUndefined();
});

test("rewrites Next runtime checks for generated Edge App Page modules in react_ssr", async () => {
  const plugin = treatNextInternalsAsServerInRsc();
  const transform = getHookHandler(plugin.transform);
  const code = `
    if (process.env.NEXT_RUNTIME === "edge") {
      module.exports = require("next/dist/server/route-modules/app-page/module.js");
    }
  `;

  expect(plugin.applyToEnvironment?.({ name: "react_ssr" } as never)).toBe(true);

  const result = (await transform.call(
    { environment: { name: "react_ssr" } } as never,
    code,
    path.join(
      fixtureRoot,
      "node_modules/next/dist/server/route-modules/app-page/module.compiled.js",
    ),
  )) as { code: string };

  expect(result.code).toContain('if ("edge" === "edge")');
});

test("routes Next Edge render Web Crypto calls through the global Web Crypto object", async () => {
  const plugin = treatNextInternalsAsServerInRsc();
  const transform = getHookHandler(plugin.transform);
  const code = `
    export const requestId = await crypto.subtle.digest("SHA-1", input);
    export const uuid = crypto.randomUUID();
    export const existing = await globalThis.crypto.subtle.digest("SHA-1", input);
    export const nodeUuid = nodeCrypto.randomUUID();
  `;

  const result = (await transform.call(
    { environment: { name: "react_ssr" } } as never,
    code,
    path.join(fixtureRoot, "node_modules/next/dist/server/app-render/app-render.js"),
  )) as { code: string };

  expect(result.code).toContain('const crypto = globalThis["crypto"];');
  expect(result.code).toContain(
    'export const requestId = await crypto.subtle.digest("SHA-1", input);',
  );
  expect(result.code).toContain("export const uuid = crypto.randomUUID();");
  expect(result.code).toContain(
    'export const existing = await globalThis.crypto.subtle.digest("SHA-1", input);',
  );
  expect(result.code).toContain("export const nodeUuid = nodeCrypto.randomUUID();");
});

test("does not rewrite Next client internals in react_ssr", async () => {
  const plugin = treatNextInternalsAsServerInRsc();
  const transform = getHookHandler(plugin.transform);
  const code = `
    export const runtime = process.env.NEXT_RUNTIME;
    export const hasWindow = typeof window !== "undefined";
  `;

  expect(
    await transform.call(
      { environment: { name: "react_ssr" } } as never,
      code,
      path.join(fixtureRoot, "node_modules/next/dist/client/components/app-router.js"),
    ),
  ).toBeUndefined();
});

test("preserves NextRequest duplex setup for streamed browser request bodies", async () => {
  const plugin = treatNextInternalsAsServerInRsc();
  const transform = getHookHandler(plugin.transform);
  const code = `
    if (process.env.NEXT_RUNTIME !== 'edge') {
      if (init.body && init.duplex !== 'half') {
        init.duplex = 'half';
      }
    }
  `;

  const result = (await transform.call(
    { environment: { name: "client" } } as never,
    code,
    path.join(fixtureRoot, "node_modules/next/dist/server/web/spec-extension/request.js"),
  )) as { code: string };

  expect(result.code).toContain("if (init.body && init.duplex !== 'half')");
  expect(result.code).toContain("init.duplex = 'half';");
  expect(result.code).not.toContain("\"edge\" !== 'edge'");
});

test("disables Next dev-server runtime checks only inside Next internals", async () => {
  const plugin = disableNextDevServerRuntime();
  const transform = getHookHandler(plugin.transform);
  const code = `
    export const isNextDevServer = process.env.__NEXT_DEV_SERVER;
  `;

  const result = (await transform.call(
    {} as never,
    code,
    path.join(fixtureRoot, "node_modules/next/dist/client/components/app-router.js"),
  )) as { code: string };

  expect(result.code).toContain("export const isNextDevServer = false;");
  expect(
    await transform.call({} as never, code, path.join(fixtureRoot, "node_modules/react/index.js")),
  ).toBeUndefined();
});

test("provides Buffer only to Next internals that reference Buffer", async () => {
  const plugin = provideBufferLikeNextWebpack();
  const transform = getHookHandler(plugin.transform);
  const code = `export const value = Buffer.from("next");`;

  const result = (await transform.call(
    {} as never,
    code,
    path.join(fixtureRoot, "node_modules/next/dist/server/web/spec-extension/blob.js"),
  )) as { code: string };

  expect(result.code).toMatch(/^import \{ Buffer \} from "node:buffer";/);
  expect(
    await transform.call({} as never, code, path.join(fixtureRoot, "node_modules/react/index.js")),
  ).toBeUndefined();
});

test("provides Buffer with CommonJS syntax for Next compiled CJS internals", async () => {
  const plugin = provideBufferLikeNextWebpack();
  const transform = getHookHandler(plugin.transform);
  const code = `module.exports = Buffer.from("next");`;

  const result = (await transform.call(
    {} as never,
    code,
    path.join(fixtureRoot, "node_modules/next/dist/compiled/nanoid/index.cjs"),
  )) as { code: string };

  expect(result.code).toMatch(/^const \{ Buffer \} = require\("node:buffer"\);/);
});

function findAlias(aliases: Alias[], find: string) {
  const match = aliases.find((alias): alias is Alias & { find: string } => alias.find === find);
  if (!match) throw new Error(`Expected alias for ${find}.`);
  return match.replacement;
}
