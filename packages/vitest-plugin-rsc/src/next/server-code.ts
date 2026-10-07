import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFilter, normalizePath, parseAstAsync, transformWithOxc, type Plugin } from "vite";
import type { NextLayer } from "./project.ts";

// The server layers run in a browser tab, which has a `window` and a `fetch`
// of its own. A tab cannot lose its globals, but a module can be compiled not
// to see them. That is what happens to a module that is server code.
//
// `fetch`, `Request` and `Response` are replaced by the server's, which are in
// `registry`: see globals.ts.
//
// `window`, `document` and the other globals only a browser has are hidden in
// one of two ways:
//
// - A source file gets them as variables of the module, which nothing
//   assigns. `typeof window` is `"undefined"` there and `window.innerWidth`
//   throws. This is a declaration and not a replacement, so the text of a
//   function stays what it was. An app can send one to the browser as a
//   string, and there it has to find the tab's `document`.
// - A pre-bundled dependency gets `typeof window` replaced by `"undefined"`,
//   which is what Next's build does to the bundles it makes for a server. A
//   declaration does not hold there: the bundler puts many modules in one
//   scope and renames the variables that clash, inside functions too.
//
// What neither reaches is what looks a global up at runtime: `self.window`,
// `globalThis.window`, `"window" in globalThis`.

/** Globals of a tab that a server does not have. */
const browserGlobals = ["window", "document", "location", "localStorage", "sessionStorage"];
/** Globals a server has too, but its own. */
const serverGlobals = ["Request", "Response", "fetch"];

const mentions = (names: string[]) => new RegExp(`\\b(?:${names.join("|")})\\b`);
const mentionsBrowserGlobal = mentions(browserGlobals);
const mentionsServerGlobal = mentions(serverGlobals);
const mentionsTypeofBrowserGlobal = new RegExp(`\\btypeof\\s+${mentionsBrowserGlobal.source}`);

type AstNode = { type: string; [key: string]: any };

// The names a pattern binds: `a`, `{ a, b: [c] }`, `[a = 1, ...b]`.
function* namesOf(pattern: AstNode | null): Generator<string> {
  if (!pattern) return;
  if (pattern.type === "Identifier") yield pattern.name;
  else if (pattern.type === "ObjectPattern") {
    for (const property of pattern.properties) yield* namesOf(property.value ?? property.argument);
  } else if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements) yield* namesOf(element);
  } else yield* namesOf(pattern.left ?? pattern.argument);
}

// What a module declares itself: a `location` of its own is not the tab's.
function* declaredNames(program: AstNode): Generator<string> {
  for (const statement of program.body as AstNode[]) {
    const node: AstNode =
      (statement.type.startsWith("Export") && statement.declaration) || statement;
    if (node.type === "ImportDeclaration") {
      for (const specifier of node.specifiers) yield specifier.local.name;
    } else if (node.type === "VariableDeclaration") {
      for (const declaration of node.declarations) yield* namesOf(declaration.id);
    } else if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
      if (node.id) yield node.id.name;
    }
  }
}

type Compiled = Pick<Awaited<ReturnType<typeof transformWithOxc>>, "code" | "map">;

/**
 * Compiles JavaScript as server code: a module of its own, or one that a
 * bundler will put in a scope with others. Returns nothing for code that stays
 * as it is.
 */
export async function compileServerCode(
  code: string,
  id: string,
  registry: string,
  { bundled = false } = {},
): Promise<Compiled | undefined> {
  // Replacements are scope-aware: a parameter named `fetch` is not the global.
  const defines: Record<string, string> = {};
  if (mentionsServerGlobal.test(code)) {
    for (const name of serverGlobals) {
      defines[name] = defines[`globalThis.${name}`] = `${registry}.${name}`;
    }
  }
  if (bundled && mentionsTypeofBrowserGlobal.test(code)) {
    for (const name of browserGlobals) defines[`typeof ${name}`] = '"undefined"';
  }

  let result: Compiled | undefined;
  if (Object.keys(defines).length > 0) {
    result = await transformWithOxc(code, id, { lang: "js", define: defines });
    code = result.code;
  }
  if (!bundled && mentionsBrowserGlobal.test(code)) {
    const declared = new Set(declaredNames(await parseAstAsync(code)));
    const hidden = browserGlobals.filter((name) => !declared.has(name));
    // At the end, where it moves nothing: `var` is hoisted, and what has to
    // be first in a module, like `"use client"`, stays first.
    if (hidden.length > 0) {
      result = { code: `${code}\nvar ${hidden.join(", ")};\n`, map: result?.map };
    }
  }
  return result;
}

export type ServerCodeOptions = {
  /**
   * Modules that are part of the test and not of the app, next to the test
   * files and setup files of the Vitest config: glob patterns, relative to the
   * project root. They keep the tab's `window` and `fetch`.
   *
   * @example ["test/**", "**\/node_modules/@electric-sql/pglite/**"]
   */
  testModules?: string | RegExp | (string | RegExp)[];
};

// The directory of this package. Its own runtime knows where it runs.
function findOwnDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!fs.existsSync(path.join(dir, "package.json"))) dir = path.dirname(dir);
  return normalizePath(dir);
}

// Every `node_modules` a file in `from` can import from, nearest first.
function* nodeModulesOf(from: string): Generator<string> {
  for (let dir = from; ; dir = path.dirname(dir)) {
    yield path.join(dir, "node_modules");
    if (dir === path.dirname(dir)) return;
  }
}

