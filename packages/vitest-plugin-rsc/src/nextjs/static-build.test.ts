import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RenderBuiltAssetUrl } from "vite";
import { ESModulesEvaluator, ModuleRunner, createDefaultImportMeta } from "vite/module-runner";
import { expect, onTestFinished, test, vi } from "vitest";
import { createBuiltLayers, type BuiltLayer, type BuiltManifest } from "../built-layers.ts";
import { nextStaticBuild, toRunnerModule, withBuiltFiles } from "./static-build.ts";

const names = { rsc: "client", ssr: "next_ssr", browser: "react_client" };
const clientReferences = "\0virtual:vitest-plugin-rsc/next-client-references";
const serverReferences = "\0virtual:vitest-plugin-rsc/next-server-references";

type Bundle = Record<string, object>;
type Hook = (this: unknown, ...args: any[]) => any;
type Warning = { code: string; message: string };
type Meta = { referenceKey: string; importId: string };

// A hook of the plugin, called the way Vite calls it for an environment.
const call = (hook: unknown, environment: string, ...args: unknown[]) =>
  (typeof hook === "function" ? hook : (hook as { handler: Hook }).handler).call(
    { environment: { name: environment, mode: "build" } },
    ...args,
  ) as unknown;

// A chunk of the bundle of a layer, as Rolldown has it: named as its file is,
// without the hash.
const chunk = (
  fileName: string,
  code: string,
  {
    imports = [],
    dynamicImports = [],
    isEntry = false,
  }: { imports?: string[]; dynamicImports?: string[]; isEntry?: boolean } = {},
) => ({
  type: "chunk",
  fileName,
  name: path.basename(fileName).replace(/(-[\w]+)?\.js$/, ""),
  code,
  imports,
  dynamicImports,
  isEntry,
});

// The bundle of a layer that has nothing but its entry.
const entryOnly = (name: string): Bundle => {
  const fileName = `vitest-plugin-rsc/${name}/assets/entry-A0a0.js`;
  return { [fileName]: chunk(fileName, "export {};\n", { isEntry: true }) };
};

// The plugin as a build has it, in a project of its own: the config of Vite
// that it asks for, and an app builder that says what it was asked to build.
// A build of a layer starts as Vite starts it, and leaves the bundle of
// `bundles` for that layer, or one with only an entry. The host's build goes
// to `dist`, as the config has it: relative to the root, which is not the
// directory of the process.
function setup(
  bundles: Record<string, Bundle> = {},
  emitted: Record<string, string> = {},
  {
    onwarn,
    renderBuiltUrl,
  }: { onwarn?: (...args: any[]) => void; renderBuiltUrl?: RenderBuiltAssetUrl } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "static-build-"));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  const outDir = path.join(root, "dist");
  const manager = {
    isScanBuild: false,
    clientReferenceMetaMap: {} as Record<string, Meta>,
    serverReferences: { metaMap: new Map<string, Meta>() },
  };
  const plugin = nextStaticBuild({
    environments: names,
    entries: { ssr: "vitest-plugin-rsc/nextjs/ssr", browser: "vitest-plugin-rsc/nextjs/client" },
    emittedFiles: () =>
      Object.entries(emitted).map(([pathname, body]) => ({ pathname, body: Buffer.from(body) })),
  });
  const userConfig = { build: { rolldownOptions: { onwarn } } };
  const config = (plugin.config as Hook)(userConfig, { command: "build" }) as {
    builder: object;
    build: { rolldownOptions: { onwarn(warning: Warning, warn: (w: Warning) => void): void } };
    environments: Record<
      string,
      { build: { rolldownOptions: { output: { assetFileNames: string } } } }
    >;
  };
  const layers = Object.fromEntries(
    [names.ssr, names.browser].map((name) => [
      name,
      { build: { outDir: "dist", emptyOutDir: false } },
    ]),
  );
  (plugin.configResolved as Hook)({
    command: "build",
    root,
    plugins: [{ name: "rsc:minimal", api: { manager } }],
    environments: layers,
    experimental: { renderBuiltUrl },
  });

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
      call(plugin.generateBundle, name, {}, bundles[name] ?? entryOnly(name));
    },
  };
  const warnings = (warning: Warning) => {
    const shown: Warning[] = [];
    config.build.rolldownOptions.onwarn(warning, (shownWarning) => shown.push(shownWarning));
    return shown;
  };
  return { root, outDir, plugin, config, manager, layers, builder, builds, warnings };
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

  expect(layers).toEqual({
    next_ssr: { build: { outDir: "dist", emptyOutDir: false, write: false } },
    react_client: { build: { outDir: "dist", emptyOutDir: false, write: false } },
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
  const plugin = nextStaticBuild({
    environments: names,
    entries: { ssr: "ssr", browser: "client" },
    emittedFiles: () => [],
  });

  expect(() => (plugin.config as Hook)({ build: { watch: {} } }, { command: "build" })).toThrow(
    "vitest-plugin-rsc: a static build of the app cannot watch. Build it again instead of " +
      "`vite build --watch`.",
  );
  expect(() =>
    (plugin.config as Hook)({ build: { watch: null } }, { command: "build" }),
  ).not.toThrow();
  // A dev server is not a build.
  expect((plugin.config as Hook)({ build: { watch: {} } }, { command: "serve" })).toBeUndefined();
});

