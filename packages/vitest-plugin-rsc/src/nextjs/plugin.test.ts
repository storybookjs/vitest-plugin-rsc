import fs from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLogger,
  createServer,
  normalizePath,
  resolveConfig,
  type MinimalPluginContextWithoutEnvironment,
  type Plugin,
  type UserConfig,
  type ViteDevServer,
} from "vite";
import { expect, onTestFinished, test, vi } from "vitest";
import { vitestPluginRSC } from "../index.ts";
import { createNodePlatform } from "./node-platform.ts";
import { vitestPluginNext, type VitestPluginNextOptions } from "./plugin.ts";

// The tests load Next projects: longer than Vitest's 5 s on a loaded CI.
vi.setConfig({ testTimeout: 60_000 });

// The `config` hook, as Vite calls it for a dev server or a build.
type ConfigHook<T> = (config: object, env: { command: "serve" | "build" }) => Promise<T>;
const serve = { command: "serve" } as const;

// What the plugin has Vite scan and pre-bundle for the demo, per layer. A
// dependency that is missing here is one Vite finds while a test runs, with a
// cold cache: it pre-bundles again and reloads the page.

const here = fileURLToPath(new URL("./", import.meta.url));
const root = fileURLToPath(new URL("../../../../playground/nextjs-e2e-demo", import.meta.url));
const installed = createRequire(path.join(root, "package.json"));
const nextDir = path.dirname(installed.resolve("next/package.json"));

type OptimizeDeps = { include: string[] };
type Config = { environments: Record<string, { optimizeDeps: OptimizeDeps }> };

// The config loads the project, and Next's config with it: once for the file.
const optimizeDeps = (async () => {
  const plugin = vitestPluginNext().find(({ name }) => name === "vitest-plugin-rsc:next")!;
  const { environments } = await (plugin.config as ConfigHook<Config>)({ root }, serve);
  return {
    rsc: environments.client!.optimizeDeps,
    ssr: environments.next_ssr!.optimizeDeps,
    browser: environments.react_client!.optimizeDeps,
  };
})();

// What the layers scan with a dev server, for a host with this config, and
// the entries that a host like Vitest names on the resolved config: the
// hooks that name the entries, in the order Vite runs them.
async function scanEntries(hostConfig: UserConfig, resolvedEntries?: string[]) {
  const config = await resolveConfig(
    {
      root,
      configFile: false,
      logLevel: "silent",
      ...hostConfig,
      plugins: [vitestPluginRSC(), vitestPluginNext()],
    },
    "serve",
  );
  if (resolvedEntries) config.environments.client!.optimizeDeps.entries = resolvedEntries;
  const server = { config } as ViteDevServer;
  const scans = ["vitest-plugin-rsc:next-scan", "rsc:runner-environment-optimizer:react_client"];
  for (const { name, configureServer } of config.getSortedPlugins("configureServer")) {
    if (!scans.includes(name)) continue;
    const hook = typeof configureServer === "function" ? configureServer : configureServer.handler;
    await hook.call({} as MinimalPluginContextWithoutEnvironment, server);
  }
  return {
    rsc: config.environments.client!.optimizeDeps.entries,
    browser: config.environments.react_client!.optimizeDeps.entries,
  };
}

// Routes load when they are first requested, and so does the proxy, which
// no file of `app/` imports.
const app = [
  normalizePath(path.join(root, "app/**/*.{js,jsx,ts,tsx}")),
  normalizePath(path.join(root, "proxy.ts")),
];

test("has Vite scan the host's pages and the app, for a host that names no entries", async () => {
  // Vite's default, which a config with entries has no more: every HTML file.
  expect(await scanEntries({})).toEqual({
    rsc: ["**/*.html", ...app],
    browser: ["**/*.html", ...app],
  });
  // Or the input of the build, where the config has one.
  const input = { main: "index.html", callout: path.join(root, "callout.html") };
  expect((await scanEntries({ build: { rolldownOptions: { input } } })).rsc).toEqual([
    "index.html",
    normalizePath(path.join(root, "callout.html")),
    ...app,
  ]);
});

test("has Vite scan the entries of a host and the app", async () => {
  const optimizeDeps = { entries: ["src/**/*.demo.tsx"] };
  expect(await scanEntries({ optimizeDeps })).toEqual({
    rsc: ["src/**/*.demo.tsx", ...app],
    browser: ["src/**/*.demo.tsx", ...app],
  });
  // Vitest names its test files and setup files once the config is resolved.
  expect(await scanEntries({}, ["app/page.test.tsx"])).toEqual({
    rsc: ["app/page.test.tsx", ...app],
    browser: ["app/page.test.tsx", ...app],
  });
});

