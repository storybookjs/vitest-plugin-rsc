import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preprocessCSS, resolveConfig } from "vite";
import { onTestFinished, expect, test, vi } from "vitest";
import { flightBridge } from "./flight.ts";
import { vitestPluginNext } from "./plugin.ts";
import { loadNextProject, type NextRoute } from "./project.ts";

// The `config` hook, as Vite calls it for a dev server.
type ConfigHook<T> = (config: object, env: { command: "serve" | "build" }) => Promise<T>;
const serve = { command: "serve" } as const;

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

test("has the entry of a page import the module of each segment once, not at every request", async () => {
  const project = await loadNextProject(root);
  const { code } = await project.loadRouteEntry(route(project.routes, "/notes/[id]"));

  // Next's loader tree gets each module with a function that it calls for
  // every request: see `loadingOnce()` in project/entries.ts.
  expect(code).toContain("instrumentModuleGetter(__vitest_plugin_rsc_once__(() => import(");
  expect(code).not.toContain("instrumentModuleGetter(() => import(");
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

test("has the test env and env of next.config for the page, and none of it in Next's constants", async () => {
  const app = appWith(["layout.js", "page.js"], {
    env: { PAGE_ENV_OF_CONFIG: "config", PAGE_ENV_URL: "of-the-host" },
  });
  fs.writeFileSync(
    path.join(app, ".env.test"),
    "PAGE_ENV_URL=postgres://test\nNEXT_PUBLIC_PAGE_ENV=hello\n",
  );
  fs.writeFileSync(path.join(app, ".env.local"), "PAGE_ENV_SECRET=local\n");
  process.env.NEXT_PUBLIC_PAGE_ENV_OF_THE_HOST = "host";
  onTestFinished(() => {
    // What the project gave the host's process before its config loaded.
    for (const name of [
      "NEXT_PUBLIC_PAGE_ENV_OF_THE_HOST",
      "PAGE_ENV_URL",
      "NEXT_PUBLIC_PAGE_ENV",
    ]) {
      delete process.env[name];
    }
  });

  const project = await loadNextProject(app, installed);

  expect(project.env).toEqual({
    values: {
      PAGE_ENV_OF_CONFIG: "config",
      PAGE_ENV_URL: "postgres://test",
      NEXT_PUBLIC_PAGE_ENV: "hello",
    },
    files: [".env.test"],
    configNames: ["PAGE_ENV_OF_CONFIG"],
  });
  for (const layer of ["rsc", "ssr", "browser"] as const) {
    const names = Object.keys(project.defines[layer]);
    expect(names.filter((name) => /PAGE_ENV/.test(name))).toEqual([]);
  }
  // The config that the layers get has the page's values of its `env`.
  expect(project.config.env).toEqual({
    PAGE_ENV_OF_CONFIG: "config",
    PAGE_ENV_URL: "postgres://test",
  });
  // Before the config, for the names the host's process did not have.
  expect(process.env.PAGE_ENV_URL).toBe("postgres://test");
  expect(process.env.PAGE_ENV_SECRET).toBeUndefined();
});

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
  expect(route(routes, "/sitemap.xml")).toMatchObject({
    kind: "route",
    page: "/sitemap.xml/route",
  });
});

// An app with metadata files: the image of the demo, and modules for the rest.
function appWithMetadata(files: Record<string, string>): string {
  const app = appWith(["layout.js", "page.js"]);
  const logo = fs.readFileSync(appFile("images/logo.png"));
  fs.writeFileSync(path.join(app, "app", "icon.png"), logo);
  fs.writeFileSync(path.join(app, "app", "favicon.ico"), logo);
  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(app, "app", file)), { recursive: true });
    fs.writeFileSync(path.join(app, "app", file), source);
  }
  return app;
}

// The requests of Next's app loader for its metadata loaders, in an entry.
const metadataRequests = (code: string) =>
  [...code.matchAll(/"(next-metadata-(?:image|route)-loader\?[^"]+)"/g)].map(
    ([, request]) => request!,
  );

