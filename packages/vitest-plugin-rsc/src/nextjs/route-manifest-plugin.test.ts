import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { loadNextProjectConfig } from "./config.ts";
import { useNextRouteManifest } from "./route-manifest-plugin.ts";
import { useNextMetadataRouteLoader } from "./src/build/webpack/loaders/next-metadata-route-loader.ts";
import {
  createNextEdgeSsrAppVirtualSource,
  parseNextAppLoaderOptions,
} from "./src/build/entries.ts";
import { loadNextRouteStaticInfo } from "./src/build/analysis/get-page-static-info.ts";
import {
  virtualNextAppPageIdPrefix,
  virtualNextAppPagePublicId,
  virtualNextAppRouteIdPrefix,
  virtualNextAppRoutePublicId,
  virtualNextEdgeAppRouteIdPrefix,
  virtualNextEdgeAppRoutePublicId,
  virtualNextEdgeSsrAppIdPrefix,
  virtualNextEdgeSsrAppPublicId,
  virtualNextEntrypointsPublicId,
  virtualNextRouteManifestPublicId,
  virtualNextRouteTreeIdPrefix,
  virtualNextRouteTreePublicId,
  virtualNextServerActionEntryIdPrefix,
  virtualNextServerActionEntryPublicId,
} from "./virtual-ids.ts";

const fixtureRoot = fileURLToPath(
  new URL("../../../../playground/nextjs-notes-demo/", import.meta.url),
);

test("collects route segment config through Next static info", async () => {
  const previousCwd = process.cwd();

  process.chdir(fixtureRoot);
  try {
    const projectConfig = await loadNextProjectConfig(fixtureRoot, "test");
    const appPath = "/route-patterns/conventions/generated/page";

    const staticInfo = await loadNextRouteStaticInfo(fixtureRoot, projectConfig, {
      route: "/route-patterns/conventions/generated",
      appDir: projectConfig.appDir ?? path.join(fixtureRoot, "app"),
      appPath,
      appPaths: [appPath],
      allNormalizedAppPaths: [appPath],
      pageFile: path.join(fixtureRoot, "app/route-patterns/conventions/generated/page.tsx"),
    });

    expect(staticInfo.runtime).toBe("edge");
    expect(staticInfo.maxDuration).toBe(5);
    expect(staticInfo.preferredRegion).toBe("auto");
  } finally {
    process.chdir(previousCwd);
  }
});

test("extracts a Vite loader tree module from the real Next app loader output", async () => {
  const plugin = useNextRouteManifest();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const pageFile = path.join(fixtureRoot, "app/route-patterns/defaulted/page.tsx");

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  const entrypointsResolved = (await resolveId.call(
    {} as never,
    virtualNextEntrypointsPublicId,
    undefined,
    {} as never,
  )) as string;
  const entrypointsCode = (await load.call(
    {
      addWatchFile() {},
    } as never,
    entrypointsResolved,
    {} as never,
  )) as string;
  const routeTreeSource = extractNextRouteTreeSource(
    entrypointsCode,
    "/route-patterns/defaulted/page",
  );

  const resolved = (await resolveId.call(
    {} as never,
    routeTreeSource,
    undefined,
    {} as never,
  )) as string;
  const watchedFiles: string[] = [];
  const code = (await load.call(
    {
      addWatchFile: (file: string) => watchedFiles.push(file),
    } as never,
    resolved,
    {} as never,
  )) as string;

  expect(watchedFiles).toContain(pageFile);
  expect(code).toContain("export const tree =");
  expect(code).toContain("() => import(");
  expect(code).toContain("/@fs/");
  expect(code).toContain("route-patterns/defaulted/page.tsx");
  expect(code).not.toContain("export const routeModule");
  expect(code).not.toContain("export const __next_app__");
  expect(code).not.toContain('export * from "next/dist/server/app-render/entry-base"');
  expect(code).not.toContain("const __next_app_require__");
  expect(code).not.toContain("const __next_app_load_chunk__");
  expect(code).not.toContain("renderToHTMLOrFlight");
}, 15_000);