test("pre-bundles every Client Component of Next for the layers that render one", async () => {
  const { rsc, ssr, browser } = await optimizeDeps;

  // A Flight payload names a Client Component of Next by its file. The app
  // imports this one as `next/legacy/image`, which is all the scan finds.
  const legacyImage = "next/dist/esm/client/legacy/image.js";
  expect(ssr.include).toContain(legacyImage);
  expect(browser.include).toContain(legacyImage);
  // The rsc layer has a reference to it, in whatever imports it.
  expect(rsc.include).not.toContain(legacyImage);

  // Every file that the rsc layer makes a client reference of.
  const boundaries = fs
    .readdirSync(path.join(nextDir, "dist/esm"), { recursive: true, encoding: "utf8" })
    .filter((file) => {
      if (!file.endsWith(".js")) return false;
      return /^\s*(["'])use client\1/.test(
        fs.readFileSync(path.join(nextDir, "dist/esm", file), "utf8"),
      );
    })
    .map((file) => `next/dist/esm/${normalizePath(file)}`);
  expect(boundaries.length).toBeGreaterThan(20);
  expect(ssr.include).toEqual(expect.arrayContaining(boundaries));
  expect(browser.include).toEqual(expect.arrayContaining(boundaries));
});

// The modules of this package that run in a layer in the browser and import a
// module of Next: the entry of the layer, and what it imports from here.
const runtimeFiles = {
  ssr: ["ssr.ts", "cache.ts", "node-server.ts", "build-output.ts"],
  browser: ["client.tsx"],
} as const;

// The modules of Next that a file imports to run, not only for their types.
// In a server layer, not one it has a stand-in for, which is no dependency to
// pre-bundle: see node-platform.ts.
const nodePlatform = createNodePlatform("registry", "");
function nextImportsOf(layer: keyof typeof runtimeFiles, file: string): string[] {
  const code = fs.readFileSync(path.join(here, file), "utf8");
  return [
    ...code.matchAll(/^import (?!type\b)[^;]*?from "(next\/[^"]+)";/gms),
    ...code.matchAll(/\bimport\("(next\/[^"]+)"\)/g),
  ]
    .map((match) => match[1]!)
    .filter((specifier) => layer === "browser" || nodePlatform.moduleOf(specifier) === undefined);
}

// The file of Next's ESM build that the plugin pre-bundles for a specifier.
function preBundledAs(specifier: string): string {
  const file = path.relative(nextDir, installed.resolve(specifier));
  // An API of the package, like `next/navigation`, is a file at its root,
  // which Next's aliases point to its file in `dist/api`.
  if (!file.startsWith("dist/")) return `next/dist/esm/api/${normalizePath(file)}`;
  return `next/${normalizePath(file).replace(/^dist\/(?!compiled\/|esm\/)/, "dist/esm/")}`;
}

test("pre-bundles every module of Next that a module of the plugin imports in the browser", async () => {
  const deps = await optimizeDeps;

  for (const [layer, files] of Object.entries(runtimeFiles) as [
    keyof typeof runtimeFiles,
    readonly string[],
  ][]) {
    const imported = files.flatMap((file) => nextImportsOf(layer, file));
    expect(imported.length).toBeGreaterThan(0);
    // A new import is to be listed in `runtimeImports` of plugin.ts.
    expect(deps[layer].include).toEqual(expect.arrayContaining(imported.map(preBundledAs)));
  }
});

// Whoever asks for it: `react`, which the plugin of ../index.ts and a host
// include, is Next's React of the layer, pre-bundled once. See the
// `configEnvironment` hook of plugin.ts.
test("pre-bundles a dependency only under the name its layer resolves it to", async () => {
  // A host that has the layers pre-bundle React: in its config, which reaches
  // the rsc layer, and for every environment, after the `config` hooks. And
  // a module that Next's aliases send to a file of Next.
  const host: Plugin = {
    name: "host",
    config: () => ({
      optimizeDeps: { include: ["react", "react/jsx-runtime", "react-dom/client"] },
    }),
    configEnvironment: () => ({ optimizeDeps: { include: ["react-dom/client", "object-assign"] } }),
  };
  const config = await resolveConfig(
    {
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [vitestPluginRSC(), vitestPluginNext(), host],
    },
    "serve",
  );
  const includeOf = (environment: string) =>
    config.environments[environment]!.optimizeDeps.include ?? [];

  for (const environment of ["client", "next_ssr", "react_client"]) {
    const include = includeOf(environment);
    // Not npm React, nor Vite RSC's Flight codec for it.
    expect(include.filter((name) => /^react(-dom)?(\/|$)|\/vendor\/react-/.test(name))).toEqual([]);
    expect(include).toEqual([...new Set(include)]);
    expect(include).not.toContain("object-assign");
  }
  expect(includeOf("client")).toEqual(
    expect.arrayContaining([
      "next/dist/compiled/react/react.react-server.js",
      "next/dist/compiled/react/jsx-runtime.react-server.js",
      "next/dist/compiled/react-dom/react-dom.react-server.js",
      "next/dist/compiled/react-server-dom-webpack/server.edge.js",
      // Which only the plugin of ../index.ts and the host ask for here.
      "next/dist/compiled/react-dom/client.js",
    ]),
  );
  expect(includeOf("react_client")).toEqual(
    expect.arrayContaining([
      "next/dist/compiled/react/index.js",
      "next/dist/compiled/react/jsx-runtime.js",
      "next/dist/compiled/react-dom/client.js",
      "next/dist/compiled/react-server-dom-webpack/client.browser.js",
    ]),
  );
  // What Next's compiler has app code import stays as it was: a package Next
  // depends on, found from Next.
  expect(includeOf("client")).toContain("next > styled-jsx/style");
});

