import "../compile-cache.ts";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPluginApi } from "@vitejs/plugin-rsc/plugin";
import { hasDirective, transformDirectiveProxyExport } from "@vitejs/plugin-rsc/transforms";
import {
  createFilter,
  normalizePath,
  parseAst,
  parseAstAsync,
  send,
  transformWithOxc,
  type EnvironmentModuleNode,
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
} from "vite";
import { escapePath } from "tinyglobby";
import type { TestProject, Vitest } from "vitest/node";
import { createRunnerEnvironmentPlugins } from "../runner-environment.ts";
import { flightBridge, type FlightEntry } from "./flight.ts";
import { nextBuilds, nextProductionPlugin, type NextBuild } from "./build.ts";
import { clientFiles, clientReferenceOfModule } from "./client-files.ts";
import {
  createCompilePlugin,
  createDependencyCompilePlugin,
  createScanCompilePlugin,
} from "./compile.ts";
import {
  devAssetPrefix,
  prerenderImports,
  runtimeImports as nextRuntimeImports,
  serverReferenceInfo,
} from "./compat/paths.ts";
import { nextPatches } from "./compat/patches.ts";
import { browserMapping, isNodeModule, nodeModuleOf } from "./node-builtins.ts";
import { fastCryptoModule, fastCryptoModuleOf, fastCryptoSetup } from "./fast-crypto.ts";
import {
  resolveMode,
  type Feature,
  type Features,
  type Mode,
  type ModeOptions,
  type SpeedOptions,
} from "./fast-options.ts";
import { createNodePlatform, instrumentationPlugin } from "./node-platform.ts";
import { registryGlobal } from "./registry-global.ts";
import {
  loadNextProject,
  type ComponentRoute,
  type NextLayer,
  type NextProject,
  type NextRoute,
} from "./project.ts";
import { moduleFileAt } from "./project/context.ts";
import { describeEnv, envFilesOf, type PageEnv } from "./project/env.ts";
import { compileServerCode, createServerCode, type ServerCodeOptions } from "./server-code.ts";
import { optimizerCacheKey } from "./optimizer-cache-key.ts";
import { createCommonJsPlugin } from "./commonjs.ts";
import { createUseCachePlugin, useCacheId, useCacheModule } from "./use-cache.ts";
import { createPathsPlugin } from "./paths.ts";
import { pageTimersPlugin } from "./page-timers.ts";
import { nextStaticBuild, withPathsFromRoot } from "./static-build.ts";
import { builtHostFileOf, createStyles, changesInPlace } from "./styles.ts";
import { assertVitestVersion } from "./vitest-version.ts";

// Each layer of Next is a Vite environment, and all three run in the
// browser (docs/internals/next-routes.md). Where Next's own bundler config says a module
// belongs to another layer, it is bridged to that environment through
// `registry` (registry.ts).
const environmentOf: Record<NextLayer, string> = {
  rsc: "client",
  ssr: "next_ssr",
  browser: "react_client",
};
const layers = Object.keys(environmentOf) as NextLayer[];

const registry = `globalThis.${registryGlobal}`;

// An entry of a scan is a glob: a file by its path, escaped, as a path can
// have a `(group)` or a `[id]` in it, which a glob reads as a pattern. As
// Vite makes a path a glob, for `import.meta.glob` (`globSafePath()`).
const fileEntry = (file: string) => escapePath(normalizePath(file));
// What a dependency scan of the app starts from: every module of `app/`.
const appEntriesOf = (project: NextProject) => `${fileEntry(project.appDir)}/**/*.{js,jsx,ts,tsx}`;
// Shared by the layers: the routes and the `next.config`.
const manifestId = "virtual:vitest-plugin-rsc/next-manifest";
// The modules of the routes, all in the rsc layer: one for each route, by its
// place in the list of routes, and two that say how to load them, the pages
// and the route handlers. The ssr layer handles the requests of a page
// (node-server.ts). A route handler is in the rsc layer as a whole, as Next's
// bundler config has it. The routes of a node are pages too, listed after the
// ones of the app.
const virtual = (name: string) => `virtual:vitest-plugin-rsc/next-${name}`;
const routeEntryPrefix = virtual("route/");
const routeLists = { page: virtual("app-pages"), route: virtual("route-handlers") } as const;
type RouteKind = keyof typeof routeLists;
const routeKinds = Object.keys(routeLists) as RouteKind[];
// The middleware of the app, in the rsc layer: a module that says how to load
// it, if the app has one, and its request handler.
const middlewareId = virtual("middleware");
const middlewareEntryId = virtual("middleware-entry");
// A module of Next's metadata loaders, by the inline request for it of Next's
// app loader: see project/metadata.ts.
const metadataPrefix = virtual("metadata/");
// The env of the run, which globals.ts puts in the page's `process.env`: see
// project/env.ts.
const envId = virtual("env");
// The cache handlers that `next.config` names, for the ssr layer: cache.ts.
const cacheHandlersId = virtual("cache-handlers");
// `next/root-params`, which Next's build makes for the app.
const rootParamsId = virtual("root-params");
// The verdict of Next's build on which pathnames of a route it prerenders,
// for rsc.ts: prerender-verdict.ts with `build: "production"`, the one build
// that asks for it. Without it the module imports nothing, so that Vite
// neither finds the modules of Next's build that the verdict imports, which
// would have it pre-bundle again mid-test, nor loads them.
const prerenderId = virtual("prerender");
// Next's route resolution: the rsc layer, the document's, says with it which
// requests are the app's, and the ssr layer routes with it each request that
// it handles. Not a part of `next`: it is the project's, next to its `next`.
const nextRouting = "@next/routing";
// What the modules of a route are listed by: its page name, which the route
// of a node shares with a page of the app.
const entryOf = (route: { page: string; component?: string }) => route.component ?? route.page;
const isRouteModule = (id: string) =>
  id.startsWith(routeEntryPrefix) || routeKinds.some((kind) => id === routeLists[kind]);

// Whether a module of the rsc layer is one that a route or the middleware
// imports, also through other modules: code of the app that the plugin's
// runtime loads. Not through a stylesheet that changes in place, which Vite
// swaps as its `<style>` or whose links the page moves to the version of now
// (`changesInPlace()`): the change is the stylesheet's, also one of a
// stylesheet it `@import`s or of a file it depends on, as Tailwind's PostCSS
// plugin makes every file it scans one. A stylesheet imports no code, and
// what a page renders of the code is what a route imports.
function importedByRoute(module: EnvironmentModuleNode): boolean {
  const seen = new Set<EnvironmentModuleNode>([module]);
  for (const node of seen) {
    if (changesInPlace(node)) continue;
    for (const importer of node.importers) {
      const id = importer.id?.startsWith("\0") ? importer.id.slice(1) : undefined;
      if (
        id !== undefined &&
        (isRouteModule(id) || id === middlewareId || id === middlewareEntryId)
      )
        return true;
      seen.add(importer);
    }
  }
  return false;
}
// The line of a list of the routes, or of the middleware, that makes it the
// boundary of Vite's HMR for its entries. Vite invalidates a changed module
// and what imports it up to an importer that accepts it, so the runtime that
// imports the list keeps its modules. No update reaches the list: the plugin
// loads the page again for a change of what a route imports, see `hotUpdate`.
const hmrBoundary = (entries: string[]) => `import.meta.hot?.accept([${entries.join(", ")}]);\n`;
const bridgePrefix = "\0vitest-plugin-rsc/next-bridge/";
// What an alias of Next's to `false` gets, and an import a dependency's
// `browser` field maps to `false`: a module of nothing, as webpack's is for
// Next, with an empty object as its default export. A named import of it is
// `undefined`, by `shimMissingExports` of the pre-bundling.
const emptyModuleId = "\0vitest-plugin-rsc/next-empty";
const emptyModule = "const empty = {};\nexport default empty;\n";
const vendoredFlight = (entry: string) => `@vitejs/plugin-rsc/vendor/react-server-dom/${entry}`;
// The directory of the files of this package: `src` or `dist`.
const ownDir = normalizePath(fileURLToPath(new URL("..", import.meta.url)));
// A file of this package, in `src` or in `dist`.
const ownFile = (name: string) =>
  normalizePath(
    fileURLToPath(new URL(`./${name}${path.extname(import.meta.url)}`, import.meta.url)),
  );
// Vitest wants a file path for a setup file, not a package specifier. It is
// the only file of the layers that imports Vitest: a host without Vitest
// never loads it.
const setupFile = ownFile("setup");
// What a test imports `renderServer()` from, and the file that is.
const testingLibrary = {
  specifier: "vitest-plugin-rsc/nextjs/testing-library",
  file: ownFile("index"),
};
// The page the tests run in. Vitest puts a reset in its own, `body { margin:
// 0 }`, and only in its own: a page of Next has the margin of the browser.
const testerHtml = fileURLToPath(new URL("./tester.html", import.meta.url));

