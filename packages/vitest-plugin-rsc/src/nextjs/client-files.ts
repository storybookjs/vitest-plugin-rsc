import path from "node:path";
import { hasDirective } from "@vitejs/plugin-rsc/transforms";
import {
  isCSSRequest,
  normalizePath,
  parseAstAsync,
  type EnvironmentModuleNode,
  type Plugin,
  type ResolvedConfig,
} from "vite";
import { builtHostModuleUrl, hostModulePrefix } from "../host-module.ts";
import { clientFileKeyExport } from "./client-file-key.ts";
import { builtHostFileKey } from "./styles.ts";

// A file of the host is a test file or a setup file of Vitest. One with
// `"use client"` is a client boundary, as a file with that directive is in
// React: a module of the browser layer. Vitest still imports it in its own
// environment, which is the rsc layer, to collect its tests. There Vite RSC
// makes it a client reference, as it does every file with the directive: a
// module that exports a reference for each export, and runs none of the
// file's code. The plugin has that module load the file in the browser layer
// before anything else runs, see `clientFileCode()` and client-graph.ts,
// and with a dev server a change of what the file imports there changes that
// module. That is all of it. A file without the directive is server code,
// and what it imports with the directive is a reference, which loads when
// something renders it, as in React.
//
// The file runs in the browser layer, and the test runner does not: `vitest`
// has the test that is running. So an import of `vitest`, `@vitest/*` or the
// testing library is of the module the page has, see ../host-module.ts. That
// goes for every module of the browser layer, like `render()` of
// vitest-browser-react, which registers a hook with `vitest`. Every other
// import is the browser layer's, as what a client module imports is client
// code in React: also another file of the host.

// The files whose code the check of `vi.mock()` parses, before the host's
// plugins ran. A file of the host with another extension, which a plugin of
// the host compiles to JavaScript, like `.mdx`, is still a client file when
// Vite RSC made a reference of it: that is what says it has the directive.
const parsedFile = /\.(?:tsx|ts|mts|jsx|js|mjs)$/;
const languageOf = (file: string) =>
  file.endsWith(".tsx") ? "tsx" : file.endsWith("ts") ? "ts" : "jsx";

// A dev server puts its version of the dependencies in the query of the id of
// a module in `node_modules` that it does not pre-bundle, by which the browser
// caches it: `/x/node_modules/a/b.js?v=1a2b3c4d`. A file of the host can be
// such a module, like a framework of Storybook that `host.files` matches. Any
// other query, like `?raw` or `?import`, is another module of the file.
const versionQuery = /^\?v=[\w.-]+$/;

/**
 * The file that a module of Vite is, by its id: the id, without the version
 * a dev server adds for a dependency. Nothing for an id with another query.
 */
export function fileOfModule(id: string): string | undefined {
  const query = id.indexOf("?");
  if (query === -1) return id;
  return versionQuery.test(id.slice(query)) ? id.slice(0, query) : undefined;
}

/**
 * The client reference of a module of the rsc layer, in Vite RSC's map of
 * them. With a dev server, Vite RSC has a module in `node_modules` there by
 * its file, without the version, unless the page imports it by the name of
 * its package.
 */
export function clientReferenceOfModule<Reference>(
  references: Record<string, Reference>,
  id: string,
): Reference | undefined {
  const reference = references[id];
  if (reference) return reference;
  const file = fileOfModule(id);
  return file === undefined ? undefined : references[file];
}

/**
 * What Vite RSC made of a module of the rsc layer with `"use client"`: a
 * client reference, with the file's reference key. With a dev server that is
 * the URL of the file in the browser layer, in a build a hash of the file.
 */
export type ClientReference = { referenceKey: string };

export type ClientFilesOptions = {
  /** The Vite environment of the rsc layer, which the host shares, and of the browser layer. */
  environments: { rsc: string; browser: string };
  /** `vitest-plugin-rsc/nextjs/testing-library`, and the file it is. */
  testingLibrary: { specifier: string; file: string };
  /** The file of the plugin that loads a client file: internal.ts. */
  internal: string;
  /** Whether a file is the host's: a test file or a setup file. */
  isHostFile(file: string): boolean;
  /** Whether an import is of a package of the host, by its name. */
  isHostPackage(specifier: string): boolean;
  /**
   * The client reference that Vite RSC made of a module of the rsc layer, if
   * it has `"use client"`: by the id of a module, else by its file, see
   * `clientReferenceOfModule()`.
   */
  clientReferenceOf(id: string, config: ResolvedConfig): ClientReference | undefined;
};