// An app of its own, next to the demo so that it finds the same Next, with
// the files it is given, by their path from its root.
function appWith(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(root, ".app-"));
  onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [file, code] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), code);
  }
  return dir;
}

// What Vite's dependency scan of each layer finds, on a dev server with a
// cache of its own, and what it logs as an error: a scan that fails is
// dropped as a whole, and the layer finds its dependencies as a test runs.
async function scanOf(app: string) {
  const errors: string[] = [];
  const logger = createLogger("silent");
  logger.error = (message) => void errors.push(message);
  // Not in the app: the optimizer goes on to bundle what the scan found, and
  // can still write when the server has closed.
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-scan-"));
  const server = await createServer({
    root: app,
    configFile: false,
    customLogger: logger,
    cacheDir,
    server: { middlewareMode: true, ws: false },
    plugins: [vitestPluginRSC(), vitestPluginNext({ host: { files: ["**/*.test.tsx"] } })],
  });
  onTestFinished(async () => {
    await server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });
  const found = async (environment: string) => {
    const { depsOptimizer } = server.environments[environment]!;
    await depsOptimizer!.init();
    await depsOptimizer!.scanProcessing;
    return Object.keys(depsOptimizer!.metadata.discovered);
  };
  const [rsc, ssr, browser] = await Promise.all(["client", "next_ssr", "react_client"].map(found));
  return { rsc: rsc!, ssr: ssr!, browser: browser!, errors };
}

test("has the scan of each layer read the app's code as Next's compiler gives it to the layer", async () => {
  const app = appWith({
    "next.config.mjs": "export default {};",
    "app/layout.js": "export default ({ children }) => children;",
    "app/page.js": 'import Styled from "./styled";\nexport default () => <Styled />;',
    // The app has no `styled-jsx` of its own: Next has. Next's compiler takes
    // the import of `styled-jsx/css` out, and has `<style jsx>` import
    // `styled-jsx/style`.
    "app/styled.js": [
      '"use client";',
      'import css from "styled-jsx/css";',
      "const button = css`button { color: hotpink; }`;",
      "export default () => <style jsx>{button}</style>;",
    ].join("\n"),
  });

  const { ssr, browser, errors } = await scanOf(app);

  expect(errors.join("\n")).not.toContain("Failed to run dependency scan");
  for (const found of [ssr, browser]) {
    expect(found).toContain("styled-jsx/style");
    expect(found).not.toContain("styled-jsx/css");
  }
});

test("has the scan of a layer read a module that Next's compiler stops at in the layer as it is", async () => {
  const app = appWith({
    "next.config.mjs": "export default {};",
    "app/layout.js": "export default ({ children }) => children;",
    // Server Components, which Next's compiler does not take in the ssr and
    // browser layers: they use `next/headers`. The scans of all three
    // layers start at every file of `app/`. Of this one the compiler's
    // error is what the module throws.
    "app/page.tsx": [
      'import { cookies } from "next/headers";',
      'import { currentRequest } from "request-context";',
      'import Themed from "./themed";',
      "export default async () => <Themed>{currentRequest() ?? (await cookies()).size}</Themed>;",
    ].join("\n"),
    // And this one does not even get that far: JSX in a `.js` file.
    "app/themed.js": [
      'import { cookies } from "next/headers";',
      'import { ThemeProvider } from "next-themes";',
      "export default async ({ children }) =>",
      "  <ThemeProvider key={(await cookies()).size}>{children}</ThemeProvider>;",
    ].join("\n"),
  });

  const { ssr, browser, errors } = await scanOf(app);

  expect(errors.join("\n")).not.toContain("Failed to run dependency scan");
  // `next-themes` is a Client Component, which the page renders.
  for (const found of [ssr, browser]) {
    expect(found).toContain("request-context");
    expect(found).toContain("next-themes");
  }
});

