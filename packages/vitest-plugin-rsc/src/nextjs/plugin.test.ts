import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePath, type Plugin } from "vite";
import { expect, test, vi } from "vitest";
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

type OptimizeDeps = {
  entries?: string[];
  include: string[];
  rolldownOptions: { plugins: Plugin[] };
};
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

test("has Vite scan the proxy of the app, next to its routes", async () => {
  const { rsc } = await optimizeDeps;

  // No file of `app/` imports the proxy, so the scan of `app/` does not find
  // what only the proxy imports.
  expect(rsc.entries).toEqual([
    normalizePath(path.join(root, "app/**/*.{js,jsx,ts,tsx}")),
    normalizePath(path.join(root, "proxy.ts")),
  ]);
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

// Next's own files with "use client" are pre-bundled, where Vite RSC's
// transform does not run: the plugin makes their client references itself.
test("gives each export of a Client Component of Next the proxy that renders it in the host", async () => {
  const { rsc } = await optimizeDeps;
  const boundary = rsc.rolldownOptions.plugins.find(
    ({ name }) => name === "vitest-plugin-rsc:next-client-boundary",
  )!;
  const transform = boundary.transform as (code: string, id: string) => Promise<{ code: string }>;
  const file = path.join(nextDir, "dist/esm/client/app-dir/link.js");

  const { code } = await transform(fs.readFileSync(file, "utf8"), file);

  const key = JSON.stringify("/@id/next/dist/esm/client/app-dir/link.js");
  for (const name of ["default", "useLinkStatus"]) {
    const reference = `$$clientProxy(${key}, "${name}"), ${key}, "${name}")`;
    expect(code).toContain(`registerClientReference(${reference}`);
  }
  expect(code.match(/registerClientReference\(/g)).toHaveLength(2);
  expect(code).toMatch(
    /^import \{ clientProxy as \$\$clientProxy \} from ".*\/client-proxy\.ts";$/m,
  );
});

// The rsc layer of a build, as Vite RSC describes the client reference
// modules it made: a module that did not get the plugin's proxy fails it.
test("fails a build whose rsc layer has a client reference module without the proxy", async () => {
  const proxyPlugin = vitestPluginNext().find(
    ({ name }) => name === "vitest-plugin-rsc:next-client-proxy",
  )!;
  const transform = proxyPlugin.transform as (
    this: object,
    code: string,
    id: string,
  ) => Promise<unknown>;
  const buildEnd = proxyPlugin.buildEnd as (this: object, error?: Error) => void;
  const referenceModule = (key: string) =>
    `import * as $$ReactServer from "react-server";\n` +
    `export const A = $$ReactServer.registerClientReference(() => { throw new Error() }, "${key}", "A");\n`;
  const manager = {
    isScanBuild: false,
    clientReferenceMetaMap: {
      "/app/a.tsx": { referenceKey: "aaa", exportNames: ["A"] },
      "/app/b.tsx": { referenceKey: "bbb", exportNames: ["A"] },
    } as Record<string, object>,
  };
  const config = { plugins: [{ name: "rsc:minimal", api: { manager } }] };
  const context = {
    environment: { name: "client", mode: "build", getTopLevelConfig: () => config },
    // The modules of the build, which a scan before it may have had more of.
    getModuleIds: () => ["/app/a.tsx", "/app/b.tsx", "/app/page.tsx"].values(),
    error(error: string | Error) {
      throw typeof error === "string" ? new Error(error) : error;
    },
  };

  await transform.call(context, referenceModule("aaa"), "/app/a.tsx");
  expect(() => buildEnd.call(context)).toThrow(
    "the rsc layer has client reference modules without the proxy that renders them in the " +
      "document of the host: /app/b.tsx.",
  );

  await transform.call(context, referenceModule("bbb"), "/app/b.tsx");
  // One that only the scan had.
  manager.clientReferenceMetaMap["/app/c.tsx"] = { referenceKey: "ccc", exportNames: ["A"] };
  expect(() => buildEnd.call(context)).not.toThrow();
  // The scan of a build keeps only the imports of a module.
  manager.isScanBuild = true;
  delete manager.clientReferenceMetaMap["/app/b.tsx"];
  manager.clientReferenceMetaMap["/app/b.tsx"] = { referenceKey: "bbb", exportNames: ["A"] };
  expect(() => buildEnd.call(context)).not.toThrow();
});
