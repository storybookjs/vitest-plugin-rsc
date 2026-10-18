import path from "node:path";
import MagicString from "magic-string";
import type { NormalizedStoriesSpecifier } from "storybook/internal/types";
import { normalizePath, parseAstAsync, type Plugin, type Rollup, type UserConfig } from "vite";

// The Vite plugins of the docs pages of `@storybook/addon-docs`: they render
// in the browser layer, on Next's browser React, through the framework's
// `docs.renderer` (docs.ts). An MDX file is a file with `"use client"`, whose
// imports of story files are the objects of Storybook's store.

// The rsc layer, the preview, is Vite's `client` environment; the browser
// layer is the plugin's `react_client`.
const rsc = "client";
const browser = "react_client";

// Where the rsc layer puts the exports of the story files that an MDX file
// imports, by their importPath, for the browser layer's evaluation of the
// file to read.
const storyFilesKey = "@storybook/nextjs-vite-rsc/story-files";

export type DocsPluginOptions = {
  /** Where Storybook names the story files from: their importPaths. */
  workingDir: string;
  /** The `stories` of `.storybook/main.ts`, as Storybook normalizes them. */
  stories: NormalizedStoriesSpecifier[];
  /** The framework's preview, which has the hook that loads a story file. */
  previewFile: string;
};

/** The plugins, after `vitestPluginNext()`: see `mdxFiles`. */
export function docsPlugins(options: DocsPluginOptions): Plugin[] {
  return [
    withoutDocsDependencies(),
    addonDocsModule(),
    addonDocsPreview(),
    browserOnlyImports(),
    ...mdxFiles(options),
  ];
}

// `@storybook/addon-docs` aliases `react` and `react-dom` to the project's in
// every environment, for one React of the docs pages and the stories. Each
// layer here has the React that Next gives it, which the aliases would take
// away: they go, and the one of `@mdx-js/react` stays, for one `MDXProvider`
// of the docs page and the MDX files. Its pre-bundles of the docs page and
// React DOM are for the preview, which is the rsc layer and never loads
// them: the browser layer pre-bundles the docs page instead.
const reactAliases = new Set(["react", "react-dom", "react-dom/server"]);
const mdxProvider = "@mdx-js/react";
const docsDependency = /^@storybook\/addon-docs([\s/]|$)/;

function withoutDocsDependencies(): Plugin {
  return {
    name: "storybook-nextjs-vite-rsc:without-docs-dependencies",
    config: {
      order: "post",
      handler(config) {
        // Without addon-docs, whose alias of `@mdx-js/react` says it is
        // there, in a build too, the config is the project's own.
        const alias = config.resolve?.alias;
        const aliases = Array.isArray(alias)
          ? alias.map(({ find }: { find: unknown }) => find)
          : Object.keys(alias ?? {});
        if (!aliases.includes(mdxProvider)) return;
        if (Array.isArray(alias)) {
          config.resolve!.alias = alias.filter(
            ({ find }: { find: unknown }) => typeof find !== "string" || !reactAliases.has(find),
          );
        } else if (alias) {
          for (const name of reactAliases) delete (alias as Record<string, string>)[name];
        }
        // Only `storybook dev` has its pre-bundles.
        const include = config.optimizeDeps?.include ?? [];
        const docs = include.filter((name) => docsDependency.test(name));
        if (docs.length === 0) return;
        config.optimizeDeps!.include = include.filter(
          (name) => !docsDependency.test(name) && name !== "react-dom/client",
        );
        return {
          environments: { [browser]: { optimizeDeps: { include: docs } } },
        } satisfies UserConfig;
      },
    },
  };
}

// `@storybook/addon-docs` is an optional peer dependency: the canvas
// (client-canvas.tsx) imports its `DocsRenderer` through this module, which
// has none when the project does not have addon-docs installed.
const addonDocsId = "virtual:@storybook/nextjs-vite-rsc/addon-docs";

function addonDocsModule(): Plugin {
  return {
    name: "storybook-nextjs-vite-rsc:addon-docs",
    resolveId: {
      filter: { id: new RegExp(`^${addonDocsId}$`) },
      handler: () => `\0${addonDocsId}`,
    },
    load: {
      filter: { id: new RegExp(`^\0${addonDocsId}$`) },
      async handler() {
        const resolved = await this.resolve("@storybook/addon-docs", import.meta.filename);
        return resolved && !resolved.external
          ? `export { DocsRenderer } from ${JSON.stringify(resolved.id)};`
          : "export const DocsRenderer = undefined;";
      },
    },
  };
}

// Storybook's Vite builder imports the preview of addon-docs by its path,
// after the framework's, so its `docs.renderer`, whose `DocsRenderer` renders
// with React DOM, would win over the framework's: in the rsc layer the
// preview of addon-docs is its parameters without it.
const addonDocsPreviewFile = /\/@storybook\/addon-docs\/dist\/preview\.js(\?.*)?$/;
const docsPreviewId = "\0storybook-nextjs-vite-rsc/addon-docs-preview";