test("has the ssr layer pre-bundle what the cache handlers of next.config import", async () => {
  const app = appWith({
    // One of Next's own, as Next's own tests name it, and one of the app,
    // outside `app/`, which imports a package the app has.
    "next.config.mjs": [
      'import { createRequire } from "node:module";',
      "const require = createRequire(import.meta.url);",
      "export default {",
      '  cacheHandler: require.resolve("./cache-handler.js"),',
      "  cacheHandlers: {",
      '    default: require.resolve("next/dist/server/lib/cache-handlers/default.external"),',
      "  },",
      "};",
    ].join("\n"),
    "cache-handler.js": 'export { ThemeProvider as default } from "next-themes";',
    "app/layout.js": "export default ({ children }) => children;",
    "app/page.js": "export default () => null;",
  });

  const { ssr, errors } = await scanOf(app);

  expect(errors.join("\n")).not.toContain("Failed to run dependency scan");
  expect(ssr).toContain("next/dist/esm/server/lib/cache-handlers/default.external.js");
  expect(ssr).toContain("next-themes");
});

test("has the rsc layer pre-bundle what the module of next/root-params imports", async () => {
  // A root layout under a dynamic segment: `next/root-params` has a `lang()`.
  const app = appWith({
    "next.config.mjs": "export default {};",
    "app/[lang]/layout.js": "export default ({ children }) => children;",
    "app/[lang]/page.js": "export default () => null;",
  });
  const plugin = vitestPluginNext().find(({ name }) => name === "vitest-plugin-rsc:next")!;
  const { environments } = await (plugin.config as ConfigHook<Config>)({ root: app }, serve);

  expect(environments.client!.optimizeDeps.include).toContain(
    "next/dist/esm/server/request/root-params.js",
  );
});

test("gives Next's module for the asset prefix of its dev server no prefix: there is no dev server", async () => {
  const plugins = vitestPluginNext();
  const plugin = plugins.find(({ name }) => name === "vitest-plugin-rsc:next")!;
  await (plugin.config as ConfigHook<Config>)({ root }, serve);
  const resolver = plugins.find(({ name }) => name === "vitest-plugin-rsc:next-resolve:browser")!;
  const resolveId = resolver.resolveId as (
    this: object,
    source: string,
    importer: string,
    options: object,
  ) => Promise<string | { id: string }>;
  const load = resolver.load as (this: object, id: string) => string | undefined;
  // What Vite finds for an import that is not a shim.
  const context = { resolve: async (source: string) => ({ id: source }) };
  const shimOf = async (source: string, importer: string) => {
    const resolved = await resolveId.call(context, source, importer, {});
    return typeof resolved === "string" ? load.call(context, resolved) : undefined;
  };
  const shim = 'export const assetPrefix = "";\n';
  const app = path.join(nextDir, "dist/esm/client/dev/hot-reloader/app");
  const bootstrap = path.join(nextDir, "dist/esm/client/app-bootstrap.js");

  // Next 16.5 imports it from its WebSocket module, and its entry requires it.
  // The module reads `document.currentScript`, which is null when Next's
  // router first imports it, on a navigation. The dependency optimizer names
  // a file by its path, and Next's CommonJS build has it too.
  for (const [source, importer] of [
    ["./asset-prefix", path.join(app, "web-socket.js")],
    ["./asset-prefix.js", path.join(app, "web-socket.js")],
    ["./dev/hot-reloader/app/asset-prefix", bootstrap],
    [path.join(app, "asset-prefix.js"), bootstrap],
    ["next/dist/client/dev/hot-reloader/app/asset-prefix", bootstrap],
    ["next/dist/esm/client/dev/hot-reloader/app/asset-prefix.js", bootstrap],
  ] as const) {
    expect(await shimOf(source, importer), source).toBe(shim);
  }
  // The asset prefix of the app's assets is Next's own.
  expect(await shimOf("./asset-prefix", bootstrap)).toBeUndefined();
});