// Next's server reference ids are 42 hex characters whose first byte says
// which arguments the function uses. Vite RSC's are `<module>#<export>`. An
// id here can be either: Next answers 400 for one that can be neither, and
// 409 for one that it does not have. The rest of the module stays as it is.
const serverReferenceInfoShim = `
import * as original from ${JSON.stringify(serverReferenceInfo)};
export * from ${JSON.stringify(serverReferenceInfo)};
const isNextId = (id) => id.length === original.SERVER_REFERENCE_ID_LENGTH && /^[0-9a-f]+$/i.test(id);
export function mightBeServerReferenceId(id) {
  return typeof id === "string" && (original.mightBeServerReferenceId(id) || id.includes("#"));
}
export function extractInfoFromServerReferenceId(id) {
  return isNextId(id)
    ? original.extractInfoFromServerReferenceId(id)
    : { type: "server-action", usedArgs: [true, true, true, true, true, true], hasRestArgs: true };
}
`;

// Since Next 16.5 a module of Next reads the asset prefix of the dev
// server's WebSocket when it is evaluated, off `document.currentScript`. Next's
// entry evaluates it first, on the dev server. Without the dev server Next's
// router imports it on its first navigation, where nothing runs as a script,
// and the navigation fails. The plugin has no dev server, and Next opens that
// WebSocket only on one: the prefix is for nothing here.
const devAssetPrefixShim = `export const assetPrefix = "";\n`;

const nodePlatform = createNodePlatform(registry, bridgePrefix);
// What a run has said of the installed Next, which its projects share.
const saidOfNext = new Set<string>();
// The modules of the speed feature `fastCrypto`, see fast-crypto.ts: one for
// each package.
const fastCryptoPrefix = `${bridgePrefix}fast-crypto/`;
// What the plugin's setup file imports: Web Crypto's stand-in, or nothing.
const fastCryptoSetupId = "virtual:vitest-plugin-rsc/next-fast-crypto";

type Alias = { key: string; exact: boolean; target: string | false };