test("lists the metadata files of the app as routes, by the paths Next serves them at", async () => {
  const app = appWithMetadata({
    "robots.txt": "User-Agent: *\n",
    "blog/page.js": "export default () => null;",
    "blog/opengraph-image.tsx": "export default () => new Response();",
    "blog/[slug]/icon.tsx": "export default () => new Response();",
  });

  const { routes } = await loadNextProject(app, installed);

  expect(
    routes.filter((candidate) => candidate.kind === "route").map((candidate) => candidate.page),
  ).toEqual([
    "/blog/[slug]/icon/route",
    "/blog/opengraph-image/route",
    "/favicon.ico/route",
    "/icon.png/route",
    "/robots.txt/route",
  ]);
});

test("links the metadata images of a page with Next's metadata image loader", async () => {
  const app = appWithMetadata({
    "opengraph-image.tsx":
      "export const size = { width: 1200, height: 630 };\n" +
      "export const alt = 'A card';\n" +
      "export default () => new Response();\n",
  });
  const project = await loadNextProject(app, installed);
  const entry = await project.loadRouteEntry(route(project.routes, "/"));
  // The root layout and the page of `/` both have the files of `app/`.
  const requests = [...new Set(metadataRequests(entry.code))];
  expect(requests).toHaveLength(3);
  expect(requests.every(project.isMetadataRequest)).toBe(true);

  // A static image: its data, and its URL with the hash of what is in it.
  const icon = requests.find((request) => request.includes("type=icon&"))!;
  const { code, watchFiles } = await project.loadMetadata(icon);
  expect(watchFiles).toEqual([path.join(app, "app", "icon.png")]);
  expect(code).toContain('"type":"image/png","sizes":"40x30"');
  expect(code).toMatch(/url: "\/icon\.png\?[0-9a-f]{16}"/);
  // The favicon, before the other icons.
  expect(requests[0]).toContain("type=favicon");

  // A generated image: its module for what it says of the image, and its URL.
  const openGraph = requests.find((request) => request.includes("type=openGraph"))!;
  const generated = (await project.loadMetadata(openGraph)).code;
  expect(generated).toContain("size as _size");
  expect(generated).toContain("alt as _alt");
  expect(generated).toContain(
    JSON.stringify(path.join(app, "app", "opengraph-image.tsx") + project.metadataImageMeta),
  );
});

