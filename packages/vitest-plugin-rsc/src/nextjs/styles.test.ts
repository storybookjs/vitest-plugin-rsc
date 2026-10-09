import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type CSSOptions } from "vite";
import { expect, test } from "vitest";
import { exportsOfStylesheet, isCode } from "./styles.ts";

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