function addonDocsPreview(): Plugin {
  let realPreview = "";
  return {
    name: "storybook-nextjs-vite-rsc:addon-docs-preview",
    enforce: "pre",
    applyToEnvironment: (environment) => environment.name === rsc,
    resolveId: {
      filter: { id: addonDocsPreviewFile },
      handler(source, importer) {
        if (importer === docsPreviewId) return;
        realPreview = normalizePath(source).replace(/\?.*$/, "");
        return docsPreviewId;
      },
    },
    load: {
      filter: { id: new RegExp(`^${docsPreviewId}$`) },
      handler: () =>
        [
          `import { parameters as docsParameters } from ${JSON.stringify(realPreview)};`,
          `export * from ${JSON.stringify(realPreview)};`,
          "const { renderer, ...docs } = docsParameters.docs;",
          "export const parameters = { ...docsParameters, docs };",
        ].join("\n"),
    },
  };
}

// A module of the docs page or of Storybook's theming calls `createContext`
// as it loads, which the rsc layer's React, the server's, does not have. A
// module of the rsc layer that imports one, like the preview file or a story
// file without `"use client"`, is an error that says where it goes. Not a
// file with `"use client"`, which the rsc layer has a reference module of,
// nor an import of types.
const browserOnly = new Set([
  "storybook/theming",
  "@storybook/addon-docs",
  "@storybook/addon-docs/blocks",
]);
const languageOf = (file: string) =>
  file.endsWith(".tsx") ? "tsx" : /\.[cm]?ts$/.test(file) ? "ts" : "jsx";

type ModuleDeclaration = Awaited<ReturnType<typeof parseAstAsync>>["body"][number];

// The source of a declaration that imports a value of another module.
function valueImportOf(node: ModuleDeclaration): { source: string; start: number } | undefined {
  if (node.type === "ImportDeclaration") {
    if (node.importKind === "type") return;
    const specifiers = node.specifiers;
    const types = specifiers.filter(
      (specifier) => specifier.type === "ImportSpecifier" && specifier.importKind === "type",
    );
    if (specifiers.length > 0 && types.length === specifiers.length) return;
    return { source: node.source.value, start: node.start };
  }
  if (node.type === "ExportAllDeclaration" || node.type === "ExportNamedDeclaration") {
    if (!node.source || node.exportKind === "type") return;
    return { source: node.source.value, start: node.start };
  }
  return undefined;
}