test("serves full App Page userland from the isolated virtual module", async () => {
  const plugin = useNextRouteManifest();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const pageFile = path.join(fixtureRoot, "app/route-patterns/defaulted/page.tsx");

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  const entrypointsResolved = (await resolveId.call(
    {} as never,
    virtualNextEntrypointsPublicId,
    undefined,
    {} as never,
  )) as string;
  const entrypointsCode = (await load.call(
    {
      addWatchFile() {},
    } as never,
    entrypointsResolved,
    {} as never,
  )) as string;
  const routeTreeSource = extractNextRouteTreeSource(
    entrypointsCode,
    "/route-patterns/defaulted/page",
  );
  const appPageSource = routeTreeSource.replace(
    virtualNextRouteTreePublicId,
    virtualNextAppPagePublicId,
  );

  const resolved = (await resolveId.call(
    {} as never,
    appPageSource,
    undefined,
    {} as never,
  )) as string;
  const watchedFiles: string[] = [];
  const code = (await load.call(
    {
      addWatchFile: (file: string) => watchedFiles.push(file),
    } as never,
    resolved,
    {} as never,
  )) as string;

  expect(watchedFiles).toContain(pageFile);
  expect(code).toContain("const tree =");
  expect(code).toMatch(/export\s+const\s+__next_app__\s*=\s*\{/);
  expect(code).toContain("export const ClientPageRoot = entryBase.ClientPageRoot");
  expect(code).not.toContain('from "next/dist/server/app-render/entry-base"');
  expect(code).toMatch(/export\s+const\s+routeModule\s*=\s*new AppPageRouteModule\(\{/);
  expect(code).toContain("loaderTree: tree");
  expect(code).toContain("const __next_app_require_map__ = new Map([");
  expect(code).not.toContain("createAppPageRouteModule");
  expect(code).not.toContain("renderToHTMLOrFlight");
}, 15_000);

test("serves isolated Edge SSR App entrypoint through loadable full app-page userland", async () => {
  const plugin = useNextRouteManifest();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const pageFile = path.join(fixtureRoot, "app/edge-app-page-delegation/page.tsx");

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  const entrypointsResolved = (await resolveId.call(
    {} as never,
    virtualNextEntrypointsPublicId,
    undefined,
    {} as never,
  )) as string;
  const entrypointsCode = (await load.call(
    {
      addWatchFile() {},
    } as never,
    entrypointsResolved,
    {} as never,
  )) as string;
  const routeTreeSource = extractNextRouteTreeSource(
    entrypointsCode,
    "/edge-app-page-delegation/page",
  );
  const loaderOptions = parseNextAppLoaderOptions(
    new URLSearchParams(routeTreeSource.slice(routeTreeSource.indexOf("?") + 1)),
  );
  const edgeSource = createNextEdgeSsrAppVirtualSource(loaderOptions);
  const edgeParams = new URLSearchParams(
    edgeSource.slice(`${virtualNextEdgeSsrAppPublicId}?`.length),
  );
  const appPageUserlandSource = edgeParams.get("VAR_USERLAND");
  if (!appPageUserlandSource) {
    throw new Error("Expected Edge SSR App virtual source to include VAR_USERLAND.");
  }

  expect(appPageUserlandSource.startsWith(`${virtualNextAppPagePublicId}?`)).toBe(true);
  expect(appPageUserlandSource.endsWith(`!${loaderOptions.pagePath}?__next_edge_ssr_entry__`)).toBe(
    true,
  );
  expect(appPageUserlandSource).toContain("__next_edge_ssr_entry__");
  expect(appPageUserlandSource).not.toContain(virtualNextRouteTreePublicId);

  const appPageUserlandResolved = (await resolveId.call(
    {} as never,
    appPageUserlandSource,
    undefined,
    {} as never,
  )) as string;
  const appPageWatchedFiles: string[] = [];
  const appPageCode = (await load.call(
    {
      addWatchFile: (file: string) => appPageWatchedFiles.push(file),
    } as never,
    appPageUserlandResolved,
    {} as never,
  )) as string;

  expect(appPageUserlandResolved.startsWith(virtualNextAppPageIdPrefix)).toBe(true);
  expect(appPageUserlandResolved.startsWith(virtualNextRouteTreeIdPrefix)).toBe(false);
  expect(appPageWatchedFiles).toContain(pageFile);
  expect(appPageCode).toMatch(/export\s+const\s+routeModule\s*=\s*new AppPageRouteModule\(\{/);
  expect(appPageCode).toContain("next/dist/server/route-modules/app-page/module.js");
  expect(appPageCode).toMatch(/export\s+const\s+__next_app__\s*=\s*\{/);
  expect(appPageCode).toContain("export const ClientPageRoot = entryBase.ClientPageRoot");
  expect(appPageCode).not.toContain('from "next/dist/server/app-render/entry-base"');
  expect(appPageCode).toContain("edge-app-page-delegation/page.tsx");
  expect(appPageCode).not.toContain("export const tree =");
  expectEdgeAppPageDelegationCodeToAvoidLocalRenderBridge(appPageCode);

  const resolved = (await resolveId.call(
    {} as never,
    edgeSource,
    undefined,
    {} as never,
  )) as string;
  const code = (await load.call({} as never, resolved, {} as never)) as string;

  expect(resolved.startsWith(virtualNextEdgeSsrAppIdPrefix)).toBe(true);
  expect(code).toContain(`import * as pageMod from ${JSON.stringify(appPageUserlandSource)};`);
  expect(code).toContain("export const ComponentMod = pageMod");
  expect(code).toContain("const pageRouteModule = pageMod.routeModule");
  expect(code).toContain("export async function handler(");
  expect(code).toMatch(/pageRouteModule\s*\.\s*render\(baseReq,\s*baseRes,\s*renderContext\)/);
  expect(code).toContain("self.__RSC_MANIFEST");
  expect(code).toContain("self.__RSC_SERVER_MANIFEST");
  expect(code).toMatch(
    /setManifestsSingleton\(\{\s*page: ['"]\/edge-app-page-delegation\/page['"]/,
  );

  expect(code).not.toContain("renderToHTMLOrFlight");
  expect(code).not.toContain("node-environment-baseline");
  expectEdgeAppPageDelegationCodeToAvoidLocalRenderBridge(code);
}, 15_000);

test("generates App Page route manifest entries with loadable Edge handlers", async () => {
  const plugin = useNextRouteManifest();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  const resolved = (await resolveId.call(
    {} as never,
    virtualNextRouteManifestPublicId,
    undefined,
    {} as never,
  )) as string;
  const code = (await load.call(
    {
      addWatchFile() {},
    } as never,
    resolved,
    {} as never,
  )) as string;
  const index = extractNextRouteTreeImportIndex(code, "/edge-app-page-delegation/page");
  const edgeSource = extractNextEdgeSsrAppSource(code, index);
  const edgeParams = new URLSearchParams(
    edgeSource.slice(`${virtualNextEdgeSsrAppPublicId}?`.length),
  );
  const appPageManifestEntry = extractManifestEntry(
    code,
    "nextRouteManifest",
    "/edge-app-page-delegation",
  );
  const routeHandlerManifestEntry = extractManifestEntry(
    code,
    "nextRouteHandlerManifest",
    "/api/next-request-response",
  );
  const routeHandlerEdgeSource = extractManifestEdgeAppRouteSource(routeHandlerManifestEntry);
  const routeHandlerEdgeImportIndex =
    extractManifestEdgeAppRouteImportIndex(routeHandlerManifestEntry);
  const routeHandlerEdgeParams = new URLSearchParams(
    routeHandlerEdgeSource.slice(`${virtualNextEdgeAppRoutePublicId}?`.length),
  );

  expect(code).toContain("export const nextRouteManifest =");
  expect(code).toContain(`route: ${JSON.stringify("/edge-app-page-delegation")}`);
  expect(code).toContain(`appPath: ${JSON.stringify("/edge-app-page-delegation/page")}`);
  expect(code).toContain(
    `const edgeAppPage${index} = () => import(${JSON.stringify(edgeSource)});`,
  );
  expect(code).not.toContain(`import ${JSON.stringify(edgeSource)};`);
  expect(code).not.toContain(`edgeAppPage${index}()`);
  expect(appPageManifestEntry).toContain(`edgeAppPageSource: ${JSON.stringify(edgeSource)}`);
  expect(appPageManifestEntry).toContain(`edgeAppPage: edgeAppPage${index}`);
  expect(appPageManifestEntry).not.toContain(`edgeAppPageSource: edgeAppPage${index}`);
  expect(routeHandlerManifestEntry).toContain(
    `edgeAppRouteSource: ${JSON.stringify(routeHandlerEdgeSource)}`,
  );
  expect(routeHandlerManifestEntry).toContain(
    `edgeAppRoute: edgeAppRoute${routeHandlerEdgeImportIndex}`,
  );
  expect(routeHandlerManifestEntry).not.toContain("edgeAppPageSource");
  expect(routeHandlerManifestEntry).not.toContain("edgeAppPage");
  expect(edgeSource.startsWith(`${virtualNextEdgeSsrAppPublicId}?`)).toBe(true);
  expect(edgeParams.get("VAR_PAGE")).toBe("/edge-app-page-delegation/page");
  expect(edgeParams.get("VAR_USERLAND")?.startsWith(`${virtualNextAppPagePublicId}?`)).toBe(true);
  expect(edgeParams.get("VAR_USERLAND")).not.toContain(virtualNextRouteTreePublicId);
  expect(edgeParams.get("VAR_USERLAND")).not.toContain("next-app-loader?");
  expect(routeHandlerEdgeSource.startsWith(`${virtualNextEdgeAppRoutePublicId}?`)).toBe(true);
  expect(routeHandlerEdgeParams.get("VAR_PAGE")).toBe("/api/next-request-response/route");
  expect(
    routeHandlerEdgeParams.get("VAR_USERLAND")?.startsWith(`${virtualNextAppRoutePublicId}?`),
  ).toBe(true);
  expect(routeHandlerEdgeParams.get("VAR_USERLAND")).not.toContain("next-app-loader?");
}, 15_000);

test("serves isolated Edge App Route entrypoint through loadable App Route userland", async () => {
  const plugin = useNextRouteManifest();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const routeFile = path.join(fixtureRoot, "app/api/next-request-response/route.ts");

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  const resolved = (await resolveId.call(
    {} as never,
    virtualNextRouteManifestPublicId,
    undefined,
    {} as never,
  )) as string;
  const manifestCode = (await load.call(
    {
      addWatchFile() {},
    } as never,
    resolved,
    {} as never,
  )) as string;
  const routeHandlerManifestEntry = extractManifestEntry(
    manifestCode,
    "nextRouteHandlerManifest",
    "/api/next-request-response",
  );
  const edgeSource = extractManifestEdgeAppRouteSource(routeHandlerManifestEntry);
  const edgeParams = new URLSearchParams(
    edgeSource.slice(`${virtualNextEdgeAppRoutePublicId}?`.length),
  );
  const appRouteUserlandSource = edgeParams.get("VAR_USERLAND");
  if (!appRouteUserlandSource) {
    throw new Error("Expected Edge App Route virtual source to include VAR_USERLAND.");
  }

  expect(appRouteUserlandSource.startsWith(`${virtualNextAppRoutePublicId}?`)).toBe(true);
  expect(appRouteUserlandSource).toContain("__next_edge_ssr_entry__");
  expect(appRouteUserlandSource).not.toContain(virtualNextAppPagePublicId);

  const appRouteResolved = (await resolveId.call(
    {} as never,
    appRouteUserlandSource,
    undefined,
    {} as never,
  )) as string;
  const appRouteWatchedFiles: string[] = [];
  const appRouteCode = (await load.call(
    {
      addWatchFile: (file: string) => appRouteWatchedFiles.push(file),
    } as never,
    appRouteResolved,
    {} as never,
  )) as string;

  expect(appRouteResolved.startsWith(virtualNextAppRouteIdPrefix)).toBe(true);
  expect(appRouteWatchedFiles).toContain(routeFile);
  expect(appRouteCode).toContain("new AppRouteRouteModule({");
  expect(appRouteCode).toContain("kind: RouteKind.APP_ROUTE");
  expect(appRouteCode).toContain(`page: ${JSON.stringify("/api/next-request-response/route")}`);
  expect(appRouteCode).toContain(`pathname: ${JSON.stringify("/api/next-request-response")}`);
  expect(appRouteCode).toContain(
    `import * as userland from ${JSON.stringify(`/@fs/${routeFile.slice(1)}`)}`,
  );
  expect(appRouteCode).not.toContain("renderToHTMLOrFlight");

  const edgeResolved = (await resolveId.call(
    {} as never,
    edgeSource,
    undefined,
    {} as never,
  )) as string;
  const edgeCode = (await load.call({} as never, edgeResolved, {} as never)) as string;

  expect(edgeResolved.startsWith(virtualNextEdgeAppRouteIdPrefix)).toBe(true);
  expect(edgeCode).toContain(`import * as module from ${JSON.stringify(appRouteUserlandSource)};`);
  expect(edgeCode).toContain("EdgeRouteModuleWrapper.wrap(");
  expect(edgeCode).toContain("module.routeModule");
  expect(edgeCode).toContain("export async function handler(");
  expect(edgeCode).not.toContain(".GET(");
  expect(edgeCode).not.toContain(".POST(");
}, 15_000);

test("resolves metadata route loader requests from generated App Route userland", async () => {
  const routeManifestPlugin = useNextRouteManifest();
  const metadataRoutePlugin = useNextMetadataRouteLoader();
  const routeConfigResolved = getHookHandler(routeManifestPlugin.configResolved);
  const routeResolveId = getHookHandler(routeManifestPlugin.resolveId);
  const routeLoad = getHookHandler(routeManifestPlugin.load);
  const metadataConfigResolved = getHookHandler(metadataRoutePlugin.configResolved);
  const metadataResolveId = getHookHandler(metadataRoutePlugin.resolveId);
  const metadataLoad = getHookHandler(metadataRoutePlugin.load);
  const robotsFile = path.join(fixtureRoot, "app/robots.ts");

  await routeConfigResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);
  await metadataConfigResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  const manifestResolved = (await routeResolveId.call(
    {} as never,
    virtualNextRouteManifestPublicId,
    undefined,
    {} as never,
  )) as string;
  const manifestCode = (await routeLoad.call(
    {
      addWatchFile() {},
    } as never,
    manifestResolved,
    {} as never,
  )) as string;
  const routeHandlerManifestEntry = extractManifestEntry(
    manifestCode,
    "nextRouteHandlerManifest",
    "/robots.txt",
  );
  const edgeSource = extractManifestEdgeAppRouteSource(routeHandlerManifestEntry);
  const edgeParams = new URLSearchParams(
    edgeSource.slice(`${virtualNextEdgeAppRoutePublicId}?`.length),
  );
  const appRouteUserlandSource = edgeParams.get("VAR_USERLAND");
  if (!appRouteUserlandSource) {
    throw new Error("Expected Edge App Route virtual source to include VAR_USERLAND.");
  }

  const appRouteResolved = (await routeResolveId.call(
    {} as never,
    appRouteUserlandSource,
    undefined,
    {} as never,
  )) as string;
  const appRouteWatchedFiles: string[] = [];
  const appRouteCode = (await routeLoad.call(
    {
      addWatchFile: (file: string) => appRouteWatchedFiles.push(file),
    } as never,
    appRouteResolved,
    {} as never,
  )) as string;
  const metadataRouteLoaderSource = extractMetadataRouteLoaderSource(appRouteCode);
  const metadataRouteResolved = (await metadataResolveId.call(
    {} as never,
    metadataRouteLoaderSource,
    undefined,
    {} as never,
  )) as string;
  const metadataRouteWatchedFiles: string[] = [];
  const metadataRouteCode = (await metadataLoad.call(
    {
      addWatchFile: (file: string) => metadataRouteWatchedFiles.push(file),
    } as never,
    metadataRouteResolved,
    {} as never,
  )) as string;

  expect(appRouteWatchedFiles).toContain(robotsFile);
  expect(metadataRouteLoaderSource).toContain("next-metadata-route-loader?");
  expect(metadataRouteLoaderSource).toContain("!?__next_metadata_route__");
  expect(metadataRouteLoaderSource).toContain(encodeURIComponent(robotsFile));
  expect(metadataRouteWatchedFiles).toEqual([robotsFile]);
  expect(metadataRouteCode).toContain("/* dynamic asset route */");
  expect(metadataRouteCode).toContain(
    `import handler from ${JSON.stringify(`/@fs/${robotsFile.slice(1)}`)}`,
  );
  expect(metadataRouteCode).toContain('const contentType = "text/plain"');
}, 15_000);

test("generates optimizer entrypoints from discovered App Page route trees only", async () => {
  const plugin = useNextRouteManifest();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const pageFile = path.join(fixtureRoot, "app/next-apis/page.tsx");
  const nonRouteAppFile = path.join(fixtureRoot, "app/next-apis/after-probe.tsx");
  const routeFile = path.join(fixtureRoot, "app/api/next-request-response/route.ts");

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  const resolved = (await resolveId.call(
    {} as never,
    virtualNextEntrypointsPublicId,
    undefined,
    {} as never,
  )) as string;
  const watchedFiles: string[] = [];
  const code = (await load.call(
    {
      addWatchFile: (file: string) => watchedFiles.push(file),
    } as never,
    resolved,
    {} as never,
  )) as string;

  expect(watchedFiles).toContain(pageFile);
  expect(watchedFiles).toContain(routeFile);
  expect(code).toContain("virtual:vitest-plugin-rsc/next-route-tree?");
  const importSources = code
    .split("\n")
    .map((line) => line.match(/^import ("(?:[^"\\]|\\.)*");$/)?.[1])
    .filter((source): source is string => Boolean(source))
    .map((source) => JSON.parse(source) as string);
  expect(importSources.length).toBeGreaterThan(0);
  expect(
    importSources.every((source) => source.startsWith(`${virtualNextRouteTreePublicId}?`)),
  ).toBe(true);
  expect(code).not.toContain(virtualNextEdgeSsrAppPublicId);
  expect(code).not.toContain(virtualNextAppPagePublicId);
  expect(code).not.toContain(virtualNextEdgeAppRoutePublicId);
  expect(code).not.toContain("__next_edge_ssr_entry__");
  expect(code).not.toContain(JSON.stringify(pageFile));
  expect(code).not.toContain(encodeURIComponent(encodeURIComponent(routeFile)));
  const nextApisRouteTree = extractNextRouteTreeSource(code, "/next-apis/page");
  const nextApisParams = new URLSearchParams(nextApisRouteTree.split("?")[1]);
  expect(nextApisParams.get("name")).toBe("app/next-apis/page");
  expect(nextApisParams.get("page")).toBe("/next-apis/page");
  expect(nextApisParams.get("pagePath")).toBe("private-next-app-dir/next-apis/page");
  expect(nextApisParams.getAll("appPaths")).toContain("/next-apis/page");
  expect(nextApisParams.getAll("allNormalizedAppPaths")).toContain("/next-apis");
  expect(nextApisParams.getAll("pageExtensions")).toContain("tsx");
  expect(nextApisParams.get("middlewareConfig")).toBeTruthy();
  expect(nextApisParams.has("pageFile")).toBe(false);
  expect(code).not.toContain("app/**/*");
  expect(code).not.toContain("src/app/**/*");
  expect(code).not.toContain(nonRouteAppFile);
}, 15_000);

test("serves Next Server Action entry modules from virtual action ids", async () => {
  const plugin = useNextRouteManifest();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const actionId = "/app/edge-app-page-delegation/actions.ts#saveDelegatedNote";
  const source = `${virtualNextServerActionEntryPublicId}?${new URLSearchParams({ actionId })}`;

  await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

  const resolved = (await resolveId.call({} as never, source, undefined, {} as never)) as string;
  const code = (await load.call({} as never, resolved, {} as never)) as string;

  expect(resolved.startsWith(virtualNextServerActionEntryIdPrefix)).toBe(true);
  expect(code).toBe(
    `export { saveDelegatedNote as ${JSON.stringify(actionId)} } from "/app/edge-app-page-delegation/actions.ts";\n`,
  );
}, 15_000);

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}

function extractNextRouteTreeSource(code: string, page: string) {
  return extractNextRouteTreeImport(code, page).source;
}

function extractNextRouteTreeImportIndex(code: string, page: string) {
  return extractNextRouteTreeImport(code, page).index;
}

function extractNextRouteTreeImport(code: string, page: string) {
  for (const line of code.split("\n")) {
    const match = line.match(/^import(?: \{ tree as tree(\d+) \} from)? ("(?:[^"\\]|\\.)*");$/);
    if (!match) continue;

    const source = JSON.parse(match[2]!) as string;
    if (!source.startsWith(`${virtualNextRouteTreePublicId}?`)) continue;

    const params = new URLSearchParams(source.slice(source.indexOf("?") + 1));
    if (params.get("page") === page) {
      return {
        index: match[1] ? Number(match[1]) : undefined,
        source,
      };
    }
  }

  throw new Error(`Expected a route tree virtual import for ${page}.`);
}

function extractNextEdgeSsrAppSource(code: string, index: number | undefined) {
  if (index === undefined) {
    throw new Error("Expected a named route manifest tree import.");
  }
  const matcher = new RegExp(
    `^const edgeAppPage${index} = \\(\\) => import\\(("(?:[^"\\\\]|\\\\.)*")\\);$`,
    "m",
  );
  const match = code.match(matcher);
  if (!match) {
    throw new Error(`Expected Edge App Page import for manifest entry ${index}.`);
  }
  return JSON.parse(match[1]!) as string;
}

function extractManifestEdgeAppRouteSource(entryCode: string) {
  const match = entryCode.match(/edgeAppRouteSource: ("(?:[^"\\]|\\.)*")/);
  if (!match) {
    throw new Error("Expected route handler manifest entry to include edgeAppRouteSource.");
  }
  return JSON.parse(match[1]!) as string;
}

function extractManifestEdgeAppRouteImportIndex(entryCode: string) {
  const match = entryCode.match(/edgeAppRoute: edgeAppRoute(\d+)/);
  if (!match) {
    throw new Error("Expected route handler manifest entry to include edgeAppRoute import.");
  }
  return Number(match[1]);
}

function extractMetadataRouteLoaderSource(code: string) {
  const match = code.match(/from ("next-metadata-route-loader\?(?:[^"\\]|\\.)*")/);
  if (!match) {
    throw new Error("Expected generated App Route code to import next-metadata-route-loader.");
  }
  return JSON.parse(match[1]!) as string;
}

function extractManifestEntry(code: string, exportName: string, route: string) {
  const manifestStart = code.indexOf(`export const ${exportName} = [`);
  if (manifestStart === -1) {
    throw new Error(`Expected ${exportName} export.`);
  }
  const manifestEnd = code.indexOf("];", manifestStart);
  if (manifestEnd === -1) {
    throw new Error(`Expected ${exportName} export to be serialized as an array.`);
  }

  const manifestCode = code.slice(manifestStart, manifestEnd);
  const routeMarker = `route: ${JSON.stringify(route)}`;
  const routeIndex = manifestCode.indexOf(routeMarker);
  if (routeIndex === -1) {
    throw new Error(`Expected ${exportName} entry for ${route}.`);
  }

  const entryStart = manifestCode.lastIndexOf("{", routeIndex);
  const entryEnd = manifestCode.indexOf("}", routeIndex);
  if (entryStart === -1 || entryEnd === -1) {
    throw new Error(`Expected ${exportName} entry for ${route} to be an object.`);
  }
  return manifestCode.slice(entryStart, entryEnd + 1);
}

function expectEdgeAppPageDelegationCodeToAvoidLocalRenderBridge(code: string) {
  expect(code).not.toContain("renderToHTMLOrFlight");
  expect(code).not.toContain("createAppPageRouteModule");
  expect(code).not.toContain('from "./app-render.ts"');
  expect(code).not.toContain("src/nextjs/app-render.ts");
  expect(code).not.toContain("node-environment-baseline");
  expect(code).not.toContain("probe header");
  expect(code).not.toContain("x-vitest-plugin-rsc-probe");
  expect(code).not.toContain("server.middlewares");
  expect(code).not.toContain(".middlewares.use");
  expect(code).not.toContain("middlewareMode");
  expect(code).not.toContain("ModuleRunner");
}
