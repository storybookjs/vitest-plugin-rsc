import { expect, test } from "vitest";
import {
  createNextAppRouteVirtualSource,
  createNextEdgeAppRouteVirtualSource,
  type NextAppRouteLoaderOptions,
} from "../../../entries.ts";
import {
  virtualNextAppRoutePublicId,
  virtualNextEdgeAppRoutePublicId,
} from "../../../../../virtual-ids.ts";
import {
  createNextEdgeAppRouteEntrypointSource,
  createNextEdgeAppRouteUserlandSource,
} from "./index.ts";
import { nextEdgeSsrEntryResourceQuery } from "../next-edge-ssr-loader/index.ts";

test("constructs Edge App Route VAR_USERLAND from the app-route virtual source", () => {
  const options = createLoaderOptions();
  const appRouteVirtualSource = createNextAppRouteVirtualSource(options);
  const userland = createNextEdgeAppRouteUserlandSource({
    appRouteVirtualSource,
    pagePath: options.pagePath,
  });
  const edgeSource = createNextEdgeAppRouteVirtualSource(options);
  const edgeParams = new URLSearchParams(
    edgeSource.slice(`${virtualNextEdgeAppRoutePublicId}?`.length),
  );

  expect(appRouteVirtualSource).toContain("pagePath=private-next-app-dir%2Fapi%2Fnotes%2Froute.ts");
  expect(userland).toBe(
    `${appRouteVirtualSource}!${options.pagePath}?${nextEdgeSsrEntryResourceQuery}`,
  );
  expect(edgeParams.get("VAR_USERLAND")).toBe(userland);
  expect(edgeParams.get("VAR_PAGE")).toBe(options.page);
  expect(userland).toContain(virtualNextAppRoutePublicId);
  expect(userland).not.toContain("next-app-loader?");
});

test("generates Next's edge App Route entrypoint source", async () => {
  const options = createLoaderOptions();
  const appRouteUserlandSource = createNextEdgeAppRouteUserlandSource({
    appRouteVirtualSource: createNextAppRouteVirtualSource(options),
    pagePath: options.pagePath,
  });
  const code = await createNextEdgeAppRouteEntrypointSource({
    userland: appRouteUserlandSource,
    page: options.page,
  });

  expect(code).toContain(`const module = await import(${JSON.stringify(appRouteUserlandSource)});`);
  expect(code).toContain(`import "vitest-plugin-rsc/nextjs/edge-web-crypto/install";`);
  expect(appRouteUserlandSource).toContain(virtualNextAppRoutePublicId);
  expect(code).toContain("export const ComponentMod = module");
  expect(code).toContain("EdgeRouteModuleWrapper.wrap(");
  expect(code).toContain("module.routeModule");
  expect(code).toContain("export async function handler(");
  expect(code).toContain("return result.response");
  expect(code).toContain("export default internalHandler");
  expect(code).toContain("self.__RSC_MANIFEST");
  expect(code).toMatch(/setManifestsSingleton\(\{\s*page: ['"]\/api\/notes\/route['"]/);

  expectEdgeAppRouteEntrypointSourceToAvoidLowerRuntime(code);
});

test("injects Edge App Route cache handlers into generated source", async () => {
  const options = createLoaderOptions();
  const appRouteUserlandSource = createNextEdgeAppRouteUserlandSource({
    appRouteVirtualSource: createNextAppRouteVirtualSource(options),
    pagePath: options.pagePath,
  });
  const cacheHandlerImports = `import edgeCacheHandler_0 from "virtual:vitest-plugin-rsc/cache-handler"`;
  const edgeCacheHandlersRegistration = `edgeCacheHandlers["default"] = edgeCacheHandler_0`;
  const incrementalCacheHandler = "virtual:vitest-plugin-rsc/incremental-cache-handler";
  const code = await createNextEdgeAppRouteEntrypointSource({
    userland: appRouteUserlandSource,
    page: options.page,
    cacheHandlerImports,
    edgeCacheHandlersRegistration,
    incrementalCacheHandler,
  });

  expect(code).toContain(cacheHandlerImports);
  expect(code).toContain(
    `import incrementalCacheHandler from ${JSON.stringify(incrementalCacheHandler)}`,
  );
  expect(code).toContain("const edgeCacheHandlers = {}");
  expect(code).toContain(edgeCacheHandlersRegistration);
  expect(code).toContain("cacheHandlers: edgeCacheHandlers");
  expect(code).toMatch(/setManifestsSingleton\(\{\s*page: ['"]\/api\/notes\/route['"]/);
  expect(code).toContain("serverActionsManifest: rscServerManifest");
  expect(code).toMatch(/incrementalCacheHandler\s*\}\)/);

  expectEdgeAppRouteEntrypointSourceToAvoidLowerRuntime(code);
});

function createLoaderOptions(): NextAppRouteLoaderOptions {
  return {
    name: "app/api/notes/route",
    page: "/api/notes/route",
    pagePath: "private-next-app-dir/api/notes/route.ts",
    appDir: "/fixture/app",
    routeFile: "/fixture/app/api/notes/route.ts",
    preferredRegion: "auto",
    pageExtensions: ["tsx", "ts"],
    rootDir: "/fixture",
    tsconfigPath: "/fixture/tsconfig.json",
    isDev: true,
    nextConfigOutput: undefined,
    middlewareConfig: "e30=",
  };
}

function expectEdgeAppRouteEntrypointSourceToAvoidLowerRuntime(code: string) {
  expect(code).not.toContain(".GET(");
  expect(code).not.toContain(".POST(");
  expect(code).not.toContain("renderToHTMLOrFlight");
  expect(code).not.toContain("node-environment-baseline");
  expect(code).not.toContain("ModuleRunner");
}
