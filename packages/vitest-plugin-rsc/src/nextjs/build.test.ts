import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, onTestFinished, test, vi } from "vitest";
import { nextBuild, toRunnerModule, withBuiltFiles } from "./build.ts";

// A builder that builds nothing: `nextBuild()` asks Vite for one when a host
// only builds its own environment. And a config file, which it loads for that.
const { createBuilder, loadConfigFromFile } = vi.hoisted(() => ({
  createBuilder: vi.fn(),
  loadConfigFromFile: vi.fn(),
}));
vi.mock("vite", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vite")>()),
  createBuilder,
  loadConfigFromFile,
}));

const names = { rsc: "client", ssr: "next_ssr", browser: "react_client" };
const clientReferences = "\0virtual:vitest-plugin-rsc/next-client-references";

type Bundle = Record<string, object>;
type Hook = (this: unknown, ...args: any[]) => any;
type Warning = { code: string; message: string };

// A hook of the plugin, called the way Vite calls it for an environment.
const call = (hook: unknown, environment: string, ...args: unknown[]) =>
  (typeof hook === "function" ? hook : (hook as { handler: Hook }).handler).call(
    { environment: { name: environment, mode: "build" } },
    ...args,
  ) as unknown;

// The plugin as a build has it, in a project of its own: the config of Vite
// that it asks for, and a builder that says what it was asked to build. A
// build of a layer leaves the bundle of `bundles` for that layer.
function setup(
  bundles: Record<string, Bundle> = {},
  emitted: Record<string, string> = {},
  {
    configFile,
    plugins = [],
    onwarn,
  }: { configFile?: string; plugins?: object[]; onwarn?: (...args: any[]) => void } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "build-"));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  const outDir = path.join(root, "dist");
  const manager = { isScanBuild: false };
  const plugin = nextBuild({
    environments: names,
    entries: { ssr: "vitest-plugin-rsc/nextjs/ssr", browser: "vitest-plugin-rsc/nextjs/client" },
    emittedFiles: () =>
      Object.entries(emitted).map(([pathname, body]) => ({ pathname, body: Buffer.from(body) })),
  });
  const userConfig = { plugins, build: { rolldownOptions: { onwarn } } };
  const config = (plugin.config as Hook)(userConfig, { command: "build" }) as {
    build: { rolldownOptions: { onwarn(warning: Warning, warn: (w: Warning) => void): void } };
    environments: Record<
      string,
      { build: { rolldownOptions: { output: { assetFileNames: string } } } }
    >;
  };
  const layers = Object.fromEntries(
    [names.ssr, names.browser].map((name) => [name, { build: { outDir, emptyOutDir: false } }]),
  );
  (plugin.configResolved as Hook)({
    command: "build",
    mode: "production",
    root,
    configFile,
    inlineConfig: { root, configLoader: "native" },
    plugins: [{ name: "rsc:minimal", api: { manager } }],
    environments: layers,
  });

  const host = { name: names.rsc, config: { build: { outDir } } };
  const builds: { name: string; scan: boolean; outDir: string; stale: boolean }[] = [];
  const builder = {
    config: { root, plugins: [plugin] as object[] },
    environments: {
      [names.rsc]: host,
      [names.ssr]: { name: names.ssr },
      [names.browser]: { name: names.browser },
    },
    async build({ name }: { name: string }) {
      builds.push({
        name,
        scan: manager.isScanBuild,
        outDir: path.relative(root, host.config.build.outDir),
        stale: fs.existsSync(path.join(outDir, "stale.txt")),
      });
      call(plugin.generateBundle, name, {}, bundles[name] ?? {});
    },
  };
  createBuilder.mockResolvedValue(builder);
  const warnings = (warning: Warning) => {
    const shown: Warning[] = [];
    config.build.rolldownOptions.onwarn(warning, (shownWarning) => shown.push(shownWarning));
    return shown;
  };
  return { root, outDir, plugin, config, manager, layers, host, builder, builds, warnings };
}