// In a build, Vite RSC keys a client reference of a package by the bare
// specifier it last saw resolve to the file. An import of Next by a bare
// specifier gets the file, without a second resolution of the specifier the
// layer sends it to. A relative import between Next's files is resolved by
// that specifier, which Vite RSC keys the file by.
test("resolves a bare import of Next to its file in a build", async () => {
  const plugins = vitestPluginNext();
  const plugin = plugins.find(({ name }) => name === "vitest-plugin-rsc:next")!;
  await (plugin.config as ConfigHook<Config>)({ root }, { command: "build" });
  const resolver = plugins.find(({ name }) => name === "vitest-plugin-rsc:next-resolve:rsc")!;
  const resolveId = resolver.resolveId as (
    this: object,
    source: string,
    importer: string,
    options: object,
  ) => Promise<unknown>;
  const resolved: unknown[][] = [];
  const contextOf = (environment?: { mode: string }) => ({
    environment,
    resolve: async (...args: unknown[]) => {
      resolved.push(args);
      return { id: args[0] };
    },
  });
  const resolve = (source: string, importer: string, mode: string | null = "build") => {
    resolved.length = 0;
    const environment = mode === null ? undefined : { mode };
    return resolveId.call(contextOf(environment), source, importer, {});
  };
  const fromRoot = path.join(root, "package.json");
  const page = path.join(root, "app/page.tsx");

  // What a route entry imports.
  const globalError = "dist/esm/client/components/builtin/global-error.js";
  const source = "next/dist/client/components/builtin/global-error.js";
  expect(await resolve(source, page)).toBe(normalizePath(path.join(nextDir, globalError)));
  expect(resolved).toEqual([]);

  // What Next's ESM files import, here the layout router of a page's tree.
  const layoutRouter = "next/dist/esm/client/components/layout-router.js";
  const entryBase = path.join(nextDir, "dist/esm/server/app-render/entry-base.js");
  expect(await resolve("../../client/components/layout-router", entryBase)).toEqual({
    id: layoutRouter,
  });
  expect(resolved).toEqual([[layoutRouter, fromRoot, { skipSelf: true }]]);

  // A file of a package in `next/dist/compiled`, whose `package.json` Vite reads.
  const reactDom = "next/dist/compiled/react-dom/react-dom.react-server.js";
  expect(await resolve("react-dom", page)).toEqual({ id: reactDom });
  expect(resolved).toEqual([[reactDom, fromRoot, { skipSelf: true }]]);

  // A dev server maps a bare specifier to the pre-bundled dependency, and so
  // does the dependency optimizer, which runs the plugin without an environment.
  const commonJs = `next/${globalError}`;
  expect(await resolve(source, page, "dev")).toEqual({ id: commonJs });
  expect(await resolve(source, page, null)).toEqual({ id: commonJs });
});

// The server layers take Next's alias tables for its edge runtime. In the ssr
// layer `react-dom/server` and `react-dom/static` are the Node.js entries for
// the app's code, its files and its packages, and the edge table's for Next's
// own files (project/layers.ts): a Client Component that calls
// `renderToStaticMarkup()` renders on the server too, which the edge table's
// entry has not, and Next's renderer, on web streams here, keeps the entries
// it is written against.
test("gives a Client Component React's server entries for Node.js in the ssr layer", async () => {
  const plugins = vitestPluginNext();
  const plugin = plugins.find(({ name }) => name === "vitest-plugin-rsc:next")!;
  await (plugin.config as ConfigHook<Config>)({ root }, { command: "build" });
  const page = path.join(root, "app/page.tsx");
  // `null` for none.
  const resolveIn = async (layer: string, source: string, importer: string | null = page) => {
    const resolver = plugins.find(
      ({ name }) => name === `vitest-plugin-rsc:next-resolve:${layer}`,
    )!;
    const resolveId = resolver.resolveId as (
      this: object,
      source: string,
      importer: string | undefined,
      options: object,
    ) => Promise<unknown>;
    const context = {
      environment: { mode: "build" },
      resolve: async (id: string) => ({ id }),
    };
    return resolveId.call(context, source, importer ?? undefined, {});
  };
  const reactDom = "next/dist/compiled/react-dom";
  // The build of the `build` option, a production one for a build.
  const edgeRenderer = {
    id: expect.stringMatching(
      new RegExp(`^${reactDom}/cjs/react-dom-server\\.edge\\.(development|production)\\.js$`),
    ),
  };
  const nodeEntries = {
    server: `${reactDom}/server.node.js`,
    static: `${reactDom}/static.node.js`,
  };

  // A file of the app, and one of a package, which may re-export it.
  for (const importer of [page, path.join(root, "node_modules/some-package/index.js")]) {
    expect(await resolveIn("ssr", "react-dom/server", importer)).toEqual({
      id: nodeEntries.server,
    });
    expect(await resolveIn("ssr", "react-dom/static", importer)).toEqual({
      id: nodeEntries.static,
    });
  }
  // Next's renderer for web streams, which the plugin runs.
  const streamOps = path.join(nextDir, "dist/esm/server/app-render/stream-ops.web.js");
  expect(await resolveIn("ssr", "react-dom/server", streamOps)).toEqual(edgeRenderer);
  expect(await resolveIn("ssr", "react-dom/static", streamOps)).toEqual({
    id: `${reactDom}/static.edge.js`,
  });
  // Without an importer, as for an entry of the optimizer: Next's.
  expect(await resolveIn("ssr", "react-dom/server", null)).toEqual(edgeRenderer);
  // What Next's own files import by name, for any importer.
  expect(await resolveIn("ssr", "react-dom/server.edge")).toEqual(edgeRenderer);
  expect(await resolveIn("browser", "react-dom/server")).toEqual({
    id: `${reactDom}/server.browser.js`,
  });
  // Not `react-dom/static`: Next's table sends it to `static.browser`, a
  // file its React does not have.
  // A Server Component is not to render: Next's modules, as in Next.
  expect(await resolveIn("rsc", "react-dom/server")).toEqual(edgeRenderer);
  expect(await resolveIn("rsc", "react-dom/static")).toEqual({ id: `${reactDom}/static.edge.js` });
});

