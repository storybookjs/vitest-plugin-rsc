import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveConfig } from "vite";
import { ESModulesEvaluator, ModuleRunner, createDefaultImportMeta } from "vite/module-runner";
import { expect, onTestFinished, test, vi } from "vitest";
import { builtUrl, createBuiltLayers, type BuiltLayer } from "./built-layers.ts";
import { nextStaticBuild } from "./nextjs/static-build.ts";
import {
  staticBuild,
  toRunnerModule,
  withBuiltFiles,
  withStaticBuild,
  type StaticBuildLayers,
} from "./static-build.ts";

const names = { rsc: "client", ssr: "next_ssr", browser: "react_client" };
const clientReferences = "\0virtual:vitest-plugin-rsc/client-references";
const hostModules = "\0virtual:vitest-plugin-rsc/host-modules";
const serverReferences = "\0virtual:vitest-plugin-rsc/server-references";

// The layers of `vitestPluginRSC()` on its own, as ../index.ts has them.
const rscLayers: StaticBuildLayers = {
  entries: { react_client: "vitest-plugin-rsc/testing-library-client" },
};
const createPlugin = () =>
  staticBuild({ rsc: names.rsc, browser: names.browser, layers: rscLayers });

// The plugin's module of the rsc layer, and the files of the host, for
// `vitestPluginNext()`.
const rscModule = "/vitest-plugin-rsc/nextjs/rsc.ts";
const isHostFile = (id: string) => id.startsWith("/host/");

// Next's part of the static build, with the files of `emitted`.
const createNextPlugin = (emitted: Record<string, string> = {}) =>
  nextStaticBuild({
    environments: names,
    entries: { ssr: "vitest-plugin-rsc/nextjs/ssr", browser: "vitest-plugin-rsc/nextjs/client" },
    emittedFiles: () =>
      Object.entries(emitted).map(([pathname, body]) => ({ pathname, body: Buffer.from(body) })),
    rscModule,
    isHostFile,
  });

// What `vitestPluginNext()` puts in the config for the static build: its
// layers, and the files of `emitted`.
const nextConfig = (next = createNextPlugin()): object =>
  (next.config as Hook)({}, { command: "build" }) as object;

type Bundle = Record<string, object>;
type Hook = (this: unknown, ...args: any[]) => any;
type Warning = { code: string; message: string; id?: string; ids?: string[]; pos?: number };
type Meta = { referenceKey: string; importId: string };

// A hook of the plugin, called the way Vite calls it for an environment.
const call = (hook: unknown, environment: string, ...args: unknown[]) =>
  (typeof hook === "function" ? hook : (hook as { handler: Hook }).handler).call(
    { environment: { name: environment, mode: "build" } },
    ...args,
  ) as unknown;

// A chunk of the bundle of a layer, and what it imports that is no chunk of
// it, statically and with `import()`: a module of the page, see
// host-module.ts.
const chunk = (
  fileName: string,
  code: string,
  imports: string[] = [],
  dynamicImports: string[] = [],
) => ({ type: "chunk", fileName, code, imports, dynamicImports });
// The URL of a module of the page, which a chunk imports it by.
const hostModule = (specifier: string) => `/@id/__x00__vitest-plugin-rsc/host-module/${specifier}`;

// The plugin as a build has it, in a project of its own: the config of Vite
// that it asks for, and an app builder that says what it was asked to build.
// A build of a layer starts as Vite starts it, and leaves the bundle of
// `bundles` for that layer, with the ids of `graphs` for its module graph.
// The host's build goes to `dist`, as the config has it: relative to the
// root, which is not the directory of the process. With the layers of
// Next.js, and the files of `emitted`, unless `rsc` says it is
// `vitestPluginRSC()` on its own. Served from anywhere, unless `base` says
// where.
function setup(
  bundles: Record<string, Bundle> = {},
  emitted: Record<string, string> = {},
  {
    onwarn,
    rsc = false,
    graphs = {},
    base = "./",
  }: {
    onwarn?: (...args: any[]) => void;
    rsc?: boolean;
    graphs?: Record<string, string[]>;
    base?: string;
  } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "static-build-"));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  const outDir = path.join(root, "dist");
  const manager = {
    isScanBuild: false,
    clientReferenceMetaMap: {} as Record<string, Meta>,
    serverReferences: { metaMap: new Map<string, Meta>() },
  };
  const plugin = createPlugin();
  const next = createNextPlugin(emitted);
  const userConfig = {
    build: { rolldownOptions: { onwarn } },
    ...(!rsc && nextConfig(next)),
  };
  const config = call(plugin.config, names.rsc, userConfig, { command: "build" }) as {
    builder: object;
    build: {
      rolldownOptions: {
        output: object;
        onwarn(warning: Warning, warn: (w: Warning) => void): void;
      };
    };
    environments: Record<
      string,
      {
        build: {
          cssCodeSplit?: boolean;
          rolldownOptions: { input: object; output: { assetFileNames: string } };
        };
      }
    >;
  };
  const runnerLayers = rsc ? [names.browser] : [names.ssr, names.browser];
  const layers = Object.fromEntries(
    runnerLayers.map((name) => [name, { build: { outDir: "dist", emptyOutDir: false } }]),
  );
  const resolved = {
    command: "build",
    root,
    base,
    plugins: [{ name: "rsc:minimal", api: { manager } }, plugin],
    environments: layers,
  };
  (plugin.configResolved as Hook)(resolved);
  if (!rsc) (next.configResolved as Hook)(resolved);

  const environments = Object.fromEntries(
    Object.values(names).map((name) => [
      name,
      { name, config: { build: { outDir: "dist", write: true } } },
    ]),
  );
  const builds: { name: string; scan: boolean; write: boolean }[] = [];
  const builder = {
    config: { root },
    environments,
    async build({ name }: { name: string }) {
      builds.push({
        name,
        scan: manager.isScanBuild,
        write: environments[name]!.config.build.write,
      });
      (plugin.buildStart as Hook).call({ environment: { name, mode: "build" } });
      (plugin.generateBundle as { handler: Hook }).handler.call(
        {
          environment: { name, mode: "build" },
          getModuleIds: () => (graphs[name] ?? []).values(),
        },
        {},
        bundles[name] ?? {},
      );
    },
  };
  const warnings = (warning: Warning) => {
    const shown: Warning[] = [];
    config.build.rolldownOptions.onwarn(warning, (shownWarning) => shown.push(shownWarning));
    return shown;
  };
  return { root, outDir, plugin, next, config, manager, layers, builder, builds, warnings };
}