test("builds the layers in the order that gives every reference its id", async () => {
  const { outDir, plugin, builder, builds } = setup();
  // What an earlier build left: Vite empties the directory before the first
  // build of an environment, which for the host is the one that only looks.
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "stale.txt"), "");

  await (plugin.buildApp as Hook)(builder);

  const scratch = "node_modules/.vitest-plugin-rsc/scan";
  expect(builds).toEqual([
    { name: "client", scan: true, outDir: scratch, stale: true },
    { name: "react_client", scan: true, outDir: scratch, stale: true },
    { name: "client", scan: false, outDir: "dist", stale: false },
    { name: "react_client", scan: false, outDir: "dist", stale: false },
    { name: "next_ssr", scan: false, outDir: "dist", stale: false },
  ]);
});

test("names a file of the ssr layer where the browser layer has it", () => {
  const { config } = setup();

  // The server renders the URL of a file that the browser hydrates.
  const assets = (name: string) => config.environments[name]!.build.rolldownOptions.output;
  expect(assets("next_ssr").assetFileNames).toBe(
    "vitest-plugin-rsc/react_client/assets/[name]-[hash][extname]",
  );
  expect(assets("react_client").assetFileNames).toBe(assets("next_ssr").assetFileNames);
});

test("builds the layers somewhere of their own, whatever directory the host gave them", () => {
  const { root, layers } = setup();

  expect(layers).toEqual({
    next_ssr: {
      build: {
        outDir: path.join(root, "node_modules/.vitest-plugin-rsc/next_ssr"),
        emptyOutDir: true,
      },
    },
    react_client: {
      build: {
        outDir: path.join(root, "node_modules/.vitest-plugin-rsc/react_client"),
        emptyOutDir: true,
      },
    },
  });
});

test("ends a scan as it started, also one that fails", async () => {
  const { outDir, plugin, host, builder, manager } = setup();
  builder.build = async () => {
    throw new Error("The build failed");
  };

  await expect((plugin.buildApp as Hook)(builder)).rejects.toThrow("The build failed");

  expect(manager.isScanBuild).toBe(false);
  expect(host.config.build.outDir).toBe(outDir);
});

test("builds the other layers around the build of a host that only builds its own", async () => {
  const { plugin, builds } = setup();

  // Not for a layer that this plugin builds, and not for a dev server.
  await call(plugin.buildStart, "react_client");
  await (plugin.buildStart as { handler: Hook }).handler.call({
    environment: { name: "client", mode: "dev" },
  });
  expect(builds).toEqual([]);

  await call(plugin.buildStart, "client");
  expect(builds.map(({ name, scan }) => [name, scan])).toEqual([
    ["client", true],
    ["react_client", true],
  ]);

  builds.length = 0;
  await call(plugin.closeBundle, "client");
  expect(builds.map(({ name, scan }) => [name, scan])).toEqual([
    ["react_client", false],
    ["next_ssr", false],
  ]);

  // Once for a build: the layers are not built again without a new start.
  builds.length = 0;
  await call(plugin.closeBundle, "client");
  expect(builds).toEqual([]);
});

test("builds the layers around a build of a config file with the plugins of that build", async () => {
  const own = { name: "own" };
  const { root, plugin, builds } = setup(
    {},
    {},
    { configFile: "/app/vite.config.ts", plugins: [own] },
  );
  // A config file makes new plugins each time it is loaded.
  loadConfigFromFile.mockResolvedValue({
    config: { base: "/site/", plugins: [{ name: "own" }] },
  });

  await call(plugin.buildStart, "client");

  expect(loadConfigFromFile.mock.calls[0]?.slice(0, 2)).toEqual([
    { command: "build", mode: "production", isSsrBuild: false, isPreview: false },
    "/app/vite.config.ts",
  ]);
  expect(createBuilder).toHaveBeenLastCalledWith({
    base: "/site/",
    root,
    configLoader: "native",
    configFile: false,
    plugins: [own],
  });
  expect(builds.map(({ name }) => name)).toEqual(["client", "react_client"]);
});