// What the plugin makes of a Vitest config, and says of it when a run starts.
async function configure(config: Record<string, unknown>) {
  const plugin = vitestPluginNext().find(({ name }) => name === "vitest-plugin-rsc:next")!;
  const input = { root, ...config } as {
    test?: { browser?: { testerHtmlPath?: string } };
  };
  const result = (await (plugin.config as ConfigHook<unknown>)(input, serve)) as {
    css: { postcss?: unknown; modules?: unknown };
  };
  const warnings: string[] = [];
  (plugin.configResolved as (config: object) => void)({
    logger: { warnOnce: (message: string) => warnings.push(message), info: () => {} },
  });
  return { css: result.css, testerHtmlPath: input.test?.browser?.testerHtmlPath, warnings };
}

test("runs the tests in a page of its own, without Vitest's reset, unless the project has one", async () => {
  expect((await configure({})).testerHtmlPath).toBe(path.join(here, "tester.html"));
  expect(fs.existsSync(path.join(here, "tester.html"))).toBe(true);

  const own = await configure({ test: { browser: { testerHtmlPath: "own.html" } } });
  expect(own.testerHtmlPath).toBe("own.html");
});

test("compiles CSS with Next's rules, and says so where the Vitest config has its own", async () => {
  const next = await configure({});
  expect(next.css.postcss).toBeDefined();
  expect(next.css.modules).toBeDefined();
  expect(next.warnings.filter((warning) => warning.includes("`css"))).toEqual([]);

  // `false` turns CSS modules off, and stays so.
  const off = await configure({ css: { modules: false } });
  expect(off.css.modules).toBeUndefined();
  expect(off.warnings).toContain(
    "vitest-plugin-rsc: `css.modules` of the Vitest config names the classes of a CSS module, " +
      "not Next's rule.",
  );

  const lightningcss = await configure({ css: { transformer: "lightningcss" } });
  expect(lightningcss.css.postcss).toBeUndefined();
  expect(lightningcss.css.modules).toBeUndefined();
  expect(lightningcss.warnings.join("\n")).toContain("compiles the CSS with Lightning CSS");
});

// What the `config` hook makes of the `build` option for a command: the
// NODE_ENV of the layers in a static build, and JSX compiled for production.
async function buildOf(options: VitestPluginNextOptions, command: "serve" | "build") {
  const plugin = vitestPluginNext(options).find(({ name }) => name === "vitest-plugin-rsc:next")!;
  type BuildConfig = {
    oxc?: { jsx?: { development?: boolean } };
    environments: Record<string, { define?: Record<string, string> }>;
  };
  const config = await (plugin.config as ConfigHook<BuildConfig>)({ root }, { command });
  const nodeEnvs = new Set(
    ["client", "next_ssr", "react_client"].map(
      (name) => config.environments[name]!.define?.["process.env.NODE_ENV"],
    ),
  );
  // The same in every layer.
  expect(nodeEnvs.size).toBe(1);
  return { jsxDevelopment: config.oxc?.jsx?.development, nodeEnv: [...nodeEnvs][0] };
}

// Four `config` hooks, each of which loads the Next project.
test("runs Next's development code in a test run, and builds its production code", async () => {
  expect(await buildOf({}, "serve")).toEqual({ jsxDevelopment: undefined, nodeEnv: undefined });
  expect(await buildOf({}, "build")).toEqual({ jsxDevelopment: false, nodeEnv: '"production"' });

  // Unless the option says otherwise.
  expect(await buildOf({ build: "production" }, "serve")).toEqual({
    jsxDevelopment: false,
    nodeEnv: undefined,
  });
  expect(await buildOf({ build: "development" }, "build")).toEqual({
    jsxDevelopment: undefined,
    nodeEnv: '"development"',
  });
});