function browserOnlyImports(): Plugin {
  return {
    name: "storybook-nextjs-vite-rsc:browser-only-imports",
    // On the code as it is written, before Vite RSC makes a reference module
    // of a file with `"use client"`.
    enforce: "pre",
    applyToEnvironment: (environment) => environment.name === rsc,
    transform: {
      filter: {
        id: { include: /\.[cm]?[jt]sx?(\?.*)?$/, exclude: /\/node_modules\// },
        code: /["'](storybook\/theming|@storybook\/addon-docs(\/blocks)?)["']/,
      },
      async handler(code, id) {
        const file = id.replace(/\?.*$/, "");
        const ast = await parseAstAsync(code, { lang: languageOf(file) });
        for (const node of ast.body) {
          if (node.type === "ExpressionStatement" && node.directive === "use client") return;
          if (node.type !== "ExpressionStatement" || !node.directive) break;
        }
        for (const node of ast.body) {
          const imported = valueImportOf(node);
          if (!imported || !browserOnly.has(imported.source)) continue;
          const name = path.basename(file);
          this.error(
            `${name} imports ${imported.source}, which renders with React DOM, in the ` +
              `browser: ${name} runs on React's server build, as the preview file and a story ` +
              `file without "use client" do, where it does not load. Import it from a file ` +
              `with "use client", and a theme from storybook/theming/create.`,
            imported.start,
          );
        }
      },
    },
  };
}

// An import of a story file in an MDX file, which the docs page renders with
// the objects of Storybook's store: `of={Stories.Default}` names a story by
// its object, and a story file without `"use client"` is server code, which
// does not load in a browser.
type StoryFileImport = {
  start: number;
  end: number;
  file: string;
  importPath: string;
  /** `import * as Stories`, `import meta`, `import { Default as Story }`. */
  namespace?: string;
  default?: string;
  named: [imported: string, local: string][];
};

// The MDX files. In the rsc layer an MDX file is a file with `"use client"`:
// the plugin evaluates it in the browser layer, where the docs page renders
// its `default`. Its module there keeps the imports of its story files, so
// a change of a story file loads the docs page again, and puts their
// exports, as the store has them, where the browser layer's evaluation of
// the MDX file reads them in place of its imports.
function mdxFiles({ workingDir, stories, previewFile }: DocsPluginOptions): Plugin[] {
  const isStoryFile = (importPath: string) =>
    !importPath.endsWith(".mdx") &&
    stories.some(({ importPathMatcher }) => importPathMatcher.test(importPath));
  const importPathOf = (file: string) => {
    const relative = normalizePath(path.relative(workingDir, file));
    return relative.startsWith("../") ? relative : `./${relative}`;
  };
  // The story files that each MDX file imports, as the rsc layer compiled it.
  const imported = new Map<string, StoryFileImport[]>();
  return [
    {
      // After `storybook:mdx-plugin`, which addon-docs puts first, and before
      // Vite RSC's `rsc:use-client`.
      name: "storybook-nextjs-vite-rsc:mdx",
      enforce: "pre",
      applyToEnvironment: (environment) => environment.name === rsc || environment.name === browser,
      transform: {
        filter: { id: /\.mdx$/ },
        async handler(code, id) {
          const resolve = (source: string) => this.resolve(source, id);
          const imports = await storyFileImports(code, resolve, isStoryFile, importPathOf);
          const result = new MagicString(code);
          if (this.environment.name === rsc) {
            imported.set(id, imports);
            result.prepend(`"use client";\n`);
          } else {
            withStoryFilesOfTheStore(result, imports);
          }
          return { code: result.toString(), map: result.generateMap({ hires: true }) };
        },
      },
    },
    {
      // After the plugin's own, which loads the file in the browser layer: so
      // the story files load, and the store has them, before that.
      name: "storybook-nextjs-vite-rsc:mdx-story-files",
      enforce: "post",
      applyToEnvironment: (environment) => environment.name === rsc,
      transform: {
        filter: { id: /\.mdx$/ },
        handler(code, id) {
          const imports = imported.get(id);
          if (!imports?.length) return;
          const result = new MagicString(code).prepend(storyFilesCode(imports, previewFile));
          return { code: result.toString(), map: result.generateMap({ hires: true }) };
        },
      },
    },
  ];
}

// The imports of story files in compiled MDX.
async function storyFileImports(
  code: string,
  resolve: (source: string) => Promise<Rollup.ResolvedId | null>,
  isStoryFile: (importPath: string) => boolean,
  importPathOf: (file: string) => string,
): Promise<StoryFileImport[]> {
  const ast = await parseAstAsync(code, { lang: "jsx" });
  const imports: StoryFileImport[] = [];
  for (const node of ast.body) {
    if (node.type !== "ImportDeclaration" || node.importKind === "type") continue;
    const resolved = await resolve(node.source.value);
    if (!resolved || resolved.external) continue;
    const file = normalizePath(resolved.id.replace(/\?.*$/, ""));
    const importPath = importPathOf(file);
    if (!isStoryFile(importPath)) continue;
    const found: StoryFileImport = {
      start: node.start,
      end: node.end,
      file,
      importPath,
      named: [],
    };
    for (const specifier of node.specifiers) {
      if (specifier.type === "ImportNamespaceSpecifier") found.namespace = specifier.local.name;
      else if (specifier.type === "ImportDefaultSpecifier") found.default = specifier.local.name;
      else {
        const { imported: name, local } = specifier;
        found.named.push([name.type === "Identifier" ? name.name : String(name.value), local.name]);
      }
    }
    imports.push(found);
  }
  return imports;
}

const storyFiles = `globalThis[Symbol.for(${JSON.stringify(storyFilesKey)})]`;

// The rsc layer's lines above the module of an MDX file: its story files,
// loaded by the framework's hook, as the store loads them.
function storyFilesCode(imports: StoryFileImport[], previewFile: string): string {
  const lines = [
    `import { experimental_loadStoryFile as __loadStoryFile } from ${JSON.stringify(previewFile)};`,
    ...imports.map(
      ({ file }, index) => `import * as __storyFile${index} from ${JSON.stringify(file)};`,
    ),
    `const __storyFiles = (${storyFiles} ??= new Map());`,
    ...imports.map(
      ({ importPath }, index) =>
        `__storyFiles.set(${JSON.stringify(importPath)}, await __loadStoryFile(` +
        `${JSON.stringify(importPath)}, () => __storyFile${index}));`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

// The browser layer's MDX, with the exports that the rsc layer loaded in
// place of its imports. Only an MDX file that Storybook loads, as a docs
// page, has them: not one that another file imports.
function withStoryFilesOfTheStore(code: MagicString, imports: StoryFileImport[]): void {
  if (imports.length === 0) return;
  code.prepend(
    "const __storyFileOf = (importPath) => {\n" +
      `  const exports = ${storyFiles}?.get(importPath);\n` +
      "  if (exports) return exports;\n" +
      "  throw new Error(`The stories of ${importPath} are not loaded: an MDX file has them " +
      "as Storybook loads it, as a docs page, not as another file imports it.`);\n" +
      "};\n",
  );
  for (const found of imports) {
    const local = found.namespace ?? `__storyFile${found.start}`;
    const declarations = [`const ${local} = __storyFileOf(${JSON.stringify(found.importPath)});`];
    if (found.default) declarations.push(`const ${found.default} = ${local}.default;`);
    if (found.named.length > 0) {
      const names = found.named.map(([name, as]) =>
        name === as ? name : `${JSON.stringify(name)}: ${as}`,
      );
      declarations.push(`const { ${names.join(", ")} } = ${local};`);
    }
    code.overwrite(found.start, found.end, declarations.join(" "));
  }
}
