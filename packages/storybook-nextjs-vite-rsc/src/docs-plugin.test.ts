import path from "node:path";
import { normalizeStories } from "storybook/internal/common";
import { expect, test } from "vitest";
import { docsPlugins } from "./docs-plugin.ts";

// The plugins as Vite calls their hooks, in a project at /repo with its
// stories in /repo/stories, and Storybook run from /repo.
const workingDir = "/repo";
const plugins = docsPlugins({
  workingDir,
  stories: normalizeStories(["../stories/**/*.mdx", "../stories/**/*.stories.tsx"], {
    configDir: "/repo/.storybook",
    workingDir,
  }),
  previewFile: "/fw/dist/preview.js",
});
const plugin = (name: string) => plugins.find((plugin) => plugin.name === name)!;

type Hook = (this: object, ...args: never[]) => unknown;
const handlerOf = (hook: unknown): Hook =>
  (typeof hook === "function" ? hook : (hook as { handler: Hook }).handler) as Hook;

// What a hook gets as `this`: the environment, and Vite's resolve of a
// relative import.
const contextOf = (environment: string) => ({
  environment: { name: environment },
  resolve: async (source: string, importer: string) =>
    source.startsWith(".") ? { id: path.posix.join(path.posix.dirname(importer), source) } : null,
  error: (message: string) => {
    throw new Error(message);
  },
});

async function transform(name: string, environment: string, code: string, id: string) {
  const hook = handlerOf(plugin(name).transform);
  const result = (await hook.call(contextOf(environment), code as never, id as never)) as
    | { code: string }
    | undefined;
  return result?.code;
}

// Compiled MDX, as `storybook:mdx-plugin` gives it, with an import of each
// kind and some that are not of story files.
const mdx = [
  'import { Canvas, Meta } from "@storybook/addon-docs/blocks";',
  'import * as Greeting from "./greeting.stories.tsx";',
  'import meta, { Pressed, Labelled as Other } from "./nested/press-button.stories.tsx";',
  'import { helper } from "./helper.ts";',
  'import Readme from "./readme.mdx";',
  "export default function MDXContent() {}",
].join("\n");
const id = "/repo/stories/introduction.mdx";

test('in the rsc layer an MDX file has "use client", and its story files above the load line', async () => {
  const prepended = await transform("storybook-nextjs-vite-rsc:mdx", "client", mdx, id);
  expect(prepended).toBe(`"use client";\n${mdx}`);
  // What Vite RSC and the plugin made of it: the load line of the plugin,
  // and the reference module.
  const reference = 'await loadClientFile("/stories/introduction.mdx");\nexport default ref;';
  const code = await transform(
    "storybook-nextjs-vite-rsc:mdx-story-files",
    "client",
    reference,
    id,
  );
  const storyFiles = 'globalThis[Symbol.for("@storybook/nextjs-vite-rsc/story-files")]';
  expect(code).toBe(
    [
      'import { experimental_loadStoryFile as __loadStoryFile } from "/fw/dist/preview.js";',
      'import * as __storyFile0 from "/repo/stories/greeting.stories.tsx";',
      'import * as __storyFile1 from "/repo/stories/nested/press-button.stories.tsx";',
      `const __storyFiles = (${storyFiles} ??= new Map());`,
      '__storyFiles.set("./stories/greeting.stories.tsx", await __loadStoryFile(' +
        '"./stories/greeting.stories.tsx", () => __storyFile0));',
      '__storyFiles.set("./stories/nested/press-button.stories.tsx", await __loadStoryFile(' +
        '"./stories/nested/press-button.stories.tsx", () => __storyFile1));',
      reference,
    ].join("\n"),
  );
});

test("in the browser layer an MDX file has the store's exports of its story files", async () => {
  const code = await transform("storybook-nextjs-vite-rsc:mdx", "react_client", mdx, id);
  const storyFiles = 'globalThis[Symbol.for("@storybook/nextjs-vite-rsc/story-files")]';
  const start = mdx.indexOf("import meta");
  expect(code!.split("\n")).toEqual([
    "const __storyFileOf = (importPath) => {",
    `  const exports = ${storyFiles}?.get(importPath);`,
    "  if (exports) return exports;",
    "  throw new Error(`The stories of ${importPath} are not loaded: an MDX file has them as " +
      "Storybook loads it, as a docs page, not as another file imports it.`);",
    "};",
    'import { Canvas, Meta } from "@storybook/addon-docs/blocks";',
    'const Greeting = __storyFileOf("./stories/greeting.stories.tsx");',
    `const __storyFile${start} = __storyFileOf("./stories/nested/press-button.stories.tsx"); ` +
      `const meta = __storyFile${start}.default; ` +
      `const { Pressed, "Labelled": Other } = __storyFile${start};`,
    'import { helper } from "./helper.ts";',
    'import Readme from "./readme.mdx";',
    "export default function MDXContent() {}",
  ]);
});

