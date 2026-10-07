import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFilter, normalizePath, parseAstAsync, transformWithOxc, type Plugin } from "vite";
import type { NextLayer } from "./project.ts";

// The server layers run in a browser tab, which has a `window` and a `fetch`
// of its own. A tab cannot lose its globals, but a module can be compiled not
// to see them. That is what happens to a module that is server code:
//
// - `window`, `document` and the other globals only a browser has become
//   variables of the module, which are `undefined`. So `typeof window` is
//   `"undefined"`, and `window.innerWidth` throws.
// - `fetch`, `Request` and `Response` are replaced by the server's, which are
//   in `registry`: see globals.ts.
//
// The first is a declaration and not a replacement, so that the code of a
// function stays what it was. An app can send one to the browser as text, as
// `next-themes` does with the script that sets the theme before the page
// hydrates, and there it has to find the tab's `document`.
//
// What this does not reach is what looks a global up at runtime: `self.window`,
// `"window" in globalThis`, a `globalThis` that is passed around.

/** Globals of a tab that a server does not have. */
const browserGlobals = ["window", "document", "location", "localStorage", "sessionStorage"];
/** Globals a server has too, but its own. */
const serverGlobals = ["Request", "Response", "fetch"];

const mentions = (names: string[]) => new RegExp(`\\b(?:${names.join("|")})\\b`);
const mentionsBrowserGlobal = mentions(browserGlobals);
const mentionsServerGlobal = mentions(serverGlobals);

function serverDefines(registry: string): Record<string, string> {
  const defines: Record<string, string> = {};
  for (const name of serverGlobals) {
    defines[name] = defines[`globalThis.${name}`] = `${registry}.${name}`;
  }
  for (const name of browserGlobals) defines[`globalThis.${name}`] = "undefined";
  return defines;
}

type Node = { type: string; [key: string]: any };

// The names a pattern binds: `a`, `{ a, b: [c] }`, `[a = 1, ...b]`.
function* namesOf(pattern: Node | null): Generator<string> {
  if (!pattern) return;
  if (pattern.type === "Identifier") yield pattern.name;
  else if (pattern.type === "ObjectPattern") {
    for (const property of pattern.properties) yield* namesOf(property.value ?? property.argument);
  } else if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements) yield* namesOf(element);
  } else yield* namesOf(pattern.left ?? pattern.argument);
}

// What a module declares itself: a `location` of its own is not the tab's.
function* declaredNames(program: Node): Generator<string> {
  for (const statement of program.body as Node[]) {
    const node: Node = (statement.type.startsWith("Export") && statement.declaration) || statement;
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
 * Compiles JavaScript as server code. Returns nothing for code that stays as
 * it is.
 */
export async function compileServerCode(
  code: string,
  id: string,
  registry: string,
): Promise<Compiled | undefined> {
  const mentionsBrowser = mentionsBrowserGlobal.test(code);
  let result: Compiled | undefined;
  if (mentionsServerGlobal.test(code) || (mentionsBrowser && code.includes("globalThis"))) {
    // Scope-aware: a parameter named `fetch` is not the global.
    result = await transformWithOxc(code, id, { lang: "js", define: serverDefines(registry) });
    code = result.code;
  }
  if (mentionsBrowser) {
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

function findPackage(name: string, from: string): string | undefined {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
    if (dir === path.dirname(dir)) return;
  }
}

// The directories of these packages and of everything they depend on.
function findPackagesWithDependencies(names: string[], root: string): Set<string> {
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

// `/x/node_modules/@scope/name/dist/index.js` is of the package `/x/node_modules/@scope/name`.
function packageDirOf(file: string): string | undefined {
  return /^.*\/node_modules\/(?:@[^/]+\/)?[^/]+(?=\/)/.exec(file)?.[0];
}

export function createServerCode(registry: string, options: ServerCodeOptions = {}) {
  const ownDir = findOwnDir();
  const patterns = [options.testModules ?? []].flat();
  // Vite keys its cache of pre-bundled dependencies on the names of the
  // plugins, among other things. What is compiled into them is part of it.
  const name = `vitest-plugin-rsc:next-server-code?testModules=${patterns.map(String).join()}`;
  let isTestModule: (file: string) => boolean = () => false;
  let isTestFile: (file: string) => boolean = () => false;
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
    if (isTestFile(file) || isTestModule(file)) return false;
    const packageDir = packageDirOf(file);
    return !packageDir || !testRunnerPackages.has(packageDir);
  }

  return {
    isServerCode,
    /** For a module this plugin generates. */
    compile: async (code: string, id: string) =>
      (await compileServerCode(code, id, registry))?.code ?? code,
    /** Call once the root of the project is known. */
    configure(root: string): void {
      if (patterns.length > 0) isTestModule = createFilter(patterns, null, { resolve: root });
      // Vitest pre-bundles its own runtime for the tab, in the environment of
      // the test, which is the one of the rsc layer.
      testRunnerPackages = findPackagesWithDependencies(
        ["vitest", "@vitest/browser", "vite"],
        root,
      );
    },
    /** Call with what Vitest's config says is a test file or a setup file. */
    setTestFiles(matches: (file: string) => boolean): void {
      isTestFile = matches;
    },
    /** For the dependency optimizer: the pre-bundled dependencies of a layer. */
    optimizerPlugin(layer: NextLayer) {
      return {
        name,
        async transform(code: string, id: string) {
          if (!/\.[cm]?js$/.test(id) || !isServerCode(id, layer)) return;
          const result = await compileServerCode(code, id, registry);
          return result && { code: result.code, map: null };
        },
      };
    },
    /** For the source files of the server layers, by the name of their environment. */
    plugin(environments: Record<string, NextLayer>): Plugin {
      return {
        name,
        applyToEnvironment: (environment) => environment.name in environments,
        async transform(code, id) {
          const file = id.split("?")[0]!;
          // A dependency is compiled when it is pre-bundled, and is not
          // compiled again when it is served from Vite's cache. One that is
          // left out of pre-bundling is served as it is.
          if (file.includes("/node_modules/") || !fs.existsSync(file)) return;
          if (file.startsWith(`${normalizePath(this.environment.config.cacheDir)}/`)) return;
          if (!isServerCode(file, environments[this.environment.name]!)) return;
          try {
            return await compileServerCode(code, file, registry);
          } catch {
            // Not JavaScript, like the stylesheet a `<link>` asks for.
          }
        },
      };
    },
  };
}
