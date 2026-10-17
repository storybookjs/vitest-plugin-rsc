import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFilter, normalizePath, transformWithOxc, type Plugin } from "vite";
import type { NextLayer } from "./project.ts";

// The server layers run in a browser, which has a `window` and a `fetch`
// of its own. A browser cannot lose its globals, but a module can be compiled
// not to see them: `typeof window` becomes `"undefined"`, which is what Next's
// build does to server code, and `fetch`, `Request` and `Response` become the
// server's, which are in `registry` (globals.ts). See docs/next-routes.md.

/** Globals of a browser that a server does not have. */
const browserGlobals = ["window", "document", "location", "localStorage", "sessionStorage"];
/** Globals a server has too, but its own. */
const serverGlobals = [
  "Request",
  "Response",
  "fetch",
  // Node.js has these and a browser does not: see globals.ts.
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
   * to the project root. They keep the browser's `typeof window` and `fetch`,
   * as the test files and setup files of the Vitest config do. List a helper of
   * the tests, or a package they use on the page, that asks `typeof window`
   * before it works on the page.
   *
   * Files are matched by their real path, which for a package is seldom
   * `node_modules/<name>` under the root. So start a pattern for one with `**`.
   *
   * @example ["test/**", "**\/node_modules/@testing-library/**"]
   */
  browserModules?: string | RegExp | (string | RegExp)[];
  /**
   * What runs the app, when that is not Vitest. Under Vitest the plugin knows
   * the host's files from its config, the test files and the setup files, and
   * its packages, `vitest` and `@vitest/*`. Another host, like Storybook, says
   * here what is its own. A file of the host is not server code: it keeps the
   * browser's `typeof window` and `fetch`, and Next's compiler does not run on
   * it. With `"use client"` it is a module of the browser layer. A package of
   * the host is the one instance the page has, also in the browser layer.
   */
  host?: {
    /**
     * The files of the host, like its stories: glob patterns, relative to the
     * project root. What a test file is to Vitest.
     *
     * @example [".storybook/**", "src/**\/*.stories.tsx"]
     */
    files?: string | RegExp | (string | RegExp)[];
    /**
     * The packages of the host, by name. A name that ends in `/*` is every
     * package of that scope the project has. What they depend on is the
     * host's too, but for this plugin and Vite RSC, which a framework of the
     * host can depend on.
     *
     * Not something the plugin can read off the files: a file of the host
     * with `"use client"` imports `react` and `storybook/test` the same way,
     * and the first has to be the browser layer's React, where the second
     * has to be the page's own module, whose spies the host shows. What
     * `vitest` is to a test file. The same list keeps the host's runtime
     * the browser's in the rsc layer, where every other package is server
     * code.
     *
     * @example ["storybook", "@storybook/*"]
     */
    packages?: string[];
  };
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

// What a host can depend on that is never the host's: this plugin, and what
// it is built on. A framework of a host brings the plugin, and the walk of
// the host's dependencies would take it along: `@storybook/nextjs-vite-rsc`
// matches `@storybook/*`, depends on `vitest-plugin-rsc`, which depends on
// `@vitejs/plugin-rsc`, whose Flight server has to stay server code in the
// rsc layer. Without this, that framework turns the plugin's own server
// code into browser code.
const ownPackages = new Set(["vitest-plugin-rsc", "@vitejs/plugin-rsc"]);

// The directories of these packages and of everything they depend on.
function findPackagesWithDependencies(names: Iterable<string>, root: string): Set<string> {
  const dirs = new Set<string>();
  const visit = (name: string, from: string) => {
    if (ownPackages.has(name)) return;
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

// The packages of the test runner, and of another host (`host.packages`), by
// name. Their own modules have state that is the page's.
const hostPackages = (packages: string[]) => ["vitest", "@vitest/*", ...packages];

// Vite and the packages of the host that the project has: Vitest, its browser
// mode, the provider that drives the browser, coverage; a scope is every
// package of it.
function* hostPackageNames(root: string, packages: string[]): Generator<string> {
  for (const name of ["vite", ...hostPackages(packages)]) {
    if (!name.endsWith("/*")) {
      yield name;
      continue;
    }
    const scope = name.slice(0, -"/*".length);
    for (const nodeModules of nodeModulesOf(root)) {
      const dir = path.join(nodeModules, scope);
      if (fs.existsSync(dir)) for (const child of fs.readdirSync(dir)) yield `${scope}/${child}`;
    }
  }
}

// `/x/node_modules/@scope/name/dist/index.js` is of the package `/x/node_modules/@scope/name`.
function packageDirOf(file: string): string | undefined {
  return /^.*\/node_modules\/(?:@[^/]+\/)?[^/]+(?=\/)/.exec(file)?.[0];
}

const name = "vitest-plugin-rsc:next-server-code";

export function createServerCode(registry: string, options: ServerCodeOptions = {}) {
  const patterns = [options.browserModules ?? []].flat();
  const hostFiles = [options.host?.files ?? []].flat();
  const packages = options.host?.packages ?? [];
  let isBrowserModule: (file: string) => boolean = () => false;
  // One for every Vitest project this plugin is in.
  const testFileMatchers: ((file: string) => boolean)[] = [];
  // The files of another host, `host.files`.
  let isOwnFileOfHost: (file: string) => boolean = () => false;
  // The names of the packages of the host, and once configured, the
  // directories of them and of everything they depend on.
  const hostPackageNamesOfOptions = hostPackages(packages);
  let hostPackageDirs = new Set<string>();

  /**
   * Whether a file is one of the host's: a test file or a setup file of
   * Vitest, or a file of another host, like a story.
   */
  function isHostFile(file: string): boolean {
    file = normalizePath(file);
    return isOwnFileOfHost(file) || testFileMatchers.some((matches) => matches(file));
  }
  // Whether anything says which files are the host's.
  const knowsHostFiles = () => hostFiles.length > 0 || testFileMatchers.length > 0;

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
    if (isBrowserModule(file) || isHostFile(file)) return false;
    const packageDir = packageDirOf(file);
    return !packageDir || !hostPackageDirs.has(packageDir);
  }

  return {
    isServerCode,
    isHostFile,
    /**
     * Whether an import is of a package of the host, by its name: `vitest`,
     * `vitest/browser`, `@vitest/spy`. Not what such a package depends on.
     */
    isHostPackage(specifier: string): boolean {
      return hostPackageNamesOfOptions.some((name) =>
        name.endsWith("/*")
          ? specifier.startsWith(name.slice(0, -1))
          : specifier === name || specifier.startsWith(`${name}/`),
      );
    },
    /**
     * Whether a source file is code of the app in a layer: what Next's build
     * compiles. Not in the rsc layer: what is the browser's there, the test
     * files and the `browserModules`. And in no layer a file of the host,
     * which with `"use client"` is a module of the browser layer: it is the
     * host's to compile, as any test file of Vitest, with Vite's own
     * transforms and the host's config, not with Next's.
     */
    isAppCode(file: string, layer: NextLayer): boolean {
      if (!path.isAbsolute(file) || file.includes("/node_modules/")) return false;
      if (layer !== "rsc") return !normalizePath(file).startsWith(ownDir) && !isHostFile(file);
      return knowsHostFiles() && isServerCode(file, layer);
    },
    /** For the `define` of the optimizer of a server layer, which Vite keys its cache on. */
    cacheKey: {
      __vitest_plugin_rsc_browser_modules__: JSON.stringify([
        patterns.map(String),
        hostFiles.map(String),
        packages,
      ]),
    },
    /**
     * The same for the browser layer, which pre-bundles the packages of the
     * host as the page's own: Vite does not key its cache on the plugins of
     * the optimizer.
     */
    browserCacheKey: { __vitest_plugin_rsc_host_packages__: JSON.stringify(packages) },
    /** For a module this plugin generates, with the constants of its layer. */
    compile: async (code: string, id: string, define: Record<string, string>) =>
      (await compileServerCode(code, id, registry, define))?.code ?? code,
    /** Call once the root of the project is known. */
    configure(root: string): void {
      if (patterns.length > 0) isBrowserModule = createFilter(patterns, null, { resolve: root });
      if (hostFiles.length > 0) isOwnFileOfHost = createFilter(hostFiles, null, { resolve: root });
      // Vitest pre-bundles its own runtime in the environment of the rsc layer.
      hostPackageDirs = findPackagesWithDependencies(hostPackageNames(root, packages), root);
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
          // Without Vitest's config, or the files of another host, there is
          // no telling a test file from a file of the app, and a test file
          // must keep the browser.
          if (layer === "rsc" && !knowsHostFiles()) return;
          if (!isServerCode(file, layer)) return;
          return compileServerCode(code, file, registry);
        },
      };
    },
  };
}