// The module resolution of one layer: Next's alias tables with webpack's
// matching rules, and the ESM build of Next in place of the CommonJS one.
//
// This is a function and not Vite's `resolve.alias`, which is one table for
// every environment. And it names a file of Next one way only: Vite keeps a
// pre-bundled dependency per specifier, so a second spelling is a second copy
// of the module, found mid-test.
function createLayerResolver(
  getProject: () => NextProject,
  layer: NextLayer,
  fastCrypto: () => boolean,
) {
  let aliases: Alias[] | undefined;
  const normalized = new Map<string, string | false>();

  function nextFile(specifier: string): string | undefined {
    return moduleFileAt(path.join(getProject().nextDir, specifier.slice("next/".length)));
  }

  function toSpecifier(file: string): string {
    return `next/${path.relative(getProject().nextDir, file).split(path.sep).join("/")}`;
  }

  function getAliases(): Alias[] {
    if (aliases) return aliases;
    const { nextDir } = getProject();
    const table: Record<string, string | false> = { ...getProject().aliases[layer] };
    // Vite RSC brings a Flight codec for the `react` of the project. The app
    // runs on Next's React, so its runtime gets the codec that goes with it.
    const flightDir = path.posix.dirname(table["react-server-dom-webpack/server$"] as string);
    for (const entry of ["server.edge", "static.edge", "client.edge", "client.browser"]) {
      table[`${vendoredFlight(entry)}$`] = `${flightDir}/${entry}`;
    }
    aliases = Object.entries(table).flatMap(([key, target]) => {
      // Next's compilation for ESM sends its directories to its ESM build
      // this way. `normalize()` does that for every layer, file by file.
      if (/^next\/dist\/\w+$/.test(key)) return [];
      let exact = key.endsWith("$");
      key = key.replace(/\$$/, "");
      // A table keyed by a file of the `next` package matches the resolved
      // file. The public entry files, like `<next>/link.js`, also match the
      // specifier they are imported by.
      if (path.isAbsolute(key) && !path.relative(nextDir, key).startsWith("..")) {
        key = toSpecifier(key);
        exact = true;
        if (/^next\/[\w-]+\.js$/.test(key)) {
          return [
            { key, exact, target },
            { key: key.slice(0, -".js".length), exact, target },
          ];
        }
      }
      return [{ key, exact, target }];
    });
    return aliases;
  }

  function applyAlias(source: string): string | false | undefined {
    for (const { key, exact, target } of getAliases()) {
      if (source !== key && (exact || !source.startsWith(`${key}/`))) continue;
      const aliased = target && target + source.slice(key.length);
      // Like webpack, not when nothing is there. Next sends all of
      // `next/dist/compiled/server-only` to `.../server-only/index`, also the
      // request for that file itself.
      if (aliased && source !== key && aliased.startsWith("next/") && !nextFile(aliased)) continue;
      return aliased;
    }
  }

  // The target of an alias like `styled-jsx$`: a file of another package.
  function isDependencyOfNext(target: string): boolean {
    return (
      path.isAbsolute(target) &&
      normalizePath(target).includes("/node_modules/") &&
      path.relative(getProject().nextDir, target).startsWith("..")
    );
  }

  function bridgeOf(source: string): string | undefined {
    if (layer === "rsc") {
      const flight = /^react-server-dom-webpack\/(server|static|client)(\.edge)?$/.exec(source);
      if (flight) return `${bridgePrefix}flight-${flight[1]}`;
    }
    if (source === serverReferenceInfo) return `${bridgePrefix}server-reference-info`;
    if (devAssetPrefix.test(source)) return `${bridgePrefix}dev-asset-prefix`;
    // The route module of a page is made in the rsc layer, by Next's request
    // handler for it, and belongs to the ssr layer.
    if (
      layer === "rsc" &&
      /^next\/dist\/(esm\/)?server\/route-modules\/app-page\/module\.compiled(\.js)?$/.test(source)
    ) {
      return `${bridgePrefix}ssr-app-page-module`;
    }
    // Next's own modules of its process, in the server layers.
    if (layer !== "browser") return nodePlatform.moduleOf(source);
  }

  /**
   * Where a specifier leads in this layer: another specifier, a bridge module
   * (`\0...`), or `false` for a module the layer leaves empty. For the app's
   * code, `ofApp`, with the entries Next's own files do not get, like React's
   * `react-dom/server` for Node.js in the ssr layer (project/layers.ts).
   */
  function normalize(source: string, ofApp = false): string | false {
    const appTarget = ofApp ? getProject().appAliases[layer][`${source}$`] : undefined;
    if (appTarget !== undefined) return normalize(appTarget);
    const cached = normalized.get(source);
    if (cached !== undefined) return cached;

    // A module of Node.js in the server layers: the package's own, before
    // any alias of Next's for it, see node-builtins.ts. The browser layer
    // gets Next's, as in Next.
    const own = layer !== "browser" ? nodeModuleOf(source) : undefined;
    if (own) {
      normalized.set(source, own);
      return own;
    }
    let current: string | false = source;
    for (let i = 0; i < 10 && current; i++) {
      const bridge = bridgeOf(current);
      if (bridge) {
        current = bridge;
        break;
      }
      // Next ships its runtime twice: CommonJS in `next/dist`, ESM in
      // `next/dist/esm`. Aliases are keyed by the CommonJS file.
      const commonJs: string = current.replace(/^next\/dist\/esm\//, "next/dist/");
      let next: string | false | undefined = applyAlias(current) ?? applyAlias(commonJs);
      if (next === undefined && current.startsWith("next/")) {
        // Next's edge and Turbopack builds take the ESM file, and so does
        // Vite, which pre-bundles ESM best. A few files only exist as
        // CommonJS, like the polyfills its client entry imports.
        const esm = commonJs.replace(/^next\/dist\/(?!compiled\/)/, "next/dist/esm/");
        const file = nextFile(esm) ?? nextFile(commonJs);
        if (file) next = toSpecifier(file);
      }
      if (next === undefined || next === current) break;
      current = next;
    }
    normalized.set(source, current);
    return current;
  }

  /**
   * The name this layer pre-bundles an entry of `optimizeDeps.include` under:
   * the specifier `plugin()` resolves it to, or none for a module the layer
   * leaves empty, bridges, or imports by its file.
   */
  function preBundledName(entry: string): string | undefined {
    // Vite's `parent > dependency`: the layer resolves the dependency alike
    // from any parent, and a specifier of Next from the project.
    const source = entry.slice(entry.lastIndexOf(">") + 1).trim();
    // An entry of the config is the app's.
    const target = normalize(source, true);
    if (target === false || target.startsWith("\0") || isNodeModule(target)) return;
    // A package that Next depends on, like `styled-jsx`, found by its name
    // from Next. Not a file of Next, like its polyfill of `object-assign`.
    if (isDependencyOfNext(target)) return entry;
    if (path.isAbsolute(target)) return;
    return target === source ? entry : target;
  }

  function plugin(): Plugin {
    return {
      name: `vitest-plugin-rsc:next-resolve:${layer}`,
      enforce: "pre",
      async resolveId(source, importer, options) {
        // One bridge module imports another by its id. A dev server takes
        // such an id as it is, and a build asks.
        if (source.startsWith(bridgePrefix) || source === emptyModuleId) return source;
        if (source.startsWith("\0")) return;
        // A package that hashes passwords, and `node:crypto`, in the server
        // layers and the test files, with the speed feature `fastCrypto`: the stand-ins. Not
        // for a dependency whose `browser` field says what it uses for
        // `crypto`, which gets that, as without the option.
        if (layer !== "browser" && fastCrypto()) {
          const name = fastCryptoModuleOf(source);
          if (name && (name !== "node-crypto" || browserMapping(source, importer) === undefined)) {
            return fastCryptoPrefix + name;
          }
        }
        // The shim wraps the module it replaces.
        if (importer === `${bridgePrefix}server-reference-info`) {
          return nextFile(serverReferenceInfo);
        }

        // The package's own modules import it, and have it as a peer: it is
        // the project's. Another importer resolves it as it is, like Vite
        // RSC, which resolves a package of the rsc layer again at the root.
        if (source === nextRouting) {
          if (!importer || !normalizePath(importer).startsWith(ownDir)) return;
          return this.resolve(source, path.join(getProject().root, "package.json"), {
            ...options,
            skipSelf: true,
          });
        }

        let specifier = source;
        // Relative imports between Next's own files, and the absolute paths
        // the dependency optimizer names its entries with.
        if (source.startsWith(".") && importer) {
          specifier = path.resolve(path.dirname(importer.split("?")[0]!), source);
        }
        if (path.isAbsolute(specifier)) {
          const relative = path.relative(getProject().nextDir, specifier.split("?")[0]!);
          if (relative.startsWith("..")) return;
          specifier = `next/${relative.split(path.sep).join("/")}`;
        }

        // Not a file of Next's own, under `next/dist`: one of the app or of
        // a package, which gets the app's entries (project/layers.ts). The
        // dependency optimizer and the dev server alike give the file.
        const ofApp = !!importer && !normalizePath(importer).includes("/next/dist/");
        const target = normalize(specifier, ofApp);
        if (target === false) return emptyModuleId;
        if (isNodeModule(target)) {
          // A dependency that says what it uses for the module in a browser
          // gets that: nothing, or Vite's resolution of a file of its own.
          const mapping = browserMapping(source, importer);
          if (mapping === false) return emptyModuleId;
          if (mapping !== undefined) return;
          // The file, which Vite serves as it is: not a dependency to find.
          // Under Rolldown itself, the dependency scan and the optimizer, which
          // run this plugin without an environment, the file as it is: the
          // scan reads it, for what the source imports in this repository,
          // and the optimizer bundles it. On the dev server through Vite,
          // for the `?v=` it gives a file of `node_modules`, so that
          // `fs/promises`' import of `fs` by name is the same module.
          if (!this.environment) return target;
          return this.resolve(target, importer, { ...options, skipSelf: true });
        }
        if (target.startsWith("\0")) return target;
        if (target === source) return;
        // Not found as a file of the `next` package: leave the import alone.
        if (specifier !== source && target === specifier && !nextFile(target)) return;
        // A package that Next depends on and the app may not, like
        // `styled-jsx`: found from Next, as a dependency that Vite pre-bundles.
        if (isDependencyOfNext(target) && importer && !importer.includes("/node_modules/")) {
          return this.resolve(source, path.join(getProject().nextDir, "package.json"), {
            ...options,
            skipSelf: true,
          });
        }
        // In a build, a bare import of Next gets its file, in each layer: a
        // build has no optimizer to keep a bare specifier for. The rsc layer
        // is the one that needs it. Vite RSC keys the client reference of a
        // package's file by the last bare specifier it saw resolve to it, and
        // it has seen this import's own. A `resolve()` of the specifier
        // `normalize()` gives would show it a second one, like the ESM form
        // of a route entry's `next/dist/client/components/builtin/global-error.js`,
        // and the key would depend on how the routes' resolutions interleave.
        // A relative import between Next's files keeps the `resolve()` below,
        // so Vite RSC keys the file by that specifier, not by its path in
        // `node_modules`, which differs by install. Not in `next/dist/compiled`,
        // where Vite reads the `package.json` of a package, like the exports
        // by condition of `next/dist/compiled/react-dom`.
        if (
          // The dependency optimizer runs this plugin under Rolldown itself
          // (its `rolldownOptions.plugins`), without an environment.
          this.environment?.mode === "build" &&
          source === specifier &&
          target.startsWith("next/") &&
          !target.startsWith("next/dist/compiled/")
        ) {
          const file = nextFile(target);
          if (file) return normalizePath(file);
        }
        // Keep it a bare specifier, so Vite maps it to the pre-bundled dependency.
        // Next is the project's: a package of the app that imports `react`
        // can have another `next` closer by, as in a pnpm workspace.
        const from = target.startsWith("next/")
          ? path.join(getProject().root, "package.json")
          : importer;
        return this.resolve(target, from, { ...options, skipSelf: true });
      },
      load(id) {
        if (id === emptyModuleId) return emptyModule;
        if (!id.startsWith(bridgePrefix)) return;
        const name = id.slice(bridgePrefix.length);
        if (name === "server-reference-info") return serverReferenceInfoShim;
        if (name === "dev-asset-prefix") return devAssetPrefixShim;
        if (id.startsWith(fastCryptoPrefix)) {
          return fastCryptoModule(id.slice(fastCryptoPrefix.length), nodeModuleOf("node:crypto")!);
        }
        const { flightExports, version, newExports } = getProject();
        const nodeModule = nodePlatform.load(name, newExports[name], version);
        if (nodeModule) return nodeModule;
        const entry = name.slice("flight-".length) as FlightEntry;
        return flightBridge(entry, flightExports[entry], version, registry);
      },
    };
  }

  return { normalize, nextFile, toSpecifier, isDependencyOfNext, preBundledName, plugin };
}

type LayerResolver = ReturnType<typeof createLayerResolver>;

// Client Components of Next's own runtime: the layout router, the error
// boundaries, `next/link`. Vite RSC turns `"use client"` modules into client
// references while it serves source files, but dependencies are pre-bundled
// without that step, so do it here. The reference is the module's specifier,
// which the other two layers load as their own pre-bundled copy. (`/@id/` is
// how Vite spells a bare specifier where a URL is expected.)
function nextClientBoundaryPlugin(getProject: () => NextProject, resolver: LayerResolver): Plugin {
  return {
    name: "vitest-plugin-rsc:next-client-boundary",
    async transform(code, id) {
      const file = normalizePath(id.split("?")[0]!);
      // Not `next-themes`, which is next to it in a flat `node_modules`.
      if (!file.startsWith(`${normalizePath(getProject().nextDir)}/`)) return;
      if (!code.includes("use client")) return;

      const specifier = resolver.toSpecifier(file);
      const result = transformDirectiveProxyExport(await parseAstAsync(code), {
        directive: "use client",
        code,
        runtime: (name) =>
          `$$ReactServer.registerClientReference(` +
          `() => { throw new Error(${JSON.stringify(`${specifier}#${name} is a Client Component and cannot be called on the server`)}) }, ` +
          `${JSON.stringify(`/@id/${specifier}`)}, ${JSON.stringify(name)})`,
      });
      if (!result) return;
      result.output.prepend(
        `import * as $$ReactServer from ${JSON.stringify(vendoredFlight("server.edge"))};\n`,
      );
      return { code: result.output.toString(), map: null };
    },
  };
}

// React's Flight server, in development, wraps the console to send what a
// request logs to the page, which logs it again. Here the page is the server:
// it has logged it already. And the request a log is sent with is the one
// whose scope is active, which in the page also takes in client code that
// runs while a request is open. React queues a log without a flush of its
// own, and a response does not end while one is queued.
function flightConsolePlugin(): Plugin {
  return {
    name: "vitest-plugin-rsc:flight-console",
    transform: {
      // Rolldown matches the id with `/` for a separator.
      filter: { id: /\/react-server-dom-webpack-server\.[^/]+\.development\.js$/ },
      handler(code, id) {
        const patched = code.replace(/function patchConsole\([^)]*\)\s*\{/, "$& return;");
        if (patched === code) {
          this.warn(`vitest-plugin-rsc: React's patchConsole() in ${id} is not turned off.`);
        }
        return { code: patched, map: null };
      },
    },
  };
}

function nextPatchesPlugin(): Plugin {
  const patches = nextPatches(registry);
  return {
    name: "vitest-plugin-rsc:next-patches",
    transform: {
      // Rolldown matches the id with `/` for a separator.
      filter: { id: { include: patches.map(({ file }) => file) } },
      handler(code, id) {
        let patched = code;
        for (const { file, lost, edits } of patches) {
          if (!file.test(id)) continue;
          for (const [find, replace] of edits) {
            if (!patched.includes(find)) {
              this.warn(`vitest-plugin-rsc: ${id} has no \`${find.trim()}\`: ${lost}.`);
              continue;
            }
            patched = patched.replaceAll(find, () => replace);
          }
        }
        return patched === code ? undefined : { code: patched, map: null };
      },
    },
  };
}

// Next's compile-time constants for a layer. A server layer gets what makes
// a module server code on top of these: see server-code.ts.
function definesOf(project: NextProject, layer: NextLayer): Record<string, string> {
  // Not NODE_ENV, which is the app's. Next's own is the `build` option
  // (build.ts).
  const { "process.env.NODE_ENV": _, ...defines } = project.defines[layer];
  return {
    ...defines,
    // Next's ncc-compiled packages only build paths with it that they never
    // read here.
    __dirname: '""',
    ...(layer === "browser" && {
      // The browser's Flight client loads Client Components in its own
      // module graph. (Vite RSC points this at one global, for a server
      // and a browser that do not share globals.)
      __webpack_require__: `${registry}.browserRequire`,
      // Makes Next's root component report that it has hydrated.
      "process.env.__NEXT_TEST_MODE": "true",
    }),
  };
}

// Next's inline requests for its metadata loaders in the code of an entry.
function findMetadataRequests(code: string): string[] {
  return [...code.matchAll(/["'](next-metadata-(?:image|route)-loader\?[^"']+)["']/g)].map(
    (match) => match[1]!,
  );
}

/**
 * The files of the cache handlers that `next.config` names, which Next's
 * server loads before its first request (cache.ts): `cacheHandler`, and one
 * of `cacheHandlers` for each kind of `"use cache"` that has one. A path, or
 * a `file:` URL, as Next takes one. A relative path is of the project, as
 * Next's server resolves it.
 */
function cacheHandlerFilesOf(project: Pick<NextProject, "config" | "root">): {
  cacheHandler: string | undefined;
  cacheHandlers: Record<string, string>;
} {
  const { cacheHandler, cacheHandlers = {} } = project.config as {
    cacheHandler?: string;
    cacheHandlers?: Record<string, string | undefined>;
  };
  const fileOf = (file: string) =>
    normalizePath(
      file.startsWith("file:") ? fileURLToPath(file) : path.resolve(project.root, file),
    );
  return {
    cacheHandler: cacheHandler ? fileOf(cacheHandler) : undefined,
    cacheHandlers: Object.fromEntries(
      Object.entries(cacheHandlers).flatMap(([kind, file]) => (file ? [[kind, fileOf(file)]] : [])),
    ),
  };
}

/**
 * What the dependency optimizer of the ssr layer, which loads the cache
 * handlers, is to know of them before the first request. Vite's scan does not
 * follow the `import()` of a file that a virtual module makes from the
 * config. A file of Next, like its `default.external.js`, is a dependency:
 * the layer imports it by the specifier `toSpecifier()` gives it. Any other
 * file, of the app or of another package, is an entry of the scan, which
 * then finds what it imports.
 */
function cacheHandlerScan(
  project: Pick<NextProject, "config" | "root" | "nextDir">,
  toSpecifier: (file: string) => string,
): { include: string[]; entries: string[] } {
  const { cacheHandler, cacheHandlers } = cacheHandlerFilesOf(project);
  const files = [...new Set([cacheHandler ?? [], Object.values(cacheHandlers)].flat())];
  const isOfNext = (file: string) => {
    const relative = path.relative(project.nextDir, file);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  };
  return {
    include: files.filter(isOfNext).map(toSpecifier),
    entries: files.filter((file) => !isOfNext(file)).map(fileEntry),
  };
}

function findImports(code: string): string[] {
  return [
    ...code.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(?:\/\*.*?\*\/\s*)?["']([^"'?!]+)["']/g,
    ),
  ].map((match) => match[1]!);
}

