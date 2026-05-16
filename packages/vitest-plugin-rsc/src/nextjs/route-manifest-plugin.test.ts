import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { loadNextProjectConfig } from "./config.ts";
import { useNextRouteManifest } from "./route-manifest-plugin.ts";
import { loadNextRouteStaticInfo } from "./src/build/analysis/get-page-static-info.ts";
import { virtualNextEntrypointsPublicId, virtualNextRouteTreePublicId } from "./virtual-ids.ts";

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
  expect(code).not.toContain("const __next_app_require__");
  expect(code).not.toContain("const __next_app_load_chunk__");
}, 15_000);

test("generates optimizer entrypoints from discovered Next routes only", async () => {
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
  expect(code).toContain(JSON.stringify(pageFile));
  expect(code).toContain(JSON.stringify(routeFile));
  expect(code).toContain("app/api/next-request-response/route.ts");
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

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}

function extractNextRouteTreeSource(code: string, page: string) {
  for (const line of code.split("\n")) {
    const match = line.match(/^import ("(?:[^"\\]|\\.)*");$/);
    if (!match) continue;

    const source = JSON.parse(match[1]!) as string;
    if (!source.startsWith(`${virtualNextRouteTreePublicId}?`)) continue;

    const params = new URLSearchParams(source.slice(source.indexOf("?") + 1));
    if (params.get("page") === page) return source;
  }

  throw new Error(`Expected a route tree virtual import for ${page}.`);
}