test("in the rsc layer the preview of addon-docs has no renderer", async () => {
  const docsPreview = plugin("storybook-nextjs-vite-rsc:addon-docs-preview");
  const applies = docsPreview.applyToEnvironment as (environment: { name: string }) => boolean;
  expect([applies({ name: "client" }), applies({ name: "react_client" })]).toEqual([true, false]);
  // Storybook's Vite builder imports it by its path.
  const file = "/repo/node_modules/@storybook/addon-docs/dist/preview.js";
  const resolveId = handlerOf(docsPreview.resolveId);
  const resolved = (await resolveId.call(contextOf("client"), file as never)) as string;
  expect(await resolveId.call(contextOf("client"), file as never, resolved as never)).toBe(
    undefined,
  );
  const load = handlerOf(docsPreview.load);
  expect(await load.call(contextOf("client"), resolved as never)).toBe(
    [
      `import { parameters as docsParameters } from "${file}";`,
      `export * from "${file}";`,
      "const { renderer, ...docs } = docsParameters.docs;",
      "export const parameters = { ...docsParameters, docs };",
    ].join("\n"),
  );
});

test("a module of the rsc layer that imports Storybook's theming says where it goes", async () => {
  const check = (code: string, file = "/repo/.storybook/preview.tsx") =>
    transform("storybook-nextjs-vite-rsc:browser-only-imports", "client", code, file);
  await expect(check('import { themes } from "storybook/theming";')).rejects.toThrow(
    "preview.tsx imports storybook/theming, which renders with React DOM, in the browser: " +
      "preview.tsx runs on React's server build, as the preview file and a story file without " +
      '"use client" do, where it does not load. Import it from a file with "use client", and a ' +
      "theme from storybook/theming/create.",
  );
  // A story file without the directive, whose `docs.page` has the blocks.
  const storyFile = "/repo/stories/greeting.stories.tsx";
  await expect(
    check('import { Title } from "@storybook/addon-docs/blocks";', storyFile),
  ).rejects.toThrow("greeting.stories.tsx imports @storybook/addon-docs/blocks");
  await expect(check('export { Title } from "@storybook/addon-docs/blocks";')).rejects.toThrow(
    "preview.tsx imports @storybook/addon-docs/blocks",
  );
  // A file with "use client" is a reference module there, a type is no
  // import, and `storybook/theming/create` has no React.
  expect(await check('"use client";\nimport { Title } from "@storybook/addon-docs/blocks";')).toBe(
    undefined,
  );
  expect(await check('import type { Theme } from "storybook/theming";')).toBe(undefined);
  expect(await check('import { type Theme } from "storybook/theming";')).toBe(undefined);
  expect(await check('export type { Theme } from "storybook/theming";')).toBe(undefined);
  expect(await check('import { create } from "storybook/theming/create";')).toBe(undefined);
});

test("addon-docs's React goes, its MDXProvider stays, and the browser layer pre-bundles it", async () => {
  const config = {
    resolve: {
      alias: [
        { find: "react", replacement: "/repo/node_modules/react" },
        { find: "react-dom", replacement: "/repo/node_modules/react-dom" },
        { find: "react-dom/server", replacement: "/repo/node_modules/react-dom/server.js" },
        { find: "@mdx-js/react", replacement: "/repo/node_modules/@mdx-js/react" },
      ],
    },
    // What addon-docs has the preview pre-bundle.
    optimizeDeps: {
      include: [
        "@storybook/addon-docs",
        "@storybook/addon-docs/blocks",
        "@storybook/addon-docs > @mdx-js/react",
        "react-dom/client",
        "react/jsx-runtime",
      ],
    },
  };
  const hook = handlerOf(plugin("storybook-nextjs-vite-rsc:without-docs-dependencies").config);
  // Without addon-docs the config is the project's own.
  const own = {
    resolve: { alias: [{ find: "react", replacement: "/repo/vendor/react" }] },
    optimizeDeps: { include: ["react-dom/client"] },
  };
  expect(await hook.call({}, own as never)).toBe(undefined);
  expect(own.resolve.alias.map(({ find }) => find)).toEqual(["react"]);
  expect(own.optimizeDeps.include).toEqual(["react-dom/client"]);
  // `storybook build`, which has the aliases of addon-docs, as an object,
  // and no pre-bundles.
  const built = {
    resolve: { alias: { react: "/repo/node_modules/react", "@mdx-js/react": "/repo/mdx" } },
  };
  expect(await hook.call({}, built as never)).toBe(undefined);
  expect(built.resolve.alias).toEqual({ "@mdx-js/react": "/repo/mdx" });
  const added = await hook.call({}, config as never);
  expect(config.resolve.alias.map(({ find }) => find)).toEqual(["@mdx-js/react"]);
  expect(config.optimizeDeps.include).toEqual(["react/jsx-runtime"]);
  expect(added).toEqual({
    environments: {
      react_client: {
        optimizeDeps: {
          include: [
            "@storybook/addon-docs",
            "@storybook/addon-docs/blocks",
            "@storybook/addon-docs > @mdx-js/react",
          ],
        },
      },
    },
  });
});

test("the canvas has the DocsRenderer of addon-docs when the project has it", async () => {
  const addonDocs = plugin("storybook-nextjs-vite-rsc:addon-docs");
  const resolved = handlerOf(addonDocs.resolveId).call(
    {},
    "virtual:@storybook/nextjs-vite-rsc/addon-docs" as never,
  ) as string;
  const load = handlerOf(addonDocs.load);
  const installed = {
    resolve: async () => ({ id: "/repo/node_modules/@storybook/addon-docs/dist/index.js" }),
  };
  expect(await load.call(installed, resolved as never)).toBe(
    'export { DocsRenderer } from "/repo/node_modules/@storybook/addon-docs/dist/index.js";',
  );
  expect(await load.call({ resolve: async () => null }, resolved as never)).toBe(
    "export const DocsRenderer = undefined;",
  );
});
