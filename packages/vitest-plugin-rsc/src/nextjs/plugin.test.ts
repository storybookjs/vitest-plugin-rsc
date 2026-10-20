import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizePath,
  resolveConfig,
  type MinimalPluginContextWithoutEnvironment,
  type Plugin,
  type UserConfig,
  type ViteDevServer,
} from "vite";
import { expect, test, vi } from "vitest";
import { vitestPluginRSC } from "../index.ts";
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
  ssr: ["ssr.ts", "cache.ts", "node-server.ts"],
  browser: ["client.tsx"],
} as const;

// The modules of Next that a file imports to run, not only for their types.
function nextImportsOf(file: string): string[] {
  const code = fs.readFileSync(path.join(here, file), "utf8");
  return [
    ...code.matchAll(/^import (?!type\b)[^;]*?from "(next\/[^"]+)";/gms),
    ...code.matchAll(/\bimport\("(next\/[^"]+)"\)/g),
  ].map((match) => match[1]!);
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

  for (const [layer, files] of Object.entries(runtimeFiles)) {
    const imported = files.flatMap(nextImportsOf);
    expect(imported.length).toBeGreaterThan(0);
    // A new import is to be listed in `runtimeImports` of plugin.ts.
    expect(deps[layer as keyof typeof runtimeFiles].include).toEqual(
      expect.arrayContaining(imported.map(preBundledAs)),
    );
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
    logger: { warnOnce: (message: string) => warnings.push(message) },
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