/**
 * What the module of the rsc layer for a file with `"use client"` starts
 * with, in front of the reference module, which has none of the code of the
 * file: the export `clientFileKeyExport` with the file's reference key, by
 * which `loadClientModule()` tells the module, see client-file-key.ts. For a
 * file of the host, `load`, also the line that loads the file in the browser
 * layer by that key, see client-graph.ts. With a dev server the key is the
 * URL of the file in the browser layer. In a build it is a hash, and the
 * line also has the key of the file's stylesheets in the build, `builtFile`:
 * its path from the root of the project. Not its id, which is a path of the
 * machine.
 */
export function clientFileCode(
  { referenceKey }: ClientReference,
  load?: { internal: string; builtFile?: string },
): string {
  const key = `export const ${clientFileKeyExport} = ${JSON.stringify(referenceKey)}; `;
  if (!load) return key;
  const { internal, builtFile } = load;
  const args = [referenceKey, ...(builtFile === undefined ? [] : [builtFile])];
  return (
    `import { loadClientFile as __vitestPluginRscLoadClientFile } from ${JSON.stringify(internal)}; ` +
    key +
    `await __vitestPluginRscLoadClientFile(${args.map((arg) => JSON.stringify(arg)).join(", ")}); `
  );
}

/** What `renderServer()` throws in a file with `"use client"`. */
export const renderServerError =
  'vitest-plugin-rsc: renderServer() renders on the server, and this test file has "use client": ' +
  "it is client code, which cannot render server code. Render a Client Component with " +
  "`render()` of vitest-browser-react or of @testing-library/react, or test a connected " +
  'component with renderServer() in a test file without "use client".';

/** What the page imports for a module of the host: see ../host-module.ts. */
export function hostModuleCode(
  target: string,
  testingLibrary: ClientFilesOptions["testingLibrary"],
): string {
  // A client file renders no server code.
  if (target === testingLibrary.specifier) {
    return (
      `import * as module from ${JSON.stringify(testingLibrary.file)};\n` +
      `export default {\n` +
      `  ...module,\n` +
      `  async renderServer() {\n` +
      `    throw new Error(${JSON.stringify(renderServerError)});\n` +
      `  },\n` +
      `};\n`
    );
  }
  return `import * as module from ${JSON.stringify(target)};\nexport default module;\n`;
}

/**
 * Two plugins. Before Vite RSC: the modules of the page for the browser
 * layer, the error for a file with `"use client"` that mocks a module,
 * before Vite RSC drops the code of the file, and with a dev server the
 * change of the file's module in the rsc layer for a change of what the file
 * imports in the browser layer. After Vite RSC, which made the file a
 * reference: the line in front of that module, with the file's reference
 * key, which for a file of the host loads the file in the browser layer by
 * that key. Not a file without the directive: a test file without it renders
 * with `renderServer()`, in a page with a graph of its own.
 */