// The scan reads every file of Next's ESM build, so it is done once for an
// installation of Next, and not for every project that uses it.
const clientBoundaryFiles = new Map<string, string[]>();

// The modules of Next a Flight payload can refer to: every file of its ESM
// build with a `"use client"` directive, which is what
// `nextClientBoundaryPlugin` makes a client reference of. The other two layers
// pre-bundle them up front, or Vite would discover them mid-test and reload
// the page. By the file, which is how a payload names one: an import of the
// app does not, like `next/legacy/image`, so the dependency scan finds another
// spelling. This is what Next's client entry plugin does for its own bundles.
function findClientBoundaries(nextDir: string, root: string, resolver: LayerResolver): string[] {
  let files = clientBoundaryFiles.get(nextDir);
  if (!files) {
    files = scanClientBoundaries(nextDir, root);
    clientBoundaryFiles.set(nextDir, files);
  }
  // Vite keeps the pre-bundled dependencies by a hash of this list, and a
  // directory is listed in the order of its disk.
  return files.map((file) => resolver.toSpecifier(file)).sort();
}

// The scan parses the files that have the words, about 50 of Next's 1300,
// which is a tenth of a second at every start of Vitest. So its result is
// kept on disk, in the project's `node_modules/.cache/`, as other tools keep
// theirs, by the size and the time of change of every file it reads: a
// version of Next, or a patch of one, has other files. Listing and stating
// them costs a third of the scan. The version of the format is in the name.
function scanClientBoundaries(nextDir: string, root: string): string[] {
  const entries = fs.readdirSync(path.join(nextDir, "dist/esm"), {
    recursive: true,
    withFileTypes: true,
  });
  const scripts = entries.flatMap((entry) =>
    entry.isFile() && entry.name.endsWith(".js") ? [path.join(entry.parentPath, entry.name)] : [],
  );
  const key = createHash("sha256");
  for (const file of scripts) {
    const stats = fs.statSync(file, { throwIfNoEntry: false });
    key.update(`${file}\0${stats?.size}\0${stats?.mtimeMs}\n`);
  }
  const cache = path.join(root, "node_modules/.cache/vitest-plugin-rsc/client-boundaries-1.json");
  const digest = key.digest("hex");
  try {
    const cached = JSON.parse(fs.readFileSync(cache, "utf8")) as { key: string; files: string[] };
    if (cached.key === digest) return cached.files;
  } catch {}
  const files = scripts.filter((file) => {
    const code = fs.readFileSync(file, "utf8");
    return code.includes("use client") && hasDirective(parseAst(code).body, "use client");
  });
  // By a rename, so that a run that reads it at the same time reads all of
  // it. A disk that cannot be written to only means the scan again next time.
  try {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    const written = `${cache}.${process.pid}`;
    fs.writeFileSync(written, JSON.stringify({ key: digest, files }));
    fs.renameSync(written, cache);
  } catch {}
  return files;
}

// What the runtime modules of this package, and the modules Vite and Vite RSC
// generate, import from Next and from React, per layer.
const react = ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react/compiler-runtime"];
// Not what only `build: "production"` loads: see `prerenderImports`.
const runtimeImports: Record<NextLayer, string[]> = {
  rsc: [
    ...react,
    "react-dom",
    ...nextRuntimeImports.rsc,
    vendoredFlight("server.edge"),
    vendoredFlight("static.edge"),
    vendoredFlight("client.edge"),
  ],
  ssr: [
    ...react,
    "react-dom",
    ...nextRuntimeImports.ssr,
    vendoredFlight("client.edge"),
    // node-rendered.tsx, around every node
    "next/navigation",
  ],
  browser: [
    ...react,
    "react-dom",
    "react-dom/client",
    ...nextRuntimeImports.browser,
    // node-rendered.tsx, around every node
    "next/navigation",
    vendoredFlight("client.browser"),
  ],
};

export type { NextBuild };
export type { Feature, Features, Mode, SpeedOptions };

export type VitestPluginNextOptions = ServerCodeOptions &
  ModeOptions & {
  /**
   * Experimental. The code that Next's runtime and React run, in all three
   * layers: `"development"` as `next dev` runs it, `"production"` as
   * `next start` runs it after `next build`. Production renders faster,
   * without what the development code checks and reports. In a test run
   * the app's `process.env.NODE_ENV` stays as it is, in a static build it is
   * the build. See docs/internals/next-routes.md, "Development Or Production".
   *
   * @default `"development"` for a test run and a dev server, `"production"`
   * for `vite build`, a static build of the app
   */
  build?: NextBuild;
};