function findPackage(name: string, from: string): string | undefined {
  for (const nodeModules of nodeModulesOf(from)) {
    const candidate = path.join(nodeModules, name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
  }
}

// The directories of these packages and of everything they depend on.
function findPackagesWithDependencies(names: Iterable<string>, root: string): Set<string> {
  const dirs = new Set<string>();
  const visit = (name: string, from: string) => {
    const dir = findPackage(name, from);
    if (!dir || dirs.has(normalizePath(dir))) return;
    dirs.add(normalizePath(dir));
    const { dependencies = {} } = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    for (const dependency of Object.keys(dependencies)) visit(dependency, dir);
  };
  for (const name of names) visit(name, root);
  return dirs;
}

// Vitest, Vite, and the packages of Vitest's scope that the project has: its
// browser mode, the provider that drives the browser, coverage.
function* testRunnerPackageNames(root: string): Generator<string> {
  yield* ["vitest", "vite"];
  for (const nodeModules of nodeModulesOf(root)) {
    const scope = path.join(nodeModules, "@vitest");
    if (fs.existsSync(scope)) for (const name of fs.readdirSync(scope)) yield `@vitest/${name}`;
  }
}

// `/x/node_modules/@scope/name/dist/index.js` is of the package `/x/node_modules/@scope/name`.
function packageDirOf(file: string): string | undefined {
  return /^.*\/node_modules\/(?:@[^/]+\/)?[^/]+(?=\/)/.exec(file)?.[0];
}

const name = "vitest-plugin-rsc:next-server-code";

export function createServerCode(registry: string, options: ServerCodeOptions = {}) {
  const ownDir = findOwnDir();
  const patterns = [options.testModules ?? []].flat();
  let isTestModule: (file: string) => boolean = () => false;
  // One for every Vitest project this plugin is in.
  const testFileMatchers: ((file: string) => boolean)[] = [];
  let testRunnerPackages = new Set<string>();

  /**
   * Whether a file is server code in a layer. Everything in the ssr layer is.
   * The rsc layer shares its environment with the test: the test files, what
   * runs them and what the options add to those are not.
   */
  function isServerCode(file: string, layer: NextLayer): boolean {
    if (layer === "browser" || !path.isAbsolute(file)) return false;
    file = normalizePath(file);
    if (file.startsWith(`${ownDir}/`)) return false;
    if (layer === "ssr") return true;
    if (isTestModule(file) || testFileMatchers.some((matches) => matches(file))) return false;
    const packageDir = packageDirOf(file);
    return !packageDir || !testRunnerPackages.has(packageDir);
  }

  return {
    isServerCode,
    /**
     * Vite keys its cache of pre-bundled dependencies on the `define` of the
     * optimizer, among other things. What is compiled into them is part of it.
     */
    cacheKey: { __vitest_plugin_rsc_test_modules__: JSON.stringify(patterns.map(String)) },
    /** For a module this plugin generates. */
    compile: async (code: string, id: string) =>
      (await compileServerCode(code, id, registry))?.code ?? code,
    /** Call once the root of the project is known. */
    configure(root: string): void {
      if (patterns.length > 0) isTestModule = createFilter(patterns, null, { resolve: root });
      // Vitest pre-bundles its own runtime for the tab, in the environment of
      // the test, which is the one of the rsc layer.
      testRunnerPackages = findPackagesWithDependencies(testRunnerPackageNames(root), root);
    },
    /** Call with what a Vitest config says is a test file or a setup file. */
    addTestFiles(matches: (file: string) => boolean): void {
      testFileMatchers.push(matches);
    },
    /** For the dependency optimizer: the pre-bundled dependencies of a layer. */
    optimizerPlugin(layer: NextLayer) {
      return {
        name,
        async transform(
          this: { warn(message: string): void },
          code: string,
          id: string,
        ): Promise<{ code: string; map: null } | undefined> {
          if (!/\.[cm]?js$/.test(id) || !isServerCode(id, layer)) return;
          try {
            const result = await compileServerCode(code, id, registry, { bundled: true });
            return result && { code: result.code, map: null };
          } catch (error) {
            // JSX in a `.js` file, for one. The bundler may still take it.
            this.warn(
              `vitest-plugin-rsc: ${id} is not compiled as server code, it does not parse as ` +
                `JavaScript: ${String(error instanceof Error ? error.message : error).split("\n")[0]}`,
            );
          }
        },
      };
    },
    /** For the source files of the server layers, by the name of their environment. */
    plugin(environments: Record<string, NextLayer>): Plugin {
      return {
        name,
        applyToEnvironment: (environment) => Object.hasOwn(environments, environment.name),
        async transform(code, id) {
          const file = id.split("?")[0]!;
          // JavaScript and TypeScript, which is JavaScript by now. Not a
          // stylesheet, and not what another plugin compiles to JavaScript.
          if (!/\.[cm]?[jt]sx?$/.test(file) || !fs.existsSync(file)) return;
          // A dependency is compiled when it is pre-bundled, and is not
          // compiled again when it is served from Vite's cache. One that is
          // left out of pre-bundling is served as it is.
          if (file.includes("/node_modules/")) return;
          if (file.startsWith(`${normalizePath(this.environment.config.cacheDir)}/`)) return;
          if (!isServerCode(file, environments[this.environment.name]!)) return;
          return compileServerCode(code, file, registry);
        },
      };
    },
  };
}