test("serves a metadata file with the route of Next's metadata route loader", async () => {
  const app = appWithMetadata({
    "sitemap.ts":
      "export const revalidate = 60;\n" +
      "export default () => [{ url: 'https://example.com' }];\n",
  });
  const project = await loadNextProject(app, installed);
  const routeCode = async (pathname: string) => {
    const entry = await project.loadRouteEntry(route(project.routes, pathname));
    const [request] = metadataRequests(entry.code);
    return (await project.loadMetadata(request!)).code;
  };

  // A static file, with the cache header of `next build`, which is not that
  // of the NODE_ENV of the host.
  const favicon = await routeCode("/favicon.ico");
  expect(favicon).toContain('const contentType = "image/x-icon"');
  expect(favicon).toContain(`'Cache-Control': "public, max-age=0, must-revalidate"`);
  expect(favicon).toContain(fs.readFileSync(appFile("images/logo.png")).toString("base64"));

  // A module: Next's route around it, with the config it exports.
  const sitemap = await routeCode("/sitemap.xml");
  expect(sitemap).toContain("resolveRouteData(data, fileType)");
  expect(sitemap).toContain(
    `export { revalidate } from ${JSON.stringify(path.join(app, "app", "sitemap.ts"))}`,
  );
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

test("makes next/root-params of the params of the root layouts, as Next's build does", async () => {
  const app = appWith(["[lang]/[region]/layout.js", "[lang]/[region]/page.js"]);
  const project = await loadNextProject(app, installed);

  const code = await project.loadRootParams();

  expect(code).toContain("export function lang() { return getRootParam('lang'); }");
  expect(code).toContain("export function region() { return getRootParam('region'); }");
});

test("compiles CSS with the PostCSS plugins of Next, its own for an app without a config", async () => {
  const project = await loadNextProject(appWith(["layout.js", "page.js"]), installed);

  const { options, differences } = await project.loadCssOptions();

  // `postcss-flexbugs-fixes` and `postcss-preset-env`, of Next's own, and the
  // check of the mode of Next for a CSS module.
  const { plugins } = options.postcss as { plugins: { postcssPlugin?: string }[] };
  expect(plugins).toHaveLength(3);
  expect(plugins.at(-1)?.postcssPlugin).toBe("vitest-plugin-rsc:next-css-module-mode");
  expect(differences).toEqual([]);
});

test("leaves a config of PostCSS that Next's webpack build does not read to Vite", async () => {
  // Turbopack reads it, and so does Vite.
  const app = appWith(["layout.js", "page.js"]);
  fs.writeFileSync(path.join(app, "postcss.config.ts"), "export default { plugins: {} };");
  const project = await loadNextProject(app, installed);

  expect((await project.loadCssOptions()).options.postcss).toBeUndefined();
});

test("holds a CSS module to the mode of Next, `pure`, as Next's build does", async () => {
  const app = appWith(["layout.js", "page.js"]);
  const project = await loadNextProject(app, installed);
  const { options } = await project.loadCssOptions();
  // Vite's own pipeline of CSS, in which the check has to see the module
  // before Vite's `postcss-modules` scopes it.
  const config = await resolveConfig({ root: app, configFile: false, css: options }, "serve");
  const compile = (css: string, file: string) => preprocessCSS(css, path.join(app, file), config);

  await expect(compile("body { color: red }", "app/card.module.css?next-linked")).rejects.toThrow(
    /Selector "body" is not pure/,
  );
  await expect(compile(":global(.card) { color: red }", "app/card.module.css")).rejects.toThrow(
    /is not pure/,
  );
  await expect(compile(".card { color: red }", "app/card.module.css")).resolves.toBeDefined();
  // As in Next, a comment lets a module have a global selector.
  await expect(
    compile("/* cssmodules-pure-no-check */\nbody { color: red }", "app/card.module.css"),
  ).resolves.toBeDefined();
  // Global CSS may have any selector.
  await expect(compile("body { color: red }", "app/global.css")).resolves.toBeDefined();
});

test("names a class of a CSS module as Next's build does", async () => {
  const app = appWith(["layout.js", "page.js"]);
  const project = await loadNextProject(app, installed);
  const { modules } = (await project.loadCssOptions()).options;
  const name = (modules as { generateScopedName(name: string, file: string): string })
    .generateScopedName;

  expect(name("card", path.join(app, "app/card.module.css?next-linked"))).toMatch(
    /^card_card__[\w-]{5}$/,
  );
  // `[folder]` of a file at the root of the project is empty.
  expect(name("card", path.join(app, "index.module.css"))).toMatch(/^_card__[\w-]{5}$/);
});

test("says when the CSS is compiled otherwise than by Next", async () => {
  const app = appWith(["layout.js", "page.js"], {
    experimental: { useLightningcss: true, inlineCss: true },
  });
  const project = await loadNextProject(app, installed);

  expect((await project.loadCssOptions()).differences).toEqual([
    "`experimental.useLightningcss` is not supported: the CSS is compiled with PostCSS",
  ]);
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

test("loads a module of Next's build where it is first read, and says there that it does not load", async () => {
  const next = nextWith({
    "next/dist/build/webpack/loaders/next-font-loader/index.js": new Error("Cannot find module"),
  });
  // The project loads without it: nothing has run the font loader yet.
  const project = await loadNextProject(root, next);
  const compiled = await project.compile(
    sourceOf("fonts/fonts.ts"),
    appFile("fonts/fonts.ts"),
    "rsc",
  );
  const [request] = /next\/font\/local\/target\.css\?[^']+(?=')/.exec(compiled!.code)!;

  await expect(project.loadFont(request)).rejects.toThrow(
    changed(
      "next/dist/build/webpack/loaders/next-font-loader/index.js does not load (Cannot find module)",
    ),
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
  expect(code).toMatch(/'layout': \[\w+, "app\/layout\.js"\]/);
  expect(code).toMatch(/'layout': \[\w+, "app\/notes\/layout\.js"\]/);
  expect(code).toMatch(/'loading': \[\w+, "app\/notes\/\[id\]\/loading\.js"\]/);
  expect(code).not.toMatch(/page: \[\w+, "[^"]*page\.js"\]/);
});

// A static build has the tree in its files: they are the same on every
// machine, and the stylesheets of a segment are listed by the same name.
test("names the files of a route from the root of the project, and imports them by their path", async () => {
  const dir = appWith(["layout.js", "notes/[id]/page.js", "api/route.ts"]);
  const project = await loadNextProject(dir);
  const page = await project.loadRouteEntry(route(project.routes, "/notes/[id]"));
  const handler = await project.loadRouteEntry(route(project.routes, "/api"));

  const layout = path.join(dir, "app", "layout.js");
  expect(page.code).toMatch(/'layout': \[\w+, "app\/layout\.js"\]/);
  expect(page.code).toMatch(/page: \[\w+, "app\/notes\/\[id\]\/page\.js"\]/);
  // The absolute path is in the specifiers, and nowhere else.
  expect(page.code).toContain(JSON.stringify(layout));
  for (const { code } of [page, handler]) {
    const specifiers = /\b(?:import|require)\s*\((?:\s*\/\*.*?\*\/)?\s*"[^"]*"\)|\bfrom\s*"[^"]*"/g;
    expect(code.replace(specifiers, "")).not.toContain(dir);
  }
  expect(page.segments).toContainEqual({ file: layout, stylesheetsKey: "app/layout" });
  expect(page.segments).toContainEqual({
    file: path.join(dir, "app", "notes", "[id]", "page.js"),
    stylesheetsKey: "app/notes/[id]/page",
  });
  // Next's errors of a route handler quote its file.
  expect(handler.code).toContain(`resolvedPagePath: "app/api/route.ts"`);
  expect(handler.segments).toEqual([]);
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

test("says which module of Next's server with stores is gone", async () => {
  const file = "next/dist/esm/server/app-render/action-handler.js";
  const next = nextWith({ [file]: new Error("Cannot find module") });

  await expect(loadNextProject(root, next)).rejects.toThrow(changed(`${file} is not there`));
});

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
  // Of the options of the root, not of the import of the function.
  ["client/app-index", "    onCaughtError,\n", "", "has no `onCaughtError` in `reactRootOptions`"],
  [
    "server/lib/implicit-tags",
    "        `/layout`\n    ];",
    "        `/page`\n    ];",
    "has no `const derivedTags = [`/layout`];`",
  ],
  [
    "build/index",
    ".filter((route)=>route.isPrerenderOutput !== false)",
    "",
    "has no `ssgPageRoutes = workerResult.prerenderedRoutes.filter((route)=>route.isPrerenderOutput !== false).map((route)=>route.pathname);`",
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

// Where what the plugin assumes is in the formatting of Next's compiled
// output, another formatting of the same code.
test.for([
  [
    "server/lib/implicit-tags",
    "const derivedTags = [\n        `/layout`\n    ];",
    "const derivedTags = [`/layout`];",
  ],
  [
    "client/app-index",
    "    onRecoverableError,\n    onCaughtError,\n    onUncaughtError\n};",
    "  onRecoverableError, onCaughtError, onUncaughtError };",
  ],
  [
    "build/index",
    ".filter((route)=>route.isPrerenderOutput !== false).map((route)=>route.pathname);",
    "\n  .filter((route) => route.isPrerenderOutput !== false)\n  .map((route) => route.pathname);",
  ],
])(
  "takes another formatting of what the plugin assumes of %s",
  async ([file, piece, replacement]) => {
    const next = nextWith({ [runtime(file!)]: sourceWith(runtime(file!), piece!, replacement!) });

    await expect(loadNextProject(root, next)).resolves.toBeDefined();
  },
);

test("has a stand-in with every export of the modules of Next it replaces", async () => {
  const { newExports } = await loadNextProject(root);

  expect(newExports).toEqual({});
});

test.for([
  ["server/node-environment-extensions/fast-set-immediate.external", "fast-set-immediate"],
  ["server/node-environment-extensions/process-error-handlers", "node-environment"],
  ["server/route-modules/app-page/vendored/ssr/entrypoints", "vendored-react"],
  ["server/route-modules/app-page/module", "ssr-app-page-module"],
])("finds an export of %s for a stub, and does not stop", async ([file, standIn]) => {
  const source = fs.readFileSync(installed.resolve(runtime(file!)), "utf8");
  const next = nextWith({ [runtime(file!)]: `${source}\nexport const addedInNext = 1;\n` });

  const { newExports } = await loadNextProject(root, next);

  expect(newExports).toEqual({ [standIn!]: [{ name: "addedInNext", module: runtime(file!) }] });
});

test("finds an export that two modules of one stand-in have for one stub", async () => {
  const files = ["rsc", "ssr"].map((layer) =>
    runtime(`server/route-modules/app-page/vendored/${layer}/entrypoints`),
  );
  const next = nextWith(
    Object.fromEntries(
      files.map((file) => [
        file,
        `${fs.readFileSync(installed.resolve(file), "utf8")}\nexport const ReactNew = 1;\n`,
      ]),
    ),
  );

  const { newExports } = await loadNextProject(root, next);

  expect(newExports).toEqual({ "vendored-react": [{ name: "ReactNew", module: files[0] }] });
});

test("says which module of Next that a stand-in replaces is gone", async () => {
  const file = runtime("server/load-manifest.external");
  const next = nextWith({ [file]: new Error("Cannot find module") });

  await expect(loadNextProject(root, next)).rejects.toThrow(
    changed(`${file} is not there, which the plugin stands in for`),
  );
});

test.for([
  ["import()", "await require(", "await import("],
  ["a second `require`", "await require(", "require.cache, await require("],
  ["a `require()` of another file", "`${INSTRUMENTATION_HOOK_FILENAME}.js`", "'other.js'"],
])(
  "needs Next to load instrumentation.ts with one `require()`, not with %s",
  async ([, piece, replacement]) => {
    const file = runtime("server/lib/router-utils/instrumentation-globals.external");
    const next = nextWith({ [file]: sourceWith(file, piece!, replacement!) });

    await expect(loadNextProject(root, next)).rejects.toThrow(changed(`${file} has \`require\``));
  },
);

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
  // By its path from the root, as `next build` quotes it: a static build has
  // the module.
  expect(first).toContain(",-[app/page.tsx:1:1]");
  expect(first).not.toContain(root);
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

  const { css, exports, files } = await project.loadFont(request);

  expect(exports).toEqual({
    className: expect.stringMatching(/^__className_\w{6}$/),
    variable: expect.stringMatching(/^__variable_\w{6}$/),
    style: { fontFamily: "'geist', 'geist Fallback'" },
  });
  expect(css).toContain(`.${String(exports.variable)} {--font-geist: 'geist', 'geist Fallback'`);
  const [, url] = /src: url\(([^)]+)\) format\('woff2'\)/.exec(css)!;
  expect(url).toMatch(/^\/_next\/static\/media\/\w+-s\.p\.woff2$/);
  // Its font files, as Next's manifest of fonts lists them.
  expect(files).toEqual([url!.slice("/_next/".length)]);
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
    "/api/plain",
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

test("turns Cached Navigations off, also when next.config turns it on", async () => {
  const app = appWith(["layout.js", "page.js"], {
    cacheComponents: true,
    experimental: { cachedNavigations: true },
  });

  const { config } = await loadNextProject(app, installed);

  expect(config.experimental).toMatchObject({ cachedNavigations: false });
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
  await (plugin.config as ConfigHook<unknown>)({ root: app }, serve);
  (plugin.configResolved as (config: object) => void)({ logger: { warnOnce, info: () => {} } });

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