export function vitestPluginNext(options: VitestPluginNextOptions = {}): Plugin[] {
  // oxlint-disable-next-line no-process-env -- The switch of an agent's run, as `CI` is.
  const features = resolveMode(options, process.env);
  // The speed features that are on, with `fastCrypto` in a test run of Vitest
  // only, once the `config` hook knows: a static build, or a dev server of
  // another host, hashes for real.
  let fast: Features = { ...features, fastCrypto: false };
  let project: NextProject;
  // What the CSS of the app gets otherwise than from Next: see `loadCssOptions()`.
  let cssDifferences: string[] = [];
  const serverCode = createServerCode(registry, options);
  const getProject = () => project;
  if (options.build !== undefined && !nextBuilds.includes(options.build)) {
    throw new Error(
      `vitest-plugin-rsc: \`build\` is "development" or "production", not ${JSON.stringify(options.build)}.`,
    );
  }
  // The option's, or the default of the command, once the `config` hook knows
  // it: development for a test run and a dev server, production for a static
  // build, which is a site to look at, not a test that reads React's warnings.
  let build: NextBuild = options.build ?? "development";
  // What `envId` has: the project's, until an env file changes. One load
  // after the other, so that the last change has the last word.
  let env: PageEnv;
  let envLoad: Promise<unknown> = Promise.resolve();
  let server: ViteDevServer | undefined;
  // The files of the cache handlers that are no file of Next, for the scan
  // of the ssr layer: see `cacheHandlerScan()`.
  let cacheHandlerEntries: string[] = [];
  // Whether Vitest runs the plugin, which takes a change of a file itself.
  // Vitest turns Vite's HMR off, so `hotUpdate` never runs under it: this
  // flag is a defence, should a version of Vitest turn it on.
  let underVitest = false;
  // The client reference that Vite RSC made of a module of the rsc layer, if
  // it has `"use client"`. The post transform of client-files.ts asks for
  // every module of the layer, so Vite RSC's plugin is looked up once for a
  // config, not in the list of plugins each time.
  const pluginApis = new WeakMap<ResolvedConfig, ReturnType<typeof getPluginApi>>();
  const clientReferenceOf = (id: string, config: ResolvedConfig) => {
    if (!pluginApis.has(config)) pluginApis.set(config, getPluginApi(config));
    const references = pluginApis.get(config)?.manager.clientReferenceMetaMap;
    return references && clientReferenceOfModule(references, id);
  };
  const hostPackagesPlugin = {
    name: "vitest-plugin-rsc:next-host-packages",
    resolveId: (source: string) =>
      serverCode.isHostPackage(source) ? { id: source, external: true } : undefined,
  };
  const resolvers = Object.fromEntries(
    layers.map((layer) => [layer, createLayerResolver(getProject, layer, () => fast.fastCrypto)]),
  ) as Record<NextLayer, LayerResolver>;
  // The CSS of the app, as the stylesheets of a route.
  let pageRoutes: { of: NextProject; routes: Map<string, NextRoute | ComponentRoute> } | undefined;
  const styles = createStyles({
    getProject,
    environments: environmentOf,
    isServerCode: (file) => serverCode.isServerCode(file, "rsc"),
    isHostFile: serverCode.isHostFile,
    pageRoutes() {
      if (pageRoutes?.of !== project) {
        const routes = [...project.routes, ...project.componentRoutes].flatMap((route) =>
          route.kind === "page" ? [[entryOf(route), route] as const] : [],
        );
        pageRoutes = { of: project, routes: new Map(routes) };
      }
      return pageRoutes.routes;
    },
    entryIdOf: (entry) =>
      `\0${routeEntryPrefix}${[...project.routes, ...project.componentRoutes].findIndex(
        (route) => route.kind === "page" && entryOf(route) === entry,
      )}`,
    lists: routeKinds.map((kind) => `\0${routeLists[kind]}`),
  });
  // The constants of what Next's build generates for the rsc layer, the entry
  // of a route and of the proxy: Next's code, so with Next's NODE_ENV.
  const generatedDefines = () => ({
    ...definesOf(project, "rsc"),
    ...(build === "production" && { "process.env.NODE_ENV": '"production"' }),
  });

  return [
    // The scan of the rsc layer, which the host's page is, starts where the
    // host's starts, and from the app: a route loads when it is first
    // requested, and so does the proxy, which no file of `app/` imports, so
    // without them Vite finds the dependencies of a page as it loads, and
    // pre-bundles again. Vite scans its default, the input of the build or
    // every HTML file, only when no entries are named, so it is named here
    // where the host named none, as for the pages of Vite's own dev server.
    // In `configureServer`: Vitest names its entries on the resolved config,
    // after every `config` hook. `order: "pre"`: before runner-environment.ts
    // copies them for the browser layer's scan.
    {
      name: "vitest-plugin-rsc:next-scan",
      configureServer: {
        order: "pre",
        handler(server) {
          const rsc = server.config.environments[environmentOf.rsc]!;
          const input = rsc.input ?? rsc.build.rolldownOptions.input;
          const inputFiles = typeof input === "string" ? [input] : Object.values(input ?? {});
          const hostEntries =
            rsc.optimizeDeps.entries ??
            (inputFiles.length > 0 ? inputFiles.map(fileEntry) : "**/*.html");
          rsc.optimizeDeps.entries = [
            ...[hostEntries].flat(),
            appEntriesOf(project),
            ...(project.middlewareFile ? [fileEntry(project.middlewareFile)] : []),
          ];
          // The ssr layer loads the Client Components that a payload of the
          // rsc layer names, by their id: a module of the app, of `app/` or
          // not, or of a package, which a test file can import too. So its
          // scan starts where the rsc layer's does, and reads through the
          // Server Components to them, as the browser layer's does. Not at a
          // file of a package, like the runtime of Vitest, which is the
          // page's and which the layer does not run. Nor at a file of the
          // plugin, like its setup file, which is a file of `node_modules`
          // for an installed package and a file of this repository for a
          // linked one. And at the cache handlers of `next.config`, which it
          // loads itself.
          const ssr = server.config.environments[environmentOf.ssr]!;
          const isOwnOrPackageFile = (entry: string) => {
            const file = normalizePath(entry);
            return file.includes("/node_modules/") || file.startsWith(ownDir);
          };
          ssr.optimizeDeps.entries = [
            ...[ssr.optimizeDeps.entries ?? []].flat(),
            ...rsc.optimizeDeps.entries.filter((entry) => !isOwnOrPackageFile(entry)),
            ...cacheHandlerEntries,
          ];
        },
      },
    },
    ...createRunnerEnvironmentPlugins(environmentOf.ssr),
    createPathsPlugin(getProject),
    {
      name: "vitest-plugin-rsc:next",
      enforce: "pre",
      async config(config, { command }) {
        const isBuild = command === "build";
        build = options.build ?? (isBuild ? "production" : "development");
        // Vitest says it runs in the env of its process, before it loads a
        // config: what tells a test run from a dev server here.
        // oxlint-disable-next-line no-process-env
        const fastCrypto = features.fastCrypto && !isBuild && process.env.VITEST !== undefined;
        fast = { ...features, fastCrypto };
        project = await loadNextProject(path.resolve(config.root ?? process.cwd()), undefined, {
          build,
          static: isBuild,
        });
        serverCode.configure(project.root);
        env = project.env;
        // A static build runs without Vitest, so it has no test files: every
        // file of the project is server code in the rsc layer, but for
        // `host.files`, which the page of the host is in, and the
        // `browserModules`.
        if (isBuild) serverCode.addTestFiles(() => false);

        // What the route entries import from Next, to pre-bundle it. Every
        // route is read: which of Next's builtin boundaries a loader tree
        // imports depends on what the app leaves out. And one route of a
        // node, for Next's own global error page, which an app with one of
        // its own does not import.
        const appPageEntries = await Promise.all(
          [...project.routes, ...project.componentRoutes.slice(0, 1)].map((candidate) =>
            project.loadRouteEntry(candidate),
          ),
        );
        // And what the modules of the metadata loaders import, which only
        // the entries import, by a request that is no file.
        const metadataModules = await Promise.all(
          [...new Set(appPageEntries.flatMap(({ code }) => findMetadataRequests(code)))].map(
            (request) => project.loadMetadata(request),
          ),
        );
        const entryImports = [
          ...appPageEntries.flatMap(({ code }) => findImports(code)),
          ...metadataModules.flatMap(({ code }) => findImports(code)),
          ...findImports((await project.loadMiddlewareEntry()) ?? ""),
          // `next/root-params`, which the scan finds as an import, but not
          // what the module the plugin makes of it imports.
          ...findImports(await project.loadRootParams()),
        ];
        const cacheHandlers = cacheHandlerScan(project, resolvers.ssr.toSpecifier);
        cacheHandlerEntries = cacheHandlers.entries;
        // `next/og` renders images with wasm: not something to pre-bundle for
        // every project.
        const apiImports = (layer: NextLayer) =>
          Object.entries(project.aliases[layer]).flatMap(([file, target]) =>
            path.dirname(file) === project.nextDir && target && !file.endsWith("og.js")
              ? [target]
              : [],
          );
        const toInclude = (layer: NextLayer, sources: string[]) => [
          ...new Set(
            sources.flatMap((source) => {
              const target = resolvers[layer].normalize(source);
              return target && target.startsWith("next/dist/") ? [target] : [];
            }),
          ),
        ];

        const rscInclude = toInclude("rsc", [
          ...entryImports,
          ...apiImports("rsc"),
          ...runtimeImports.rsc,
          // Fixed before the optimizer starts, by the option: a module found
          // later would have Vite pre-bundle again, mid-test.
          ...(build === "production" ? prerenderImports : []),
        ]);
        const clientBoundaries = findClientBoundaries(project.nextDir, project.root, resolvers.rsc);
        const include: Record<NextLayer, string[]> = {
          rsc: [...rscInclude, nextRouting],
          ssr: [
            ...toInclude("ssr", [
              ...apiImports("ssr"),
              ...runtimeImports.ssr,
              ...clientBoundaries,
              ...cacheHandlers.include,
            ]),
            nextRouting,
          ],
          browser: toInclude("browser", [
            ...apiImports("browser"),
            ...runtimeImports.browser,
            ...clientBoundaries,
          ]),
        };

        // What Next's compiler makes app code import, like `styled-jsx/style`
        // for a `<style jsx>`: the scan finds it where it compiles the app's
        // code, and this is for the code it does not reach.
        const dependenciesOfNext = (layer: NextLayer) =>
          Object.entries(project.aliases[layer]).flatMap(([key, target]) =>
            key.endsWith("$") && target && resolvers[layer].isDependencyOfNext(target)
              ? [`next > ${key.slice(0, -1)}`]
              : [],
          );

        const optimizeDeps = (layer: NextLayer) => ({
          include: [
            ...include[layer],
            ...dependenciesOfNext(layer),
            ...project.webpackPackages[layer],
          ],
          rolldownOptions: {
            plugins: [
              // First: the other plugins see Next's production code.
              ...(build === "production" ? [nextProductionPlugin(project.nextDir)] : []),
              // The test runner is the page's own in the browser layer too,
              // like the `vitest` that vitest-browser-react imports: see
              // client-files.ts. Not a copy in what that layer pre-bundles.
              ...(layer === "browser" ? [hostPackagesPlugin] : []),
              resolvers[layer].plugin(),
              createDependencyCompilePlugin(getProject, layer, serverCode.isAppCode),
              createScanCompilePlugin(getProject, layer, serverCode.isAppCode),
              ...(layer === "rsc" ? [nextClientBoundaryPlugin(getProject, resolvers.rsc)] : []),
              flightConsolePlugin(),
              nextPatchesPlugin(),
              ...(layer === "browser"
                ? []
                : [
                    instrumentationPlugin(),
                    serverCode.optimizerPlugin(layer),
                    serverCode.asyncFunctionsOptimizerPlugin(layer),
                  ]),
            ],
            // A package can import what only another layer's build of a module
            // has, like `useRouter` of `next/navigation` in the rsc layer (the
            // notes demo). webpack leaves such an import undefined.
            shimMissingExports: true,
            // Next takes JSX in a `.js` file, so the dependency scan of the
            // app has to as well.
            moduleTypes: { ".js": "jsx" as const },
            // Vite does not apply `define` to dependencies. NODE_ENV is all
            // it defines for them, as the "test" of Vitest. Not in the rsc
            // layer: there Vitest keeps `process.env`, so it is read as the
            // code runs.
            transform: {
              define: {
                ...definesOf(project, layer),
                ...(layer === "browser" ? serverCode.browserCacheKey : serverCode.cacheKey),
                ...optimizerCacheKey(project, layer),
                // A pre-bundle has the stand-ins of `fastCrypto` in it, or not.
                __vitest_plugin_rsc_fast_crypto__: JSON.stringify(fast.fastCrypto),
              },
            },
          },
        });

        // Next's rules for CSS, unless the Vitest config has its own, which
        // then wins, and is said to.
        const css = await project.loadCssOptions();
        cssDifferences = [...css.differences];
        const cssOptions = { ...css.options };
        if (config.css?.preprocessorOptions !== undefined && cssOptions.preprocessorOptions) {
          delete cssOptions.preprocessorOptions;
          cssDifferences.push(
            "`css.preprocessorOptions` of the Vitest config is used, not `sassOptions` of next.config",
          );
        }
        if (config.css?.transformer === "lightningcss") {
          // Then Vite runs no PostCSS at all.
          delete cssOptions.postcss;
          delete cssOptions.modules;
          cssDifferences.push(
            "`css.transformer` of the Vitest config compiles the CSS with Lightning CSS: not with " +
              "Next's PostCSS plugins, its mode of a CSS module or its class names",
          );
        } else {
          if (config.css?.postcss !== undefined) {
            delete cssOptions.postcss;
            cssDifferences.push(
              "`css.postcss` of the Vitest config is used, not Next's PostCSS plugins, nor Next's " +
                "mode of a CSS module",
            );
          }
          // Also `false`, which turns CSS modules off.
          if (config.css?.modules !== undefined) {
            delete cssOptions.modules;
            cssDifferences.push(
              "`css.modules` of the Vitest config names the classes of a CSS module, not Next's rule",
            );
          }
        }

        // Before the project's own setup files: one that imports a module of
        // Next's server needs the server's platform to be there.
        const test = ((
          config as {
            test?: {
              setupFiles?: string | string[];
              browser?: { testerHtmlPath?: string; dependencySourcemaps?: boolean };
              expect?: { poll?: { interval?: number } };
            };
          }
        ).test ??= {});
        test.setupFiles = [setupFile, ...[test.setupFiles ?? []].flat()];
        // A page of the project's own wins.
        (test.browser ??= {}).testerHtmlPath ??= testerHtml;
        // Without the source maps of the dependencies in what the page
        // fetches, unless the config asks for them: Vite inlines each map,
        // which makes a pre-bundled dependency three times the size, and the
        // three layers pre-bundle much of Next and React. Vitest still maps
        // the stack of an error it reports with the maps on disk, and only
        // a headless run leaves them out.
        test.browser.dependencySourcemaps ??= false;
        // With `watchDom`, an assertion looks again sooner: see `VitestPluginNextOptions.mode`.
        if (fast.watchDom) ((test.expect ??= {}).poll ??= {}).interval ??= 5;

        // JSX compiled for production, as `next build` compiles it: JSX
        // compiled for development calls `jsxDEV()`, which React's production
        // build does not have. Vitest sets `oxc` for every config, which Vite
        // then takes over `esbuild`. Not where the config turns the
        // transform off, or keeps JSX as it is (`jsx: "preserve"`).
        const jsx =
          build === "production" && config.oxc !== false && typeof config.oxc?.jsx !== "string"
            ? { oxc: { jsx: { development: false } } }
            : {};

        // A static build has no dependency optimizer: a dependency goes
        // through the plugins like a source file, and gets the constants of
        // its layer there, see `dependencyBuildPlugin()`. Not every module:
        // with a dev server a source file has none of them, also a file of
        // the host. `process.env` stays the one of the page, which Next's
        // server reads as it runs, and which Vite would make an empty object.
        // NODE_ENV is the `build` option's for every module: without Vitest
        // the app has no NODE_ENV of its own, and React's build follows it,
        // as the aliases of a layer do (project/layers.ts).
        const nodeEnv = JSON.stringify(build);
        const builtLayer = (layer: NextLayer) =>
          isBuild && {
            define: {
              "process.env.NODE_ENV": nodeEnv,
              "global.process.env.NODE_ENV": nodeEnv,
              "globalThis.process.env.NODE_ENV": nodeEnv,
              // The name Vite RSC gives the `__webpack_require__` of a
              // Flight client, before Vite replaces the constants.
              ...(layer === "browser" && { __vite_rsc_require__: `${registry}.browserRequire` }),
            },
            build: { rolldownOptions: { shimMissingExports: true } },
          };

        return {
          ...jsx,
          // Vite bundles the CSS of the app, with Next's PostCSS plugins and
          // Next's class names of a CSS module.
          css: cssOptions,
          environments: {
            [environmentOf.rsc]: {
              ...builtLayer("rsc"),
              optimizeDeps: optimizeDeps("rsc"),
            },
            [environmentOf.ssr]: {
              ...builtLayer("ssr"),
              consumer: "client",
              resolve: {
                // Vite's conditions for a browser, which this is.
                conditions: [
                  ...(config.resolve?.conditions ?? []).filter(
                    (condition) => condition === "vitest-plugin-rsc-source",
                  ),
                  "module",
                  "browser",
                  "development|production",
                ],
              },
              dev: { moduleRunnerTransform: true },
              optimizeDeps: {
                ...optimizeDeps("ssr"),
                // Its entries: see `vitest-plugin-rsc:next-scan`.
                exclude: ["vitest-plugin-rsc", "@vitejs/plugin-rsc"],
              },
            },
            [environmentOf.browser]: {
              ...builtLayer("browser"),
              optimizeDeps: optimizeDeps("browser"),
            },
          },
        };
      },
      configureServer(vite) {
        server = vite;
        // The script of Next's build that starts the app, which the server
        // puts in the HTML of every page (`rootMainFiles` in build-output.ts).
        // The browser asks for it when the page is loaded, and nothing is in
        // it: `renderServer()` starts the app. Not a 404, which a host may
        // count as an error of the page.
        const mainApp = "static/chunks/main-app.js";
        vite.middlewares.use((request, response, next) => {
          const { pathname } = new URL(request.url ?? "/", "http://n");
          if (pathname !== `${project.assetPath}${mainApp}`) return next();
          // Without the source map Vite adds to a script that has none.
          send(request, response, "", "js", {
            headers: vite.config.server.headers,
            map: { mappings: "" },
          });
        });
      },
      // After the `config` hooks and the `configEnvironment` hooks without
      // `order: "post"`, which add to `optimizeDeps.include` of an
      // environment: the plugin of ../index.ts, a host, the top-level
      // `optimizeDeps` of the config, which Vite gives the `client` environment.
      configEnvironment: {
        order: "post",
        handler(name, config, { command }) {
          const layer = layers.find((layer) => environmentOf[layer] === name);
          if (!layer) return;
          // A dependency is pre-bundled under the name the layer resolves it
          // to, once. With a dev server, Vite looks for a bare import that an
          // alias matches, even `react` to itself, among the pre-bundled
          // dependencies by that name, before any plugin of the app resolves
          // it: `react` pre-bundled as npm React would be a second React. In
          // place: Vite concatenates the lists it merges.
          const optimizeDeps = config.optimizeDeps;
          if (optimizeDeps?.include) {
            optimizeDeps.include = [
              ...new Set(
                optimizeDeps.include.flatMap(
                  (entry) => resolvers[layer].preBundledName(entry) ?? [],
                ),
              ),
            ];
          }
          // The plugin of ../index.ts has Vite make `process.env` an empty
          // object in the layers, for a dev server.
          if (command === "build") return { keepProcessEnv: true };
        },
      },
      // What the app has and does not get here: said once, when a run starts.
      configResolved(config) {
        config.logger.info(describeEnv(env, config.command === "build"));
        for (const difference of [...cssDifferences, ...project.webpackDifferences]) {
          config.logger.warnOnce(`vitest-plugin-rsc: ${difference}.`);
        }
        if (project.edgeRouteFiles.length > 0) {
          config.logger.warnOnce(
            `vitest-plugin-rsc: Next.js has deprecated its edge runtime. These routes ask for ` +
              `it with \`export const runtime = "edge"\` and run on Node.js here, like the ` +
              `others: ${project.edgeRouteFiles.join(", ")}`,
          );
        }
        const newExports = Object.values(project.newExports).flat();
        const aboutNext =
          `vitest-plugin-rsc: next@${project.version} has exports that the plugin's stand-ins ` +
          `for its modules have not. Each throws when it is used: ` +
          newExports.map(({ name, module }) => `\`${name}\` of ${module}`).join(", ") +
          `. Use a version of vitest-plugin-rsc that supports next@${project.version}.`;
        // Of the installed Next, not of the project: once, for every project
        // of a run that has that Next.
        if (newExports.length > 0 && !saidOfNext.has(aboutNext)) {
          saidOfNext.add(aboutNext);
          config.logger.warn(aboutNext);
        }
        if (project.unmatchedRoutes.length > 0) {
          config.logger.warnOnce(
            `vitest-plugin-rsc: @next/routing does not find a dynamic route under a folder with ` +
              `a name that a URL percent-encodes. These routes get the not-found page: ` +
              project.unmatchedRoutes.join(", "),
          );
        }
      },
      // Vitest's hook for a plugin of a project, which another host has not:
      // what its config says is a test file or a setup file is not server
      // code.
      configureVitest({ vitest, project: testProject }: { vitest: Vitest; project: TestProject }) {
        underVitest = true;
        assertVitestVersion(vitest.version);
        const test = testProject.config;
        // Read as a file is asked about: a plugin of the host adds a setup
        // file in its own `configureVitest`, which may run after this one,
        // like Storybook's Vitest addon in Browser Mode.
        const isSetupFile = (file: string) =>
          test.setupFiles.some((setupFile) => normalizePath(setupFile) === file);
        // `test.include`, matched the way Vitest does. Not `includeSource`:
        // a file with tests in its source is a file of the app.
        const isIncluded = createFilter(test.include, test.exclude, {
          resolve: test.dir || test.root,
        });
        serverCode.addTestFiles((file) => isSetupFile(file) || isIncluded(file));
      },
      // Without Vitest, a page of the host has the rsc layer's modules as the
      // browser loaded them, with the plugin's runtime, whose modules of the
      // routes import the app. Vite takes a change of a file of the app up
      // through the runtime to the host, and a host that takes the change in
      // place, like a framework that renders its own modules again, would
      // evaluate a second runtime next to the first, with another page
      // registry and other globals. A page load evaluates them all again,
      // once. A change of a stylesheet, or of a file that it only depends on,
      // is the stylesheet's, which changes in place: see `importedByRoute()` and
      // `hmrBoundary()`. Only the rsc layer's graph is walked: a module that only a
      // Client Component imports is not in it. A file of the host with
      // `"use client"` that imports it changes with it (client-files.ts), and
      // the host sees any other one as a page renders it again. Under Vitest
      // a change runs test files again: see Watch Mode.
      async hotUpdate({ file, modules }) {
        if (underVitest) return;
        // An env file that Vite does not restart for, as it is not of its
        // mode: the page loads again with the new env, which the modules of
        // the app read as they evaluate. Once, from the rsc layer, for the
        // page that every layer is in.
        if (
          envFilesOf(false).some((name) => normalizePath(path.join(project.root, name)) === file)
        ) {
          if (this.environment.name !== environmentOf.rsc) return [];
          const loaded = envLoad.then(() => project.loadEnv());
          envLoad = loaded.catch(() => {});
          env = await loaded;
          for (const environment of Object.values(server?.environments ?? {})) {
            const envModule = environment.moduleGraph.getModuleById(`\0${envId}`);
            if (envModule) environment.moduleGraph.invalidateModule(envModule);
          }
          this.environment.logger.info(
            `page reload ${path.relative(this.environment.config.root, file)} (vitest-plugin-rsc: an env file changed)`,
            { timestamp: true },
          );
          this.environment.hot.send({ type: "full-reload", path: "*", triggeredBy: file });
          return [];
        }
        if (this.environment.name !== environmentOf.rsc) return;
        if (!modules.some(importedByRoute)) return;
        this.environment.logger.info(
          `page reload ${path.relative(this.environment.config.root, file)} (vitest-plugin-rsc: a file of the app changed)`,
          { timestamp: true },
        );
        this.environment.hot.send({ type: "full-reload", path: "*", triggeredBy: file });
        return [];
      },
      resolveId(source) {
        if (source === manifestId || source === envId || isRouteModule(source)) {
          return `\0${source}`;
        }
        if (source === fastCryptoSetupId) return `\0${source}`;
        if (source === middlewareId || source === middlewareEntryId) return `\0${source}`;
        if (source === useCacheId || source === cacheHandlersId) return `\0${source}`;
        if (source === prerenderId) return `\0${source}`;
        if (source === "next/root-params") return `\0${rootParamsId}`;
        if (project.isMetadataRequest(source)) return `\0${metadataPrefix}${source}`;
        // The module of a generated image, for what it says of the image. Next
        // imports it again for that, to keep the module of a page small. Here
        // it is the module itself.
        if (source.endsWith(project.metadataImageMeta)) {
          return source.slice(0, -project.metadataImageMeta.length);
        }
      },
      async load(id) {
        if (id.startsWith(`\0${metadataPrefix}`)) {
          const { code, watchFiles } = await project.loadMetadata(
            id.slice(metadataPrefix.length + 1),
          );
          for (const file of watchFiles) this.addWatchFile(file);
          return serverCode.compile(code, "next-metadata.js", generatedDefines());
        }
        if (id === `\0${useCacheId}`) return useCacheModule(registry);
        if (id === `\0${rootParamsId}`) return project.loadRootParams();
        if (id === `\0${prerenderId}`) {
          return build === "production"
            ? `export { prerenderVerdictOf } from ${JSON.stringify(ownFile("prerender-verdict"))};\n`
            : `export function prerenderVerdictOf() {\n` +
                `  throw new Error('vitest-plugin-rsc: only \`build: "production"\` prerenders');\n` +
                `}\n`;
        }
        // The files of the cache handlers that `next.config` names, which
        // Next's server imports: cache.ts.
        if (id === `\0${cacheHandlersId}`) {
          const { cacheHandler, cacheHandlers } = cacheHandlerFilesOf(project);
          const load = (file: string) => `() => import(${JSON.stringify(file)})`;
          const kinds = Object.entries(cacheHandlers).map(
            ([kind, file]) => `  ${JSON.stringify(kind)}: ${load(file)},`,
          );
          return (
            `export const cacheHandler = ${cacheHandler ? load(cacheHandler) : "undefined"};\n` +
            `export const cacheHandlers = {\n${kinds.join("\n")}\n};\n`
          );
        }

        if (id === `\0${fastCryptoSetupId}`) return fastCryptoSetup(fast.fastCrypto);

        // Of every layer: the page's `process.env` is one.
        if (id === `\0${envId}`) {
          for (const name of env.files) this.addWatchFile(path.join(project.root, name));
          return `export default ${JSON.stringify(env.values)};\n`;
        }

        if (id === `\0${manifestId}`) {
          const routes = project.routes.map(({ kind, page, pathname }) => ({
            kind,
            page,
            pathname,
          }));
          return (
            `export const routes = ${JSON.stringify([...routes, ...project.componentRoutes])};\n` +
            `export const nextConfig = ${JSON.stringify(
              this.environment.mode === "build"
                ? withPathsFromRoot(project.config, project.root)
                : project.config,
            )};\n` +
            `export const routing = ${JSON.stringify(project.routing)};\n` +
            `export const routesManifest = ${JSON.stringify(project.routesManifest)};\n` +
            `export const preview = ${JSON.stringify(project.preview)};\n` +
            `export const build = ${JSON.stringify(build)};\n` +
            `export const fast = ${JSON.stringify(fast)};\n`
          );
        }

        // Only the rsc layer has the middleware: see the route modules below.
        const hasMiddleware =
          project.middlewareFile !== undefined && this.environment.name === environmentOf.rsc;
        if (id === `\0${middlewareId}`) {
          if (!hasMiddleware) return "export default undefined;\n";
          const entry = JSON.stringify(middlewareEntryId);
          return `export default () => import(${entry});\n${hmrBoundary([entry])}`;
        }
        if (id === `\0${middlewareEntryId}`) {
          const code = hasMiddleware && (await project.loadMiddlewareEntry());
          if (!code) return "export {};";
          return serverCode.compile(code, "next-middleware-entry.js", generatedDefines());
        }

        if (!id.startsWith("\0") || !isRouteModule(id.slice(1))) return;
        // Vite's dependency scan follows the test's imports in every
        // environment, also into the modules of another layer.
        if (this.environment.name !== environmentOf.rsc) return "export default {};";
        const routes = [...project.routes, ...project.componentRoutes];

        const listed = routeKinds.find((kind) => id === `\0${routeLists[kind]}`);
        if (listed) {
          const entries = routes.flatMap((route, index) =>
            route.kind === listed
              ? [
                  {
                    name: JSON.stringify(entryOf(route)),
                    entry: JSON.stringify(routeEntryPrefix + index),
                  },
                ]
              : [],
          );
          const lines = entries.map(({ name, entry }) => `  ${name}: () => import(${entry}),`);
          return `export default {\n${lines.join("\n")}\n};\n${hmrBoundary(entries.map(({ entry }) => entry))}`;
        }

        const route = routes[Number(id.slice(routeEntryPrefix.length + 1))]!;
        const entry = await project.loadRouteEntry(route);
        for (const file of entry.watchFiles) this.addWatchFile(file);
        // A generated module: Vite only replaces `define` keys in pre-bundled
        // dependencies.
        return serverCode.compile(entry.code, `${id.replace(/\W+/g, "-")}.js`, generatedDefines());
      },
    },
    ...clientFiles({
      environments: { rsc: environmentOf.rsc, browser: environmentOf.browser },
      testingLibrary,
      clientComponents: "vitest-plugin-rsc/nextjs/client-components",
      internal: ownFile("internal"),
      isHostFile: serverCode.isHostFile,
      isTestFile: serverCode.isTestFile,
      isHostPackage: serverCode.isHostPackage,
      clientReferenceOf,
    }),
    serverCode.plugin({ [environmentOf.rsc]: "rsc", [environmentOf.ssr]: "ssr" }),
    pageTimersPlugin(environmentOf.browser, serverCode.isHostFile),
    ...styles.plugins,
    serverCode.asyncFunctionsPlugin(environmentOf.rsc),
    createUseCachePlugin(
      getProject,
      (environment) => layers.find((layer) => environmentOf[layer] === environment),
      serverCode.isAppCode,
    ),
    createCompilePlugin(
      getProject,
      (environment) => layers.find((layer) => environmentOf[layer] === environment),
      serverCode.isAppCode,
    ),
    // After Next's compiler, before `rsc:use-client`: both are `pre`.
    createCommonJsPlugin(
      (environment) => layers.find((layer) => environmentOf[layer] === environment),
      serverCode.isAppCode,
    ),
    ...layers.map((layer) => ({
      ...resolvers[layer].plugin(),
      applyToEnvironment: (environment: { name: string }) =>
        environment.name === environmentOf[layer],
    })),
    // What the dependency optimizer does to a dependency, for a static build,
    // which has no optimizer.
    ...layers.map((layer) => dependencyBuildPlugin(getProject, serverCode, layer)),
    { ...flightConsolePlugin(), apply: "build" },
    { ...nextPatchesPlugin(), apply: "build" },
    { ...instrumentationPlugin(), apply: "build" },
    nextStaticBuild({
      environments: environmentOf,
      entries: { ssr: "vitest-plugin-rsc/nextjs/ssr", browser: "vitest-plugin-rsc/nextjs/client" },
      emittedFiles: () => [...project.emittedFiles(), ...styles.builtFiles()],
      rscModule: ownFile("rsc"),
      isHostFile: (id) => builtHostFileOf(id, project.root, serverCode.isHostFile) !== undefined,
    }),
  ];
}