test("says so when the builder of the layers has plugins of its own, and builds nothing", async () => {
  const { plugin, builder, builds } = setup();
  // It would start the build of the layers again, and again.
  builder.config.plugins = [{ name: "vitest-plugin-rsc:next-build" }];

  await expect(call(plugin.buildStart, "client")).rejects.toThrow(
    "the build of the layers needs a builder with the plugins of the build of the host",
  );
  expect(builds).toEqual([]);
});

test("does not build the layers after a build of the host that failed", async () => {
  const { plugin, builds } = setup();

  await call(plugin.buildStart, "client");
  builds.length = 0;
  call(plugin.buildEnd, "client", new Error("The build failed"));
  await call(plugin.closeBundle, "client");

  expect(builds).toEqual([]);
});

test("writes the layers and what Next's loaders made into the build of the host", async () => {
  const font = "/_next/static/media/font.woff2";
  const { outDir, plugin, builder } = setup(
    {
      react_client: {
        "vitest-plugin-rsc/react_client/entry.js": {
          type: "chunk",
          fileName: "vitest-plugin-rsc/react_client/entry.js",
          code: `import { a } from "./assets/a.js";\nexport const b = a;\n`,
        },
        "vitest-plugin-rsc/react_client/assets/a.css": {
          type: "asset",
          fileName: "vitest-plugin-rsc/react_client/assets/a.css",
          source: withBuiltFiles(`@font-face { src: url(${font}) }`, [font], "css"),
        },
      },
      next_ssr: {
        "vitest-plugin-rsc/next_ssr/entry.js": {
          type: "chunk",
          fileName: "vitest-plugin-rsc/next_ssr/entry.js",
          code: `export const c = 1;\n`,
        },
        // The CSS of a Client Component is the browser layer's to load.
        "vitest-plugin-rsc/react_client/assets/style.css": {
          type: "asset",
          fileName: "vitest-plugin-rsc/react_client/assets/style.css",
          source: "",
        },
        // A file that a module names by its URL, which the server renders.
        "vitest-plugin-rsc/react_client/assets/icon.svg": {
          type: "asset",
          fileName: "vitest-plugin-rsc/react_client/assets/icon.svg",
          source: "<svg/>",
        },
      },
    },
    { [font]: "a font" },
  );

  await (plugin.buildApp as Hook)(builder);

  const files = fs
    .readdirSync(outDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(outDir, path.join(entry.parentPath, entry.name)));
  expect(files.sort()).toEqual([
    "_next/static/media/font.woff2",
    "vitest-plugin-rsc/next_ssr/entry.js",
    "vitest-plugin-rsc/react_client/assets/a.css",
    "vitest-plugin-rsc/react_client/assets/icon.svg",
    "vitest-plugin-rsc/react_client/entry.js",
  ]);
  // A module as a module runner takes it, and CSS that names a file by the
  // way from its own.
  expect(fs.readFileSync(path.join(outDir, "vitest-plugin-rsc/react_client/entry.js"), "utf8")) //
    .toContain(`__vite_ssr_import__("/vitest-plugin-rsc/react_client/assets/a.js"`);
  expect(
    fs.readFileSync(path.join(outDir, "vitest-plugin-rsc/react_client/assets/a.css"), "utf8"),
  ).toBe("@font-face { src: url(../../../_next/static/media/font.woff2) }");
});

test("leaves the bundle of a build that only looks", () => {
  const { plugin, manager } = setup();
  const css = { type: "asset", fileName: "assets/a.css", source: "//vitest-plugin-rsc-build-dir/" };

  manager.isScanBuild = true;
  call(plugin.generateBundle, "client", {}, { "assets/a.css": css });

  expect(css.source).toBe("//vitest-plugin-rsc-build-dir/");
});

