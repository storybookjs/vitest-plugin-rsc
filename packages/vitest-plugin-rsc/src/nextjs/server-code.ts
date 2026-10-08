import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFilter, normalizePath, transformWithOxc, type Plugin } from "vite";
import type { NextLayer } from "./project.ts";

// The server layers run in a browser tab, which has a `window` and a `fetch`
// of its own. A tab cannot lose its globals, but a module can be compiled not
// to see them: `typeof window` becomes `"undefined"`, which is what Next's
// build does to server code, and `fetch`, `Request` and `Response` become the
// server's, which are in `registry` (globals.ts). See docs/next-routes.md.

/** Globals of a tab that a server does not have. */
const browserGlobals = ["window", "document", "location", "localStorage", "sessionStorage"];
/** Globals a server has too, but its own. */
const serverGlobals = [
  "Request",
  "Response",
  "fetch",
  // Node.js has these and a tab does not: see globals.ts.
  "setImmediate",
  "clearImmediate",
];

const mentionsServerGlobal = new RegExp(`\\b(?:${serverGlobals.join("|")})\\b`);
// Also `typeof(window)`: which `typeof` the defines replace is up to oxc.
const mentionsTypeof = /\btypeof\b/;
const mentionsBrowserGlobal = new RegExp(`\\b(?:${browserGlobals.join("|")})\\b`);

type Compiled = Pick<Awaited<ReturnType<typeof transformWithOxc>>, "code" | "map">;

/** Compiles JavaScript as server code. Returns nothing for code that stays as it is. */
export async function compileServerCode(
  code: string,
  id: string,
  registry: string,
  define: Record<string, string> = {},
): Promise<Compiled | undefined> {
  // Replacements are scope-aware: a parameter named `fetch` is not the global.
  const defines = { ...define };
  if (mentionsServerGlobal.test(code)) {
    for (const name of serverGlobals) {
      defines[name] = defines[`globalThis.${name}`] = `${registry}.${name}`;
    }
  }
  if (mentionsTypeof.test(code) && mentionsBrowserGlobal.test(code)) {
    for (const name of browserGlobals) defines[`typeof ${name}`] = '"undefined"';
  }
  if (Object.keys(defines).length === 0) return;
  return transformWithOxc(code, id, { lang: "js", define: defines });
}

export type ServerCodeOptions = {
  /**
   * Modules that have to know they run in a browser: glob patterns, relative
   * to the project root. They keep the tab's `typeof window` and `fetch`, as
   * the test files and setup files of the Vitest config do. List a helper of
   * the tests, or a package they use on the page, that asks `typeof window`
   * before it works on the page.
   *
   * Files are matched by their real path, which for a package is seldom
   * `node_modules/<name>` under the root. So start a pattern for one with `**`.
   *
   * @example ["test/**", "**\/node_modules/@testing-library/**"]
   */
  browserModules?: string | RegExp | (string | RegExp)[];
};

// The files of this package, in `src` or in `dist`. Its own runtime knows
// where it runs.
const ownDir = normalizePath(fileURLToPath(new URL("..", import.meta.url)));

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
  const patterns = [options.browserModules ?? []].flat();
  let isBrowserModule: (file: string) => boolean = () => false;
  // One for every Vitest project this plugin is in.
  const testFileMatchers: ((file: string) => boolean)[] = [];
  let testRunnerPackages = new Set<string>();

  /**
   * Whether a file is server code in a layer. The rsc layer shares its
   * environment with the test: the test files, what runs them and the
   * `browserModules` of the options are not.
   */
  function isServerCode(file: string, layer: NextLayer): boolean {
    if (layer === "browser" || !path.isAbsolute(file)) return false;
    file = normalizePath(file);
    if (file.startsWith(ownDir)) return false;
    if (layer === "ssr") return true;
    if (isBrowserModule(file) || testFileMatchers.some((matches) => matches(file))) return false;
    const packageDir = packageDirOf(file);
    return !packageDir || !testRunnerPackages.has(packageDir);
  }

  return {
    isServerCode,
    /**
     * Whether a source file is code of the app in a layer: what Next's build
     * compiles. Not in the rsc layer: what is the tab's there, the test files
     * and the `browserModules`.
     */
    isAppCode(file: string, layer: NextLayer): boolean {
      if (!path.isAbsolute(file) || file.includes("/node_modules/")) return false;
      if (layer !== "rsc") return !normalizePath(file).startsWith(ownDir);
      return testFileMatchers.length > 0 && isServerCode(file, layer);
    },
    /** For the `define` of the optimizer, which Vite keys its cache on. */
    cacheKey: { __vitest_plugin_rsc_browser_modules__: JSON.stringify(patterns.map(String)) },
    /** For a module this plugin generates, with the constants of its layer. */
    compile: async (code: string, id: string, define: Record<string, string>) =>
      (await compileServerCode(code, id, registry, define))?.code ?? code,
    /** Call once the root of the project is known. */
    configure(root: string): void {
      if (patterns.length > 0) isBrowserModule = createFilter(patterns, null, { resolve: root });
      // Vitest pre-bundles its own runtime in the environment of the rsc layer.
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
        ): Promise<Compiled | undefined> {
          if (!/\.[cm]?js$/.test(id) || !isServerCode(id, layer)) return;
          try {
            return await compileServerCode(code, id, registry);
          } catch (error) {
            // JSX in a `.js` file, for one. The bundler may still take it.
            const reason = String(error instanceof Error ? error.message : error);
            this.warn(
              `vitest-plugin-rsc: ${id} is not compiled as server code, it does not parse as ` +
                `JavaScript. ${reason.replace(/\s+/g, " ")}`,
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
          // Not a stylesheet, and not what another plugin compiles to JavaScript.
          if (!/\.[cm]?[jt]sx?$/.test(file) || !fs.existsSync(file)) return;
          // A dependency is compiled when it is pre-bundled, or not at all.
          if (file.includes("/node_modules/")) return;
          if (file.startsWith(`${normalizePath(this.environment.config.cacheDir)}/`)) return;
          const layer = environments[this.environment.name]!;
          // Without Vitest's config there is no telling a test file from a
          // file of the app, and a test file must keep the tab.
          if (layer === "rsc" && testFileMatchers.length === 0) return;
          if (!isServerCode(file, layer)) return;
          return compileServerCode(code, file, registry);
        },
      };
    },
  };
}
