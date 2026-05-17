import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "vitest";
import { fixtureRoot } from "../../plugin/test-utils.ts";
import {
  createNextAppLoaderSource,
  createNextAppPageVirtualSource,
  createNextEdgeSsrAppVirtualSource,
  createNextRouteTreeVirtualSource,
  createNextSourceOptimizerEntries,
  type NextAppLoaderOptions,
} from "./entries.ts";
import {
  virtualNextAppPageIdPrefix,
  virtualNextAppPagePublicId,
  virtualNextEdgeSsrAppIdPrefix,
  virtualNextEdgeSsrAppPublicId,
  virtualNextEntrypointsPublicId,
  virtualNextRouteTreePublicId,
} from "../../virtual-ids.ts";
import { nextEdgeSsrEntryResourceQuery } from "./webpack/loaders/next-edge-ssr-loader/index.ts";

const requireFromFixture = createRequire(path.join(fixtureRoot, "package.json"));
const { getAppEntry } = requireFromFixture("next/dist/build/entries.js") as {
  getAppEntry(options: Readonly<NextAppLoaderOptions>): { import: string };
};

test("uses the discovered Next route entrypoint as the optimizer scan entry", () => {
  expect(createNextSourceOptimizerEntries(fixtureRoot)).toEqual([virtualNextEntrypointsPublicId]);
});

test("does not scan app test files as optimizer entries", () => {
  for (const entry of createNextSourceOptimizerEntries(fixtureRoot)) {
    expect(entry).not.toBe("app/**/*.test.{js,jsx,ts,tsx}");
    expect(entry).not.toBe("src/app/**/*.test.{js,jsx,ts,tsx}");
  }
});

test("creates getAppEntry-shaped app loader sources", () => {
  const source = createNextAppLoaderSource(createLoaderOptions());

  expect(source.startsWith("next-app-loader?")).toBe(true);
  expect(source.endsWith("!")).toBe(true);

  const params = new URLSearchParams(source.slice("next-app-loader?".length, -1));
  expect(params.get("name")).toBe("app/notes/page");
  expect(params.get("page")).toBe("/notes/page");
  expect(params.get("pagePath")).toBe("private-next-app-dir/notes/page");
  expect(params.getAll("appPaths")).toEqual(["/notes/page"]);
  expect(params.getAll("allNormalizedAppPaths")).toEqual(["/notes"]);
  expect(params.getAll("pageExtensions")).toEqual(["tsx", "ts"]);
  expect(params.get("middlewareConfig")).toBe("e30=");
});

test("matches installed Next getAppEntry import serialization", () => {
  const appDir = path.join(fixtureRoot, "app");
  const withoutProjectRoot = createLoaderOptions({
    appDir,
    rootDir: undefined,
    tsconfigPath: undefined,
  });
  delete withoutProjectRoot.rootDir;
  delete withoutProjectRoot.tsconfigPath;

  const cases: NextAppLoaderOptions[] = [
    createLoaderOptions({
      appDir,
      rootDir: fixtureRoot,
      tsconfigPath: path.join(fixtureRoot, "tsconfig.json"),
    }),
    createLoaderOptions({
      name: "app/blog/[slug]/page",
      page: "/blog/[slug]/page",
      pagePath: "private-next-app-dir/blog/[slug]/page.tsx",
      appDir,
      appPaths: ["/blog/[slug]/page"],
      allNormalizedAppPaths: ["/blog/[slug]"],
      preferredRegion: ["iad1", "sfo1"],
      pageExtensions: ["tsx", "mdx"],
      assetPrefix: "/assets",
      rootDir: fixtureRoot,
      tsconfigPath: undefined,
      isDev: undefined,
      basePath: "/base",
      nextConfigOutput: "export",
      isGlobalNotFoundEnabled: true,
    }),
    createLoaderOptions({
      appDir,
      appPaths: null,
      allNormalizedAppPaths: null,
      preferredRegion: undefined,
      rootDir: fixtureRoot,
      tsconfigPath: path.join(fixtureRoot, "tsconfig.json"),
    }),
    withoutProjectRoot,
  ];

  for (const options of cases) {
    expect(createNextAppLoaderSource(options)).toBe(getAppEntry(options).import);
  }
});

test("keeps next-route-tree tree-only and separate from app page entries", () => {
  const source = createNextRouteTreeVirtualSource(createLoaderOptions());

  expect(virtualNextAppPagePublicId).toBe("virtual:vitest-plugin-rsc/next-app-page");
  expect(virtualNextAppPageIdPrefix).toBe("\0vitest-plugin-rsc:next-app-page?");
  expect(virtualNextEdgeSsrAppPublicId).toBe("virtual:vitest-plugin-rsc/next-edge-ssr-app");
  expect(virtualNextEdgeSsrAppIdPrefix).toBe("\0vitest-plugin-rsc:next-edge-ssr-app?");
  expect(source.startsWith(`${virtualNextRouteTreePublicId}?`)).toBe(true);
  expect(source.startsWith(`${virtualNextAppPagePublicId}?`)).toBe(false);
  expect(source.startsWith(`${virtualNextEdgeSsrAppPublicId}?`)).toBe(false);
  expect(source).not.toContain(nextEdgeSsrEntryResourceQuery);
});

test("creates isolated edge App Page virtual source against full app-page userland", () => {
  const options = createLoaderOptions();
  const appPageSource = createNextAppPageVirtualSource(options);
  const edgeSource = createNextEdgeSsrAppVirtualSource(options);

  expect(appPageSource.startsWith(`${virtualNextAppPagePublicId}?`)).toBe(true);
  expect(edgeSource.startsWith(`${virtualNextEdgeSsrAppPublicId}?`)).toBe(true);

  const params = new URLSearchParams(edgeSource.slice(`${virtualNextEdgeSsrAppPublicId}?`.length));
  expect(params.get("VAR_PAGE")).toBe(options.page);

  const userland = params.get("VAR_USERLAND");
  expect(userland).toBe(`${appPageSource}!${options.pagePath}?${nextEdgeSsrEntryResourceQuery}`);
  expect(userland?.startsWith(`${virtualNextAppPagePublicId}?`)).toBe(true);
  expect(userland).not.toContain(virtualNextRouteTreePublicId);
  expect(userland).not.toContain("next-app-loader?");

  const appPageParams = new URLSearchParams(
    appPageSource.slice(`${virtualNextAppPagePublicId}?`.length),
  );
  expect(appPageParams.get("name")).toBe(options.name);
  expect(appPageParams.get("page")).toBe(options.page);
  expect(appPageParams.get("pagePath")).toBe(options.pagePath);
  expect(appPageParams.getAll("appPaths")).toEqual([...options.appPaths!]);
});

function createLoaderOptions(overrides: Partial<NextAppLoaderOptions> = {}): NextAppLoaderOptions {
  return {
    name: "app/notes/page",
    page: "/notes/page",
    pagePath: "private-next-app-dir/notes/page",
    appDir: "/fixture/app",
    appPaths: ["/notes/page"],
    allNormalizedAppPaths: ["/notes"],
    preferredRegion: "auto",
    pageExtensions: ["tsx", "ts"],
    assetPrefix: "",
    rootDir: "/fixture",
    tsconfigPath: "/fixture/tsconfig.json",
    isDev: true,
    basePath: "",
    nextConfigOutput: undefined,
    middlewareConfig: "e30=",
    isGlobalNotFoundEnabled: undefined,
    ...overrides,
  };
}
