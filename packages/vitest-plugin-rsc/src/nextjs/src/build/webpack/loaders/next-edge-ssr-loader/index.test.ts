import { expect, test } from "vitest";
import {
  createNextAppPageVirtualSource,
  createNextEdgeSsrAppVirtualSource,
  type NextAppLoaderOptions,
} from "../../../entries.ts";
import {
  virtualNextAppPagePublicId,
  virtualNextEdgeSsrAppPublicId,
  virtualNextRouteTreePublicId,
} from "../../../../../virtual-ids.ts";
import {
  createNextEdgeAppPageEntrypointSource,
  createNextEdgeAppPageUserlandSource,
  nextEdgeSsrEntryResourceQuery,
} from "./index.ts";

test("constructs Edge App Page VAR_USERLAND from the full app-page virtual source", () => {
  const options = createLoaderOptions();
  const appPageVirtualSource = createNextAppPageVirtualSource(options);
  const userland = createNextEdgeAppPageUserlandSource({
    appPageVirtualSource,
    pagePath: options.pagePath,
  });
  const edgeSource = createNextEdgeSsrAppVirtualSource(options);
  const edgeParams = new URLSearchParams(
    edgeSource.slice(`${virtualNextEdgeSsrAppPublicId}?`.length),
  );

  expect(appPageVirtualSource).toContain("pagePath=private-next-app-dir%2Fnotes%2Fpage");
  expect(userland).toBe(
    `${appPageVirtualSource}!${options.pagePath}?${nextEdgeSsrEntryResourceQuery}`,
  );
  expect(edgeParams.get("VAR_USERLAND")).toBe(userland);
  expect(userland).toContain(virtualNextAppPagePublicId);
  expect(userland).not.toContain(virtualNextRouteTreePublicId);
  expect(userland).not.toContain("next-app-loader?");
});

test("generates Next's edge App Page entrypoint source", async () => {
  const options = createLoaderOptions();
  const appPageUserlandSource = createNextEdgeAppPageUserlandSource({
    appPageVirtualSource: createNextAppPageVirtualSource(options),
    pagePath: options.pagePath,
  });
  const code = await createNextEdgeAppPageEntrypointSource({
    userland: appPageUserlandSource,
    page: options.page,
  });

  expect(code).toContain(`const pageMod = await import(${JSON.stringify(appPageUserlandSource)});`);
  expect(code).toContain(`import "vitest-plugin-rsc/nextjs/edge-web-crypto/install";`);
  expect(appPageUserlandSource).toContain(virtualNextAppPagePublicId);
  expect(code).toContain("export const ComponentMod = pageMod");
  expect(code).toContain("const pageRouteModule = pageMod.routeModule");
  expect(code).toContain("await pageRouteModule.prepare(baseReq, null, {");
  expect(code).toMatch(/pageRouteModule\s*\.\s*render\(baseReq,\s*baseRes,\s*renderContext\)/);

  expect(code).toMatch(
    /const rscManifest = [\s\S]*self\.__RSC_MANIFEST[\s\S]*["']\/notes\/page["']/,
  );
  expect(code).toContain("const rscServerManifest = maybeJSONParse(self.__RSC_SERVER_MANIFEST)");
  expect(code).toContain("if (rscManifest && rscServerManifest) {");
  expect(code).toContain("self.__RSC_MANIFEST");
  expect(code).toMatch(/\[["']\/notes\/page["']\]/);
  expect(code).toContain("self.__RSC_SERVER_MANIFEST");
  expect(code).toMatch(/setManifestsSingleton\(\{\s*page: ['"]\/notes\/page['"]/);
  expect(code).toContain("clientReferenceManifest: rscManifest");
  expect(code).toContain("serverActionsManifest: rscServerManifest");

  expect(code).toContain("const internalHandler");
  expect(code).toContain("return adapter({");
  expect(code).toContain("handler: requestHandler");
  expect(code).toContain("export async function handler(");
  expect(code).toContain("export default internalHandler");

  expectEdgeAppPageEntrypointSourceToAvoidLegacyRuntime(code);
});

test("injects Edge App Page cache handlers into generated source", async () => {
  const options = createLoaderOptions();
  const appPageUserlandSource = createNextEdgeAppPageUserlandSource({
    appPageVirtualSource: createNextAppPageVirtualSource(options),
    pagePath: options.pagePath,
  });
  const cacheHandlerImports = `import edgeCacheHandler_0 from "virtual:vitest-plugin-rsc/cache-handler"`;
  const cacheHandlerRegistration = `  cacheHandlers.setCacheHandler("default", edgeCacheHandler_0)`;
  const incrementalCacheHandler = "virtual:vitest-plugin-rsc/incremental-cache-handler";
  const code = await createNextEdgeAppPageEntrypointSource({
    userland: appPageUserlandSource,
    page: options.page,
    cacheHandlerImports,
    cacheHandlerRegistration,
    incrementalCacheHandler,
  });

  expect(code).toContain(cacheHandlerImports);
  expect(code).toContain(
    `import incrementalCacheHandler from ${JSON.stringify(incrementalCacheHandler)}`,
  );
  expect(code).toContain(`import * as cacheHandlers from "next/dist/server/use-cache/handlers";`);
  expect(code).toContain("cacheHandlers.initializeCacheHandlers(nextConfig.cacheMaxMemorySize)");
  expect(code).toContain(cacheHandlerRegistration);
  expect(code).toMatch(/setManifestsSingleton\(\{\s*page: ['"]\/notes\/page['"]/);
  expect(code).toContain("serverActionsManifest: rscServerManifest");
  expect(code).toMatch(/incrementalCacheHandler,?\s*page: ['"]\/notes\/page['"]/);

  expectEdgeAppPageEntrypointSourceToAvoidLegacyRuntime(code);
});

function createLoaderOptions(): NextAppLoaderOptions {
  return {
    name: "app/notes/page",
    page: "/notes/page",
    pagePath: "private-next-app-dir/notes/page",
    appDir: "/fixture/app",
    appPaths: ["/notes/page"],
    allNormalizedAppPaths: ["/notes"],
    preferredRegion: "auto",
    pageExtensions: ["tsx"],
    assetPrefix: "",
    rootDir: "/fixture",
    tsconfigPath: "/fixture/tsconfig.json",
    isDev: true,
    basePath: "",
    nextConfigOutput: undefined,
    middlewareConfig: "e30=",
    isGlobalNotFoundEnabled: undefined,
  };
}

function expectEdgeAppPageEntrypointSourceToAvoidLegacyRuntime(code: string) {
  expect(code).not.toContain("renderToHTMLOrFlight");
  expect(code).not.toContain("createAppPageRouteModule");
  expect(code).not.toContain("node-environment-baseline");
  expect(code).not.toContain("setNextRenderManifests");
  expect(code).not.toContain("probe");
  expect(code).not.toContain("server.middlewares");
  expect(code).not.toContain(".middlewares.use");
  expect(code).not.toContain("middlewareMode");
  expect(code).not.toContain("ModuleRunner");
}
