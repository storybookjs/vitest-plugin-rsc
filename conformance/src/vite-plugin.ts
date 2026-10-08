import fs from "node:fs";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import type { BrowserCommand } from "vitest/node";
// For `context` of a command: Playwright's.
import type {} from "@vitest/browser-playwright";

// What a test file of Next needs around it to run in a tab: the modules it
// imports from `test/lib` of Next's repository, the names Jest and Node give
// it, and a stand-in for a Node module it imports and may never call.

const shim = (file: string) => fileURLToPath(new URL(`../shim/${file}`, import.meta.url));
const configId = "virtual:next-conformance/config";
const testUtilsId = "\0next-conformance/next-test-utils";
const stubPrefix = "\0next-conformance/stub/";

// A test file, or a module of `test/lib` that one imports.
const isTestFile = (id: string) => /\.test\.[cm]?[jt]sx?$/.test(id.replace(/[?#].*$/, ""));

// The names a module exports: its declarations, and what it exports in a list,
// its own or another module's.
export function exportedNames(code: string): string[] {
  const declared = Array.from(
    code.matchAll(
      /^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm,
    ),
    (match) => match[1]!,
  );
  const listed = Array.from(code.matchAll(/^export\s+\{([^}]*)\}/gm)).flatMap(([, list]) =>
    list!
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith("type "))
      .map((part) => part.split(/\s+as\s+/).at(-1)!),
  );
  return Array.from(new Set([...declared, ...listed])).filter((name) => name !== "default");
}

// The names an import statement takes from a module: `import a, { b as c }`.
export function importedNames(code: string, source: string): string[] {
  const names = new Set<string>();
  const quoted = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const statement = new RegExp(`import\\s+(?!type\\b)([^;'"]*?)\\s+from\\s*['"]${quoted}['"]`, "g");
  for (const [, clause] of code.matchAll(statement)) {
    for (const part of /\{([^}]*)\}/.exec(clause!)?.[1]?.split(",") ?? []) {
      const name = part
        .trim()
        .replace(/^type\s+.*$/, "")
        .split(/\s+as\s+/)[0]!;
      if (name && name !== "default") names.add(name);
    }
  }
  return Array.from(names);
}

// A module that has nothing to offer a tab. Importing it is fine: a test file
// imports what all of its tests need. Calling it is what cannot be done.
function stubModule(source: string, names: string[]): string {
  return [
    `import { unsupported } from ${JSON.stringify(shim("unsupported.ts"))};`,
    `const stub = (name) => new Proxy(function () {}, {`,
    `  apply: () => unsupported(\`\${name} of ${source}: the test runs in a tab, not in Node.js\`),`,
    `  construct: () => unsupported(\`\${name} of ${source}: the test runs in a tab, not in Node.js\`),`,
    `  get: (target, property) => typeof property === "symbol" || property in target ? target[property] : stub(\`\${name}.\${property}\`),`,
    `});`,
    ...names.map((name) => `export const ${name} = stub(${JSON.stringify(name)});`),
    `export default stub("the default export");`,
  ].join("\n");
}

const isIdentifier = (name: string) => /^[A-Za-z_$][\w$]*$/.test(name);

