import path from "node:path";
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
  return [withoutDocsDependencies(), docsPreview(), ...mdxFiles(options)];
}

// `@storybook/addon-docs` aliases `react` and `react-dom` to the project's in
// every environment, for one React of the docs pages and the stories. Each
// layer here has the React that Next gives it, which the aliases would take
// away: they go, and the one of `@mdx-js/react` stays, for one `MDXProvider`
// of the docs page and the MDX files. Its pre-bundles of the docs page and
// React DOM are for the preview, which is the rsc layer and never loads
// them: the browser layer pre-bundles the docs page instead.
const reactAliases = new Set(["react", "react-dom", "react-dom/server"]);
const docsDependency = /^@storybook\/addon-docs([\s/]|$)/;

function withoutDocsDependencies(): Plugin {
  return {
    name: "storybook-nextjs-vite-rsc:without-docs-dependencies",
    config: {
      order: "post",
      handler(config) {
        const alias = config.resolve?.alias;
        if (Array.isArray(alias)) {
          config.resolve!.alias = alias.filter(
            ({ find }: { find: unknown }) => typeof find !== "string" || !reactAliases.has(find),
          );
        } else if (alias) {
          for (const name of reactAliases) delete (alias as Record<string, string>)[name];
        }
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

// What the preview has of `@storybook/addon-docs` and of Storybook's UI.
// Storybook's Vite builder imports the preview of addon-docs by its path,
// after the framework's, so its `docs.renderer`, whose `DocsRenderer` renders
// with React DOM, would win over the framework's: in the rsc layer the
// preview of addon-docs is its parameters without it. And a module of the
// docs page or of Storybook's theming that a module of the rsc layer
// imports, like a theme of `storybook/theming` in the preview file, calls
// `createContext` as it loads, which the rsc layer's React does not have:
// that is an error that says so. Not one of a file with `"use client"`,
// which the rsc layer has a reference module of.
const addonDocsPreview = /\/@storybook\/addon-docs\/dist\/preview\.js(\?.*)?$/;
const docsPreviewId = "\0storybook-nextjs-vite-rsc/addon-docs-preview";
const browserOnly = new Set([
  "storybook/theming",
  "@storybook/addon-docs",
  "@storybook/addon-docs/blocks",
]);
const languageOf = (file: string) =>
  file.endsWith(".tsx") ? "tsx" : /\.[cm]?ts$/.test(file) ? "ts" : "jsx";

function docsPreview(): Plugin {
  let realPreview = "";
  return {
    name: "storybook-nextjs-vite-rsc:docs-preview",
    enforce: "pre",
    applyToEnvironment: (environment) => environment.name === rsc,
    resolveId(source, importer) {
      if (importer === docsPreviewId || !addonDocsPreview.test(normalizePath(source))) return;
      realPreview = normalizePath(source).replace(/\?.*$/, "");
      return docsPreviewId;
    },
    load(id) {
      if (id !== docsPreviewId) return;
      return [
        `import { parameters as docsParameters } from ${JSON.stringify(realPreview)};`,
        `export * from ${JSON.stringify(realPreview)};`,
        "const { renderer, ...docs } = docsParameters.docs;",
        "export const parameters = { ...docsParameters, docs };",
      ].join("\n");
    },
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
          if (
            node.type === "ImportDeclaration" &&
            node.importKind !== "type" &&
            browserOnly.has(node.source.value)
          ) {
            this.error(
              `${path.basename(file)} imports ${node.source.value}, which renders with React ` +
                `DOM, in the browser: the preview runs on React's server build, where it does ` +
                `not load. Import it from a file with "use client", and a theme from ` +
                `storybook/theming/create.`,
              node.start,
            );
          }
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
    const relative = path.posix.relative(normalizePath(workingDir), file);
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
          const imports = await storyFileImports.call(this, code, id, isStoryFile, importPathOf);
          if (this.environment.name === rsc) {
            imported.set(id, imports);
            return { code: `"use client";\n${code}`, map: null };
          }
          return { code: withStoryFilesOfTheStore(code, imports), map: null };
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
          return { code: storyFilesCode(imports, previewFile) + code, map: null };
        },
      },
    },
  ];
}

/** The imports of story files in compiled MDX. */
export async function storyFileImports(
  this: Pick<Rollup.PluginContext, "resolve">,
  code: string,
  id: string,
  isStoryFile: (importPath: string) => boolean,
  importPathOf: (file: string) => string,
): Promise<StoryFileImport[]> {
  const ast = await parseAstAsync(code, { lang: "jsx" });
  const imports: StoryFileImport[] = [];
  for (const node of ast.body) {
    if (node.type !== "ImportDeclaration" || node.importKind === "type") continue;
    const resolved = await this.resolve(node.source.value, id);
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

/**
 * The rsc layer's lines above the module of an MDX file: its story files,
 * loaded by the framework's hook, as the store loads them.
 */
export function storyFilesCode(imports: StoryFileImport[], previewFile: string): string {
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

/** The browser layer's MDX, with the exports that the rsc layer loaded in place of its imports. */
export function withStoryFilesOfTheStore(code: string, imports: StoryFileImport[]): string {
  let result = code;
  for (const found of [...imports].sort((a, b) => b.start - a.start)) {
    const exports = `${storyFiles}.get(${JSON.stringify(found.importPath)})`;
    const local = found.namespace ?? `__storyFile${found.start}`;
    const declarations = [`const ${local} = ${exports};`];
    if (found.default) declarations.push(`const ${found.default} = ${local}.default;`);
    if (found.named.length > 0) {
      const names = found.named.map(([name, as]) =>
        name === as ? name : `${JSON.stringify(name)}: ${as}`,
      );
      declarations.push(`const { ${names.join(", ")} } = ${local};`);
    }
    result = result.slice(0, found.start) + declarations.join(" ") + result.slice(found.end);
  }
  return result;
}
