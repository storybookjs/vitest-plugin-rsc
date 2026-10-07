import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onTestFinished, expect, test, vi } from "vitest";
import { flightBridge } from "./flight.ts";
import { vitestPluginNext } from "./plugin.ts";
import { loadNextProject, type NextRoute } from "./project.ts";

const root = fileURLToPath(new URL("../../../../playground/nextjs-e2e-demo", import.meta.url));
const installed = createRequire(path.join(root, "package.json"));
const { version } = installed("next/package.json") as { version: string };

// The installed Next, with some exports of its build code replaced, or the
// source of a file replaced: a Next that has changed.
function nextWith(changes: Record<string, object | Error | string>): NodeJS.Require {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "next-"));
  onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
  const require = (id: string) => {
    const change = changes[id];
    if (change instanceof Error) throw change;
    return typeof change === "object" ? { ...installed(id), ...change } : installed(id);
  };
  const resolve = (id: string) => {
    const change = changes[id];
    if (change instanceof Error) throw change;
    if (typeof change !== "string") return installed.resolve(id);
    const file = path.join(dir, id.replaceAll("/", "_"));
    fs.writeFileSync(file, change);
    return file;
  };
  return Object.assign(require, { resolve }) as NodeJS.Require;
}

// The source of a file of the installed Next, with a piece of it replaced.
function sourceWith(id: string, piece: string, replacement: string): string {
  const source = fs.readFileSync(installed.resolve(id), "utf8");
  expect(source).toContain(piece);
  return source.replaceAll(piece, replacement);
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

test("lists the metadata files of the app, and warns once that they are left out", async () => {
  const app = appWith([
    "layout.js",
    "page.js",
    "favicon.ico",
    "icon.png",
    "sitemap.js",
    "blog/page.js",
    "blog/opengraph-image.png",
  ]);

  const { metadataFiles } = await loadNextProject(app, installed);
  expect(metadataFiles).toEqual([
    "app/blog/opengraph-image.png",
    "app/favicon.ico",
    "app/icon.png",
    "app/sitemap.js",
  ]);

  // What a run of that app logs when it starts. Not the favicon, which every
  // new app has.
  const plugin = vitestPluginNext().find(({ name }) => name === "vitest-plugin-rsc:next")!;
  await (plugin.config as (config: object) => Promise<unknown>)({ root: app });
  const warnOnce = vi.fn();
  (plugin.configResolved as (config: object) => void)({ logger: { warnOnce } });
  expect(warnOnce.mock.calls).toEqual([
    [
      "vitest-plugin-rsc: Next.js metadata files are not supported yet. The pages of " +
        `${path.relative(process.cwd(), app)} leave them out, and their routes are not served: ` +
        "app/blog/opengraph-image.png, app/icon.png, app/sitemap.js",
    ],
  ]);
});

test("does not warn about the favicon alone", async () => {
  const app = appWith(["layout.js", "page.js", "favicon.ico"]);

  const plugin = vitestPluginNext().find(({ name }) => name === "vitest-plugin-rsc:next")!;
  await (plugin.config as (config: object) => Promise<unknown>)({ root: app });
  const warnOnce = vi.fn();
  (plugin.configResolved as (config: object) => void)({ logger: { warnOnce } });
  expect(warnOnce).not.toHaveBeenCalled();
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

// A file of Next's runtime, which runs in the tab.
const runtime = (file: string) => `next/dist/esm/${file}.js`;

test("says which file of Next's runtime is gone", async () => {
  const next = nextWith({ [runtime("client/app-index")]: new Error("Cannot find module") });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed(`${runtime("client/app-index")} is not there`),
  );
});

test.for([
  [
    "client/app-index",
    "export async function hydrate(",
    "export async function start(",
    "has no export `hydrate`",
  ],
  ["client/app-index", "__NEXT_HYDRATED_CB", "__NEXT_ON_HYDRATED", "has no `__NEXT_HYDRATED_CB`"],
  [
    "client/asset-prefix",
    "document.currentScript",
    "self.__next_script",
    "has no `document.currentScript`",
  ],
  [
    "shared/lib/server-reference-info",
    "function mightBeServerReferenceId(",
    "function isServerReferenceId(",
    "has no export `mightBeServerReferenceId`",
  ],
  [
    "server/route-modules/route-module",
    "self.__BUILD_MANIFEST",
    "self.__NEXT_BUILD",
    "has no `self.__BUILD_MANIFEST`",
  ],
  [
    "server/route-modules/route-module",
    "self.__RSC_MANIFEST",
    "self.__NEXT_CLIENT_REFERENCES",
    "has no `self.__RSC_MANIFEST`",
  ],
])("needs what the tab assumes of %s: %s", async ([file, piece, replacement, what]) => {
  const next = nextWith({ [runtime(file!)]: sourceWith(runtime(file!), piece!, replacement!) });

  await expect(loadNextProject(root, next)).rejects.toThrow(changed(`${runtime(file!)} ${what}`));
});

test("needs the manifests that the server is given for each request", async () => {
  const file = runtime("server/app-render/manifests-singleton");
  const next = nextWith({
    [file]: sourceWith(file, "serverActionsManifest: raw", "actionsManifest: raw"),
  });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed("`setManifestsSingleton()` takes no `serverActionsManifest`"),
  );
});

test.for([
  "export const setManifestsSingleton = (options) =>\n  set(options.page, options.clientReferenceManifest, options.serverActionsManifest);",
  "function setManifestsSingleton({ page, clientReferenceManifest, serverActionsManifest }) {}\nexport { setManifestsSingleton };",
  `export * from ${JSON.stringify(installed.resolve(runtime("server/app-render/manifests-singleton")))};`,
])("takes the manifests however Next declares the function that gets them: %s", async (source) => {
  const next = nextWith({ [runtime("server/app-render/manifests-singleton")]: source });

  await expect(loadNextProject(root, next)).resolves.toBeDefined();
});

test("reads the exports of the Flight codec of the rsc layer", async () => {
  const { flightExports } = await loadNextProject(root);

  expect(flightExports.client).toContain("createFromFetch");
  expect(flightExports.static).toEqual(["prerender"]);
  expect(flightExports.server).toContain("decodeReplyFromAsyncIterable");
});

test("gives the rsc layer every export of the Flight codec, one without an adapter one that throws", async () => {
  const file = "next/dist/compiled/react-server-dom-webpack/static.edge";
  const next = nextWith({
    [file]: sourceWith(
      `${file}.js`,
      "exports.prerender = s.prerender;",
      "exports.prerender = s.prerender;\nexports.resumeAndPrerender = s.resumeAndPrerender;",
    ),
  });
  const { flightExports } = await loadNextProject(root, next);
  expect(flightExports.static).toEqual(["prerender", "resumeAndPrerender"]);

  // The module the rsc layer gets, with an adapter where rsc.ts puts it.
  const registry = "globalThis.__flight_bridge_test__";
  vi.stubGlobal("__flight_bridge_test__", {
    flightStatic: { prerender: (model: unknown) => ["prerendered", model] },
  });
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  const bridge = flightBridge("static", flightExports.static, version, registry);
  const { prerender, resumeAndPrerender } = (await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(bridge)}`
  )) as Record<string, (...args: unknown[]) => unknown>;

  expect(prerender!("page")).toEqual(["prerendered", "page"]);
  expect(() => resumeAndPrerender!()).toThrow(
    `vitest-plugin-rsc: \`resumeAndPrerender\` of Next's Flight codec is not supported in the rsc layer (next@${version}).`,
  );
});