export function clientFiles(options: ClientFilesOptions): Plugin[] {
  const { rsc, browser } = options.environments;
  const { testingLibrary, internal, isHostFile, isHostPackage, clientReferenceOf } = options;

  // A file of the host in the rsc layer, with no query but the version of a
  // dependency: not Vite's `?import`, which the browser asks for.
  const hostFileOf = (id: string): string | undefined => {
    const file = fileOfModule(id);
    if (file === undefined || !isHostFile(file)) return;
    return file;
  };

  return [
    {
      name: "vitest-plugin-rsc:next-client-files",
      enforce: "pre",
      resolveId: {
        // Before the resolver of a package manager, or of the host itself.
        order: "pre",
        handler(source, importer) {
          if (source.startsWith(hostModulePrefix)) return source;
          if (this.environment.name !== browser) return;
          // What the page asks a layer for is that layer's. It has no importer,
          // for which Vite names the `index.html` of the root.
          const { root } = this.environment.config;
          if (!importer || importer === path.posix.join(normalizePath(root), "index.html")) return;
          if (isHostPackage(source) || source === testingLibrary.specifier) {
            // A build has the page's own module in the host's build, which
            // the layer imports by its URL, as it is: see ../host-module.ts.
            return this.environment.mode === "build"
              ? { id: builtHostModuleUrl(source), external: "absolute" as const }
              : hostModulePrefix + source;
          }
        },
      },
      load(id) {
        if (!id.startsWith(hostModulePrefix)) return;
        const target = id.slice(hostModulePrefix.length);
        // Not the browser layer's to evaluate: the transport of its module
        // runner answers for it, see ../utils.ts. Vite still warms it up.
        if (this.environment.name !== rsc) return "export {};";
        return hostModuleCode(target, testingLibrary);
      },
      async transform(code, id) {
        if (this.environment.name !== rsc || !code.includes("use client")) return;
        const file = hostFileOf(id);
        if (!file || !parsedFile.test(file)) return;
        const ast = await parseAstAsync(code, { lang: languageOf(file) });
        if (!hasDirective(ast.body, "use client")) return;
        // The file runs with the page's `vi`, whose mocker replaces what the
        // page imports: the modules of the rsc layer, not the ones that the
        // module runner of the browser layer fetches for the file.
        const mocking = findMocking(ast);
        if (mocking) {
          this.error(
            `vitest-plugin-rsc: ${file} calls ${mocking}(), which a file with "use client" cannot: ` +
              `it runs in the browser layer, and Vitest's mocker replaces the modules of the rsc ` +
              `layer. Mock in a setup file or a test file without the directive, or pass a mock ` +
              `as a prop.`,
          );
        }
      },
      // The module of a file of the host with `"use client"` in the rsc
      // layer stands for the file's code in the browser layer, of which it
      // has none (see the plugin below). So a change of a module that the
      // file imports there, also through other modules, is a change of that
      // module: Vite takes it to the host as a change of the file itself, the
      // host imports the file again, and the line of the new module
      // evaluates the file with what changed. First of the hooks of the rsc
      // layer, so that one that loads the document again instead, like the
      // one for a change of what a route imports, still takes over. Not for
      // a stylesheet that Vite swaps in place in the rsc layer, as a link or
      // as its `<style>`: it is the same stylesheet in the one document.
      hotUpdate: {
        order: "pre",
        handler({ file, modules, server }) {
          if (this.environment.name !== rsc) return;
          const swapped = (node: EnvironmentModuleNode) =>
            node.isSelfAccepting && isCSSRequest(node.url);
          if (modules.length > 0 && modules.every(swapped)) return;
          const changed = server.environments[browser]?.moduleGraph.getModulesByFile(file);
          if (!changed) return;
          const config = this.environment.getTopLevelConfig();
          const updated = new Set(modules);
          for (const hostFile of hostFilesImporting(changed, isHostFile)) {
            for (const node of this.environment.moduleGraph.getModulesByFile(hostFile) ?? []) {
              if (node.id && clientReferenceOf(node.id, config)) updated.add(node);
            }
          }
          // The module of a file of the host that changed itself is there already.
          if (updated.size > modules.length) return [...updated];
        },
      },
    },
    {
      name: "vitest-plugin-rsc:next-load-client-files",
      enforce: "post",
      transform(code, id) {
        if (this.environment.name !== rsc) return;
        const config = this.environment.getTopLevelConfig();
        const reference = clientReferenceOf(id, config);
        if (!reference) return;
        // Also a file that is not the host's, like a component of the app,
        // so that `loadClientModule()` can say that nothing loaded it.
        const file = hostFileOf(id);
        const builtFile =
          file && this.environment.mode === "build"
            ? builtHostFileKey(file, config.root)
            : undefined;
        const load = file ? { internal, builtFile } : undefined;
        return { code: clientFileCode(reference, load) + code, map: null };
      },
    },
  ];
}

/**
 * The files of the host among `modules` and the modules that import them in
 * a module graph, also through other modules.
 */
function hostFilesImporting(
  modules: Iterable<EnvironmentModuleNode>,
  isHostFile: (file: string) => boolean,
): Set<string> {
  const files = new Set<string>();
  const seen = new Set(modules);
  for (const node of seen) {
    if (node.file && isHostFile(node.file)) files.add(node.file);
    for (const importer of node.importers) seen.add(importer);
  }
  return files;
}

// What Vitest hoists to mock a module, by the name it is called with.
const mockingCall = /^(?:vi|vitest)\.(?:mock|unmock|doMock|doUnmock|hoisted)$/;

/** The first call of the AST to a function of Vitest that mocks a module, like `vi.mock`. */
export function findMocking(node: unknown): string | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findMocking(child);
      if (found) return found;
    }
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const { type, callee } = node as { type?: string; callee?: Record<string, any> };
  if (
    type === "CallExpression" &&
    callee?.type === "MemberExpression" &&
    !callee.computed &&
    callee.object?.type === "Identifier" &&
    callee.property?.type === "Identifier"
  ) {
    const name = `${callee.object.name}.${callee.property.name}`;
    if (mockingCall.test(name)) return name;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || typeof value !== "object") continue;
    const found = findMocking(value);
    if (found) return found;
  }
}