// Next's `// @gate` and `// @force-gate` pragmas, rewritten the way its own
// Jest transform does (test/lib/gate/pragma-transform.js): the lines of
// pragmas right above an `it`, `test` or `describe` call become a call of
// `_test_gate`, on the same line. shim/gate.ts is that function.
const pragmaBlock =
  /((?:^[ \t]*\/\/[ \t]*@(?:force-)?gate\b[^\n]*\n)+)([ \t]*)(?:(it|test|fit|describe)((?:\.only)?)([ \t]*\()|(describe)\.each[ \t]*\()/gm;
const pragmaLine = /^[ \t]*\/\/[ \t]*@(force-)?gate\b[ \t]*([^\n]*)$/;

export function rewriteGates(code: string): string {
  if (!code.includes("@gate") && !code.includes("@force-gate")) return code;
  return code.replace(
    pragmaBlock,
    (
      _all,
      pragmaLines: string,
      indent: string,
      callee: string,
      only: string,
      openParen: string,
      describeEach?: string,
    ) => {
      const gates = pragmaLines
        .split("\n")
        .slice(0, -1)
        .map((line) => {
          const [, force, source] = pragmaLine.exec(line)!;
          return { force: Boolean(force), source: source!.trim() };
        });
      return describeEach
        ? `${pragmaLines}${indent}_test_gate_describe_each(${JSON.stringify(gates)},`
        : `${pragmaLines}${indent}_test_gate(${JSON.stringify(gates)},${JSON.stringify(callee + only)})${openParen}`;
    },
  );
}

export type ConformanceOptions = {
  /** The directory of the app under test. */
  root: string;
  mode: "start" | "dev";
  /** `test/lib` of Next's repository, at the tag of the installed `next`. */
  nextTestLib: string;
  /** Packages a test lists as dependencies that its app does not import. */
  assumeInstalled?: string[];
  /** Options of `nextTestSetup()` that the runner has applied to the copy of the fixture. */
  prepared?: string[];
  /** Another checkout of this repository, to run its plugin instead. */
  pluginCheckout?: string;
};

export function conformance(options: ConformanceOptions): Plugin {
  const root = fs.realpathSync(options.root);
  const requireFromRoot = createRequire(path.join(root, "package.json"));
  // What the tests import by a bare name, as Jest's `moduleNameMapper` and
  // the `baseUrl` of Next's `test/tsconfig.json` have it.
  const aliases: Record<string, string> = {
    "e2e-utils": shim("e2e-utils.ts"),
    "next-test-utils": testUtilsId,
    "next-webdriver": shim("next-webdriver.ts"),
  };
  // For a test file only: an app that imports `path` has to get what the
  // plugin gives it.
  const testAliases: Record<string, string> = {
    path: "pathe",
    "node:path": "pathe",
    stream: shim("stream.ts"),
    "node:stream": shim("stream.ts"),
  };

  return {
    name: "next-conformance",
    enforce: "pre",
    async resolveId(source, importer, resolveOptions) {
      if (source === configId) return `\0${configId}`;
      if (Object.hasOwn(aliases, source)) return aliases[source];
      if (/^(\.\.\/)+lib\/next-test-utils$/.test(source)) return testUtilsId;

      // The plugin of another checkout: its modules for the tab are the ones
      // that checkout resolves.
      if (options.pluginCheckout && /^vitest-plugin-rsc(\/|$)/.test(source)) {
        return this.resolve(source, path.join(options.pluginCheckout, "package.json"), {
          ...resolveOptions,
          skipSelf: true,
        });
      }

      const fromTestLib = importer?.startsWith(options.nextTestLib);
      if (!importer || !(isTestFile(importer) || fromTestLib || importer.startsWith(shim(""))))
        return;

      if (source.startsWith("e2e-utils/")) {
        return this.resolve(path.join(options.nextTestLib, source), importer, {
          ...resolveOptions,
          skipSelf: true,
        });
      }
      if (Object.hasOwn(testAliases, source)) {
        return this.resolve(testAliases[source]!, shim("setup.ts"), {
          ...resolveOptions,
          skipSelf: true,
        });
      }
      // With the default export that the cheerio of Next's repository has.
      if (source === "cheerio" && !importer.startsWith(shim(""))) return shim("cheerio.ts");
      const builtin = source.replace(/^node:/, "");
      if (builtinModules.includes(builtin)) return `${stubPrefix}node:${builtin}`;
      if (source.startsWith(".") || source.startsWith("/") || source.startsWith("\0")) return;
      // A package that is not installed here: what Next's own test setup
      // uses, like `playwright` or `http-proxy`.
      const resolved = await this.resolve(source, importer, { ...resolveOptions, skipSelf: true });
      if (resolved) return resolved;
      const names = importedNames(fs.readFileSync(importer.replace(/[?#].*$/, ""), "utf8"), source);
      return `${stubPrefix}${source}?names=${names.join(",")}`;
    },
    async load(id) {
      if (id === `\0${configId}`) {
        // The packages a fixture can import: the ones in a `node_modules`
        // of its directory or of one above it.
        const packages = new Set<string>(options.assumeInstalled);
        for (let dir = root; ; dir = path.dirname(dir)) {
          const modules = path.join(dir, "node_modules");
          for (const entry of fs.existsSync(modules) ? fs.readdirSync(modules) : []) {
            if (!entry.startsWith("@")) packages.add(entry);
            else
              for (const scoped of fs.readdirSync(path.join(modules, entry)))
                packages.add(`${entry}/${scoped}`);
          }
          if (dir === path.dirname(dir)) break;
        }
        // What Next's `test/lib/gate/conditions.ts` reads off the resolved config.
        const { default: loadConfig } = requireFromRoot("next/dist/server/config") as {
          default(
            phase: string,
            dir: string,
            options: { silent: boolean },
          ): Promise<Record<string, any>>;
        };
        const config = await loadConfig("phase-production-build", root, { silent: true });
        const gateConfig = {
          cacheComponents: config.cacheComponents,
          partialPrefetchingGlobal: config.partialPrefetching,
          ppr: config.experimental?.ppr,
          cachedNavigations: config.experimental?.cachedNavigations,
          optimisticRouting: config.experimental?.optimisticRouting,
          concurrentRouterQueue: config.experimental?.concurrentRouterQueue,
          dynamicOnHover: config.experimental?.dynamicOnHover,
          useOffline: config.experimental?.useOffline,
          prefetchInlining: config.experimental?.prefetchInlining,
          output: config.output,
          basePath: config.basePath,
          trailingSlash: config.trailingSlash,
        };
        return [
          `export const root = ${JSON.stringify(root)};`,
          `export const mode = ${JSON.stringify(options.mode)};`,
          `export const packages = ${JSON.stringify(Array.from(packages).sort())};`,
          `export const prepared = ${JSON.stringify(options.prepared ?? [])};`,
          `export const gateConfig = ${JSON.stringify(gateConfig, (_, value: unknown) => value ?? false)};`,
        ].join("\n");
      }
      if (id === testUtilsId) {
        // Next's helpers that the shim has, and a stub for each of the rest.
        const own = new Set(exportedNames(fs.readFileSync(shim("next-test-utils.ts"), "utf8")));
        const theirs = exportedNames(
          fs.readFileSync(path.join(options.nextTestLib, "next-test-utils.ts"), "utf8"),
        );
        const missing = theirs.filter((name) => !own.has(name));
        return [
          `import { unsupported } from ${JSON.stringify(shim("unsupported.ts"))};`,
          `export * from ${JSON.stringify(shim("next-test-utils.ts"))};`,
          ...missing.map(
            (name) =>
              `export const ${name} = (...args) => unsupported(${JSON.stringify(
                /redbox|toast|devtools|indicator|overlay|callstack|segmentexplorer/i.test(name)
                  ? `${name}() of next-test-utils: Next's dev overlay, which only \`next dev\` has`
                  : `${name}() of next-test-utils: it starts a process, opens a socket or reads a build`,
              )});`,
          ),
        ].join("\n");
      }
      if (id.startsWith(stubPrefix)) {
        const [source, query = ""] = id.slice(stubPrefix.length).split("?names=");
        const names = source!.startsWith("node:")
          ? Object.keys((await import(source!)) as object)
          : query.split(",").filter(Boolean);
        return stubModule(
          source!,
          names.filter((name) => name !== "default" && isIdentifier(name)),
        );
      }
    },
    transform(code, id) {
      const file = id.replace(/[?#].*$/, "");
      if (!isTestFile(file) && !file.startsWith(options.nextTestLib)) return;
      // Next's own transform for its pragmas, and what Jest gives a test
      // file that a module of the browser has not.
      const result = (isTestFile(file) ? rewriteGates(code) : code).replace(
        /\brequire\(['"]console['"]\)/g,
        "console",
      );
      const prelude =
        (/\b__dirname\b/.test(result)
          ? `const __dirname = ${JSON.stringify(path.dirname(file))};`
          : "") +
        (/\b__filename\b/.test(result) ? `const __filename = ${JSON.stringify(file)};` : "");
      if (!prelude && result === code) return;
      // On the first line, so that every line keeps its number.
      return { code: prelude + result, map: null };
    },
  };
}

// A file of the app, by its path in the app. Not one outside of it.
function fileOfApp(root: string, file: string): string | undefined {
  const target = path.resolve(root, file);
  return path.relative(root, target).startsWith("..") ? undefined : target;
}

/** Reads a file of the app for `next.readFile()`: a command of Vitest's browser mode. */
export function readFileCommand(root: string): BrowserCommand<[file: string]> {
  return (_context, file): string | null => {
    const target = fileOfApp(root, file);
    return target && fs.statSync(target, { throwIfNoEntry: false })?.isFile()
      ? fs.readFileSync(target, "utf8")
      : null;
  };
}

/** Whether the app has a file or a directory, for `next.hasFile()`. */
export function fileExistsCommand(root: string): BrowserCommand<[file: string]> {
  return (_context, file): boolean => {
    const target = fileOfApp(root, file);
    return target !== undefined && fs.existsSync(target);
  };
}

// The servers that the apps of Next's fixtures fetch from while they render.
// A server is not held to CORS and a tab is, so here the request of a Server
// Component is one that the browser refuses: the plugin's own limit, see
// "Server Code In The Browser" in docs/next-routes.md. These hosts answer the
// tab as they answer a server, so that a test of the Data Cache measures the
// cache.
const serverHosts = ["next-data-api-endpoint.vercel.app"];
const allowed = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "*",
  "access-control-expose-headers": "*",
};

/** Lifts CORS for the hosts above: a command of Vitest's browser mode, for Playwright's context. */
export function serverNetworkCommand(): BrowserCommand<[]> {
  const contexts = new WeakSet<object>();
  return async ({ context }) => {
    if (contexts.has(context)) return;
    contexts.add(context);
    for (const host of serverHosts) {
      await context.route(`https://${host}/**`, async (route) => {
        try {
          if (route.request().method() === "OPTIONS")
            return await route.fulfill({ status: 204, headers: allowed });
          const response = await route.fetch();
          await route.fulfill({ response, headers: { ...response.headers(), ...allowed } });
        } catch {
          // The page that asked is gone, or the host is not reachable.
          await route.abort().catch(() => {});
        }
      });
    }
  };
}