test("takes no other build", () => {
  expect(() => vitestPluginNext({ build: "test" as never })).toThrow(
    '`build` is "development" or "production", not "test".',
  );
});

test("gives the server layers the package's module of Node.js, after Next's aliases and the bridges", async () => {
  const plugins = vitestPluginNext();
  const plugin = plugins.find(({ name }) => name === "vitest-plugin-rsc:next")!;
  await (plugin.config as ConfigHook<Config>)({ root }, serve);
  type Resolved = string | { id: string } | undefined;
  const resolverOf = (layer: string) => {
    const resolver = plugins.find(
      ({ name }) => name === `vitest-plugin-rsc:next-resolve:${layer}`,
    )!;
    const resolveId = resolver.resolveId as (
      this: object,
      source: string,
      importer: string | undefined,
      options: object,
    ) => Promise<Resolved>;
    // What Vite finds, by the specifier it was asked for and from where.
    const asked: [string, string][] = [];
    const context = {
      environment: { mode: "dev" },
      resolve: async (source: string, importer: string) => {
        asked.push([source, importer]);
        return { id: source };
      },
    };
    return {
      asked,
      resolve: (source: string, importer?: string) => resolveId.call(context, source, importer, {}),
    };
  };
  const page = path.join(root, "app/page.tsx");

  const ssr = resolverOf("ssr");
  const nodeDir = fileURLToPath(new URL("../../dist/node/", import.meta.url));
  // The file, which Vite is asked for by its path, from the importer: not a
  // dependency by name.
  expect(await ssr.resolve("node:os", page)).toEqual({ id: `${nodeDir}os.js` });
  expect(await ssr.resolve("fs/promises", page)).toEqual({ id: `${nodeDir}fs/promises.js` });
  expect(ssr.asked).toEqual([
    [`${nodeDir}os.js`, page],
    [`${nodeDir}fs/promises.js`, page],
  ]);
  // Also what Next's polyfills and node-platform.ts's stand-ins took before:
  // every module of Node.js is the package's.
  expect(await ssr.resolve("node:path", page)).toEqual({ id: `${nodeDir}path.js` });
  expect(await ssr.resolve("node:stream", page)).toEqual({ id: `${nodeDir}stream.js` });
  expect(await ssr.resolve("buffer", page)).toEqual({ id: `${nodeDir}buffer.js` });
  expect(await ssr.resolve("node:timers/promises", page)).toEqual({
    id: `${nodeDir}timers/promises.js`,
  });
  // Also `url` by its bare name, which Next aliases for its edge runtime.
  expect(await ssr.resolve("url", page)).toEqual({ id: `${nodeDir}url.js` });

  // Not for the browser layer, which gets the four modules Next's edge
  // runtime has, from Next's polyfills, and nothing for the rest.
  const browser = resolverOf("browser");
  expect(await browser.resolve("node:os", page)).toBeUndefined();
  expect(await browser.resolve("node:buffer", page)).toEqual({
    id: "next/dist/compiled/buffer/index.js",
  });

  // A dependency whose `browser` field says it uses nothing for the module
  // gets the module of nothing, whose default export is an empty object.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "browser-field-"));
  try {
    const pkg = path.join(dir, "node_modules", "some-db");
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify({ browser: { fs: false } }));
    const importer = path.join(pkg, "index.js");
    const empty = await ssr.resolve("fs", importer);
    expect(empty).toBe("\0vitest-plugin-rsc/next-empty");
    const load = plugins.find(({ name }) => name === "vitest-plugin-rsc:next-resolve:ssr")!
      .load as (this: object, id: string) => string | undefined;
    expect(load.call({}, empty as string)).toContain("export default empty;");
    expect(await ssr.resolve("node:fs", importer)).toEqual({ id: `${nodeDir}fs.js` });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("gives the rsc layer the ssr layer's contexts for Next's shared-runtime modules, as Next's build for Node.js does", async () => {
  const plugins = vitestPluginNext();
  const plugin = plugins.find(({ name }) => name === "vitest-plugin-rsc:next")!;
  await (plugin.config as ConfigHook<Config>)({ root }, serve);
  const resolverOf = (layer: string) => {
    const resolver = plugins.find(
      ({ name }) => name === `vitest-plugin-rsc:next-resolve:${layer}`,
    )!;
    const context = {
      environment: { mode: "dev" },
      resolve: async (source: string) => ({ id: source }),
    };
    return {
      resolve: (source: string, importer: string) =>
        (resolver.resolveId as (...args: unknown[]) => Promise<unknown>).call(
          context,
          source,
          importer,
          {},
        ),
      load: (id: string) => (resolver.load as (id: string) => string | undefined).call({}, id),
    };
  };
  // `next/router` imports the context of the Pages Router, which React's
  // server build cannot make: Next's module rule sends the import to the
  // context of the one bundle of its server, `module.compiled`.
  const router = path.join(nextDir, "dist/esm/client/router.js");
  const contexts = "next/dist/esm/server/route-modules/app-page/vendored/contexts";
  const rsc = resolverOf("rsc");
  expect(await rsc.resolve("../shared/lib/router-context.shared-runtime", router)).toEqual({
    id: `${contexts}/router-context.js`,
  });
  expect(await rsc.resolve("../shared/lib/app-router-context.shared-runtime", router)).toEqual({
    id: `${contexts}/app-router-context.js`,
  });
  // That file reads the context off `module.compiled`: in the rsc layer the
  // bridge to the ssr layer's route module, which has the contexts too.
  const bridge = await rsc.resolve(
    "../../module.compiled",
    path.join(nextDir, contexts.slice("next/".length), "router-context.js"),
  );
  expect(bridge).toBe("\0vitest-plugin-rsc/next-bridge/ssr-app-page-module");
  expect(rsc.load(bridge as string)).toContain("ssr.vendored.contexts");
  // The ssr layer loads the route module, whose `contexts/entrypoints`
  // imports the files: it keeps them.
  const ssr = resolverOf("ssr");
  expect(await ssr.resolve("../shared/lib/router-context.shared-runtime", router)).toEqual({
    id: "next/dist/esm/shared/lib/router-context.shared-runtime.js",
  });
});

test("gives the package's modules of Node.js each other, not a polyfill of Next to pre-bundle", async () => {
  const plugins = vitestPluginNext();
  const plugin = plugins.find(({ name }) => name === "vitest-plugin-rsc:next")!;
  await (plugin.config as ConfigHook<Config>)({ root }, serve);
  const resolver = plugins.find(({ name }) => name === "vitest-plugin-rsc:next-resolve:ssr")!;
  const resolveId = resolver.resolveId as (
    this: object,
    source: string,
    importer: string,
    options: object,
  ) => Promise<unknown>;
  const asked: string[] = [];
  const context = {
    resolve: async (source: string) => {
      asked.push(source);
      return { id: source };
    },
  };

  // What a file of dist/node has in it, and imports of Node.js: the package's
  // own source, and what the build bundles into it: memfs, unenv and
  // readable-stream.
  const ownRequire = createRequire(import.meta.url);
  const dirs = [
    fileURLToPath(new URL("../../dist/node/", import.meta.url)),
    path.join(path.dirname(ownRequire.resolve("unenv/package.json")), "dist/runtime"),
    ...["memfs", "@jsonjoy.com/fs-node", "@jsonjoy.com/fs-core", "@jsonjoy.com/fs-node-utils"].map(
      (name) => path.join(path.dirname(ownRequire.resolve(`${name}/package.json`)), "lib"),
    ),
    path.join(path.dirname(ownRequire.resolve("readable-stream/package.json")), "lib"),
  ];
  const specifiers = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(m?js|ts)$/.test(entry.name)) {
        for (const match of fs
          .readFileSync(file, "utf8")
          .matchAll(/(?:\bfrom\s*|\brequire\s*\(\s*)["']((?:node:)?[a-z_]+(?:\/[a-z_]+)?)["']/g)) {
          if (isBuiltin(match[1]!)) specifiers.add(match[1]!);
        }
      }
    }
  };
  for (const dir of dirs) walk(dir);
  expect(specifiers.size).toBeGreaterThan(10);

  // What each of them gets when one of the package's modules imports it: the
  // package's file for it. Never Next's polyfill, which is CommonJS that a
  // layer would have to pre-bundle. Only the package's own `async_hooks`,
  // which ../index.ts aliases, is left to Vite: the built files import none
  // (node-modules.test.ts), they have unenv's in them.
  const nodeDir = fileURLToPath(new URL("../../dist/node/", import.meta.url));
  const importer = path.join(nodeDir, "fs.js");
  const leftToVite = new Set<string>();
  for (const source of specifiers) {
    asked.length = 0;
    const resolved = await resolveId.call(context, source, importer, {});
    expect(
      asked.filter((target) => target.startsWith("next/")),
      source,
    ).toEqual([]);
    if (typeof resolved === "string") expect(resolved.startsWith(nodeDir), source).toBe(true);
    else leftToVite.add(source.replace(/^node:/, ""));
  }
  expect([...leftToVite]).toEqual(["async_hooks"]);
});
