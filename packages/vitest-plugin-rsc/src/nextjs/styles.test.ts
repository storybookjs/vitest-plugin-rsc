import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { build, createServer, type CSSOptions, type Rolldown } from "vite";
import { expect, onTestFinished, test } from "vitest";
import type { ComponentRoute, NextProject, NextRoute } from "./project.ts";
import {
  builtStylesheetsOf,
  componentPagePath,
  stylesheetsPath,
  type BuiltStylesheets,
} from "./styles-shared.ts";
import { createStyles, exportsOfStylesheet } from "./styles.ts";

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

// A project in a directory of its own, by its real path: Vite has a module by
// the real path of its file.
function createProject(files: Record<string, string>): string {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-built-styles-")),
  );
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

// The plugin's CSS alone, for a project with a page route, `/page`, of a
// layout and a page, and the route of a node, `/node`. The rsc layer is
// Vite's `client` environment, as under a host. A file ending in
// `.stories.js` is a file of the host.
function stylesOf(root: string) {
  const segmentFiles = ["app/layout.js", "app/page.js"].map((name) => path.join(root, name));
  const page = { kind: "page", page: "/page", pathname: "/" } as NextRoute;
  const node = { kind: "page", page: "/page", pathname: "/", component: "/node" } as ComponentRoute;
  const project = {
    assetPath: "/_next/",
    config: {},
    loadRouteEntry: async (route: NextRoute | ComponentRoute) => ({
      code: "",
      watchFiles: [],
      segmentFiles: route === page ? segmentFiles : [],
    }),
  } as unknown as NextProject;
  const isHostFile = (file: string) => file.endsWith(".stories.js");
  const styles = createStyles({
    getProject: () => project,
    environments: { rsc: "client", ssr: "next_ssr", browser: "react_client" },
    isServerCode: (file) => !isHostFile(file),
    isHostFile,
    pageRoutes: () =>
      new Map<string, NextRoute | ComponentRoute>([
        ["/page", page],
        ["/node", node],
      ]),
    builtClientFiles: () => [],
    lists: [],
  });
  const manager = { isScanBuild: false, clientReferenceMetaMap: {} };
  return {
    segmentFiles,
    styles,
    plugins: [{ name: "rsc:minimal", api: { manager } }, ...styles.plugins],
  };
}

// A static build of the project. The exports of an input are what it renders.
async function buildPage(files: Record<string, string>, inputs = ["app/layout.js", "app/page.js"]) {
  const root = createProject(files);
  const { styles, plugins } = stylesOf(root);
  const output = (await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins,
    build: {
      write: false,
      minify: false,
      rolldownOptions: {
        input: inputs.map((name) => path.join(root, name)),
        preserveEntrySignatures: "strict",
      },
    },
  })) as Rolldown.RolldownOutput;
  const [manifest] = styles.builtFiles();
  const built = JSON.parse(Buffer.from(manifest!.body).toString()) as BuiltStylesheets;
  return { root, output: output.output, built };
}

const layoutAndPage = {
  "app/layout.js": `export default function Layout() {}\n`,
  "app/page.js": `export default function Page() {}\n`,
};

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
      // Those of the node are those of the files that render it.
      "/node": { [componentPagePath]: [] },
    },
    hostFiles: {},
  });
});