// What the dependency optimizer does to a package for a layer, for a static
// build, which has no optimizer: Next's compiler for a package that calls
// `next/font`, the constants of the layer, and for a server layer what makes
// a module server code. Vite RSC makes the client references of Next's own
// `"use client"` files itself, as a build runs every module through the
// plugins (`nextClientBoundaryPlugin()` is for the optimizer).
function dependencyBuildPlugin(
  getProject: () => NextProject,
  serverCode: ReturnType<typeof createServerCode>,
  layer: NextLayer,
): Plugin {
  const compile = createDependencyCompilePlugin(getProject, layer, serverCode.isAppCode);
  return {
    name: `vitest-plugin-rsc:next-build-dependency:${layer}`,
    apply: "build",
    applyToEnvironment: (environment) => environment.name === environmentOf[layer],
    async transform(code, id) {
      const file = id.split("?")[0]!;
      if (!normalizePath(file).includes("/node_modules/") || !/\.[cm]?js$/.test(file)) return;
      const compiled = await compile.transform(code, file);
      const isServerCode = layer !== "browser" && serverCode.isServerCode(file, layer);
      // What keeps the stores of a module of Next across an `await` and a
      // render, as the optimizer does it.
      const forStores = isServerCode
        ? serverCode.forStores(this, compiled?.code ?? code, file, layer)
        : undefined;
      const source = forStores?.code ?? compiled?.code ?? code;
      const kept = source === (compiled?.code ?? code) ? compiled : { code: source };
      // The ones it names: most modules name none.
      const define = Object.fromEntries(
        Object.entries(definesOf(getProject(), layer)).filter(([key]) =>
          source.includes(key.replace(/^typeof /, "")),
        ),
      );
      if (!isServerCode && Object.keys(define).length === 0) return kept;
      try {
        const defined = isServerCode
          ? await compileServerCode(source, file, registry, { ...define, ...forStores?.define })
          : await transformWithOxc(source, file, { lang: "js", define });
        return defined ?? kept;
      } catch (error) {
        // JSX in a `.js` file, for one. The bundler may still take it.
        const reason = String(error instanceof Error ? error.message : error);
        this.warn(
          `vitest-plugin-rsc: ${file} keeps the constants of Next's ${layer} layer, it does not ` +
            `parse as JavaScript. ${reason.replace(/\s+/g, " ")}`,
        );
        return kept;
      }
    },
  };
}
