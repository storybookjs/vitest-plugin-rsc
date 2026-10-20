import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  build,
  createServer,
  normalizePath,
  type CSSOptions,
  type Plugin,
  type Rolldown,
} from "vite";
import { expect, onTestFinished, test } from "vitest";
import type { NextProject } from "./project.ts";
import { componentPagePath, type BuiltFiles } from "./styles-shared.ts";
import { builtHostFileKey, createStyles, exportsOfStylesheet, isCode, linked } from "./styles.ts";

// The module that the installed Vite makes of a stylesheet for a client, of
// which the plugin keeps the exports, and not the `<style>`. As the plugin
// sees it: after Vite's CSS plugins, before its import analysis. And the CSS
// that the dev server serves for a `<link>` to the file.
async function compileStylesheet(
  name: string,
  source: string,
  css?: CSSOptions,
): Promise<{ code: string; css: string }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-styles-"));
  fs.writeFileSync(path.join(root, name), source);
  let seen: string | undefined;
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    css,
    server: { middlewareMode: true, ws: false },
    plugins: [
      {
        name: "seen",
        enforce: "post",
        transform(code, id) {
          if (id.endsWith(name)) seen = code;
        },
      },
    ],
  });
  try {
    await server.environments.client.transformRequest(`/${name}`);
    const direct = await server.environments.client.transformRequest(`/${name}?direct`);
    return { code: seen!, css: direct!.code };
  } finally {
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// What a module of the exports gives the code that imports it.
const load = (code: string): Promise<Record<string, unknown>> =>
  import(`data:text/javascript,${encodeURIComponent(code)}`);

test("keeps the class names of a CSS module, without the <style> Vite adds", async () => {
  const compiled = await compileStylesheet(
    "card.module.css",
    ".card { color: red } .card-title { color: blue }",
  );

  const exports = exportsOfStylesheet(compiled.code, "card.module.css");

  expect(exports).not.toContain("updateStyle");
  const loaded = await load(exports);
  expect(compiled.css).toContain(`.${loaded.card as string}`);
  expect(loaded.default).toEqual({ card: loaded.card, "card-title": expect.any(String) });
});

test("keeps the constant of a class name that is no name of a variable", async () => {
  const compiled = await compileStylesheet(
    "words.module.css",
    ".switch { color: red } .café { color: blue } :export { new: 1 }",
  );

  const loaded = await load(exportsOfStylesheet(compiled.code, "words.module.css"));

  expect(compiled.css).toContain(`.${loaded.switch as string}`);
  expect(loaded.default).toEqual({
    switch: loaded.switch,
    café: expect.any(String),
    new: "1",
  });
});

test.each([
  ["PostCSS", undefined],
  ["Lightning CSS", { transformer: "lightningcss" } as const],
])("has the class names of the CSS the dev server serves, with %s", async (_, css) => {
  const compiled = await compileStylesheet("card.module.css", ".card { color: red }", css);

  const { card } = await load(exportsOfStylesheet(compiled.code, "card.module.css"));

  expect(card).toEqual(expect.any(String));
  expect(compiled.css).toContain(`.${card as string}`);
});

test("exports nothing for a stylesheet that is no CSS module", async () => {
  const { code } = await compileStylesheet("global.css", "body { color: red }");

  expect(exportsOfStylesheet(code, "global.css")).toBe("export {}");
});

test("says so when the exports of Vite's module need more than the class names", () => {
  const style = 'import { updateStyle } from "/@vite/client"\n';
  expect(() => exportsOfStylesheet(`${style}export default updateStyle`, "card.css")).toThrow(
    /the exports of its module for the stylesheet card\.css need more .*`updateStyle`/,
  );
  expect(() => exportsOfStylesheet("export default import.meta.hot", "card.css")).toThrow(
    /the exports of its module for the stylesheet card\.css need more/,
  );
  expect(() => exportsOfStylesheet('export * from "./other.css"', "card.css")).toThrow(
    /the exports of its module for the stylesheet card\.css need more/,
  );
});

// The walk for the stylesheets of a route follows modules of code, and leaves
// out a file that is no code, which Vite can list with the imports of a module.
test.each([
  ["/app/page.tsx", true],
  ["/node_modules/.vite/deps/react.js?v=1234", true],
  ["/lib/config.cts", true],
  ["\0virtual:vitest-plugin-rsc/next-route/3", true],
  ["/app/a.b/page", true],
  ["/docs/post.mdx", true],
  ["/content/page.md", true],
  ["/node_modules/@electric-sql/pglite/dist/pglite.data", false],
  ["/node_modules/@electric-sql/pglite/dist/pglite.wasm", false],
  ["/assets/photo.jpg?import", false],
  ["/app/data.json", false],
])("takes %s for code: %s", (id, code) => {
  expect(isCode(id, ["tsx", "ts", "md"])).toBe(code);
});

// What a static build writes into `next-files.json`: the build's plugin,
// driven through the hooks of a build of the rsc layer and then the layer of
// the browser, over a module graph of its own. `root` is the root as the
// config has it, which `isHostFile` matches against, and `real` where Vite
// has the modules, by their real paths.
type Graph = {
  /** What each module imports, in the rsc layer and in the browser layer. */
  rsc: Record<string, string[]>;
  browser: Record<string, string[]>;
  /** The modules with `"use client"`, a reference in the rsc layer. */
  references: string[];
  /** The stylesheets Vite's CSS plugin compiles, by layer. */
  sources: { rsc: string[]; browser: string[] };
};
const list = "\0virtual:vitest-plugin-rsc/next-routes-page";
const builtCss = (dir: string, file: string) => linked(`${dir}/${file}`, true);

async function buildStylesheets(root: string, real: string, graph: Graph) {
  const route = { kind: "page", page: "/notes/page", pathname: "/notes", component: "node" };
  const styles = createStyles({
    getProject: () =>
      ({
        root,
        assetPath: "/_next/",
        config: {},
        loadRouteEntry: async () => ({
          segments: [{ file: `${real}/app/layout.tsx`, stylesheetsKey: "app/layout" }],
        }),
      }) as unknown as NextProject,
    environments: { rsc: "client", ssr: "ssr", browser: "react_client" },
    isServerCode: (file) => !file.startsWith(`${root}/host/`),
    isHostFile: (file) => file.startsWith(`${root}/host/`),
    pageRoutes: () => new Map([["/app/notes/page", route as never]]),
    entryIdOf: () => "\0virtual:vitest-plugin-rsc/next-route/0",
    lists: [list],
  });
  const plugin = styles.plugins.find(({ name }) => name === "vitest-plugin-rsc:next-styles-build")!;
  type Hook = (this: unknown, ...args: unknown[]) => unknown;
  const hook = (name: keyof Plugin) => plugin[name] as Hook;
  const manager = {
    isScanBuild: false,
    clientReferenceMetaMap: Object.fromEntries(
      graph.references.map((id) => [id, { importId: id }]),
    ),
  };
  hook("configResolved").call(undefined, {
    plugins: [{ name: "rsc:minimal", api: { manager } }],
    publicDir: "",
  });

  const emitted: string[] = [];
  async function build(environment: string, imports: Record<string, string[]>, sources: string[]) {
    const context = {
      environment: { name: environment },
      getModuleIds: () => [...Object.keys(imports), ...Object.values(imports).flat()].values(),
      getModuleInfo: (id: string) =>
        imports[id] ? { importedIds: imports[id], dynamicallyImportedIds: [] } : null,
      resolve: async (id: string) => ({ id }),
      emitFile: ({ fileName }: { fileName: string }) => emitted.push(fileName),
    };
    hook("buildStart").call(context);
    for (const source of sources) {
      hook("transform").call(context, `.${source} {}`, builtCss(real, source));
    }
    await hook("buildEnd").call(context);
    // No chunks: the modules of a route are a test of their own, below.
    hook("generateBundle").call(context, {}, {});
  }
  await build("client", graph.rsc, graph.sources.rsc);
  await build("react_client", graph.browser, graph.sources.browser);

  const [file] = styles.builtFiles();
  expect(file!.pathname).toBe("/vitest-plugin-rsc/next-files.json");
  return {
    built: JSON.parse(Buffer.from(file!.body).toString()) as BuiltFiles,
    named: (name: string) => emitted.find((fileName) => fileName.includes(`/${name}-`))!,
  };
}

test("lists the stylesheets of every route and of every file of the host in a build", async () => {
  const root = "/project";
  const css = (file: string) => builtCss(root, file);
  const { built, named } = await buildStylesheets(root, root, {
    rsc: {
      [`${root}/app/layout.tsx`]: [css("app/global.css")],
      // A host file that renders a node, with a Server Component of the
      // app, a Client Component of the app, and a stylesheet of its own.
      [`${root}/host/node.tsx`]: [
        `${root}/app/card.tsx`,
        `${root}/app/client.tsx`,
        `${root}/host/own.css`,
      ],
      [`${root}/app/card.tsx`]: [css("app/card.module.css")],
      [`${root}/app/client.tsx`]: [],
      // The page of the host, which imports the list of the routes too.
      [`${root}/host/main.tsx`]: [`${root}/host/node.tsx`, list],
      [list]: [`${root}/app/page.tsx`],
      [`${root}/app/page.tsx`]: [css("app/page.css")],
      // A host file without stylesheets, and what is no file of the host's
      // code: a query of Vite's, a virtual module, an image.
      [`${root}/host/plain.tsx`]: [
        `${root}/host/plain.tsx?raw`,
        `\0${root}/host/virtual.tsx`,
        `${root}/host/logo.svg`,
      ],
      [`${root}/host/own.css`]: [],
      // A host file with `"use client"`.
      [`${root}/host/story.tsx`]: [],
    },
    browser: {
      [`${root}/app/client.tsx`]: [css("app/client.css")],
      [`${root}/host/story.tsx`]: [`${root}/app/client.tsx`],
    },
    references: [`${root}/app/client.tsx`, `${root}/host/story.tsx`],
    sources: {
      rsc: ["app/global.css", "app/card.module.css", "app/page.css"],
      browser: ["app/client.css"],
    },
  });
  expect(built).toEqual({
    assetPath: "/_next/",
    routes: {
      "/app/notes/page": { "app/layout": [named("global")], [componentPagePath]: [] },
    },
    // By their paths from the root, in their order: no file of the app, and
    // no stylesheet. What a file reaches goes up to the lists of the routes,
    // and into the browser layer from a Client Component.
    hostFiles: {
      "host/main.tsx": [named("card.module"), named("client")],
      "host/node.tsx": [named("card.module"), named("client")],
      "host/plain.tsx": [],
      "host/story.tsx": [named("client")],
    },
    // Those with "use client", which a host links as it uses them.
    clientFiles: ["host/story.tsx"],
    chunks: [],
    modules: { "/app/notes/page": [] },
  });
  expect(Object.keys(built.hostFiles)).toEqual(Object.keys(built.hostFiles).sort());
});

// A root that is a link, like a project in `/tmp` on macOS: Vite has the
// modules by their real paths, and `host.files` is from the root as the
// config has it.
test("finds the files of the host under a root that is a link", async () => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-link-")));
  try {
    const real = normalizePath(path.join(temp, "real"));
    const root = normalizePath(path.join(temp, "link"));
    fs.mkdirSync(real);
    fs.symlinkSync(real, root, "dir");
    const { built, named } = await buildStylesheets(root, real, {
      rsc: {
        [`${real}/app/layout.tsx`]: [],
        [`${real}/host/node.tsx`]: [`${real}/app/card.tsx`],
        [`${real}/app/card.tsx`]: [builtCss(real, "app/card.module.css")],
      },
      browser: {},
      references: [],
      sources: { rsc: ["app/card.module.css"], browser: [] },
    });
    expect(built.hostFiles).toEqual({ "host/node.tsx": [named("card.module")] });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

// The key of a file of the host in a build, which the prefix of a file with
// `"use client"` names it by: from the real path of the root, also up out of
// it, like a package in the `node_modules` of a workspace.
test("keys a file of the host in a build by its path from the real root", () => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-key-")));
  onTestFinished(() => fs.rmSync(temp, { recursive: true, force: true }));
  const real = normalizePath(path.join(temp, "real"));
  const root = normalizePath(path.join(temp, "link"));
  fs.mkdirSync(real);
  fs.symlinkSync(real, root, "dir");

  expect(builtHostFileKey(`${real}/host/badge.tsx`, root)).toBe("host/badge.tsx");
  expect(builtHostFileKey(`${temp}/node_modules/.pnpm/a@1/node_modules/a/story.js`, real)).toBe(
    "../node_modules/.pnpm/a@1/node_modules/a/story.js",
  );
});

// A static build of a layout, by the plugin's CSS alone, with Vite's own CSS
// plugin, which names a file of `public/` in a stylesheet by a placeholder of
// its own until the file has its name. The rsc layer is Vite's `client`
// environment, as under a host.
test("names a file of public/ with a query or a fragment in a stylesheet of a static build", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-public-")));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    "app/layout.js": `import "./icons.css";\nexport default function Layout() {}\n`,
    "app/icons.css":
      `@font-face { font-family: Icons; src: url(/fonts/icons.woff2?v=4) format("woff2"), ` +
      `url("/fonts/icons.woff2#iefix") format("woff2") }\n` +
      `body { background: url(/dot.png) }`,
    "public/fonts/icons.woff2": "font",
    "public/dot.png": "png",
  };
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  const layout = path.join(root, "app/layout.js");
  const route = { kind: "page", page: "/page", pathname: "/" };
  const styles = createStyles({
    getProject: () =>
      ({
        root,
        assetPath: "/_next/",
        config: {},
        loadRouteEntry: async () => ({
          segments: [{ file: layout, stylesheetsKey: "app/layout" }],
        }),
      }) as unknown as NextProject,
    environments: { rsc: "client", ssr: "next_ssr", browser: "react_client" },
    isServerCode: () => true,
    isHostFile: () => false,
    pageRoutes: () => new Map([["/page", route as never]]),
    entryIdOf: () => layout,
    lists: [],
  });
  const manager = { isScanBuild: false, clientReferenceMetaMap: {} };
  const { output } = (await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [{ name: "rsc:minimal", api: { manager } }, ...styles.plugins],
    // The exports of the layout are what the route renders.
    build: {
      write: false,
      minify: false,
      rolldownOptions: { input: layout, preserveEntrySignatures: "strict" },
    },
  })) as Rolldown.RolldownOutput;

  const css = output.find((file) => file.fileName.startsWith("_next/static/css/icons-"));
  expect(css?.type).toBe("asset");
  const source = String((css as Rolldown.OutputAsset).source);
  expect(source).not.toContain("__VITE_PUBLIC_ASSET__");
  // By the way from the stylesheet, with the query and the fragment.
  expect(source).toContain("url(../../../fonts/icons.woff2?v=4)");
  expect(source).toContain('url("../../../fonts/icons.woff2#iefix")');
  expect(source).toContain("url(../../../dot.png)");
});

