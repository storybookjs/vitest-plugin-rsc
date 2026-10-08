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
function appWith(files: string[], config: object = {}): string {
  const dir = fs.mkdtempSync(path.join(root, ".app-"));
  onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Always one of its own: Next looks for a config in the folders above too,
  // and finds the one of the demo.
  fs.writeFileSync(path.join(dir, "next.config.mjs"), `export default ${JSON.stringify(config)};`);
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

test("lists the route files that ask for Next's edge runtime", async () => {
  const { edgeRouteFiles } = await loadNextProject(root);

  expect(edgeRouteFiles).toEqual(["app/api/runtime/route.ts"]);
});

test("needs the define that makes Next's code take the branches of its Node.js server", async () => {
  const next = nextWith({ "next/dist/build/define-env.js": { getDefineEnv: () => ({}) } });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed("`getDefineEnv()` does not define `process.env.NEXT_RUNTIME` as `nodejs`"),
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

test("needs a cache that takes the options the plugin gives it", async () => {
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

  await expect(project.loadRouteEntry(route(project.routes, pathname!))).rejects.toThrow(
    new RegExp(`next@${version} differs .* the output of next-app-loader has no \`.*${piece}`),
  );
});

test("gives a node a route for each pathname of the app, and one for /", async () => {
  // An app without a page at `/`.
  const { componentRoutes } = await loadNextProject(appWith(["layout.js", "notes/[id]/page.js"]));

  // None for Next's own `/_not-found` and `/_global-error`.
  expect(componentRoutes).toEqual([
    { kind: "page", page: "/page", pathname: "/", component: "(vitest-plugin-rsc)/" },
    {
      kind: "page",
      // The name a page at that pathname has: Next tags the cached reads of
      // the node with it, for `revalidatePath()` (next-cache.test.tsx in the
      // notes demo fails with another name).
      page: "/notes/[id]/page",
      pathname: "/notes/[id]",
      component: "(vitest-plugin-rsc)/notes/[id]",
    },
    // And one with the layouts of each page of the app, for `layouts: true`.
    {
      kind: "page",
      page: "/notes/[id]/page",
      pathname: "/notes/[id]",
      component: "(vitest-plugin-rsc-layouts)/notes/[id]/page",
      layouts: true,
    },
  ]);
});

test("gives the route of a node with layouts the entry of the app's route, with the node for its page", async () => {
  const project = await loadNextProject(
    appWith(["layout.js", "notes/layout.js", "notes/[id]/page.js", "notes/[id]/loading.js"]),
  );
  const route = project.componentRoutes.find((candidate) => candidate.layouts)!;

  const { code } = await project.loadRouteEntry(route);

  expect(code).toContain(`page: [__next_component__, "vitest-plugin-rsc/component"]`);
  expect(code).toContain(`import { loadComponent as __next_component__ }`);
  // The rest of the tree is the app's.
  expect(code).toMatch(/'layout': \[\w+, "[^"]*app\/layout\.js"\]/);
  expect(code).toMatch(/'layout': \[\w+, "[^"]*app\/notes\/layout\.js"\]/);
  expect(code).toMatch(/'loading': \[\w+, "[^"]*app\/notes\/\[id\]\/loading\.js"\]/);
  expect(code).not.toMatch(/page: \[\w+, "[^"]*page\.js"\]/);
});

test("gives the route of a node the segments of its pathname, and nothing of the app", async () => {
  const project = await loadNextProject(root);
  const node = project.componentRoutes.find((candidate) => candidate.pathname === "/notes/[id]")!;

  const { code, watchFiles } = await project.loadRouteEntry(node);

  const tree = /^const tree = (.*)$/m.exec(code)![1];
  // Next's own boundaries at the root, and no layout.
  const boundaries = ["global-error", "not-found", "forbidden", "unauthorized"].map((name) => {
    const file = `"next/dist/client/components/builtin/${name}.js"`;
    return `"${name}": [() => import(${file}), ${file}]`;
  });
  expect(tree).toBe(
    `["(vitest-plugin-rsc)", { children: ["notes", { children: ["[id]", { children: ` +
      `["__PAGE__", {}, { page: [__next_component__, "vitest-plugin-rsc/component"] }] ` +
      `}, {}, null] }, {}, null] }, { ${boundaries.join(", ")} }, null]`,
  );
  expect(code).toContain('page: "/notes/[id]/page"');
  // Next's own request handler, like the entry of a page of the app.
  expect(code).toContain('from "next/dist/build/templates/app-page-runtime"');
  expect(code).not.toContain("__webpack_require__");
  expect(code).not.toContain(project.appDir);
  expect(watchFiles).toEqual([]);
});

test("needs the page template to take what Next's app loader puts in it", async () => {
  const next = nextWith({
    "next/dist/build/load-entrypoint.js": {
      loadEntrypoint: async () => {
        throw new Error("Invariant: Expected to inject all injections, found tree");
      },
    },
  });
  const project = await loadNextProject(root, next);

  await expect(project.loadRouteEntry(project.componentRoutes[0]!)).rejects.toThrow(
    changed("the app-page template does not take the injections of next-app-loader"),
  );
});

test.for(["global-error", "not-found", "forbidden", "unauthorized"])(
  "needs Next's own %s page for the route of a node",
  async (name) => {
    const file = `next/dist/client/components/builtin/${name}.js`;
    const next = nextWith({ [file]: new Error("Cannot find module") });

    await expect(loadNextProject(root, next)).rejects.toThrow(changed(`${file} is not there`));
  },
);

// A file of Next's runtime, which runs in the browser.
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
    "client/app-index",
    "const appElement = document",
    "const rootElement = document",
    "has no `const appElement = document`",
  ],
  [
    "client/app-index",
    "ReactDOMClient.createRoot(appElement",
    "ReactDOMClient.createRoot(document",
    "has no `ReactDOMClient.createRoot(appElement`",
  ],
  [
    "client/components/render-tree",
    "PrefetchHint.IsRootLayoutOrAbove",
    "PrefetchHint.InRootLayout",
    "has no `PrefetchHint.IsRootLayoutOrAbove`",
  ],
  [
    "client/components/segment-cache/cache",
    "currentTree.segment === nextTree.segment",
    "isSameRoot(currentTree, nextTree)",
    "has no `currentTree.segment === nextTree.segment`",
  ],
  [
    "client/components/render-tree",
    "isNavigatingToNewRootLayout(",
    "isOtherRootLayout(",
    "has no `isNavigatingToNewRootLayout(`",
  ],
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
    "load-manifest.external",
    "load-manifest",
    "has no `load-manifest.external`",
  ],
  [
    "server/app-render/stream-ops",
    "process.env.__NEXT_USE_NODE_STREAMS",
    "process.env.__NEXT_NODE_STREAMS",
    "has no `process.env.__NEXT_USE_NODE_STREAMS`",
  ],
])("needs what the plugin assumes of %s: %s", async ([file, piece, replacement, what]) => {
  const next = nextWith({ [runtime(file!)]: sourceWith(runtime(file!), piece!, replacement!) });

  await expect(loadNextProject(root, next)).rejects.toThrow(changed(`${runtime(file!)} ${what}`));
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

const appFile = (file: string) => path.join(root, "app", file);
const sourceOf = (file: string) => fs.readFileSync(appFile(file), "utf8");

test("compiles a module of the app with Next's SWC transform, for its layer", async () => {
  const project = await loadNextProject(root);
  const file = "styled-jsx/scoped-note.tsx";

  const compiled = await project.compile(sourceOf(file), appFile(file), "ssr");
  expect(compiled?.code).toContain('import _JSXStyle from "styled-jsx/style";');
  // JSX is left for Vite to compile.
  expect(compiled?.code).toContain("<_JSXStyle id=");
  expect(compiled?.map).toContain(file);
  // A client module in the rsc layer is Vite RSC's to turn into references.
  expect(await project.compile(sourceOf(file), appFile(file), "rsc")).toBeUndefined();
});

test("compiles with the `compiler` options of next.config", async () => {
  const app = appWith(["layout.js", "page.js"], { compiler: { removeConsole: true } });
  const project = await loadNextProject(app, installed);

  const compiled = await project.compile(
    'console.log("debug");\nexport const a = 1;\n',
    path.join(app, "app/a.js"),
    "rsc",
  );

  expect(compiled?.code).toContain("export const a = 1;");
  expect(compiled?.code).not.toContain("console.log");
});

test("makes a module that `next build` stops at throw Next's error, with its exports and without its imports", async () => {
  const project = await loadNextProject(root);
  const source = [
    'import { useState } from "react";',
    'import "./side-effect.ts";',
    "export type Count = number;",
    "export const a: Count = 1;",
    "export const { x, y: [z = 2] } = { x: 1, y: [] as number[] };",
    "export default function Page() {",
    "  return useState(a);",
    "}",
    'export { b as c } from "./b.ts";',
    'export * from "./d.ts";',
  ].join("\n");

  const compiled = await project.compile(source, appFile("page.tsx"), "rsc");

  const [first, ...rest] = compiled!.code.split("\n");
  expect(first).toMatch(
    /^throw new Error\("x You're importing a module that depends on `useState` into a React Server Component module\./,
  );
  expect(first).toContain(`${path.join("app", "page.tsx")}:1:1`);
  expect(rest.join("\n")).toBe(
    "const _ = undefined;\nexport { _ as a, _ as x, _ as z, _ as c };\n" +
      'export default undefined;\nexport * from "./d.ts";\n',
  );
});

test("stops at `metadata` in a Client Component, in the layers that run it", async () => {
  const project = await loadNextProject(root);
  const source = '"use client";\nexport const metadata = {};\nexport default () => null;\n';

  const compiled = await project.compile(source, appFile("page.tsx"), "ssr");

  expect(compiled?.code).toMatch(
    /^throw new Error\("x You are attempting to export \\"metadata\\" from a component marked with \\"use client\\"/,
  );
  expect(compiled?.code).toContain("export { _ as metadata };\nexport default undefined;");
});

test("compiles a package for its calls of next/font, where Next's checks leave a package alone", async () => {
  const project = await loadNextProject(root);
  const source = [
    'import "client-only";',
    'import localFont from "next/font/local";',
    'export const font = localFont({ src: "./font.woff2" });',
  ].join("\n");

  const compiled = await project.compile(
    source,
    path.join(root, "node_modules/fonts/index.js"),
    "rsc",
  );

  expect(compiled?.code).toContain('import "client-only";');
  expect(compiled?.code).toContain("import font from 'next/font/local/target.css?{");
});

test("needs the transform that turns a call of a font function into an import", async () => {
  const next = nextWith({
    "next/dist/build/swc/index.js": { transform: async (code: string) => ({ code }) },
  });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed("the SWC transform no longer turns a call of a `next/font` function into an import"),
  );
});

test("needs the transform to say which module of the rsc layer is a client module", async () => {
  const next = nextWith({
    "next/dist/build/swc/index.js": {
      transform: async (code: string) => ({
        code: `import "next/font/google/target.css?{}";\n${code}`,
      }),
    },
  });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed('the SWC transform no longer marks a `"use client"` module of the rsc layer'),
  );
});

test("loads a font with Next's font loaders, and has its file where the CSS says it is", async () => {
  const project = await loadNextProject(root);
  const compiled = await project.compile(
    sourceOf("fonts/fonts.ts"),
    appFile("fonts/fonts.ts"),
    "rsc",
  );
  const [request] = /next\/font\/local\/target\.css\?[^']+(?=')/.exec(compiled!.code)!;

  const { css, exports } = await project.loadFont(request);

  expect(exports).toEqual({
    className: expect.stringMatching(/^__className_\w{6}$/),
    variable: expect.stringMatching(/^__variable_\w{6}$/),
    style: { fontFamily: "'geist', 'geist Fallback'" },
  });
  expect(css).toContain(`.${String(exports.variable)} {--font-geist: 'geist', 'geist Fallback'`);
  const [, url] = /src: url\(([^)]+)\) format\('woff2'\)/.exec(css)!;
  expect(url).toMatch(/^\/_next\/static\/media\/\w+-s\.p\.woff2$/);
  expect(project.readEmittedFile(url!)).toEqual({
    body: fs.readFileSync(appFile("fonts/geist-latin.woff2")),
    contentType: "font/woff2",
  });
  expect(project.readEmittedFile("/_next/static/media/none.woff2")).toBeUndefined();
});

test("needs the loaders that Next's build has for a font", async () => {
  const next = nextWith({
    "next/dist/build/webpack/config/blocks/css/loaders/next-font.js": {
      getNextFontLoader: () => [],
    },
  });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed("`getNextFontLoader()` no longer uses css-loader and next-font-loader"),
  );
});

test("loads an image with Next's image loader, and has its file where the module says it is", async () => {
  const project = await loadNextProject(root);
  const logo = appFile("images/logo.png");
  expect(project.isImage(logo)).toBe(true);
  expect(project.isImage(appFile("styles/global.css"))).toBe(false);

  const code = await project.loadImage(logo);

  const image = JSON.parse(code.slice("export default ".length, -1)) as Record<string, string>;
  expect(image).toEqual({
    src: expect.stringMatching(/^\/_next\/static\/media\/logo\.\w{8}\.png$/),
    width: 40,
    height: 30,
    blurWidth: 8,
    blurHeight: 6,
    blurDataURL: expect.stringMatching(/^data:image\/png;base64,/),
  });
  expect(project.readEmittedFile(image.src!)).toEqual({
    body: fs.readFileSync(logo),
    contentType: "image/png",
  });
});

test("does not load an image as a module when next.config turns that off", async () => {
  const app = appWith(["layout.js", "page.js"], { images: { disableStaticImages: true } });

  const project = await loadNextProject(app, installed);

  expect(project.isImage(appFile("images/logo.png"))).toBe(false);
});

test("needs the image loader to export the data of an image", async () => {
  const next = nextWith({
    "next/dist/build/webpack/loaders/next-image-loader/index.js": {
      default: async () => "module.exports = {};",
    },
  });
  const project = await loadNextProject(root, next);

  await expect(project.loadImage(appFile("images/logo.png"))).rejects.toThrow(
    changed("next-image-loader no longer exports the data of an image"),
  );
});

// A request, by the route resolution the browser runs, with the routes of a
// project.
async function resolve(
  routing: Awaited<ReturnType<typeof loadNextProject>>["routing"],
  url: string,
) {
  const { resolveRoutes } = installed("@next/routing") as typeof import("@next/routing");
  const { resolvedPathname, resolvedHeaders, status } = await resolveRoutes({
    url: new URL(url, "http://localhost"),
    headers: new Headers(),
    requestBody: new ReadableStream(),
    basePath: routing.basePath,
    buildId: routing.buildId,
    pathnames: Object.keys(routing.outputs),
    routes: routing.routes,
    invokeMiddleware: async () => ({}),
  });
  return {
    page: routing.outputs[resolvedPathname ?? ""],
    status,
    location: resolvedHeaders?.get("location") ?? undefined,
  };
}

test("has the routes that Next's build hands a deployment adapter", async () => {
  const { routing } = await loadNextProject(root);
  // What next.config calls a route. Not a part of what `resolveRoutes()` reads.
  const sources = (routes: object[]) =>
    routes.map((route) => (route as { source?: string }).source);

  // The headers and the redirects of next.config, and Next's own redirect of
  // a trailing slash.
  expect(sources(routing.routes.beforeMiddleware)).toEqual([
    "/docs/:slug",
    "/:path+/",
    "/guide/:slug",
  ]);
  // The interception route of the gallery is a rewrite to Next's build.
  expect(sources(routing.routes.beforeFiles)).toEqual(["/docs/start", "/gallery/photo/:nxtPid"]);
  expect(sources(routing.routes.afterFiles)).toEqual(["/docs", "/docs/echo"]);
  expect(sources(routing.routes.fallback)).toEqual(["/docs/:slug/:rest+", "/elsewhere/:path*"]);
  // A pattern for each dynamic route, to the output of the build for it.
  expect(routing.routes.dynamicRoutes).toContainEqual(
    expect.objectContaining({
      source: "/docs/[slug]",
      destination: expect.stringContaining("/docs/[slug]"),
    }),
  );
  expect(routing.outputs).toMatchObject({
    "/docs": "/docs/page",
    "/docs/[slug]": "/docs/[slug]/page",
    "/api/notes/[id]": "/api/notes/[id]/route",
  });
  // The matcher of proxy.ts.
  expect(sources(routing.routes.middlewareMatchers ?? [])).toEqual([
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ]);

  // Without the server in front of the app, for `proxy: false`: only Next's
  // own routes, its interception route among them.
  const { appRoutes } = routing;
  expect(sources(appRoutes.beforeMiddleware)).toEqual([]);
  expect(appRoutes.middlewareMatchers).toEqual([]);
  expect(sources(appRoutes.beforeFiles)).toEqual(["/gallery/photo/:nxtPid"]);
  expect(sources(appRoutes.afterFiles)).toEqual([]);
  expect(sources(appRoutes.fallback)).toEqual([]);
  expect(appRoutes.dynamicRoutes).toEqual(routing.routes.dynamicRoutes);
  expect(appRoutes.onMatch).toEqual(routing.routes.onMatch);
});

test("has the routes manifest of a build, for Next's route module", async () => {
  const { routesManifest } = await loadNextProject(root);

  // Next's route module reads the rewrites of an interception route from it.
  expect(routesManifest.rewrites.beforeFiles.map(({ source }) => source)).toEqual([
    "/docs/start",
    "/gallery/photo/:nxtPid",
  ]);
  expect(routesManifest.basePath).toBe("");
});

test("finds the proxy of the app, and loads it with Next's template", async () => {
  const project = await loadNextProject(root);

  expect(project.middlewareFile).toBe(path.join(root, "proxy.ts"));
  const entry = await project.loadMiddlewareEntry();
  expect(entry).toContain('import * as _mod from "private-next-root-dir/proxy.ts"');
  expect(entry).toContain('const page = "/proxy"');
  // Not the `require` of Next's bundler.
  expect(entry).toContain("await import('node:path')");
  expect(entry).not.toMatch(/\brequire\(/);
});

test("has no middleware for an app without one, and a matcher for every path without a config", async () => {
  const plain = await loadNextProject(appWith(["layout.js", "page.js"]), installed);

  expect(plain.middlewareFile).toBeUndefined();
  expect(await plain.loadMiddlewareEntry()).toBeUndefined();
  expect(plain.routing.routes.middlewareMatchers).toEqual([]);

  const app = appWith(["layout.js", "page.js"]);
  fs.writeFileSync(path.join(app, "middleware.js"), "export function middleware() {}");
  const { routing, middlewareFile } = await loadNextProject(app, installed);

  expect(middlewareFile).toBe(path.join(app, "middleware.js"));
  expect(routing.routes.middlewareMatchers).toMatchObject([{ source: "/:path*" }]);
});

test("does not take a folder with the name of the proxy for it, as `next build` does not", async () => {
  const app = appWith(["layout.js", "page.js"]);
  fs.mkdirSync(path.join(app, "middleware"));
  fs.writeFileSync(path.join(app, "middleware/index.js"), "export const helper = 1;");

  expect((await loadNextProject(app, installed)).middlewareFile).toBeUndefined();

  // Nor is it a second one.
  fs.writeFileSync(path.join(app, "proxy.js"), "export function proxy() {}");

  expect((await loadNextProject(app, installed)).middlewareFile).toBe(path.join(app, "proxy.js"));
});

test("rejects an app with both a proxy and a middleware, as `next build` does", async () => {
  const app = appWith(["layout.js", "page.js"]);
  fs.writeFileSync(path.join(app, "proxy.js"), "export function proxy() {}");
  fs.writeFileSync(path.join(app, "middleware.js"), "export function middleware() {}");

  await expect(loadNextProject(app, installed)).rejects.toThrow(
    "the app has both proxy.js and middleware.js. Next.js takes one of them.",
  );
});

test("resolves a URL with a trailing slash to its route when next.config asks for the slash", async () => {
  const app = appWith(["layout.js", "page.js", "notes/page.js", "notes/[id]/page.js"], {
    trailingSlash: true,
  });
  const { routing } = await loadNextProject(app, installed);

  // Next redirects to the URL with the slash.
  expect(await resolve(routing, "/notes")).toMatchObject({ status: 308, location: "/notes/" });
  expect(await resolve(routing, "/notes/7")).toMatchObject({ status: 308, location: "/notes/7/" });
  // `resolveRoutes()` compares a pathname with the outputs of the build as it
  // is, so an output is there both ways.
  expect(await resolve(routing, "/notes/")).toEqual({ page: "/notes/page" });
  expect(await resolve(routing, "/notes/7/")).toEqual({ page: "/notes/[id]/page" });
  expect(await resolve(routing, "/")).toEqual({ page: "/page" });
});

test("resolves the routes of an app with a base path", async () => {
  const app = appWith(["layout.js", "page.js", "notes/[id]/page.js"], { basePath: "/shop" });
  const { routing } = await loadNextProject(app, installed);

  // The page of `/` is at the base path itself.
  expect(await resolve(routing, "/shop")).toEqual({ page: "/page" });
  expect(await resolve(routing, "/shop/notes/7")).toEqual({ page: "/notes/[id]/page" });
  expect(await resolve(routing, "/notes/7")).toEqual({});
});

test("routes an app as the App Router does, whatever next.config has for the Pages Router or an export", async () => {
  const localized = appWith(["layout.js", "page.js", "notes/page.js"]);
  fs.writeFileSync(
    path.join(localized, "next.config.mjs"),
    `export default {
      i18n: { locales: ["en", "nl"], defaultLocale: "en" },
      redirects: async () => [{ source: "/old", destination: "/notes", permanent: true }],
    };`,
  );
  fs.writeFileSync(
    path.join(localized, "proxy.js"),
    'export function proxy() {}\nexport const config = { matcher: "/notes" };',
  );
  const { routing } = await loadNextProject(localized, installed);

  // No locale in a URL: not looked for, and not added to a redirect or to
  // the matcher of the proxy.
  expect(await resolve(routing, "/notes")).toEqual({ page: "/notes/page" });
  expect(await resolve(routing, "/old")).toMatchObject({ status: 308, location: "/notes" });
  const [matcher] = routing.routes.middlewareMatchers ?? [];
  expect(new RegExp(matcher!.sourceRegex).test("/notes")).toBe(true);

  // Next's build reads the files of an export. The routes are the same.
  const exported = appWith(["layout.js", "page.js", "notes/page.js"], { output: "export" });

  expect(await resolve((await loadNextProject(exported, installed)).routing, "/notes")).toEqual({
    page: "/notes/page",
  });
});

test("resolves a URL to a route with a name that the URL percent-encodes", async () => {
  const app = appWith([
    "layout.js",
    "page.js",
    "日本語/page.js",
    "release notes/page.js",
    "日本語/[id]/page.js",
    "notes/[名前]/page.js",
  ]);
  const { routing, unmatchedRoutes } = await loadNextProject(app, installed);

  // `resolveRoutes()` compares a pathname with the outputs of the build as it
  // is, so an output is there the way a URL has it too.
  expect(await resolve(routing, "/日本語")).toEqual({ page: "/日本語/page" });
  expect(await resolve(routing, "/release notes")).toEqual({ page: "/release notes/page" });
  expect(routing.outputs).toMatchObject({ "/release%20notes": "/release notes/page" });
  // Not a dynamic route: Next's pattern for it has the folder as it is named.
  expect(unmatchedRoutes).toEqual(["/日本語/[id]"]);
  expect(await resolve(routing, "/日本語/7")).toEqual({});
  // The name of a param is in no URL.
  expect(await resolve(routing, "/notes/7")).toEqual({ page: "/notes/[名前]/page" });
});

test("warns about the dynamic routes that @next/routing does not find", async () => {
  const app = appWith(["layout.js", "page.js", "日本語/[id]/page.js"]);
  const plugin = vitestPluginNext().find(({ name }) => name === "vitest-plugin-rsc:next")!;
  const warnOnce = vi.fn();
  await (plugin.config as (config: object) => Promise<unknown>)({ root: app });
  (plugin.configResolved as (config: object) => void)({ logger: { warnOnce } });

  expect(warnOnce).toHaveBeenCalledWith(
    "vitest-plugin-rsc: @next/routing does not find a dynamic route under a folder with a name " +
      "that a URL percent-encodes. These routes get the not-found page: /日本語/[id]",
  );
});

test("needs @next/routing, at the version of next", async () => {
  const missing = nextWith({ "@next/routing/package.json": new Error("Cannot find module") });

  await expect(loadNextProject(root, missing)).rejects.toThrow(
    `Install it at the version of next: @next/routing@${version}.`,
  );

  const other = nextWith({ "@next/routing/package.json": { version: "16.2.0" } });

  await expect(loadNextProject(root, other)).rejects.toThrow(
    `found @next/routing@16.2.0 next to next@${version}. Install @next/routing@${version}.`,
  );
});

test("needs Next's build to hand an adapter the routes without a build on disk", async () => {
  const silent = nextWith({
    "next/dist/build/adapter/build-complete.js": { handleBuildComplete: async () => {} },
  });

  await expect(loadNextProject(root, silent)).rejects.toThrow(
    changed(
      "`handleBuildComplete()` does not hand an adapter the routes of an app without a build " +
        "on disk (it does not call `onBuildComplete` of the adapter)",
    ),
  );

  const reading = nextWith({
    "next/dist/build/adapter/build-complete.js": {
      handleBuildComplete: async () => {
        throw new Error("ENOENT: no such file or directory, open 'server/app/page.js'");
      },
    },
  });

  await expect(loadNextProject(root, reading)).rejects.toThrow("(ENOENT: no such file");
});

test("needs what Next's build hands an adapter to have the routes and an output for each", async () => {
  type Built = { routing: Record<string, unknown>; outputs: Record<string, unknown[]> };
  const build = installed(
    "next/dist/build/adapter/build-complete.js",
  ) as typeof import("next/dist/build/adapter/build-complete.js");
  // A build that hands the adapter something else than it does now.
  const handing = (change: (built: Built) => Built) =>
    nextWith({
      "next/dist/build/adapter/build-complete.js": {
        handleBuildComplete: async (options: Parameters<typeof build.handleBuildComplete>[0]) => {
          const { __vitest_plugin_rsc_next_adapter__: receivers } = globalThis as unknown as {
            __vitest_plugin_rsc_next_adapter__: Map<string, (built: Built) => void>;
          };
          const receive = receivers.get(options.distDir)!;
          receivers.set(options.distDir, (built) => receive(change(built)));
          await build.handleBuildComplete(options);
        },
      },
    });

  const unphased = handing((built) => ({
    ...built,
    routing: { ...built.routing, fallback: undefined },
  }));

  await expect(loadNextProject(root, unphased)).rejects.toThrow(
    changed("`handleBuildComplete()` hands an adapter no `routing.fallback`"),
  );

  const empty = handing((built) => ({ ...built, outputs: { ...built.outputs, appPages: [] } }));

  await expect(loadNextProject(root, empty)).rejects.toThrow(
    /`handleBuildComplete\(\)` has no output for \/.*\/page\./,
  );
});

test("needs the routes of the app to resolve with what Next's build hands an adapter", async () => {
  const { resolveRoutes } = installed("@next/routing") as typeof import("@next/routing");
  // A `resolveRoutes()` that no longer knows the routes it is given.
  const next = nextWith({
    "@next/routing": {
      resolveRoutes: (params: Parameters<typeof resolveRoutes>[0]) =>
        resolveRoutes({ ...params, routes: { ...params.routes, dynamicRoutes: [] } }),
    },
  });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed(
      `\`resolveRoutes()\` of @next/routing@${version} does not find /api/echo/[...path] in the ` +
        "routes that `handleBuildComplete()` hands an adapter",
    ),
  );
});

test("needs the middleware template to load its modules with the `require` of Next's bundler", async () => {
  const next = nextWith({
    "next/dist/build/webpack/loaders/next-middleware-loader.js": {
      default: async () => "export async function handler() {}",
    },
  });
  const project = await loadNextProject(root, next);

  await expect(project.loadMiddlewareEntry()).rejects.toThrow(
    changed("the middleware template has no `/\\brequire\\(/g` to replace"),
  );
});

test("needs Next's build to load the middleware with its middleware loader", async () => {
  const next = nextWith({
    "next/dist/build/entries.js": {
      getEdgeServerEntry: () => ({ import: "next-edge-function-loader?page=%2Fproxy!" }),
    },
  });
  const project = await loadNextProject(root, next);

  await expect(project.loadMiddlewareEntry()).rejects.toThrow(
    changed("`getEdgeServerEntry()` no longer loads the middleware with next-middleware-loader"),
  );
});

test("needs Next's build to have a page for the proxy file", async () => {
  const { createPagesMapping } = installed(
    "next/dist/build/route-discovery.js",
  ) as typeof import("next/dist/build/route-discovery.js");
  const next = nextWith({
    "next/dist/build/route-discovery.js": {
      // Still the pages of the app: not the page of a file next to it.
      createPagesMapping: async (options: Parameters<typeof createPagesMapping>[0]) =>
        options.pagesType === "root" ? {} : createPagesMapping(options),
    },
  });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed(`\`createPagesMapping()\` has no page for ${path.join(root, "proxy.ts")}`),
  );
});

test("stops for a page without a root layout, which Next's loader ends the process for", async () => {
  // Two root layouts in route groups, and a page that is in neither.
  const dir = appWith(["(shop)/layout.tsx", "(shop)/cart/page.tsx", "page.tsx"]);

  await expect(loadNextProject(dir)).rejects.toThrow("app/page.tsx does not have a root layout");
});