test("names a file of the build by the way from the file that asks", () => {
  const { plugin } = setup();
  const image = "/_next/static/media/logo.png";
  const code = withBuiltFiles(`export default {"src":"${image}","width":40};`, [image], "js");
  const rendered = (fileName: string) =>
    (call(plugin.renderChunk, "client", code, { fileName }) as { code: string }).code;

  expect(rendered("index.js")).toBe(
    `export default {"src":new URL("./" + "_next/static/media/logo.png", import.meta.url).href,"width":40};`,
  );
  expect(rendered("assets/page.js")).toContain(`new URL("../" + "_next/static/media/logo.png"`);
  expect(rendered("vitest-plugin-rsc/next_ssr/assets/badge.js")).toContain(
    `new URL("../../../" + "_next/static/media/logo.png"`,
  );
  // A chunk that names no file of the build stays as it is.
  expect(call(plugin.renderChunk, "client", "export {};", { fileName: "a.js" })).toBeUndefined();
});

test("tells the page where the layers are from the directory of the build", () => {
  const { plugin } = setup();
  const id = call(plugin.resolveId, "client", "virtual:vitest-plugin-rsc/layers") as string;
  const code = call(plugin.load, "client", id) as string;
  const { code: rendered } = call(plugin.renderChunk, "client", code, {
    fileName: "assets/index.js",
  }) as { code: string };

  expect(rendered).toBe(
    `const directory = new URL("../", import.meta.url).href;\n` +
      `export default {\n` +
      `  "next_ssr": { base: directory, entries: {"vitest-plugin-rsc/nextjs/ssr":"vitest-plugin-rsc/next_ssr/entry.js"} },\n` +
      `  "react_client": { base: directory, entries: {"vitest-plugin-rsc/nextjs/client":"vitest-plugin-rsc/react_client/entry.js"} },\n` +
      `};\n`,
  );
});

test("leaves out an import that a build which only looks cannot find", () => {
  const { manager, warnings } = setup();
  const unresolved = { code: "UNRESOLVED_IMPORT", message: 'Could not resolve "./pages/${name}"' };

  expect(warnings(unresolved)).toEqual([unresolved]);
  manager.isScanBuild = true;
  expect(warnings(unresolved)).toEqual([]);
  // Nothing else is left out of a build that only looks.
  const other = { code: "CIRCULAR_DEPENDENCY", message: "a.js -> b.js -> a.js" };
  expect(warnings(other)).toEqual([other]);
});

test("does not warn about the directives of Vite RSC and of Next", () => {
  const { warnings } = setup();
  const directive = (name: string) => ({
    code: "MODULE_LEVEL_DIRECTIVE",
    message: `The semantics of the module level directive "${name}" may not be preserved`,
  });

  expect(warnings(directive("use client"))).toEqual([]);
  expect(warnings(directive("use server"))).toEqual([]);
  expect(warnings(directive("use turbopack: no side effects"))).toEqual([]);
  expect(warnings(directive("use strict"))).toEqual([directive("use strict")]);
});

test("does not warn about a module that only the lists of references import twice", () => {
  const { warnings } = setup();
  const ineffective = (importers: string) => ({
    code: "INEFFECTIVE_DYNAMIC_IMPORT",
    message:
      `next/dist/esm/client/components/builtin/global-error.js is dynamically imported by ` +
      `${importers} but also statically imported by next/dist/esm/client/components/app-router.js, ` +
      `dynamic import will not move module into another chunk.`,
  });

  expect(warnings(ineffective(clientReferences))).toEqual([]);
  expect(warnings(ineffective("\0virtual:vitest-plugin-rsc/next-server-references"))).toEqual([]);
  // The app imports it that way too: that one is the app's to hear of.
  const ofTheApp = ineffective(`${clientReferences}, app/components/lazy.tsx`);
  expect(warnings(ofTheApp)).toEqual([ofTheApp]);
});