// The modules of a route in a static build, which a page load starts at once:
// the chunk of its entry, those of what its loader tree imports, and every
// chunk those import, read off a build of the rsc layer. Not a chunk that a
// segment imports with `import()`, which the segment loads when it asks, nor
// one the module that lists the routes imports, which the page has.
test("lists the modules of every route in a static build, without what a segment imports later", async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-mods-")));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    // The entry of the route, with a loader tree of two segments.
    "entry.js": 'export const tree = [() => import("./layout.js"), () => import("./page.js")];',
    "layout.js": 'import { shared } from "./shared.js";\nexport const layout = shared;',
    "page.js":
      'import { shared } from "./shared.js";\nimport { deep } from "./deep.js";\n' +
      'export const page = [shared, deep];\nexport const later = () => import("./lazy.js");',
    "shared.js": 'export const shared = "shared";',
    // Only the page imports it, so it is in the chunk of the page.
    "deep.js": 'export const deep = "deep";',
    "lazy.js": 'export const lazy = "lazy";',
    // The module that lists the routes, which the page has loaded.
    "list.js": 'import { shared } from "./shared.js";\nexport const list = [shared];',
  };
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), content);
  }
  const entry = path.join(root, "entry.js");
  const list = path.join(root, "list.js");
  const styles = createStyles({
    getProject: () =>
      ({
        root,
        assetPath: "/_next/",
        config: {},
        loadRouteEntry: async () => ({
          segments: [{ file: path.join(root, "page.js"), stylesheetsKey: "page" }],
        }),
      }) as unknown as NextProject,
    environments: { rsc: "client", ssr: "next_ssr", browser: "react_client" },
    isServerCode: () => true,
    isHostFile: () => false,
    pageRoutes: () => new Map([["/page", { kind: "page", page: "/page" } as never]]),
    entryIdOf: () => entry,
    lists: [list],
  });
  const manager = { isScanBuild: false, clientReferenceMetaMap: {} };
  const { output } = (await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [{ name: "rsc:minimal", api: { manager } }, ...styles.plugins],
    build: {
      write: false,
      minify: false,
      rolldownOptions: { input: [entry, list], preserveEntrySignatures: "strict" },
    },
  })) as Rolldown.RolldownOutput;
  const chunkOf = (file: string) =>
    output.find(
      (chunk): chunk is Rolldown.OutputChunk =>
        chunk.type === "chunk" && chunk.moduleIds.includes(path.join(root, file)),
    )!.fileName;

  const [file] = styles.builtFiles();
  const built = JSON.parse(Buffer.from(file!.body).toString()) as BuiltFiles;
  const listed = built.modules["/page"]!.map((index) => built.chunks[index]);
  // The entry's own first.
  expect(listed[0]).toBe(chunkOf("entry.js"));
  for (const file of ["layout.js", "page.js", "deep.js"]) expect(listed).toContain(chunkOf(file));
  for (const file of ["lazy.js", "shared.js", "list.js"]) {
    expect(listed).not.toContain(chunkOf(file));
  }
});
