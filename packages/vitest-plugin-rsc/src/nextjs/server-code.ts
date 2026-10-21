import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFilter, normalizePath, transformWithOxc, type Plugin } from "vite";
import { transformAsyncFunctions } from "../async-local-storage-transform.ts";
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
   * its packages, `vitest` and `@vitest/*`. Another host says here what is its
   * own. A file of the host is not server code: it keeps the browser's
   * `typeof window` and `fetch`, and Next's compiler does not run on
   * it. With `"use client"` it is a module of the browser layer. A package of
   * the host is the one instance the page has, also in the browser layer.
   */
  host?: {
    /**
     * The files of the host, like the ones it renders: glob patterns,
     * relative to the project root. What a test file is to Vitest.
     *
     * @example ["host/**", "src/**\/*.demo.tsx"]
     */
    files?: string | RegExp | (string | RegExp)[];
    /**
     * The packages of the host, by name. A name that ends in `/*` is every
     * package of that scope the project has, or every module under that path
     * of a package, like `host-kit/internal/*`. A module of a package, like
     * `host-kit/test`, is the page's own, and the package's other modules
     * are not, but the files of the whole package are the host's runtime in
     * the rsc layer. What they depend on is the host's too, but for this
     * plugin and what it depends on, which a framework of the host can
     * depend on.
     *
     * Not something the plugin can read off the files: a file of the host
     * with `"use client"` imports `react` and `host-kit/test` the same way,
     * and the first has to be the browser layer's React, where the second
     * has to be the page's own module, whose spies the host shows. What
     * `vitest` is to a test file. The same list keeps the host's runtime
     * the browser's in the rsc layer, where every other package is server
     * code.
     *
     * A package of the list that the browser layer imports only from inside
     * another package reaches the rsc layer through the page, which no scan
     * of Vite's reads: list it in `optimizeDeps.include` too, or Vite
     * pre-bundles it as the first page loads.
     *
     * @example ["host-kit/test", "host-kit/preview"]
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

// The `dependencies` of the package at `dir`, by name.
function dependenciesOf(dir: string): string[] {
  const file = path.join(dir, "package.json");
  if (!fs.existsSync(file)) return [];
  const { dependencies = {} } = JSON.parse(fs.readFileSync(file, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  return Object.keys(dependencies);
}

// The directory of this package, the nearest with a `package.json` above
// this file, in `src` or in `dist`.
function ownPackageDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!fs.existsSync(path.join(dir, "package.json")) && dir !== path.dirname(dir)) {
    dir = path.dirname(dir);
  }
  return fs.realpathSync(dir);
}

// What a host can depend on that is never the host's: this plugin, and what
// it is built on, its `dependencies`, by their directories, under whatever
// name the host has them. A framework of a host brings the plugin, and the
// walk of the host's dependencies would take it along, to Vite RSC, whose
// Flight server has to stay server code in the rsc layer. Without this, that
// framework turns the plugin's own server code into browser code.
function ownPackageDirs(): Set<string> {
  const dir = ownPackageDir();
  const dependencies = dependenciesOf(dir).map((name) => findPackage(name, dir));
  return new Set([dir, ...dependencies.filter((found) => found !== undefined)]);
}

// The directories of these packages and of everything they depend on, but
// for a package that the project itself depends on: what is in the
// `dependencies` of the app is the app's, and server code, unless the host
// names it. A package of the host that depends on `next`, `react` or a
// library of the app would otherwise take it along, and the app's server
// would run as browser code, without a message. The directory decides, so a
// version of the host's own, which the package manager keeps apart, is still
// the host's. A package that only the dependencies of the app depend on is
// not caught: the walk of the app's own tree would cost a few hundred
// milliseconds of startup, for a case no host has had yet.
function findPackagesWithDependencies(names: Iterable<string>, root: string): Set<string> {
  const dirs = new Set<string>();
  const named = new Set(names);
  const appDirs = new Set(
    dependenciesOf(root)
      .map((name) => findPackage(name, root))
      .filter((dir) => dir !== undefined),
  );
  const own = ownPackageDirs();
  const visit = (name: string, from: string) => {
    const dir = findPackage(name, from);
    if (!dir || own.has(dir) || dirs.has(normalizePath(dir))) return;
    if (!named.has(name) && appDirs.has(dir)) return;
    dirs.add(normalizePath(dir));
    for (const dependency of dependenciesOf(dir)) visit(dependency, dir);
  };
  for (const name of named) visit(name, root);
  return dirs;
}

// The packages of the test runner, and of another host (`host.packages`), by
// name. Their own modules have state that is the page's.
const hostPackages = (packages: string[]) => ["vitest", "@vitest/*", ...packages];

// The package of a module, by its name: `host-kit` of `host-kit/test`,
// `@scope/name` of `@scope/name/module`.
const packageNameOf = (specifier: string) => /^(?:@[^/]+\/)?[^/]+/.exec(specifier)![0];

// Vite and the packages of the host that the project has: Vitest, its browser
// mode, the provider that drives the browser, coverage; a scope is every
// package of it. A module of a package, like `host-kit/test`, is its
// package: the module's files are in that directory, with the rest of the
// runtime they import, and its `package.json` has what they depend on.
function* hostPackageNames(root: string, packages: string[]): Generator<string> {
  for (const name of ["vite", ...hostPackages(packages)]) {
    if (!/^@[^/]+\/\*$/.test(name)) {
      yield packageNameOf(name);
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

type Warns = { warn(message: string): void };

const name = "vitest-plugin-rsc:next-server-code";
const asyncFunctionsName = "vitest-plugin-rsc:next-async-functions";

// The modules of Next's server whose async functions are compiled to keep
// their stores across an `await` (async-local-storage-transform.ts), as the
// source files of the app are: the ones that await inside a store, one they
// entered or left with `exit()`, or the request's own, and read it after the
// `await`, as on Node.js. One entry per module, with the layer it is a
// module of and the store it carries. Each server layer's optimizer compiles
// its own, once, and keeps them in its cache. A static build does the same.
export const nextModulesWithStores: { layer: "rsc" | "ssr"; module: string }[] = [
  // The store of a `"use cache"` function: it enters the scope and awaits
  // before it has React call the function.
  { layer: "rsc", module: "use-cache/use-cache-wrapper.js" },
  // The handler of a Server Action, through `app-page/module`: it enters the
  // action's store, `actionAsyncStorage`, awaits the action, and renders the
  // page after it in an `exit()` of that store, which it awaits. After each
  // `await` it has its own request's stores back: not those of a request
  // that the action made to the app and that is still at work, as one with
  // `after()` is, and not the store it left.
  { layer: "ssr", module: "app-render/action-handler.js" },
  // The render, through `app-page/module`, with the request stores of a
  // page, `workAsyncStorage` and `workUnitAsyncStorage`: it awaits the
  // handler of an action, and its own work, before it starts React's.
  { layer: "ssr", module: "app-render/app-render.js" },
];
// The modules of a layer in that list, by their file, of either build of
// Next's server.
function nextModulesWithStoresOf(layer: NextLayer): RegExp | undefined {
  const modules = nextModulesWithStores.filter((entry) => entry.layer === layer);
  if (modules.length === 0) return;
  const files = modules.map(({ module }) => module.replaceAll(".", "\\.")).join("|");
  return new RegExp(`/next/dist/(?:esm/)?server/(?:${files})$`);
}
// React's Flight server, of the React that Next ships: the build for
// development and the one for production, of React and of its experimental
// channel.
const flightServer =
  /\/next\/dist\/compiled\/react-server-dom-webpack(?:-experimental)?\/cjs\/react-server-dom-webpack-server\.edge\.\w+\.js$/;
const performWork = "function performWork(request) {";
const issues = "https://github.com/storybookjs/vitest-plugin-rsc/issues";

// The version of the Next.js that a module of its `dist` is of.
function nextVersionOf(id: string): string {
  const root = normalizePath(id).match(/^(.*\/next)\/dist\//)?.[1];
  try {
    return (JSON.parse(fs.readFileSync(`${root}/package.json`, "utf8")) as { version: string })
      .version;
  } catch {
    return "?";
  }
}

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
    return isOwnFileOfHost(normalizePath(file)) || isTestFile(file);
  }
  /** Whether a file is a test file or a setup file of Vitest. */
  function isTestFile(file: string): boolean {
    file = normalizePath(file);
    return testFileMatchers.some((matches) => matches(file));
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

  // The async functions of a file, compiled. A file that does not parse stays
  // as it is: its functions read the store of the request after an `await`.
  function compileAsyncFunctions(context: Warns, code: string, file: string) {
    try {
      return transformAsyncFunctions(code, file, `${registry}.asyncFunctionHooks`);
    } catch (error) {
      const reason = String(error instanceof Error ? error.message : error);
      context.warn(
        `vitest-plugin-rsc: the async functions of ${file} do not keep their stores across an ` +
          `await, it does not parse as JavaScript. ${reason.replace(/\s+/g, " ")}`,
      );
    }
  }

  /** The file of a module, if it is a source file that is server code in a layer. */
  function sourceFileOf(id: string, cacheDir: string, layer: NextLayer): string | undefined {
    const file = id.split("?")[0]!;
    // Not a stylesheet, and not what another plugin compiles to JavaScript.
    // And a file on disk: a module that is no file is a plugin's, like the
    // `/virtual:/…` entries of the page of a host, which run on the page, and
    // is never server code.
    if (!/\.[cm]?[jt]sx?$/.test(file) || !fs.existsSync(file)) return;
    // A dependency is compiled when it is pre-bundled, or not at all.
    if (file.includes("/node_modules/") || file.startsWith(`${cacheDir}/`)) return;
    if (isServerCode(file, layer)) return file;
  }

  // React's Flight server of the rsc layer, for the stores a render runs
  // with. React starts a render in a microtask. On Node.js that has the
  // stores of the code that started the render, and here the server's own
  // `queueMicrotask` passes them on: see globals.ts. That is how Next has
  // React call a cached function in the scope of that function, and render
  // the page after a Server Action outside the store of the action. And it
  // renders in steps, each a `performWork()`: the later ones when a promise
  // it waits for settles. On Node.js such a step has the stores of the step
  // that waited, so what a cached component returns renders in its scope.
  // Here each step gets the stores of the first: see globals.ts.
  function flightServerOf(code: string, id: string) {
    if (!flightServer.test(normalizePath(id))) return;
    if (!code.includes(performWork)) {
      throw new Error(
        `vitest-plugin-rsc: ${id}, React's Flight server of next@${nextVersionOf(id)}, has no ` +
          `\`${performWork}\` to compile, which every render of a server needs to keep its ` +
          `stores. This Next.js is newer than the plugin knows: report it at ${issues}.`,
      );
    }
    return {
      code: code.replace(
        performWork,
        `function performWork(request) { ${registry}.performWork(request, performWorkOfReact); }\n` +
          `function performWorkOfReact(request) {`,
      ),
      define: { queueMicrotask: `${registry}.queueMicrotask` },
    };
  }

  return {
    isServerCode,
    isHostFile,
    isTestFile,
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
      // The list above, so that a change to it pre-bundles its modules again.
      __vitest_plugin_rsc_modules_with_stores__: JSON.stringify(nextModulesWithStores),
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
    /**
     * What a dependency of a server layer needs on top of `compileServerCode()`
     * to keep its stores across an `await` and a render, for a static build,
     * which has no optimizer: see `optimizerPlugin()` and
     * `asyncFunctionsOptimizerPlugin()`.
     */
    forStores(context: Warns, code: string, id: string, layer: NextLayer) {
      if (nextModulesWithStoresOf(layer)?.test(normalizePath(id))) {
        return { code: compileAsyncFunctions(context, code, id)?.code ?? code, define: {} };
      }
      return (layer === "rsc" ? flightServerOf(code, id) : undefined) ?? { code, define: {} };
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
          const flight = layer === "rsc" ? flightServerOf(code, id) : undefined;
          if (flight) code = flight.code;
          const define = flight?.define;
          try {
            return await compileServerCode(code, id, registry, define);
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
    /**
     * The async functions that have to read, after an `await`, a store Next
     * entered for them, or left for them with `exit()`: see
     * async-local-storage-transform.ts. For the dependency optimizer of a
     * server layer, the modules of Next's server in `nextModulesWithStores`
     * that are that layer's. The bundler hands it each file of a dependency
     * it pre-bundles, by its path, so a module inside the bundle of
     * `app-page/module` is one.
     */
    asyncFunctionsOptimizerPlugin(layer: NextLayer) {
      const modules = nextModulesWithStoresOf(layer);
      return {
        name: asyncFunctionsName,
        transform(this: Warns, code: string, id: string) {
          if (modules?.test(normalizePath(id))) return compileAsyncFunctions(this, code, id);
        },
      };
    },
    /** And the source files of the app in the `rsc` layer, by the name of its environment. */
    asyncFunctionsPlugin(environment: string): Plugin {
      return {
        name: asyncFunctionsName,
        applyToEnvironment: ({ name }) => name === environment,
        transform(code, id) {
          const file = sourceFileOf(id, normalizePath(this.environment.config.cacheDir), "rsc");
          // A test file keeps the browser: see plugin() for a host that does
          // not say which files are its own.
          if (file && knowsHostFiles()) return compileAsyncFunctions(this, code, file);
        },
      };
    },
    /** For the source files of the server layers, by the name of their environment. */
    plugin(environments: Record<string, NextLayer>): Plugin {
      return {
        name,
        applyToEnvironment: (environment) => Object.hasOwn(environments, environment.name),
        async transform(code, id) {
          const layer = environments[this.environment.name]!;
          const file = sourceFileOf(id, normalizePath(this.environment.config.cacheDir), layer);
          if (!file) return;
          // Without Vitest's config, or the files of another host, there is
          // no telling a test file from a file of the app, and a test file
          // must keep the browser. Said here, at the first file, rather than
          // compiling the host's own files as server code, which fails far
          // away in Next.
          if (layer === "rsc" && !knowsHostFiles()) {
            throw new Error(
              `vitest-plugin-rsc: ${file} is a file of the app, or one of the host's, and ` +
                `nothing says which. Under Vitest the test files and the setup files come ` +
                `from its config, through \`configureVitest\`, which Vitest calls for the ` +
                `plugins of a project, not for one of \`injectTestProjects\`. ` +
                `Another host lists its files in the \`host.files\` option of ` +
                `vitestPluginNext().`,
            );
          }
          return compileServerCode(code, file, registry);
        },
      };
    },
  };
}
