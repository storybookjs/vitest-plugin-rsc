import path from "node:path";
import { transformDirectiveProxyExport } from "@vitejs/plugin-rsc/transforms";
import { normalizePath, parseAstAsync, transformWithOxc, type Plugin } from "vite";
import { hostModulePrefix } from "../host-module.ts";
import { clientFileId, liveModulePrefix } from "./client-ids.ts";

// A test file or a story file with `"use client"` is a module of the browser
// layer, as a file with that directive is in Next. The host still imports it
// in its own environment, which is the rsc layer: Vitest to collect its tests,
// Storybook to read its stories. So there it is a stub, which has the page
// evaluate the file itself for the browser layer and hands out its exports:
// see client-graph.ts.
//
// The file runs in the browser layer, and what it imports from the host does
// not: `vitest` has the test that is running, and `storybook/test` the spies
// its panels show. Those imports are of the modules the page has, see
// ../host-module.ts.
//
// Every other import of the file is, in the browser layer, of a module that
// has the namespace of that import as its one export. The file is evaluated
// once and reads its imports from the page that is open, see client-graph.ts,
// and Vite compiles a named import of a CommonJS dependency, which React is,
// to a constant at the top of the importer. A constant does not follow the
// page. The module in between is ESM, so the file reads a property of it when
// it uses the import, and the constant is in that module, which every page
// evaluates again.

const sourceFile = /\.(?:tsx|ts|mts|jsx|js|mjs)$/;
const languageOf = (file: string) =>
  file.endsWith(".tsx") ? "tsx" : file.endsWith("ts") ? "ts" : "jsx";

export type ClientFilesOptions = {
  /** The Vite environment of the rsc layer, which the host shares, and of the browser layer. */
  environments: { rsc: string; browser: string };
  /** `vitest-plugin-rsc/nextjs/testing-library`, and the file it is. */
  testingLibrary: { specifier: string; file: string };
  /** Whether a file is the host's: a test file, a setup file, a story. */
  isHostFile(file: string): boolean;
  /** Whether an import is of a package of the host, by its name. */
  isHostPackage(specifier: string): boolean;
};

/** The module of the rsc layer for a client file with these exports. */
export function clientFileStub(id: string, exportNames: string[], testingLibrary: string): string {
  const exports = exportNames.map((name) =>
    name === "default"
      ? `export default $$file.default;`
      : `export const ${name} = $$file[${JSON.stringify(name)}];`,
  );
  return [
    `import { loadClientFile as $$loadClientFile } from ${JSON.stringify(testingLibrary)};`,
    `const $$file = await $$loadClientFile(${JSON.stringify(id)});`,
    ...exports,
    "",
  ].join("\n");
}

// What a client file imports, and from which file: both are in the id.
const liveModuleId = (file: string, source: string) =>
  liveModulePrefix + Buffer.from(JSON.stringify([file, source])).toString("base64url");
const liveModuleOf = (id: string) =>
  JSON.parse(Buffer.from(id.slice(liveModulePrefix.length), "base64url").toString()) as [
    file: string,
    source: string,
  ];

/** What the page imports for a module of the host: see ../host-module.ts. */
export function hostModuleCode(
  target: string,
  testingLibrary: ClientFilesOptions["testingLibrary"],
): string {
  // In a client file, a node is one of the browser layer.
  if (target === testingLibrary.specifier) {
    return (
      `import * as module from ${JSON.stringify(testingLibrary.file)};\n` +
      `export default { ...module, renderServer: module.renderClient };\n`
    );
  }
  return `import * as module from ${JSON.stringify(target)};\nexport default module;\n`;
}

export function clientFiles(options: ClientFilesOptions): Plugin {
  const { rsc, browser } = options.environments;
  const { testingLibrary, isHostFile, isHostPackage } = options;

  return {
    name: "vitest-plugin-rsc:next-client-files",
    enforce: "pre",
    resolveId: {
      // Before the resolver of a package manager, or of the host itself.
      order: "pre",
      async handler(source, importer, resolveOptions) {
        if (source.startsWith(hostModulePrefix) || source.startsWith(liveModulePrefix)) {
          return source;
        }
        // What the page asks a layer for has no importer, and is that layer's.
        if (this.environment.name !== browser || !importer) return;
        const others = { ...resolveOptions, skipSelf: true };
        // The import of a client file, from the module in between.
        if (importer.startsWith(liveModulePrefix)) {
          return this.resolve(source, liveModuleOf(importer)[0], others);
        }
        if (isHostPackage(source) || source === testingLibrary.specifier) {
          return hostModulePrefix + source;
        }
        const file = importer.split("?")[0]!;
        if (!isHostFile(file)) return;
        // Another file of the host, like a setup file, or `.storybook/preview`.
        const resolved = await this.resolve(source, file, others);
        if (resolved && !resolved.id.includes("?") && isHostFile(resolved.id)) {
          return hostModulePrefix + normalizePath(resolved.id);
        }
        // Not for the scan of the dependencies, which is after what the file
        // imports: a module in between hides that.
        if (!(resolveOptions as { scan?: boolean }).scan) return liveModuleId(file, source);
      },
    },
    load(id) {
      if (id.startsWith(liveModulePrefix)) {
        return `import * as module from ${JSON.stringify(liveModuleOf(id)[1])};\nexport { module };\n`;
      }
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
      // Types and JSX are in the way of reading what the file exports.
      const compiled = await transformWithOxc(code, file, {
        lang: languageOf(file),
        sourcemap: false,
      });
      const ast = await parseAstAsync(compiled.code);
      let exportNames: string[] | undefined;
      try {
        exportNames = transformDirectiveProxyExport(ast, {
          directive: "use client",
          runtime: () => "undefined",
        })?.exportNames;
      } catch (error) {
        this.error(
          `vitest-plugin-rsc: cannot tell what ${file} exports, which a file with "use client" ` +
            `has to say by name. ${String(error instanceof Error ? error.message : error)}`,
        );
      }
      if (!exportNames) return;
      // Vitest hoists these out of the file in the rsc layer, which has a stub
      // for it, and mocks the modules of that layer. Not the browser layer's.
      const mocking = findMocking(ast);
      if (mocking) {
        this.error(
          `vitest-plugin-rsc: ${file} calls ${mocking}(), which a file with "use client" cannot: ` +
            `it runs in the browser layer, and Vitest mocks the modules of the test's own ` +
            `environment. Mock in a test file without the directive, or pass a mock as a prop.`,
        );
      }
      // The host follows the imports of a file to know when to run it again.
      // The stub has none of them, so it names the ones of the file.
      for (const node of ast.body) {
        if (node.type !== "ImportDeclaration" && node.type !== "ExportNamedDeclaration") continue;
        const source = node.source?.value;
        const resolved = typeof source === "string" && (await this.resolve(source, file));
        if (resolved && path.isAbsolute(resolved.id) && !resolved.id.includes("/node_modules/")) {
          this.addWatchFile(resolved.id.split("?")[0]!);
        }
      }
      return {
        code: clientFileStub(clientFileId(normalizePath(file)), exportNames, testingLibrary.file),
        map: { mappings: "" },
      };
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