test("builds the layers in the order that gives every reference its id", async () => {
  const { plugin, builder, builds } = setup();

  await (plugin.buildApp as Hook)(builder);

  // The builds that only look write nothing. So Vite empties the directory
  // of the host's build, and copies `public/` into it, with the next one.
  expect(builds).toEqual([
    { name: "client", scan: true, write: false },
    { name: "react_client", scan: true, write: false },
    { name: "client", scan: false, write: true },
    { name: "react_client", scan: false, write: true },
    { name: "next_ssr", scan: false, write: true },
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

test("has Vite write nothing of the layers: their files come from their bundles", () => {
  const { layers } = setup();

  // Each builds its own entries, and the browser layer the list of its
  // references, which a runner outside a page loads a Client Component from.
  expect(layers).toEqual({
    next_ssr: {
      build: {
        outDir: "dist",
        emptyOutDir: false,
        write: false,
        rolldownOptions: { input: { entry: "vitest-plugin-rsc/nextjs/ssr" } },
      },
    },
    react_client: {
      build: {
        outDir: "dist",
        emptyOutDir: false,
        write: false,
        rolldownOptions: {
          input: {
            entry: "vitest-plugin-rsc/nextjs/client",
            references: "virtual:vitest-plugin-rsc/client-references",
          },
        },
      },
    },
  });
});

test("ends a scan as it started, also one that fails", async () => {
  const { plugin, builder, manager } = setup();
  builder.build = async () => {
    throw new Error("The build failed");
  };

  await expect((plugin.buildApp as Hook)(builder)).rejects.toThrow("The build failed");

  expect(manager.isScanBuild).toBe(false);
  expect(builder.environments.client!.config.build.write).toBe(true);
  expect(builder.environments.react_client!.config.build.write).toBe(true);
  // A build of the host after it is outside `buildApp()` again.
  expect(() =>
    (plugin.buildStart as Hook).call({ environment: { name: "client", mode: "build" } }),
  ).toThrow("outside the plugin's `buildApp()`");
});

test("asks for Vite's app builder, which `vite build` uses", () => {
  const { config } = setup();

  // With a `builder` in the config, `createBuilder(config, null)` makes one.
  expect(config.builder).toEqual({ sharedPlugins: true, sharedConfigBuild: true });
});

test("says to build with the app builder when the host's environment is built outside buildApp()", async () => {
  const { plugin, builder, builds } = setup();
  const buildStart = (name: string, mode: string) =>
    (plugin.buildStart as Hook).call({ environment: { name, mode } });

  // As Vite's `build()` does: the site would have no ssr and browser layer.
  expect(() => buildStart("client", "build")).toThrow(
    "vitest-plugin-rsc: the app is built outside the plugin's `buildApp()`, which builds its " +
      "three layers. Vite's `build()` does that: it builds one environment. Build with Vite's " +
      "app builder: `vite build`, or `await (await createBuilder(config, null)).buildApp()`.",
  );
  // Not for a dev server, and not in `buildApp()`, which builds every layer.
  expect(() => buildStart("client", "dev")).not.toThrow();
  await (plugin.buildApp as Hook)(builder);
  expect(builds.map(({ name }) => name)).toEqual([
    "client",
    "react_client",
    "client",
    "react_client",
    "next_ssr",
  ]);
  // And again after it.
  expect(() => buildStart("client", "build")).toThrow("outside the plugin's `buildApp()`");
});

test("says that a static build cannot watch", () => {
  const config = (userConfig: object, command: string) =>
    call(createPlugin().config, names.rsc, userConfig, { command });

  expect(() => config({ build: { watch: {} } }, "build")).toThrow(
    "vitest-plugin-rsc: a static build of the app cannot watch. Build it again instead of " +
      "`vite build --watch`.",
  );
  expect(() => config({ build: { watch: null } }, "build")).not.toThrow();
  // A dev server is not a build.
  expect(config({ build: { watch: {} } }, "serve")).toBeUndefined();
});

test("writes the layers and what Next's loaders made into the build of the host", async () => {
  const font = "/_next/static/media/font.woff2";
  const { outDir, plugin, builder } = setup(
    {
      react_client: {
        "vitest-plugin-rsc/react_client/entry.js": {
          ...chunk(
            "vitest-plugin-rsc/react_client/entry.js",
            `import { a } from "./assets/a.js";\nexport const b = a;\n`,
          ),
        },
        "vitest-plugin-rsc/react_client/assets/a.css": {
          type: "asset",
          fileName: "vitest-plugin-rsc/react_client/assets/a.css",
          source: withBuiltFiles(`@font-face { src: url(${font}) }`, [font], "css"),
        },
      },
      next_ssr: {
        "vitest-plugin-rsc/next_ssr/entry.js": {
          ...chunk("vitest-plugin-rsc/next_ssr/entry.js", `export const c = 1;\n`),
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

  // The modules of a layer are one file, its other files are files.
  expect(filesOf(outDir)).toEqual([
    "_next/static/media/font.woff2",
    "vitest-plugin-rsc/next_ssr/modules.json",
    "vitest-plugin-rsc/react_client/assets/a.css",
    "vitest-plugin-rsc/react_client/assets/icon.svg",
    "vitest-plugin-rsc/react_client/modules.json",
  ]);
  // A module as a module runner takes it, by its id, and CSS that names a
  // file by the way from its own.
  const modules = (layer: string) =>
    JSON.parse(
      fs.readFileSync(path.join(outDir, `vitest-plugin-rsc/${layer}/modules.json`), "utf8"),
    ) as Record<string, string>;
  expect(Object.keys(modules("react_client"))).toEqual([
    "/vitest-plugin-rsc/react_client/entry.js",
  ]);
  expect(modules("react_client")["/vitest-plugin-rsc/react_client/entry.js"]).toContain(
    `__vite_ssr_import__("/vitest-plugin-rsc/react_client/assets/a.js"`,
  );
  expect(modules("next_ssr")).toEqual({
    "/vitest-plugin-rsc/next_ssr/entry.js": await toRunnerModule({
      fileName: "vitest-plugin-rsc/next_ssr/entry.js",
      code: `export const c = 1;\n`,
    }),
  });
  expect(
    fs.readFileSync(path.join(outDir, "vitest-plugin-rsc/react_client/assets/a.css"), "utf8"),
  ).toBe("@font-face { src: url(../../../_next/static/media/font.woff2) }");
});

// The files in a directory, by their path from it.
const filesOf = (directory: string) =>
  fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .sort();

// The build of the browser layer of an app: its entry imports a module, which
// names its CSS, and loads others when it is asked to, one by a template
// literal, as Rolldown writes a dynamic import. And the ssr layer, whose
// entry is a module of its own. It is served from `base`, by a `fetch` that
// says what it was asked for, and the tab fetches the files of `inAdvance`.
async function servedBuild(
  base: string,
  inAdvance: (layers: BuiltLayer[]) => BuiltLayer[] = () => [],
) {
  const { outDir, plugin, builder } = setup({
    next_ssr: {
      "vitest-plugin-rsc/next_ssr/entry.js": chunk(
        "vitest-plugin-rsc/next_ssr/entry.js",
        `export const layer = "ssr";\n`,
      ),
    },
    react_client: {
      "vitest-plugin-rsc/react_client/entry.js": chunk(
        "vitest-plugin-rsc/react_client/entry.js",
        `import { greeting } from "./assets/greeting.js";\n` +
          `export const loads = (globalThis.loads ?? 0) + 1;\n` +
          `globalThis.loads = loads;\n` +
          `export const lazy = () => import("./assets/lazy.js");\n` +
          "export const later = () => import(`./assets/later.js`);\n" +
          `export { greeting };\n`,
      ),
      "vitest-plugin-rsc/react_client/assets/greeting.js": chunk(
        "vitest-plugin-rsc/react_client/assets/greeting.js",
        `export const greeting = "hello";\n` +
          `export const css = new URL("./greeting.css", import.meta.url).href;\n`,
      ),
      "vitest-plugin-rsc/react_client/assets/lazy.js": chunk(
        "vitest-plugin-rsc/react_client/assets/lazy.js",
        `export default "lazy";\n`,
      ),
      "vitest-plugin-rsc/react_client/assets/later.js": chunk(
        "vitest-plugin-rsc/react_client/assets/later.js",
        `export default "later";\n`,
      ),
      "vitest-plugin-rsc/react_client/assets/greeting.css": {
        type: "asset",
        fileName: "vitest-plugin-rsc/react_client/assets/greeting.css",
        source: "p { color: red }",
      },
    },
  });
  await (plugin.buildApp as Hook)(builder);
  onTestFinished(() => void delete (globalThis as { loads?: number }).loads);
  const asked: string[] = [];
  const fetch = async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const file = path.join(outDir, url.slice(base.length));
    if (!url.startsWith(base) || !fs.existsSync(file)) return new Response(null, { status: 404 });
    return new Response(fs.readFileSync(file));
  };
  // Where the build of the host says the layers are: see the test of that.
  const layer: BuiltLayer = {
    base,
    entries: { "vitest-plugin-rsc/nextjs/client": "vitest-plugin-rsc/react_client/entry.js" },
    modules: "vitest-plugin-rsc/react_client/modules.json",
  };
  const ssr: BuiltLayer = {
    base,
    entries: { "vitest-plugin-rsc/nextjs/ssr": "vitest-plugin-rsc/next_ssr/entry.js" },
    modules: "vitest-plugin-rsc/next_ssr/modules.json",
  };
  const built = createBuiltLayers(fetch as typeof globalThis.fetch, inAdvance([layer, ssr]));
  return { outDir, layer, ssr, built, fetch, asked };
}

type Entry = {
  loads: number;
  greeting: string;
  lazy: () => Promise<{ default: string }>;
  later: () => Promise<{ default: string }>;
};
const entry = "/vitest-plugin-rsc/react_client/entry.js";

// A runner of the layer for a page load, as ../utils.ts makes one.
const pageRunner = (
  built: Pick<ReturnType<typeof createBuiltLayers>, "invoke">,
  layer: BuiltLayer,
) =>
  new ModuleRunner(
    {
      transport: { invoke: (payload) => built.invoke(layer, payload) },
      hmr: false,
      sourcemapInterceptor: false,
      createImportMeta: (file) => ({
        ...createDefaultImportMeta(file),
        url: builtUrl(layer, file),
      }),
    },
    new ESModulesEvaluator(),
  );

test("a runner evaluates a layer from its one file, which a tab fetches once", async () => {
  // As the page asks for it when it starts, before a runner does.
  const { outDir, layer, built, asked } = await servedBuild(
    "https://site.test/docs/",
    ([layer]) => [layer!],
  );

  // The modules are no files of the build, the CSS is.
  expect(filesOf(outDir)).toEqual([
    "vitest-plugin-rsc/next_ssr/modules.json",
    "vitest-plugin-rsc/react_client/assets/greeting.css",
    "vitest-plugin-rsc/react_client/modules.json",
  ]);
  const first = await pageRunner(built, layer).import<Entry>(entry);
  expect(first.loads).toBe(1);
  expect(first.greeting).toBe("hello");
  expect((await first.lazy()).default).toBe("lazy");
  expect((await first.later()).default).toBe("later");
  // A module has the URL of the file it would be: what it names by its URL,
  // like its CSS, is a file of the build where it says.
  const greeting = await pageRunner(built, layer).import<{ css: string }>(
    "/vitest-plugin-rsc/react_client/assets/greeting.js",
  );
  expect(greeting.css).toBe(
    "https://site.test/docs/vitest-plugin-rsc/react_client/assets/greeting.css",
  );

  // The next page load has a module graph of its own, and evaluates every
  // module again, from what the tab fetched.
  const second = await pageRunner(built, layer).import<Entry>(entry);
  expect(second.loads).toBe(2);
  expect(asked).toEqual(["https://site.test/docs/vitest-plugin-rsc/react_client/modules.json"]);
  // With the same answer for a module, which a page compiles once.
  const fetchModule = (id: string) =>
    built.invoke(layer, {
      type: "custom",
      event: "vite:invoke",
      data: { id: "send:fetchModule", name: "fetchModule", data: [id] },
    });
  const [answer, again] = await Promise.all([fetchModule(entry), fetchModule(entry)]);
  expect((answer as { result: unknown }).result).toBe((again as { result: unknown }).result);
  // Also for a URL of the module, which encodes what its path does not.
  const encoded = await fetchModule("/vitest-plugin-rsc/react_client/assets/gr%65eting.js");
  expect((encoded as { result: { id: string } }).result.id).toBe(
    "/vitest-plugin-rsc/react_client/assets/greeting.js",
  );
});

test("a runner of a built layer asks again after a failure, and says what the build does not have", async () => {
  const { outDir, layer, built, asked } = await servedBuild("https://site.test/");
  const file = path.join(outDir, layer.modules);

  // The file of the layer is not there, and then it is: the next page load
  // asks for it again.
  fs.renameSync(file, `${file}.gone`);
  await expect(pageRunner(built, layer).import(entry)).rejects.toThrow(
    "vitest-plugin-rsc: https://site.test/vitest-plugin-rsc/react_client/modules.json responded with 404",
  );
  fs.renameSync(`${file}.gone`, file);
  await expect(pageRunner(built, layer).import<Entry>(entry)).resolves.toMatchObject({
    greeting: "hello",
  });
  expect(asked).toHaveLength(2);

  await expect(
    pageRunner(built, layer).import("/vitest-plugin-rsc/react_client/assets/gone.js"),
  ).rejects.toThrow(
    "vitest-plugin-rsc: the build has no module /vitest-plugin-rsc/react_client/assets/gone.js",
  );
  expect(asked).toHaveLength(2);

  // A site that answers with another file, like a page of its own.
  const elsewhere = { ...layer, modules: "vitest-plugin-rsc/react_client/assets/greeting.css" };
  await expect(pageRunner(built, elsewhere).import(entry)).rejects.toThrow(
    "vitest-plugin-rsc: https://site.test/vitest-plugin-rsc/react_client/assets/greeting.css " +
      "is not the modules of a layer",
  );
});

// The first file is the one of the layer that every page runs, which the
// tab fetches at once. Another layer's only when a runner of it asks: when
// the tab needs that layer.
async function orderedBuild({
  first = "held",
  ssrFails = false,
}: { first?: "held" | "missing"; ssrFails?: boolean } = {}) {
  const { layer, ssr, fetch } = await servedBuild("https://site.test/");
  const events: string[] = [];
  const firstFile = Promise.withResolvers<void>();
  onTestFinished(() => firstFile.resolve());
  const held = async (input: string | URL | Request) => {
    const name = String(input).split("/").at(-2)!;
    events.push(`fetches ${name}`);
    if (name !== layer.modules.split("/").at(-2)) {
      return ssrFails ? new Response(null, { status: 500 }) : fetch(input);
    }
    await firstFile.promise;
    return first === "held" ? fetch(input) : new Response(null, { status: 404 });
  };
  const built = createBuiltLayers(held as typeof globalThis.fetch, [layer, ssr]);
  const server = () =>
    pageRunner(built, ssr).import<{ layer: string }>("/vitest-plugin-rsc/next_ssr/entry.js");
  const endFirst = () => {
    events.push("the first ends");
    firstFile.resolve();
  };
  return { built, layer, server, events, endFirst };
}

test("a tab fetches the file of the layer every page runs at once, and another one when a runner of it asks", async () => {
  const { built, layer, server, events, endFirst } = await orderedBuild();
  expect(events).toEqual(["fetches react_client"]);
  endFirst();
  await pageRunner(built, layer).import(entry);
  expect(events).toEqual(["fetches react_client", "the first ends"]);
  expect((await server()).layer).toBe("ssr");
  expect(events).toEqual(["fetches react_client", "the first ends", "fetches next_ssr"]);
});

test("a runner of another layer does not wait for the file of the first one", async () => {
  const { server, events } = await orderedBuild();
  expect((await server()).layer).toBe("ssr");
  expect(events).toEqual(["fetches react_client", "fetches next_ssr"]);
});

// What fails is the error of the requests that need the layer: the next
// runner that asks fetches its file again.
test("a tab fetches the file of a layer that failed again for the next runner", async () => {
  const { server, events } = await orderedBuild({ ssrFails: true });
  await expect(server()).rejects.toThrow("next_ssr/modules.json responded with 500");
  await expect(server()).rejects.toThrow("next_ssr/modules.json responded with 500");
  expect(events).toEqual(["fetches react_client", "fetches next_ssr", "fetches next_ssr"]);
});

test("a tab fetches another layer also when the first one fails", async () => {
  const { server, events, endFirst } = await orderedBuild({ first: "missing" });
  endFirst();
  expect((await server()).layer).toBe("ssr");
  expect(events).toEqual(["fetches react_client", "the first ends", "fetches next_ssr"]);
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

// In the order the tab fetches them: the browser layer, which every page
// runs, first. See built-layers.ts.
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
      `  "react_client": { base: directory, entries: {"vitest-plugin-rsc/nextjs/client":"vitest-plugin-rsc/react_client/entry.js","virtual:vitest-plugin-rsc/client-references":"vitest-plugin-rsc/react_client/references.js"}, modules: "vitest-plugin-rsc/react_client/modules.json" },\n` +
      `  "next_ssr": { base: directory, entries: {"vitest-plugin-rsc/nextjs/ssr":"vitest-plugin-rsc/next_ssr/entry.js"}, modules: "vitest-plugin-rsc/next_ssr/modules.json" },\n` +
      `};\n`,
  );
  // A dev server serves the modules of every layer itself.
  const inDev = { environment: { name: "client", mode: "dev" } };
  const devId = (plugin.resolveId as Hook).call(inDev, "virtual:vitest-plugin-rsc/layers");
  expect((plugin.load as Hook).call(inDev, devId)).toBe("export default undefined;\n");
});

// A page of the host whose scripts load the layers, by a chain of imports,
// starts the file of the browser layer from its HTML, at the URL that Vite
// names the scripts of the page by: for a build served from anywhere the way
// from where the page is, also from a directory of its own, and otherwise
// from the base. No other layer's, which waits for that one, and nothing
// for a page that loads no layer.
test.for(["./", "/sub/"])(
  "starts the browser layer from the HTML of a page that loads the layers, with base %s",
  (base) => {
    const { plugin } = setup({}, {}, { base });
    const layers = "\0virtual:vitest-plugin-rsc/layers/built";
    const bundle = {
      "assets/page.js": {
        type: "chunk",
        moduleIds: ["/host/page.ts"],
        imports: ["assets/a.js"],
        dynamicImports: [],
      },
      "assets/a.js": {
        type: "chunk",
        moduleIds: ["/host/a.ts"],
        imports: [],
        dynamicImports: ["assets/b.js"],
      },
      "assets/b.js": {
        type: "chunk",
        moduleIds: [layers, "/src/utils.ts"],
        imports: [],
        dynamicImports: [],
      },
      "assets/other.js": {
        type: "chunk",
        moduleIds: ["/host/other.ts"],
        imports: [],
        dynamicImports: [],
      },
    };
    const transform = (page: string, chunk: string, inDev = false) =>
      call(plugin.transformIndexHtml, "client", "<html></html>", {
        path: page,
        filename: `/root${page}`,
        ...(inDev ? { server: {} } : { bundle, chunk: bundle[chunk as keyof typeof bundle] }),
      });
    const preload = (href: string) => [
      {
        tag: "link",
        attrs: { rel: "preload", as: "fetch", crossorigin: true, href },
        injectTo: "head-prepend",
      },
    ];

    const file = "vitest-plugin-rsc/react_client/modules.json";
    expect(transform("/index.html", "assets/page.js")).toEqual(
      preload(base === "./" ? `./${file}` : `${base}${file}`),
    );
    expect(transform("/stories/nested/page.html", "assets/page.js")).toEqual(
      preload(base === "./" ? `../../${file}` : `${base}${file}`),
    );
    expect(transform("/other.html", "assets/other.js")).toBeUndefined();
    // A dev server has no file of a layer.
    expect(transform("/index.html", "assets/page.js", true)).toBeUndefined();
  },
);

// The modules of the page that the browser layer imports, like a package of
// the host, are externals of its chunks, which the module graph of its scan
// reaches. The rsc layer, the host's build, lists them, to import each as the
// host's own scripts do: see host-module.ts.
test("lists the modules of the page that the scan of the browser layer finds", async () => {
  const entry = "vitest-plugin-rsc/react_client/entry.js";
  const { plugin, builder } = setup(
    {
      react_client: {
        [entry]: chunk(entry, "", [hostModule("host-ui/test")], [hostModule("host-report")]),
      },
    },
    {},
    {
      graphs: {
        react_client: [
          "vitest-plugin-rsc/nextjs/client",
          hostModule("host-ui/test"),
          hostModule("host-report"),
        ],
      },
    },
  );

  await (plugin.buildApp as Hook)(builder);

  const id = call(plugin.resolveId, "client", "virtual:vitest-plugin-rsc/host-modules");
  expect(id).toBe(hostModules);
  // In the order of their names, the same in every build.
  expect(call(plugin.load, "client", id)).toBe(
    `export default {\n` +
      `  "${hostModule("host-report")}": () => import("\\u0000vitest-plugin-rsc/host-module/host-report"),\n` +
      `  "${hostModule("host-ui/test")}": () => import("\\u0000vitest-plugin-rsc/host-module/host-ui/test"),\n` +
      `};\n`,
  );
  // Only the host's build has them, and a dev server serves them itself.
  expect(call(plugin.load, "react_client", id)).toBe("export default undefined;");
  const inDev = { environment: { name: "client", mode: "dev" } };
  expect((plugin.load as Hook).call(inDev, id)).toBe("export default undefined;");
});

// A module of a package that says it has no side effects, which the scan
// cut down to its imports: its chunks drop it and what only it imports, as
// nothing binds an export of it. The build of the layer keeps it for the
// export it uses.
test("lists a module of the page that the scan's graph reaches and its output dropped", async () => {
  const entry = "vitest-plugin-rsc/react_client/entry.js";
  const { plugin, builder } = setup(
    { react_client: { [entry]: chunk(entry, "", [hostModule("host-report")]) } },
    {},
    {
      graphs: {
        react_client: [
          "vitest-plugin-rsc/nextjs/client",
          "/node_modules/ui-kit/tagged.js",
          hostModule("host-report"),
          hostModule("host-ui/test"),
        ],
      },
    },
  );
  await (plugin.buildApp as Hook)(builder);

  expect(call(plugin.load, "client", hostModules)).toBe(
    `export default {\n` +
      `  "${hostModule("host-report")}": () => import("\\u0000vitest-plugin-rsc/host-module/host-report"),\n` +
      `  "${hostModule("host-ui/test")}": () => import("\\u0000vitest-plugin-rsc/host-module/host-ui/test"),\n` +
      `};\n`,
  );
  // The build of the layer, which imports it.
  expect(() =>
    (plugin.generateBundle as { handler: Hook }).handler.call(
      {
        environment: { name: "react_client", mode: "build" },
        error(message: string) {
          throw new Error(message);
        },
      },
      {},
      { [entry]: chunk(entry, "", [hostModule("host-report"), hostModule("host-ui/test")]) },
    ),
  ).not.toThrow();
});

test("says which module of the page the scan of the browser layer did not find", async () => {
  const entry = "vitest-plugin-rsc/react_client/entry.js";
  const { plugin, builder } = setup(
    { react_client: { [entry]: chunk(entry, "", [hostModule("host-report")]) } },
    {},
    { graphs: { react_client: ["vitest-plugin-rsc/nextjs/client", hostModule("host-report")] } },
  );
  await (plugin.buildApp as Hook)(builder);

  // A build of the layer that imports one more than its scan's graph reached,
  // with `import()`.
  const generate = () =>
    (plugin.generateBundle as { handler: Hook }).handler.call(
      {
        environment: { name: "react_client", mode: "build" },
        error(message: string) {
          throw new Error(message);
        },
      },
      {},
      { [entry]: chunk(entry, "", [hostModule("host-report")], [hostModule("host-ui/test")]) },
    );
  expect(generate).toThrow(
    "vitest-plugin-rsc: the react_client layer imports host-ui/test as a module of the page, " +
      "as `host.packages` of vitestPluginNext() names its package, but the scan of the browser " +
      "layer did not find that import",
  );
  expect(generate).toThrow("a plugin that adds this import has to add it in the scan too");
});

// `vitestPluginRSC()` on its own: the rsc layer and the browser layer, which
// starts with the client of the testing library.
test("builds the two layers of vitestPluginRSC() on its own", async () => {
  const { plugin, config, builder, builds, layers } = setup({}, {}, { rsc: true });

  expect(Object.keys(config.environments)).toEqual(["react_client"]);
  // Its CSS is its own to load, as Vite loads the CSS of a chunk.
  expect(config.environments.react_client!.build.cssCodeSplit).toBe(true);
  // Its modules run as Vite bundles them, as for any app: that is Next's.
  expect(config.build.rolldownOptions.output).toBeUndefined();
  expect(layers).toEqual({
    react_client: {
      build: {
        outDir: "dist",
        emptyOutDir: false,
        write: false,
        rolldownOptions: {
          input: {
            entry: "vitest-plugin-rsc/testing-library-client",
            references: "virtual:vitest-plugin-rsc/client-references",
          },
        },
      },
    },
  });

  await (plugin.buildApp as Hook)(builder);
  expect(builds.map(({ name, scan }) => `${name}${scan ? " (scan)" : ""}`)).toEqual([
    "client (scan)",
    "react_client (scan)",
    "client",
    "react_client",
  ]);

  const id = call(plugin.resolveId, "client", "virtual:vitest-plugin-rsc/layers") as string;
  expect(call(plugin.load, "client", id)).toBe(
    `const directory = new URL(__VITEST_PLUGIN_RSC_BUILD_DIR__, import.meta.url).href;\n` +
      `export default {\n` +
      `  "react_client": { base: directory, entries: {"vitest-plugin-rsc/testing-library-client":"vitest-plugin-rsc/react_client/entry.js","virtual:vitest-plugin-rsc/client-references":"vitest-plugin-rsc/react_client/references.js"}, modules: "vitest-plugin-rsc/react_client/modules.json" },\n` +
      `};\n`,
  );
  expect(() =>
    (plugin.buildStart as Hook).call({ environment: { name: "client", mode: "build" } }),
  ).toThrow("outside the plugin's `buildApp()`, which builds its two layers.");
});

// What a framework's plugin, like `vitestPluginNext()`, gives the build in
// the config: a layer more, with the CSS of the browser layer.
test("builds the layers that a framework's plugin gives it", () => {
  const { config, layers } = setup();

  expect(config).toMatchObject({
    build: { rolldownOptions: { output: { strictExecutionOrder: true } } },
    environments: { next_ssr: { build: { cssCodeSplit: false } } },
  });
  expect(config.environments.react_client!.build.cssCodeSplit).toBe(true);
  expect(layers).toMatchObject({
    react_client: {
      build: { rolldownOptions: { input: { entry: "vitest-plugin-rsc/nextjs/client" } } },
    },
    next_ssr: { build: { rolldownOptions: { input: { entry: "vitest-plugin-rsc/nextjs/ssr" } } } },
  });
  expect(nextConfig()).toEqual(
    withStaticBuild(expect.objectContaining({ directives: ["use turbopack: no side effects"] })),
  );
});

// As Vite resolves the config of `vite build`: the build reads the layers of
// a framework after its `config` hook, whichever plugin comes first.
test.for(["the framework first", "the build first"])(
  "builds the layers of a framework's plugin, with %s",
  async (order) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "static-build-"));
    onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
    const framework = {
      name: "framework",
      config: () =>
        withStaticBuild({
          entries: { next_ssr: "framework/ssr", react_client: "framework/client" },
        }),
    };
    const manager = { isScanBuild: false };
    const rsc = { name: "rsc:minimal", api: { manager } };
    const plugins =
      order === "the framework first" ? [framework, createPlugin()] : [createPlugin(), framework];

    // The host's own input, the pages of a site, which a layer does not
    // build: Vite merges an array of them into the input of an environment.
    const pages = ["index.html", "callout.html"].map((page) => path.join(root, page));
    const resolved = await resolveConfig(
      {
        configFile: false,
        root,
        logLevel: "silent",
        plugins: [rsc, ...plugins],
        build: { rolldownOptions: { input: pages } },
      },
      "build",
    );

    const build = (name: string) => resolved.environments[name]!.build;
    expect(build("react_client").rolldownOptions.input).toEqual({
      entry: "framework/client",
      references: "virtual:vitest-plugin-rsc/client-references",
    });
    expect(build("next_ssr").rolldownOptions.input).toEqual({ entry: "framework/ssr" });
    expect(build("client").rolldownOptions.input).toEqual(pages);
    expect([build("react_client").write, build("next_ssr").write]).toEqual([false, false]);
    expect(build("client").write).toBe(true);
  },
);

test("says that a framework's layers need the browser layer", () => {
  const config = withStaticBuild({ entries: { next_ssr: "framework/ssr" } });

  expect(() => call(createPlugin().config, names.rsc, config, { command: "build" })).toThrow(
    'vitest-plugin-rsc: a static build has no entry of "react_client".',
  );
});

test("lists the modules a Flight payload can refer to, by the id it has for each", () => {
  const { plugin, manager } = setup();
  manager.clientReferenceMetaMap = {
    "/app/counter.tsx": { referenceKey: "a1b2c3", importId: "/app/counter.tsx" },
  };
  manager.serverReferences.metaMap.set("/app/actions.ts", {
    referenceKey: "d4e5f6",
    importId: "/app/actions.ts",
  });
  const listed = (environment: string, source: string) => {
    const resolved = call(plugin.resolveId, environment, source.slice(1)) as string;
    expect(resolved).toBe(source);
    return call(plugin.load, environment, resolved) as string;
  };

  expect(listed("react_client", clientReferences)).toBe(
    `export default {\n  "a1b2c3": () => import("/app/counter.tsx"),\n};\n`,
  );
  // Every one, until the rsc layer's build says which ones server code reaches.
  expect(listed("next_ssr", clientReferences)).toBe(listed("react_client", clientReferences));
  expect(listed("client", serverReferences)).toBe(
    `export default {\n  "d4e5f6": () => import("/app/actions.ts"),\n};\n`,
  );
  // A dev server imports a module by its id itself.
  const dev = (plugin.load as Hook).call(
    { environment: { name: "client", mode: "dev" } },
    clientReferences,
  );
  expect(dev).toBe("export default undefined;");
});

// The ssr layer renders what server code renders: the plugin's module of the
// rsc layer, with the routes, and a file of the host that is no reference
// itself, which can render a node. The browser layer evaluates any reference,
// a file of the host with "use client" by its key.
test("lists in the ssr layer the client references that server code reaches", () => {
  const { plugin, next, manager } = setup();
  const reference = (key: string) => ({ referenceKey: key, importId: `/${key}.tsx` });
  manager.clientReferenceMetaMap = {
    "/vitest-plugin-rsc/nextjs/node-rendered.tsx": reference("node-rendered"),
    "/next/global-error.js": reference("global-error"),
    "/app/like.tsx": reference("like"),
    "/host/field.tsx": reference("field"),
    "/host/button.demo.tsx": reference("button-demo"),
    "/app/dialog.tsx": reference("dialog"),
  };
  // The module graph of the rsc layer's build: each module, and what it
  // imports, statically and with `import()`.
  const graph: Record<string, [string[], string[]?]> = {
    // The plugin's module, which renders the routes of the list, each with
    // Next's own Client Components, and the plugin's own.
    [rscModule]: [["/vitest-plugin-rsc/nextjs/node-rendered.tsx", "\0routes"]],
    "\0routes": [[], ["\0route/0"]],
    "\0route/0": [["/app/page.tsx", "/next/global-error.js"]],
    "/app/page.tsx": [["/app/like.tsx"]],
    // A file of the host that renders a node with a file of the host with
    // "use client".
    "/host/field.demo.tsx": [[rscModule, "/host/field.tsx"]],
    // The host's runtime, no file of the host, which imports both, and a
    // module of the app that imports a Client Component no server code
    // imports.
    "/runtime/demos.js": [
      ["/app/dialog-trigger.ts"],
      ["/host/field.demo.tsx", "/host/button.demo.tsx"],
    ],
    "/app/dialog-trigger.ts": [["/app/dialog.tsx"]],
  };
  const keys = (environment: string) =>
    [...(call(plugin.load, environment, clientReferences) as string).matchAll(/"(.+)": /g)].map(
      ([, key]) => key,
    );

  (next.buildEnd as Hook).call(
    {
      environment: { name: names.rsc, mode: "build" },
      getModuleIds: () => [...Object.keys(graph), ...Object.keys(manager.clientReferenceMetaMap)],
      getModuleInfo: (id: string) => ({
        importedIds: graph[id]?.[0] ?? [],
        dynamicallyImportedIds: graph[id]?.[1] ?? [],
      }),
    },
    undefined,
  );

  expect(keys(names.ssr)).toEqual(["field", "global-error", "like", "node-rendered"]);
  expect(keys(names.browser)).toEqual([
    "button-demo",
    "dialog",
    "field",
    "global-error",
    "like",
    "node-rendered",
  ]);
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

// A module as the bundler parsed it, which a warning names by its id, and
// the warning about the directive at `pos` in it: its message is for people.
function parsedDirective(plugin: ReturnType<typeof createPlugin>, directive: string) {
  const id = `/app/${directive.replace(/\W+/g, "-")}.js`;
  const code = `/* © ${directive} */\n"${directive}";\nexport const a = 1;\n`;
  call(plugin.moduleParsed, names.browser, { id, code });
  return {
    code: "MODULE_LEVEL_DIRECTIVE",
    message: 'The semantics of the module level directive "use client" may not be preserved',
    id,
    pos: code.indexOf(`"${directive}"`),
  };
}

test("does not warn about the directives of Vite RSC and of Next", () => {
  const { plugin, warnings } = setup();
  const directive = (name: string) => parsedDirective(plugin, name);

  expect(warnings(directive("use client"))).toEqual([]);
  expect(warnings(directive("use server"))).toEqual([]);
  expect(warnings(directive("use turbopack: no side effects"))).toEqual([]);
  // What the module has at the position, not what the message says.
  expect(warnings(directive("use strict"))).toEqual([directive("use strict")]);
  expect(warnings(directive("use client-side"))).toEqual([directive("use client-side")]);
  // A warning about a module that the build did not parse.
  const unknown = { ...directive("use client"), id: "/app/other.js" };
  expect(warnings(unknown)).toEqual([unknown]);
});

// As Rolldown warns: by the id of the module and the position in the code
// that it parsed, after the plugins transformed it.
test("finds the directive of a warning where Rolldown parsed it", async () => {
  const { plugin, config } = setup();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "static-build-directives-"));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    "main.js": 'import { a } from "./a.js";\nimport { b } from "./b.js";\nconsole.log(a, b);\n',
    "a.js": '"use client";\nexport const a = 1;\n',
    "b.js": '"use cache";\nexport const b = 2;\n',
  };
  for (const [name, code] of Object.entries(files)) fs.writeFileSync(path.join(root, name), code);
  const shown: Warning[] = [];
  const { rolldown } = await import("rolldown");
  const bundle = await rolldown({
    input: path.join(root, "main.js"),
    plugins: [
      // A plugin before the bundler that moves the directive.
      { name: "comment", transform: (code) => `/* é ✓ 😀 */\n${code}` },
      {
        name: "static-build",
        moduleParsed(info) {
          call(plugin.moduleParsed, names.browser, info);
        },
      },
    ],
    onwarn: (warning) =>
      config.build.rolldownOptions.onwarn(warning as Warning, (shownWarning) =>
        shown.push(shownWarning),
      ),
  });
  await bundle.generate({});
  await bundle.close();

  expect(shown.map(({ code, id }) => ({ code, id }))).toEqual([
    { code: "MODULE_LEVEL_DIRECTIVE", id: path.join(fs.realpathSync(root), "b.js") },
  ]);
});

test("does not warn about a module that only the lists of references import twice", () => {
  const { plugin, warnings } = setup();
  const globalError = "/app/node_modules/next/dist/esm/client/components/builtin/global-error.js";
  const lazy = "/app/app/components/lazy.tsx";
  const appRouter = "/app/node_modules/next/dist/esm/client/components/app-router.js";
  // The build's module graph: the lists import both with `import()`, and the
  // app imports `lazy.tsx` that way too.
  const graph: Record<string, { dynamicallyImportedIds?: string[]; dynamicImporters?: string[] }> =
    {
      [clientReferences]: { dynamicallyImportedIds: [globalError, lazy] },
      [serverReferences]: { dynamicallyImportedIds: [] },
      [globalError]: { dynamicImporters: [clientReferences] },
      [lazy]: { dynamicImporters: [clientReferences, "/app/app/page.tsx"] },
    };
  (plugin.buildEnd as Hook).call({
    environment: { name: names.browser, mode: "build" },
    getModuleInfo: (id: string) => graph[id] ?? null,
  });
  // As Rolldown has it: the module, and its importers, static or not. Not
  // its message, which is for people.
  const ineffective = (id: string) => ({
    code: "INEFFECTIVE_DYNAMIC_IMPORT",
    message: "a module is dynamically imported but also statically imported",
    id,
    ids: [...(graph[id]!.dynamicImporters ?? []), appRouter],
  });

  expect(warnings(ineffective(globalError))).toEqual([]);
  // The app imports it that way too: that one is the app's to hear of.
  expect(warnings(ineffective(lazy))).toEqual([ineffective(lazy)]);
});

test("rewrites a chunk into what a module runner evaluates", async () => {
  const rewritten = await toRunnerModule({
    fileName: "vitest-plugin-rsc/react_client/assets/page.js",
    code:
      `import { a } from "./a.js";\n` +
      `import { b } from "../entry.js";\n` +
      `export * from "./c.js";\n` +
      `export { d } from './d.js';\n` +
      `export const load = () => import("./lazy.js");\n` +
      "export const later = () => import(`./later.js`);\n" +
      `export const name = "./a.js";\n` +
      `export const page = [a, b];\n`,
  });

  // By the path of the file from the directory of the build, also the import
  // of the entry, which is a directory up.
  expect(rewritten).toContain(`__vite_ssr_import__("/vitest-plugin-rsc/react_client/assets/a.js"`);
  expect(rewritten).toContain(`__vite_ssr_import__("/vitest-plugin-rsc/react_client/entry.js"`);
  expect(rewritten).toContain(`__vite_ssr_import__("/vitest-plugin-rsc/react_client/assets/c.js"`);
  expect(rewritten).toContain(`__vite_ssr_import__("/vitest-plugin-rsc/react_client/assets/d.js"`);
  expect(rewritten).toContain(
    `__vite_ssr_dynamic_import__("/vitest-plugin-rsc/react_client/assets/lazy.js"`,
  );
  expect(rewritten).toContain(
    `__vite_ssr_dynamic_import__("/vitest-plugin-rsc/react_client/assets/later.js"`,
  );
  // A string that is no import is as it was.
  expect(rewritten).toContain(`"./a.js"`);
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
  const { plugin, warnings } = setup({}, {}, { onwarn });
  const directive = parsedDirective(plugin, "use client");
  const hidden = { code: "THE_CONFIG_HIDES", message: "" };
  const shown = { code: "CIRCULAR_DEPENDENCY", message: "a.js -> b.js -> a.js" };

  expect(warnings(directive)).toEqual([]);
  expect(warnings(hidden)).toEqual([]);
  expect(warnings(shown)).toEqual([shown]);
  expect(onwarn.mock.calls.map(([warning]) => warning)).toEqual([hidden, shown]);
});
