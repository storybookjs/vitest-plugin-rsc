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
} from "./webpack-config.ts";
import { fixtureRoot, getHookHandler } from "../../plugin/test-utils.ts";

test("creates app-router API aliases from Next's compiler aliases", () => {
  expect(createAppRouterApiAliasesFromNext(fixtureRoot, true)).toEqual(
    expect.objectContaining({
      "next/link": "next/dist/client/app-dir/link.react-server",
      "next/link.js": "next/dist/client/app-dir/link.react-server",
      "next/navigation": "next/dist/client/components/navigation.react-server",
      "next/navigation.js": "next/dist/client/components/navigation.react-server",
    }),
  );

  expect(createAppRouterApiAliasesFromNext(fixtureRoot, false)).toEqual(
    expect.objectContaining({
      "next/link": "next/dist/client/app-dir/link",
      "next/navigation": "next/dist/client/components/navigation",
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
  expect(findAlias(aliases, "os")).toContain("os-browser.js");
  expect(findAlias(aliases, "buffer")).toContain("next/dist/compiled/buffer");
  expect(findAlias(aliases, "@opentelemetry/api")).toBe("next/dist/compiled/@opentelemetry/api");
});

test("creates react-server-dom-webpack aliases for Vite RSC vendor modules", () => {
  expect(createReactServerDomWebpackAliases(fixtureRoot)).toEqual(
    expect.objectContaining({
      browser: expect.stringContaining("@vitejs/plugin-rsc"),
      edge: expect.stringContaining("@vitejs/plugin-rsc"),
      serverEdge: expect.stringContaining("@vitejs/plugin-rsc"),
    }),
  );
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
  expect(
    resolveId.call(
      {} as never,
      "react-dom/server",
      path.join(fixtureRoot, "node_modules/next/dist/server/app-render/app-render.js"),
      {} as never,
    ),
  ).toContain("next/dist/build/webpack/alias/react-dom-server");
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
    await transform.call({} as never, code, path.join(fixtureRoot, "node_modules/react/index.js")),
  ).toBeUndefined();
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

function findAlias(aliases: Alias[], find: string) {
  const match = aliases.find((alias): alias is Alias & { find: string } => alias.find === find);
  if (!match) throw new Error(`Expected alias for ${find}.`);
  return match.replacement;
}
