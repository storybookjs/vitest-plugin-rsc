import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build, createServer, type CSSOptions, type Rolldown } from "vite";
import { expect, onTestFinished, test } from "vitest";
import type { NextProject, NextRoute } from "./project.ts";
import { builtStylesheetsOf, type BuiltStylesheets } from "./styles-command.ts";
import { createStyles, exportsOfStylesheet, isCode } from "./styles.ts";

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

// A static build of a page with a layout, by the plugin's CSS alone: the rsc
// layer is Vite's `client` environment, as under a host.
async function buildPage(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-built-styles-"));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  const segmentFiles = ["app/layout.js", "app/page.js"].map((name) => path.join(root, name));
  const route: NextRoute = { kind: "page", page: "/page", pathname: "/" } as NextRoute;
  const project = {
    assetPath: "/_next/",
    config: {},
    loadRouteEntry: async () => ({ code: "", watchFiles: [], segmentFiles }),
  } as unknown as NextProject;
  const styles = createStyles({
    getProject: () => project,
    environments: { rsc: "client", ssr: "next_ssr", browser: "react_client" },
    isServerCode: () => true,
    isHostFile: () => false,
    pageRoutes: () => new Map([["/page", route]]),
    builtClientFiles: () => [],
    lists: [],
  });
  const manager = { isScanBuild: false, clientReferenceMetaMap: {} };
  const output = (await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [{ name: "rsc:minimal", api: { manager } }, ...styles.plugins],
    // The exports of a page are what the route renders.
    build: {
      write: false,
      minify: false,
      rolldownOptions: { input: segmentFiles, preserveEntrySignatures: "strict" },
    },
  })) as Rolldown.RolldownOutput;
  const [manifest] = styles.builtFiles();
  return {
    root,
    output: output.output,
    built: JSON.parse(Buffer.from(manifest!.body).toString()) as BuiltStylesheets,
  };
}

test("builds each stylesheet of a route into a file that Next links, and none into a chunk", async () => {
  const { root, output, built } = await buildPage({
    "app/layout.js": `import "./global.css";\nexport default function Layout() {}\n`,
    "app/page.js": `import styles from "./card.module.css";\nexport default () => styles.card;\n`,
    "app/global.css": `body { background: url(./dot.png) }`,
    "app/card.module.css": `.card { color: red }`,
    // Larger than what Vite inlines.
    "app/dot.png": "x".repeat(8000),
  });

  const css = output.filter((file) => file.fileName.endsWith(".css"));
  expect(css.map((file) => file.fileName).sort()).toEqual([
    expect.stringMatching(/^_next\/static\/css\/card\.module-\w{8}\.css$/),
    expect.stringMatching(/^_next\/static\/css\/global-\w{8}\.css$/),
  ]);
  const source = (name: string) =>
    String((css.find((file) => file.fileName.includes(name)) as Rolldown.OutputAsset).source);
  const image = output.find((file) => file.fileName.endsWith(".png"))!.fileName;
  // A file it names, by the way from the stylesheet.
  expect(source("global")).toContain(`url(../../../${image})`);
  // The class names of the module are those of the stylesheet.
  const className = /\.(\w*card\w+)/.exec(source("card.module"))?.[1];
  expect(className).toBeDefined();
  const chunks = output.filter((file) => file.type === "chunk");
  expect(chunks.some((chunk) => chunk.code.includes(`"${className}"`))).toBe(true);

  expect(built).toEqual({
    assetPath: "/_next/",
    routes: {
      "/page": {
        [path.join(root, "app/layout")]: [css.find((f) => f.fileName.includes("global"))!.fileName],
        [path.join(root, "app/page")]: [css.find((f) => f.fileName.includes("card"))!.fileName],
      },
    },
  });
});

test("links a stylesheet of a static build from wherever the build is served", () => {
  const built: BuiltStylesheets = {
    assetPath: "/_next/",
    routes: { "/page": { "/app/layout": ["_next/static/css/global-1.css"] } },
  };

  expect(builtStylesheetsOf(built, "/page", "http://localhost/")).toEqual({
    "/app/layout": [{ path: "static/css/global-1.css" }],
  });
  // Up from where Next links it, `/_next/`, to the root of the site.
  expect(builtStylesheetsOf(built, "/page", "http://localhost/docs/site/")).toEqual({
    "/app/layout": [{ path: "../docs/site/_next/static/css/global-1.css" }],
  });
  const prefixed = { ...built, assetPath: "/shop/_next/" };
  prefixed.routes = { "/page": { "/app/layout": ["shop/_next/static/css/global-1.css"] } };
  expect(builtStylesheetsOf(prefixed, "/page", "http://localhost/")).toEqual({
    "/app/layout": [{ path: "static/css/global-1.css" }],
  });
  expect(builtStylesheetsOf(built, "/other", "http://localhost/")).toEqual({});
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