test("links a stylesheet of a static build from wherever the build is served", () => {
  const built: BuiltStylesheets = {
    assetPath: "/_next/",
    routes: { "/page": { "/app/layout": ["_next/static/css/global-1.css"] } },
    hostFiles: {},
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

// Two story files, each with a component of its own, whose CSS has an element
// selector: what one story links would apply to the other.
const twoStories = {
  ...layoutAndPage,
  "stories/a.stories.js": `import { A } from "../app/a.js";\nexport default { component: A };\n`,
  "stories/b.stories.js": `import { B } from "../app/b.js";\nexport default { component: B };\n`,
  "app/a.js": `import "./a.css";\nexport const A = () => "a";\n`,
  "app/b.js": `import "./b.css";\nexport const B = () => "b";\n`,
  "app/a.css": `h2 { color: red }`,
  "app/b.css": `h2 { color: blue }`,
};

test("has the dev server link the CSS of the files that render a node, and of no other file", async () => {
  const root = createProject(twoStories);
  const { plugins } = stylesOf(root);
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, ws: false },
    environments: { react_client: {} },
    plugins,
  });
  onTestFinished(() => server.close());
  const site = http.createServer(server.middlewares);
  await new Promise<void>((resolve) => site.listen(0, resolve));
  onTestFinished(() => new Promise<void>((resolve) => site.close(() => resolve())));
  // The host has loaded both story files.
  for (const file of ["/stories/a.stories.js", "/stories/b.stories.js"]) {
    await server.environments.client.transformRequest(file);
  }
  const ask = async (...files: string[]) => {
    const query = new URLSearchParams({ entry: "/node", inline: "false" });
    for (const file of files) query.append("file", file);
    const { port } = site.address() as AddressInfo;
    return fetch(`http://localhost:${port}${stylesheetsPath}?${query}`);
  };

  // By its path from the root, or its absolute one.
  expect(await (await ask("./stories/a.stories.js")).json()).toEqual({
    [componentPagePath]: [{ path: "static/css/app/a.css" }],
  });
  expect(await (await ask(path.join(root, "stories/b.stories.js"))).json()).toEqual({
    [componentPagePath]: [{ path: "static/css/app/b.css" }],
  });
  // In the order of the files.
  expect(await (await ask("./stories/b.stories.js", "./stories/a.stories.js")).json()).toEqual({
    [componentPagePath]: [{ path: "static/css/app/b.css" }, { path: "static/css/app/a.css" }],
  });
  // Without a file, those of every file of the host that was loaded.
  expect(await (await ask()).json()).toEqual({
    [componentPagePath]: [{ path: "static/css/app/a.css" }, { path: "static/css/app/b.css" }],
  });
  // Not what a file of the app imports.
  const other = await ask("./stories/a.stories.js", "./app/b.js");
  expect(other.status).toBe(403);
  expect(await other.text()).toContain(
    `${root}/app/b.js renders a node, and is no file of the host`,
  );
});

test("builds the CSS of a node per file of the host, by its path from the root", async () => {
  const { root, built, output } = await buildPage(twoStories, [
    ...Object.keys(layoutAndPage),
    "stories/a.stories.js",
    "stories/b.stories.js",
  ]);

  const fileOf = (name: string) =>
    output.find((file) => file.fileName.startsWith(`_next/static/css/${name}-`))!.fileName;
  expect(built.hostFiles).toEqual({
    "stories/a.stories.js": [fileOf("a")],
    "stories/b.stories.js": [fileOf("b")],
  });
  expect(built.routes["/node"]).toEqual({ [componentPagePath]: [] });
  // Nothing of the machine that built it.
  expect(JSON.stringify(built.hostFiles)).not.toContain(root);

  // A story links the CSS of its own file, as with a dev server.
  const story = (files?: string[]) =>
    builtStylesheetsOf(built, "/node", "http://localhost/", files)[componentPagePath];
  expect(story(["./stories/a.stories.js"])).toEqual([{ path: fileOf("a").slice("_next/".length) }]);
  expect(story(["stories/b.stories.js"])).toEqual([{ path: fileOf("b").slice("_next/".length) }]);
  // Without a file, those of every file of the host.
  expect(story()).toHaveLength(2);
});

test("names a file of public/ with a query or a fragment in a stylesheet of a static build", async () => {
  const { output } = await buildPage({
    ...layoutAndPage,
    "app/layout.js": `import "./icons.css";\nexport default function Layout() {}\n`,
    "app/icons.css":
      `@font-face { font-family: Icons; src: url(/fonts/icons.woff2?v=4) format("woff2"), ` +
      `url("/fonts/icons.woff2#iefix") format("woff2") }\n` +
      `body { background: url(/dot.png) }`,
    "public/fonts/icons.woff2": "font",
    "public/dot.png": "png",
  });

  const css = output.find((file) => file.fileName.startsWith("_next/static/css/icons-"));
  const source = String((css as Rolldown.OutputAsset).source);
  expect(source).not.toContain("__VITE_PUBLIC_ASSET__");
  // By the way from the stylesheet, with the query and the fragment.
  expect(source).toContain("url(../../../fonts/icons.woff2?v=4)");
  expect(source).toContain('url("../../../fonts/icons.woff2#iefix")');
  expect(source).toContain("url(../../../dot.png)");
});