// The files in a directory, by their path from it.
const filesOf = (directory: string) =>
  fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .sort();

const readManifest = (outDir: string, layer: string) =>
  JSON.parse(
    fs.readFileSync(path.join(outDir, `vitest-plugin-rsc/${layer}/manifest.json`), "utf8"),
  ) as BuiltManifest;

test("names the chunks of a layer after their content, also its entry", () => {
  const { config } = setup();

  const output = (name: string) => config.environments[name]!.build.rolldownOptions.output;
  for (const name of ["react_client", "next_ssr"]) {
    expect(output(name)).toMatchObject({
      entryFileNames: `vitest-plugin-rsc/${name}/assets/[name]-[hash].js`,
      chunkFileNames: `vitest-plugin-rsc/${name}/assets/[name]-[hash].js`,
    });
  }
});

test("writes the layers and what Next's loaders made into the build of the host", async () => {
  const font = "/_next/static/media/font.woff2";
  const entryFile = "vitest-plugin-rsc/react_client/assets/entry-B1x2.js";
  const { outDir, plugin, builder } = setup(
    {
      react_client: {
        [entryFile]: chunk(
          entryFile,
          `import { a } from "./a-C3d4.js";\n` +
            `export const b = a;\n` +
            `export const lazy = () => import("./lazy-E5f6.js");\n`,
          {
            isEntry: true,
            imports: ["vitest-plugin-rsc/react_client/assets/a-C3d4.js"],
            dynamicImports: ["vitest-plugin-rsc/react_client/assets/lazy-E5f6.js"],
          },
        ),
        "vitest-plugin-rsc/react_client/assets/a-C3d4.js": chunk(
          "vitest-plugin-rsc/react_client/assets/a-C3d4.js",
          `export const a = 1;\n`,
        ),
        "vitest-plugin-rsc/react_client/assets/lazy-E5f6.js": chunk(
          "vitest-plugin-rsc/react_client/assets/lazy-E5f6.js",
          `import { a } from "./a-C3d4.js";\nexport default a;\n`,
          // Not a chunk of the bundle: Vite took the CSS out of it.
          { imports: ["vitest-plugin-rsc/react_client/assets/a-C3d4.js", "lazy.css"] },
        ),
        "vitest-plugin-rsc/react_client/assets/a.css": {
          type: "asset",
          fileName: "vitest-plugin-rsc/react_client/assets/a.css",
          source: withBuiltFiles(`@font-face { src: url(${font}) }`, [font], "css"),
        },
      },
      next_ssr: {
        "vitest-plugin-rsc/next_ssr/assets/entry-G7h8.js": chunk(
          "vitest-plugin-rsc/next_ssr/assets/entry-G7h8.js",
          `export const c = 1;\n`,
          { isEntry: true },
        ),
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

  // A chunk is a file of its own, named as Rolldown named it, and a layer
  // has a manifest.
  expect(filesOf(outDir)).toEqual([
    "_next/static/media/font.woff2",
    "vitest-plugin-rsc/next_ssr/assets/entry-G7h8.js",
    "vitest-plugin-rsc/next_ssr/manifest.json",
    "vitest-plugin-rsc/react_client/assets/a-C3d4.js",
    "vitest-plugin-rsc/react_client/assets/a.css",
    "vitest-plugin-rsc/react_client/assets/entry-B1x2.js",
    "vitest-plugin-rsc/react_client/assets/icon.svg",
    "vitest-plugin-rsc/react_client/assets/lazy-E5f6.js",
    "vitest-plugin-rsc/react_client/manifest.json",
  ]);
  // The entry by the id the page imports it by, and the imports of each
  // chunk, by their files.
  expect(readManifest(outDir, "react_client")).toEqual({
    entry: { id: "vitest-plugin-rsc/nextjs/client", file: entryFile },
    chunks: {
      "vitest-plugin-rsc/react_client/assets/a-C3d4.js": { imports: [], dynamicImports: [] },
      [entryFile]: {
        imports: ["vitest-plugin-rsc/react_client/assets/a-C3d4.js"],
        dynamicImports: ["vitest-plugin-rsc/react_client/assets/lazy-E5f6.js"],
      },
      "vitest-plugin-rsc/react_client/assets/lazy-E5f6.js": {
        imports: ["vitest-plugin-rsc/react_client/assets/a-C3d4.js"],
        dynamicImports: [],
      },
    },
  });
  expect(readManifest(outDir, "next_ssr")).toEqual({
    entry: {
      id: "vitest-plugin-rsc/nextjs/ssr",
      file: "vitest-plugin-rsc/next_ssr/assets/entry-G7h8.js",
    },
    chunks: {
      "vitest-plugin-rsc/next_ssr/assets/entry-G7h8.js": { imports: [], dynamicImports: [] },
    },
  });
  // A chunk as a module runner takes it, with its imports by their files,
  // and CSS that names a file by the way from its own.
  const read = (file: string) => fs.readFileSync(path.join(outDir, file), "utf8");
  expect(read(entryFile)).toContain(
    `__vite_ssr_import__("/vitest-plugin-rsc/react_client/assets/a-C3d4.js"`,
  );
  expect(read("vitest-plugin-rsc/next_ssr/assets/entry-G7h8.js")).toBe(
    await toRunnerModule({
      fileName: "vitest-plugin-rsc/next_ssr/assets/entry-G7h8.js",
      code: `export const c = 1;\n`,
    }),
  );
  expect(read("vitest-plugin-rsc/react_client/assets/a.css")).toBe(
    "@font-face { src: url(../../../_next/static/media/font.woff2) }",
  );
});

test("says when a layer has no entry", async () => {
  const { plugin, builder } = setup({
    react_client: { "a.js": chunk("a.js", "export {};") },
  });

  await expect((plugin.buildApp as Hook)(builder)).rejects.toThrow(
    "vitest-plugin-rsc: the build of the react_client layer has no entry",
  );
});

const assets = "vitest-plugin-rsc/react_client/assets";
const entryFile = `${assets}/entry-B1x2.js`;
const entry = `/${entryFile}`;

// The build of the browser layer of an app: its entry imports a module, which
// names its CSS, and loads others when it is asked to, one by a template
// literal, as Rolldown writes a dynamic import. The one it loads first imports
// a chunk of its own. It is served from `base`, by a `fetch` that says what it
// was asked for, and that answers once `release()` is called.
async function servedBuild(
  base: string,
  { renderBuiltUrl }: { renderBuiltUrl?: RenderBuiltAssetUrl } = {},
) {
  const file = (name: string) => `${assets}/${name}`;
  const { outDir, plugin, builder } = setup(
    {
      react_client: {
        [entryFile]: chunk(
          entryFile,
          `import { greeting } from "./greeting-C3d4.js";\n` +
            `export const loads = (globalThis.loads ?? 0) + 1;\n` +
            `globalThis.loads = loads;\n` +
            `export const lazy = () => import("./lazy-E5f6.js");\n` +
            "export const later = () => import(`./later-G7h8.js`);\n" +
            `export { greeting };\n`,
          {
            isEntry: true,
            imports: [file("greeting-C3d4.js")],
            dynamicImports: [file("lazy-E5f6.js"), file("later-G7h8.js")],
          },
        ),
        [file("greeting-C3d4.js")]: chunk(
          file("greeting-C3d4.js"),
          `import { name } from "./name-J9k0.js";\n` +
            `export const greeting = "hello " + name;\n` +
            `export const css = new URL("./greeting.css", import.meta.url).href;\n`,
          { imports: [file("name-J9k0.js")] },
        ),
        [file("name-J9k0.js")]: chunk(file("name-J9k0.js"), `export const name = "you";\n`),
        [file("lazy-E5f6.js")]: chunk(
          file("lazy-E5f6.js"),
          `import { word } from "./word-L1m2.js";\nexport default word;\n`,
          { imports: [file("word-L1m2.js")] },
        ),
        [file("word-L1m2.js")]: chunk(file("word-L1m2.js"), `export const word = "lazy";\n`),
        [file("later-G7h8.js")]: chunk(file("later-G7h8.js"), `export default "later";\n`),
        [file("greeting.css")]: {
          type: "asset",
          fileName: file("greeting.css"),
          source: "p { color: red }",
        },
      },
    },
    {},
    { renderBuiltUrl },
  );
  await (plugin.buildApp as Hook)(builder);
  onTestFinished(() => void delete (globalThis as { loads?: number }).loads);
  const asked: { url: string; cache?: RequestCache }[] = [];
  let release!: () => void;
  let released = new Promise<void>((resolve) => (release = resolve));
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    asked.push({ url, cache: init?.cache });
    await released;
    const served = url.replace("https://cdn.test/", base);
    const file = path.join(outDir, served.slice(base.length));
    if (!served.startsWith(base) || !fs.existsSync(file)) {
      return new Response(null, { status: 404 });
    }
    return new Response(fs.readFileSync(file));
  };
  // Where the build of the host says the layer is: see the test of that.
  const layer: BuiltLayer = {
    base,
    manifest: `${base}vitest-plugin-rsc/react_client/manifest.json`,
  };
  const built = createBuiltLayers(fetch as typeof globalThis.fetch);
  return {
    outDir,
    layer,
    built,
    asked,
    urls: () => asked.map(({ url }) => url.slice(base.length)),
    release,
    // From here on a request waits for `release()` again.
    hold: () => void (released = new Promise<void>((resolve) => (release = resolve))),
  };
}

type Entry = {
  loads: number;
  greeting: string;
  lazy: () => Promise<{ default: string }>;
  later: () => Promise<{ default: string }>;
};

// A runner of the layer for a page load, as ../utils.ts makes one.
const pageRunner = (built: ReturnType<typeof createBuiltLayers>, layer: BuiltLayer) =>
  new ModuleRunner(
    {
      transport: { invoke: (payload) => built.invoke(layer, payload) },
      hmr: false,
      sourcemapInterceptor: false,
      createImportMeta: (file) => ({
        ...createDefaultImportMeta(file),
        url: built.urlOf(layer, file),
      }),
    },
    new ESModulesEvaluator(),
  );

test("a page load fetches the manifest, then its entry with every chunk it imports, at once", async () => {
  const { layer, built, asked, urls, release } = await servedBuild("https://site.test/docs/");

  // As the page asks when it starts, before a runner does.
  built.preload(layer);
  await vi.waitFor(() => expect(asked).toHaveLength(1));
  // The manifest does not change its name with its content: the browser asks
  // whether its copy is current.
  expect(asked[0]).toEqual({
    url: "https://site.test/docs/vitest-plugin-rsc/react_client/manifest.json",
    cache: "no-cache",
  });
  release();
  // Then the entry and what it imports, and what that imports, before any of
  // them has arrived: one round trip. A chunk can be kept as long as the
  // site lets the browser keep it.
  await vi.waitFor(() => expect(asked).toHaveLength(4));
  expect(asked.slice(1)).toEqual(
    [entryFile, `${assets}/greeting-C3d4.js`, `${assets}/name-J9k0.js`].map((file) => ({
      url: `https://site.test/docs/${file}`,
      cache: "default",
    })),
  );

  const first = await pageRunner(built, layer).import<Entry>(
    await built.moduleOf(layer, "vitest-plugin-rsc/nextjs/client"),
  );
  expect(first.loads).toBe(1);
  expect(first.greeting).toBe("hello you");
  expect(urls()).toHaveLength(4);
  // What a page imports with `import()` is fetched when it does, with its
  // own imports, at once.
  expect((await first.lazy()).default).toBe("lazy");
  expect(urls().slice(4)).toEqual([`${assets}/lazy-E5f6.js`, `${assets}/word-L1m2.js`]);
  expect((await first.later()).default).toBe("later");
  expect(urls().slice(6)).toEqual([`${assets}/later-G7h8.js`]);
});

test("a runner evaluates a layer from the chunks that the tab fetched once", async () => {
  const { layer, built, urls, release } = await servedBuild("https://site.test/docs/");
  release();

  const first = await pageRunner(built, layer).import<Entry>(entry);
  await first.lazy();
  const fetched = urls();
  // A module has the URL of its chunk: what it names by its URL, like its
  // CSS, is a file of the build where it says.
  const greeting = await pageRunner(built, layer).import<{ css: string }>(
    `/${assets}/greeting-C3d4.js`,
  );
  expect(greeting.css).toBe(`https://site.test/docs/${assets}/greeting.css`);

  // The next page load has a module graph of its own, and evaluates every
  // module again, from what the tab fetched.
  const second = await pageRunner(built, layer).import<Entry>(entry);
  expect(second.loads).toBe(2);
  expect((await second.lazy()).default).toBe("lazy");
  expect(urls()).toEqual(fetched);
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
  const encoded = await fetchModule(`/${assets}/gr%65eting-C3d4.js`);
  expect((encoded as { result: { id: string } }).result.id).toBe(`/${assets}/greeting-C3d4.js`);
  // A module that is not the entry is imported by its id.
  expect(await built.moduleOf(layer, "vitest-plugin-rsc/other")).toBe("vitest-plugin-rsc/other");
});

test("a runner of a built layer asks again after a failure, and says what the build does not have", async () => {
  const { outDir, layer, built, urls, release } = await servedBuild("https://site.test/");
  release();
  const manifest = path.join(outDir, "vitest-plugin-rsc/react_client/manifest.json");
  const lazy = path.join(outDir, assets, "lazy-E5f6.js");

  // The manifest is not there, and then it is: the next page load asks for
  // it again.
  fs.renameSync(manifest, `${manifest}.gone`);
  await expect(pageRunner(built, layer).import(entry)).rejects.toThrow(
    "vitest-plugin-rsc: https://site.test/vitest-plugin-rsc/react_client/manifest.json responded with 404",
  );
  fs.renameSync(`${manifest}.gone`, manifest);
  const page = await pageRunner(built, layer).import<Entry>(entry);
  expect(page.greeting).toBe("hello you");
  expect(urls()).toHaveLength(5);

  // So is a chunk.
  fs.renameSync(lazy, `${lazy}.gone`);
  await expect(page.lazy()).rejects.toThrow(
    `vitest-plugin-rsc: https://site.test/${assets}/lazy-E5f6.js responded with 404`,
  );
  fs.renameSync(`${lazy}.gone`, lazy);
  await expect(pageRunner(built, layer).import<Entry>(entry)).resolves.toMatchObject({
    greeting: "hello you",
  });
  expect((await (await pageRunner(built, layer).import<Entry>(entry)).lazy()).default).toBe("lazy");

  // And a chunk that only the tab asks for, as an import of an import.
  const fresh = await servedBuild("https://site.test/");
  fresh.release();
  const name = path.join(fresh.outDir, assets, "name-J9k0.js");
  fs.renameSync(name, `${name}.gone`);
  await expect(pageRunner(fresh.built, fresh.layer).import(entry)).rejects.toThrow(
    `vitest-plugin-rsc: https://site.test/${assets}/name-J9k0.js responded with 404`,
  );
  fs.renameSync(`${name}.gone`, name);
  await expect(pageRunner(fresh.built, fresh.layer).import<Entry>(entry)).resolves.toMatchObject({
    greeting: "hello you",
  });

  // A module that the manifest does not have is not asked for.
  const asked = urls().length;
  await expect(pageRunner(built, layer).import(`/${assets}/gone.js`)).rejects.toThrow(
    `vitest-plugin-rsc: the build has no module /${assets}/gone.js`,
  );
  expect(urls()).toHaveLength(asked);
});

test("says so when the site answers with a page for a file of a layer", async () => {
  const page = "<!doctype html><title>Not found</title>";
  const html = () =>
    new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
  const manifest: BuiltManifest = {
    entry: { id: "entry", file: "a.js" },
    chunks: { "a.js": { imports: [], dynamicImports: [] } },
  };
  const layer = { base: "https://site.test/", manifest: "https://site.test/manifest.json" };
  const runner = (fetch: (url: string) => Response) =>
    pageRunner(
      createBuiltLayers(async (url) => fetch(String(url))),
      layer,
    );

  // Like a site that routes in the browser, with its `index.html`.
  await expect(runner(html).import("/a.js")).rejects.toThrow(
    "vitest-plugin-rsc: https://site.test/manifest.json responded with a page, not a file of the build",
  );
  // Also one that does not say what it answers with.
  const untyped = (url: string) =>
    url.endsWith(".json") ? Response.json(manifest) : new Response(page);
  await expect(runner(untyped).import("/a.js")).rejects.toThrow(
    "vitest-plugin-rsc: https://site.test/a.js responded with a page, not a file of the build",
  );
  // And a file that is no manifest.
  await expect(runner(() => Response.json({ a: 1 })).import("/a.js")).rejects.toThrow(
    "vitest-plugin-rsc: https://site.test/manifest.json is not the manifest of a layer",
  );
});

test("names the files of a layer as `experimental.renderBuiltUrl` says", async () => {
  const renderBuiltUrl = vi.fn<RenderBuiltAssetUrl>((file) => `https://cdn.test/${file}`);
  const { outDir, layer, built, asked, release } = await servedBuild("https://site.test/", {
    renderBuiltUrl,
  });
  release();

  // As Vite RSC asks for the URL of an asset, from the manifest of its layer.
  expect(renderBuiltUrl).toHaveBeenCalledWith(entryFile, {
    type: "asset",
    hostId: "vitest-plugin-rsc/react_client/manifest.json",
    hostType: "js",
    ssr: false,
  });
  expect(readManifest(outDir, "react_client").chunks[entryFile]!.url).toBe(
    `https://cdn.test/${entryFile}`,
  );
  // The page fetches a chunk from there, and the URL of its module is that.
  const greeting = await pageRunner(built, layer).import<{ css: string }>(
    `/${assets}/greeting-C3d4.js`,
  );
  expect(asked.slice(1).map(({ url }) => url)).toEqual([
    `https://cdn.test/${assets}/greeting-C3d4.js`,
    `https://cdn.test/${assets}/name-J9k0.js`,
  ]);
  expect(greeting.css).toBe(`https://cdn.test/${assets}/greeting.css`);
});

test("names a chunk by the code of `experimental.renderBuiltUrl`, which the page runs", async () => {
  const code = (file: string) => `globalThis.cdnUrl(${JSON.stringify(file)})`;
  const { outDir, layer, built, asked, release } = await servedBuild("https://site.test/", {
    renderBuiltUrl: (file) => ({ runtime: code(file) }),
  });
  release();
  const cdnUrl = vi.fn((file: string) => `https://cdn.test/${file}`);
  (globalThis as { cdnUrl?: unknown }).cdnUrl = cdnUrl;
  onTestFinished(() => void delete (globalThis as { cdnUrl?: unknown }).cdnUrl);

  expect(readManifest(outDir, "react_client").chunks[entryFile]!.runtime).toBe(code(entryFile));
  const page = await pageRunner(built, layer).import<Entry>(entry);
  expect(page.greeting).toBe("hello you");
  const chunks = [entryFile, `${assets}/greeting-C3d4.js`, `${assets}/name-J9k0.js`];
  expect(asked.slice(1).map(({ url }) => url)).toEqual(
    chunks.map((file) => `https://cdn.test/${file}`),
  );
  // Once for each chunk, also for the next page load.
  await pageRunner(built, layer).import<Entry>(entry);
  expect(cdnUrl.mock.calls).toEqual(chunks.map((file) => [file]));
});

test("names a chunk from the directory of the build when `experimental.renderBuiltUrl` leaves it", async () => {
  // A URL from the root of the site, and an empty one, which says nothing,
  // as for Vite.
  const rooted = await servedBuild("https://site.test/docs/", {
    renderBuiltUrl: (file) => (file.includes("greeting") ? "" : `/docs/${file}`),
  });
  rooted.release();
  const { chunks } = readManifest(rooted.outDir, "react_client");
  expect(chunks[entryFile]!.url).toBe(`/docs/${entryFile}`);
  expect(chunks[`${assets}/greeting-C3d4.js`]).not.toHaveProperty("url");
  await expect(pageRunner(rooted.built, rooted.layer).import<Entry>(entry)).resolves.toMatchObject({
    greeting: "hello you",
  });
  expect(rooted.urls().slice(1, 3)).toEqual([entryFile, `${assets}/greeting-C3d4.js`]);

  // As for a file the config asks to name from the file that names it.
  const relative = await servedBuild("https://site.test/", {
    renderBuiltUrl: () => ({ relative: true }),
  });
  relative.release();
  expect(readManifest(relative.outDir, "react_client").chunks[entryFile]).toEqual({
    imports: [`${assets}/greeting-C3d4.js`],
    dynamicImports: [`${assets}/lazy-E5f6.js`, `${assets}/later-G7h8.js`],
  });
  await expect(
    pageRunner(relative.built, relative.layer).import<Entry>(entry),
  ).resolves.toMatchObject({ greeting: "hello you" });
});

test("does not find a chunk by a name that every object has", async () => {
  const { layer, built, urls, release } = await servedBuild("https://site.test/");
  release();

  await expect(pageRunner(built, layer).import("/constructor")).rejects.toThrow(
    "vitest-plugin-rsc: the build has no module /constructor",
  );
  expect(urls()).toEqual(["vitest-plugin-rsc/react_client/manifest.json"]);
});

test("takes the entry of a layer by its name, not another chunk a plugin emits as one", async () => {
  const other = "vitest-plugin-rsc/react_client/assets/worker-Z9z9.js";
  const { outDir, plugin, builder } = setup({
    react_client: {
      ...entryOnly("react_client"),
      [other]: chunk(other, "export {};\n", { isEntry: true }),
    },
  });

  await (plugin.buildApp as Hook)(builder);

  expect(readManifest(outDir, "react_client").entry.file).toBe(
    "vitest-plugin-rsc/react_client/assets/entry-A0a0.js",
  );
});

test("writes the same manifest for the same bundle, in any order", async () => {
  const files = ["c-C3c3.js", "a-A1a1.js", "entry-B2b2.js"].map(
    (name) => `vitest-plugin-rsc/react_client/assets/${name}`,
  );
  const bundle = (order: string[]) =>
    Object.fromEntries(
      order.map((file) => [
        file,
        chunk(file, "export {};\n", {
          isEntry: file.includes("entry"),
          imports: files.slice(0, 2),
        }),
      ]),
    );
  const manifest = async (order: string[]) => {
    const { outDir, plugin, builder } = setup({ react_client: bundle(order) });
    await (plugin.buildApp as Hook)(builder);
    return fs.readFileSync(
      path.join(outDir, "vitest-plugin-rsc/react_client/manifest.json"),
      "utf8",
    );
  };

  expect(await manifest(files)).toBe(await manifest([...files].reverse()));
});

test("has the hash of a chunk of a layer cover how it is rewritten for the runner", () => {
  const { plugin } = setup();
  const augment = (environment: string) => call(plugin.augmentChunkHash, environment, {});

  // The rewrite comes after Rolldown has named the chunk.
  expect(augment("react_client")).toContain(toRunnerModule.toString());
  expect(augment("next_ssr")).toBe(augment("react_client"));
  // The rsc layer is the host's own build.
  expect(augment("client")).toBeUndefined();
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

test("tells the page where the manifests of the layers are, from the directory of the build", () => {
  const rendered = (renderBuiltUrl?: RenderBuiltAssetUrl) => {
    const { plugin } = setup({}, {}, { renderBuiltUrl });
    const id = call(plugin.resolveId, "client", "virtual:vitest-plugin-rsc/layers") as string;
    const code = call(plugin.load, "client", id) as string;
    return (
      call(plugin.renderChunk, "client", code, { fileName: "assets/index.js" }) as {
        code: string;
      }
    ).code;
  };
  const layers = (ssr: string, browser: string) =>
    `const directory = new URL("../", import.meta.url).href;\n` +
    `export default {\n` +
    `  "next_ssr": { base: directory, manifest: new URL(${ssr}, directory).href },\n` +
    `  "react_client": { base: directory, manifest: new URL(${browser}, directory).href },\n` +
    `};\n`;

  expect(rendered()).toBe(
    layers(
      `"vitest-plugin-rsc/next_ssr/manifest.json"`,
      `"vitest-plugin-rsc/react_client/manifest.json"`,
    ),
  );
  // Or where the config says, by a URL or by code, as Vite RSC asks for it.
  const renderBuiltUrl = vi.fn<RenderBuiltAssetUrl>((file) =>
    file.includes("next_ssr") ? `https://cdn.test/${file}` : { runtime: `window.cdn("${file}")` },
  );
  expect(rendered(renderBuiltUrl)).toBe(
    layers(
      `"https://cdn.test/vitest-plugin-rsc/next_ssr/manifest.json"`,
      `(window.cdn("vitest-plugin-rsc/react_client/manifest.json"))`,
    ),
  );
  expect(renderBuiltUrl).toHaveBeenCalledWith("vitest-plugin-rsc/next_ssr/manifest.json", {
    type: "asset",
    hostId: "",
    hostType: "js",
    ssr: false,
  });
  expect(rendered(() => ({ relative: true }))).toBe(rendered());

  // A dev server has the stub of ../index.ts.
  const { plugin } = setup();
  const dev = (plugin.resolveId as Hook).call(
    { environment: { name: "client", mode: "dev" } },
    "virtual:vitest-plugin-rsc/layers",
  );
  expect(dev).toBeUndefined();
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
  expect(warnings(ineffective(serverReferences))).toEqual([]);
  // The app imports it that way too: that one is the app's to hear of.
  const ofTheApp = ineffective(`${clientReferences}, app/components/lazy.tsx`);
  expect(warnings(ofTheApp)).toEqual([ofTheApp]);
});

test("rewrites a chunk into what a module runner evaluates", async () => {
  const rewritten = await toRunnerModule({
    fileName: "vitest-plugin-rsc/react_client/assets/page.js",
    code:
      `import { a } from "./a.js";\n` +
      `import { b } from "../b.js";\n` +
      // As Rolldown writes an `import()`.
      "export const load = () => import(`./lazy.js`);\n" +
      "export const pick = (name) => import(`./pages/${name}.js`);\n" +
      `export const page = [a, b];\n`,
  });

  // By the path of the file from the directory of the build, also an import
  // a directory up.
  expect(rewritten).toContain(`__vite_ssr_import__("/vitest-plugin-rsc/react_client/assets/a.js"`);
  expect(rewritten).toContain(`__vite_ssr_import__("/vitest-plugin-rsc/react_client/b.js"`);
  expect(rewritten).toContain(
    `__vite_ssr_dynamic_import__("/vitest-plugin-rsc/react_client/assets/lazy.js"`,
  );
  // One with something put into it stays as it is: the runner resolves it.
  expect(rewritten).toContain("__vite_ssr_dynamic_import__(`./pages/${name}.js`");
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