test("rewrites a chunk into what a module runner evaluates", async () => {
  const rewritten = await toRunnerModule({
    fileName: "vitest-plugin-rsc/react_client/assets/page.js",
    code:
      `import { a } from "./a.js";\n` +
      `import { b } from "../entry.js";\n` +
      `export const load = () => import("./lazy.js");\n` +
      `export const page = [a, b];\n`,
  });

  // By the path of the file from the directory of the build, also the import
  // of the entry, which is a directory up.
  expect(rewritten).toContain(`__vite_ssr_import__("/vitest-plugin-rsc/react_client/assets/a.js"`);
  expect(rewritten).toContain(`__vite_ssr_import__("/vitest-plugin-rsc/react_client/entry.js"`);
  expect(rewritten).toContain(
    `__vite_ssr_dynamic_import__("/vitest-plugin-rsc/react_client/assets/lazy.js"`,
  );
  expect(rewritten).not.toContain("__vite_ssr_import_meta__");
});

test("gives a chunk an import.meta.resolve() that answers from its own URL", async () => {
  const rewritten = await toRunnerModule({
    fileName: "vitest-plugin-rsc/react_client/assets/preload-helper.js",
    code: `export const url = (dep) => import.meta.resolve(dep);\n`,
  });
  const meta = { url: "https://site.test/docs/vitest-plugin-rsc/react_client/assets/a.js" } as {
    url: string;
    resolve?: (specifier: string) => string;
  };
  // A runner evaluates a module in a function with these names.
  const exports: Record<string, () => unknown> = {};
  // oxlint-disable-next-line typescript/no-implied-eval, no-new-func
  await new Function(
    "__vite_ssr_import_meta__",
    "__vite_ssr_exportName__",
    `return (async () => { ${rewritten} })()`,
  )(meta, (name: string, get: () => unknown) => void (exports[name] = get));

  const url = exports.url!() as (dep: string) => string;
  expect(url("/docs/vitest-plugin-rsc/react_client/assets/a.css")).toBe(
    "https://site.test/docs/vitest-plugin-rsc/react_client/assets/a.css",
  );
  expect(url("./a.css")).toBe("https://site.test/docs/vitest-plugin-rsc/react_client/assets/a.css");
});

test("names the files that Next's loaders made by where the build is", () => {
  const font = "/_next/static/media/font.woff2";
  const other = "/_next/static/media/other.woff2";

  expect(withBuiltFiles(`src: url(${font}) format("woff2")`, [font, other], "css")).toBe(
    `src: url(//vitest-plugin-rsc-build-dir${font}) format("woff2")`,
  );
  // In JavaScript only where the path is a string of its own.
  expect(withBuiltFiles(`const a = "${font}", b = "${font}?v=1";`, [font], "js")).toBe(
    `const a = new URL(__VITEST_PLUGIN_RSC_BUILD_DIR__ + "_next/static/media/font.woff2", ` +
      `import.meta.url).href, b = "${font}?v=1";`,
  );
});

test("passes a warning that it shows on to the config's own handler", () => {
  const onwarn = vi.fn((warning: Warning, warn: (w: Warning) => void) => {
    if (warning.code !== "THE_CONFIG_HIDES") warn(warning);
  });
  const { warnings } = setup({}, {}, { onwarn });
  const directive = {
    code: "MODULE_LEVEL_DIRECTIVE",
    message:
      'Module level directives cause errors when bundled, "use client" in "a.tsx" was ignored.',
  };
  const hidden = { code: "THE_CONFIG_HIDES", message: "" };
  const shown = { code: "CIRCULAR_DEPENDENCY", message: "a.js -> b.js -> a.js" };

  expect(warnings(directive)).toEqual([]);
  expect(warnings(hidden)).toEqual([]);
  expect(warnings(shown)).toEqual([shown]);
  expect(onwarn.mock.calls.map(([warning]) => warning)).toEqual([hidden, shown]);
});
