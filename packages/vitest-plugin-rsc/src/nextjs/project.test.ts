import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onTestFinished, expect, test } from "vitest";
import { loadNextProject, type NextRoute } from "./project.ts";

const root = fileURLToPath(new URL("../../../../playground/nextjs-e2e-demo", import.meta.url));
const installed = createRequire(path.join(root, "package.json"));
const { version } = installed("next/package.json") as { version: string };

// The installed Next, with some exports of its build code replaced: a Next
// that has changed.
function nextWith(changes: Record<string, object | Error>): NodeJS.Require {
  const require = (id: string) => {
    const change = changes[id];
    if (change instanceof Error) throw change;
    return change ? { ...installed(id), ...change } : installed(id);
  };
  return Object.assign(require, { resolve: installed.resolve }) as NodeJS.Require;
}

const changed = (what: string) =>
  `next@${version} differs from the Next.js this plugin was written for: ${what}`;
const route = (routes: NextRoute[], pathname: string) =>
  routes.find((candidate) => candidate.pathname === pathname)!;

test("lists the routes of the app, one for each pathname", async () => {
  const { routes } = await loadNextProject(root);

  expect(route(routes, "/notes/[id]")).toMatchObject({ kind: "page", page: "/notes/[id]/page" });
  expect(route(routes, "/api/notes/[id]")).toMatchObject({ kind: "route" });
  // The pages of a route's slots, with the one Next names the route after.
  expect(route(routes, "/dashboard")).toMatchObject({
    page: "/dashboard/page",
    appPaths: ["/dashboard/@stats/page", "/dashboard/page"],
  });
  expect(route(routes, "/board").page).toBe("/board/@team/page");
});

// An app of its own, next to the demo so that it finds the same Next.
function appWith(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(root, ".app-"));
  onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(dir, "app", file)), { recursive: true });
    const isRoute = path.basename(file).startsWith("route.");
    fs.writeFileSync(
      path.join(dir, "app", file),
      isRoute ? "export const GET = () => new Response();" : "export default () => null;",
    );
  }
  return dir;
}

test("lists a route handler and a metadata file next to a catch-all page of a slot", async () => {
  // Next's modal pattern: the catch-all page of `@auth` matches every path.
  const app = appWith([
    "layout.js",
    "default.js",
    "@auth/default.js",
    "@auth/[...catchAll]/page.js",
    "@auth/login/page.js",
    "login/page.js",
    "api/hello/route.js",
    "sitemap.js",
  ]);

  const { routes } = await loadNextProject(app, installed);

  expect(route(routes, "/api/hello")).toMatchObject({ kind: "route", page: "/api/hello/route" });
  expect(route(routes, "/login")).toMatchObject({ kind: "page" });
  // Not served yet: Next's metadata loaders build it.
  expect(route(routes, "/sitemap.xml")).toBeUndefined();
});

test("rejects parallel routes that `next build` rejects", async () => {
  const next = nextWith({
    "next/dist/build/normalize-catchall-routes.js": {
      normalizeCatchAllRoutes: () => ({
        unmatchedAppPages: ["/board/@team/members/page"],
        incompatibleParallelRouteSlots: [],
      }),
    },
  });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    "The following page files do not match any complete route:\n- /board/@team/members/page",
  );
});

test("rejects an interception route without the route it intercepts, as `next build` does", async () => {
  const app = appWith([
    "layout.js",
    "default.js",
    "@modal/default.js",
    "@modal/(.)photo/[id]/page.js",
  ]);

  await expect(loadNextProject(app, installed)).rejects.toThrow(
    "- /(.)photo/[id] (expected /photo/[id])",
  );
});

test("says which file of Next's build no longer loads", async () => {
  const next = nextWith({ "next/dist/build/define-env.js": new Error("Cannot find module") });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed("next/dist/build/define-env.js does not load (Cannot find module)"),
  );
});

test("says which export of Next's build is gone", async () => {
  const next = nextWith({ "next/dist/build/route-discovery.js": { discoverRoutes: undefined } });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed("next/dist/build/route-discovery.js has no export `discoverRoutes`"),
  );
});

test("does not take a route discovery without app pages for an app without routes", async () => {
  const next = nextWith({
    "next/dist/build/route-discovery.js": { discoverRoutes: async () => ({ appPages: {} }) },
  });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed("`discoverRoutes()` returns no `mappedAppPages`"),
  );
});

test("needs the define that makes Next's modules pick their edge build", async () => {
  const next = nextWith({ "next/dist/build/define-env.js": { getDefineEnv: () => ({}) } });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed("`getDefineEnv()` does not define `process.env.NEXT_RUNTIME` as `edge`"),
  );
});

test("needs the alias that says where Next keeps its Flight codec", async () => {
  const next = nextWith({
    "next/dist/build/create-compiler-aliases.js": { createVendoredReactAliases: () => ({}) },
  });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed("the alias tables have no `react-server-dom-webpack/server$`"),
  );
});

test("needs a cache that takes the options the tab gives it", async () => {
  const next = nextWith({
    "next/dist/server/lib/incremental-cache/index.js": { IncrementalCache: class {} },
  });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed("`IncrementalCache` no longer takes `fs`, `serverDistDir` and `fetchCacheKeyPrefix`"),
  );
});

test.for([
  ["/notes", "export const tree = {};", "__webpack_require__"],
  ["/notes", "const load = __webpack_require__;", "app-page-runtime"],
  ["/api/plain", "export const routeModule = {};", "userland"],
])("needs what it replaces in the entry of %s: %s", async ([pathname, code, piece]) => {
  const next = nextWith({
    "next/dist/build/webpack/loaders/next-app-loader/index.js": { default: async () => code },
  });
  const project = await loadNextProject(root, next);

  await expect(project.loadAppPageEntry(route(project.routes, pathname!))).rejects.toThrow(
    new RegExp(`next@${version} differs .* the output of next-app-loader has no \`.*${piece}`),
  );
});

test("needs the import of the page that it replaces in the edge template", async () => {
  const next = nextWith({
    "next/dist/build/load-entrypoint.js": { loadEntrypoint: async () => "export {};" },
  });
  const project = await loadNextProject(root, next);

  await expect(project.loadEdgeEntry(route(project.routes, "/notes"), "page")).rejects.toThrow(
    changed("the edge-ssr-app template has no `import * as pageMod from"),
  );
});
