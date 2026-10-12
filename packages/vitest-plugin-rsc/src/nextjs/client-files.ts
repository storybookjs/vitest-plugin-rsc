import path from "node:path";
import { hasDirective } from "@vitejs/plugin-rsc/transforms";
import { normalizePath, parseAstAsync, type Plugin } from "vite";
import { hostModulePrefix } from "../host-module.ts";

// A test file with `"use client"` is a client boundary, as a file with that
// directive is in React: a module of the browser layer. Vitest still imports
// it in its own environment, which is the rsc layer, to collect its tests. So
// there it is a stub, which has the page evaluate the file in the browser
// layer: see client-graph.ts.
//
// The file runs in the browser layer, and the test runner does not: `vitest`
// has the test that is running. So an import of `vitest`, `@vitest/*` or the
// testing library is of the module the page has, see ../host-module.ts. That
// goes for every module of the browser layer, like `render()` of
// vitest-browser-react, which registers a hook with `vitest`. An import of a
// setup file goes to the page too, at the file's own URL, which the page
// evaluates once. Not the instance that Vitest ran before the test file:
// it evaluates a setup file before every test file, with a query of its own.
// Every other import is the browser layer's.

const sourceFile = /\.(?:tsx|ts|mts|jsx|js|mjs)$/;
const languageOf = (file: string) =>
  file.endsWith(".tsx") ? "tsx" : file.endsWith("ts") ? "ts" : "jsx";

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
};

/**
 * The module of the rsc layer for a client file: it has the page evaluate the
 * file, with its tests. Vitest only runs a test file, so it exports nothing.
 */
export function clientFileStub(file: string, internal: string): string {
  return (
    `import { loadClientFile } from ${JSON.stringify(internal)};\n` +
    `await loadClientFile(${JSON.stringify(file)});\n`
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

export function clientFiles(options: ClientFilesOptions): Plugin {
  const { rsc, browser } = options.environments;
  const { testingLibrary, internal, isHostFile, isHostPackage } = options;

  return {
    name: "vitest-plugin-rsc:next-client-files",
    enforce: "pre",
    resolveId: {
      // Before the resolver of a package manager, or of the host itself.
      order: "pre",
      async handler(source, importer, resolveOptions) {
        if (source.startsWith(hostModulePrefix)) return source;
        if (this.environment.name !== browser) return;
        // What the page asks a layer for is that layer's. It has no importer,
        // for which Vite names the `index.html` of the root.
        const { root } = this.environment.config;
        if (!importer || importer === path.posix.join(normalizePath(root), "index.html")) return;
        if (isHostPackage(source) || source === testingLibrary.specifier) {
          return hostModulePrefix + source;
        }
        const file = importer.split("?")[0]!;
        if (!isHostFile(file)) return;
        // Another file of the host, like a setup file.
        const resolved = await this.resolve(source, file, { ...resolveOptions, skipSelf: true });
        if (resolved && !resolved.id.includes("?") && isHostFile(resolved.id)) {
          return hostModulePrefix + normalizePath(resolved.id);
        }
        return resolved;
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
    // Before Vite RSC, which makes a file with `"use client"` a reference.
    async transform(code, id) {
      if (this.environment.name !== rsc || !code.includes("use client")) return;
      const file = id.split("?")[0]!;
      if (id.includes("?") || !sourceFile.test(file) || !isHostFile(file)) return;
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
            `layer. Mock in a test file without the directive, or pass a mock as a prop.`,
        );
      }
      return { code: clientFileStub(normalizePath(file), internal), map: { mappings: "" } };
    },
  };
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
