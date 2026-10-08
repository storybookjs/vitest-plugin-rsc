import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasDirective, transformDirectiveProxyExport } from "@vitejs/plugin-rsc/transforms";
import { createFilter, normalizePath, parseAst, parseAstAsync, type Plugin } from "vite";
import type { TestProject } from "vitest/node";
import { createRunnerEnvironmentPlugins } from "../runner-environment.ts";
import { flightBridge, type FlightEntry } from "./flight.ts";
import { createCompilePlugin, createDependencyCompilePlugin } from "./compile.ts";
import { createNodePlatform } from "./node-platform.ts";
import { loadNextProject, type NextLayer, type NextProject } from "./project.ts";
import { moduleFileAt } from "./project/context.ts";
import { createServerCode, type ServerCodeOptions } from "./server-code.ts";
import { affectedTests } from "./affected/index.ts";
import { createPathsPlugin } from "./paths.ts";
import { createStylesPlugins } from "./styles.ts";

// Each layer of Next is a Vite environment, and all three run in the
// browser (docs/next-routes.md). Where Next's own bundler config says a module
// belongs to another layer, it is bridged to that environment through
// `registry` (registry.ts).
const environmentOf: Record<NextLayer, string> = {
  rsc: "client",
  ssr: "next_ssr",
  browser: "react_client",
};
const layers = Object.keys(environmentOf) as NextLayer[];

const registry = "globalThis.__vitest_plugin_rsc_next__";
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
// Next's route resolution, which the server in front of the app runs in the
// ssr layer. Not a part of `next`: it is the project's, next to its `next`.
const nextRouting = "@next/routing";
// What the modules of a route are listed by: its page name, which the route
// of a node shares with a page of the app.
const entryOf = (route: { page: string; component?: string }) => route.component ?? route.page;
const isRouteModule = (id: string) =>
  id.startsWith(routeEntryPrefix) || routeKinds.some((kind) => id === routeLists[kind]);
const bridgePrefix = "\0vitest-plugin-rsc/next-bridge/";
const emptyModuleId = "\0vitest-plugin-rsc/next-empty";
const serverReferenceInfo = "next/dist/esm/shared/lib/server-reference-info.js";
const vendoredFlight = (entry: string) => `@vitejs/plugin-rsc/vendor/react-server-dom/${entry}`;
// Vitest wants a file path for a setup file, not a package specifier.
const setupFile = fileURLToPath(
  new URL(`./setup${path.extname(import.meta.url)}`, import.meta.url),
);
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

const nodePlatform = createNodePlatform(registry, bridgePrefix);

type Alias = { key: string; exact: boolean; target: string | false };

// The module resolution of one layer: Next's alias tables with webpack's
// matching rules, and the ESM build of Next in place of the CommonJS one.
//
// This is a function and not Vite's `resolve.alias`, which is one table for
// every environment. And it names a file of Next one way only: Vite keeps a
// pre-bundled dependency per specifier, so a second spelling is a second copy
// of the module, found mid-test.
function createLayerResolver(getProject: () => NextProject, layer: NextLayer) {
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
    // The route module of a page is made in the rsc layer, by Next's request
    // handler for it, and belongs to the ssr layer.
    if (
      layer === "rsc" &&
      /^next\/dist\/(esm\/)?server\/route-modules\/app-page\/module\.compiled(\.js)?$/.test(source)
    ) {
      return `${bridgePrefix}ssr-app-page-module`;
    }
    // The Readable that node-server.ts makes a request of.
    if (source === "virtual:vitest-plugin-rsc/node-stream") return `${bridgePrefix}node-stream`;
    if (layer !== "browser") return nodePlatform.moduleOf(source);
  }

  /**
   * Where a specifier leads in this layer: another specifier, a bridge module
   * (`\0...`), or `false` for a module the layer leaves empty.
   */
  function normalize(source: string): string | false {
    const cached = normalized.get(source);
    if (cached !== undefined) return cached;

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

  function plugin(): Plugin {
    return {
      name: `vitest-plugin-rsc:next-resolve:${layer}`,
      enforce: "pre",
      async resolveId(source, importer, options) {
        if (source.startsWith("\0")) return;
        // The shim wraps the module it replaces.
        if (importer === `${bridgePrefix}server-reference-info`) {
          return nextFile(serverReferenceInfo);
        }

        if (source === nextRouting) {
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

        const target = normalize(specifier);
        if (target === false) return emptyModuleId;
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
        // Keep it a bare specifier, so Vite maps it to the pre-bundled dependency.
        // Next is the project's: a package of the app that imports `react`
        // can have another `next` closer by, as in a pnpm workspace.
        const from = target.startsWith("next/")
          ? path.join(getProject().root, "package.json")
          : importer;
        return this.resolve(target, from, { ...options, skipSelf: true });
      },
      load(id) {
        if (id === emptyModuleId) return "export {};";
        if (!id.startsWith(bridgePrefix)) return;
        const name = id.slice(bridgePrefix.length);
        if (name === "server-reference-info") return serverReferenceInfoShim;
        const nodeModule = nodePlatform.load(name);
        if (nodeModule) return nodeModule;
        const { flightExports, version } = getProject();
        const entry = name.slice("flight-".length) as FlightEntry;
        return flightBridge(entry, flightExports[entry], version, registry);
      },
    };
  }

  return { normalize, nextFile, toSpecifier, isDependencyOfNext, plugin };
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

// Next's compile-time constants for a layer. A server layer gets what makes
// a module server code on top of these: see server-code.ts.
function definesOf(project: NextProject, layer: NextLayer): Record<string, string> {
  // Not NODE_ENV: React stays a development build, for its warnings.
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
function findClientBoundaries(nextDir: string, resolver: LayerResolver): string[] {
  let files = clientBoundaryFiles.get(nextDir);
  if (!files) {
    const entries = fs.readdirSync(path.join(nextDir, "dist/esm"), {
      recursive: true,
      withFileTypes: true,
    });
    files = entries.flatMap((entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".js")) return [];
      const file = path.join(entry.parentPath, entry.name);
      const code = fs.readFileSync(file, "utf8");
      return code.includes("use client") && hasDirective(parseAst(code).body, "use client")
        ? [file]
        : [];
    });
    clientBoundaryFiles.set(nextDir, files);
  }
  // Vite keeps the pre-bundled dependencies by a hash of this list, and a
  // directory is listed in the order of its disk.
  return files.map((file) => resolver.toSpecifier(file)).sort();
}

// What the runtime modules of this package, and the modules Vite and Vite RSC
// generate, import from Next and from React, per layer.
const react = ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react/compiler-runtime"];
const runtimeImports: Record<NextLayer, string[]> = {
  rsc: [
    ...react,
    "react-dom",
    "next/dist/compiled/buffer",
    "next/dist/server/route-kind",
    vendoredFlight("server.edge"),
    vendoredFlight("static.edge"),
    vendoredFlight("client.edge"),
  ],
  ssr: [
    ...react,
    "react-dom",
    "next/dist/server/route-modules/app-page/module",
    "next/dist/server/lib/incremental-cache",
    "next/dist/server/lib/incremental-cache/tags-manifest.external",
    // ssr.ts, for the server in front of the app
    "next/dist/client/components/app-router-headers",
    "next/dist/server/lib/is-rsc-request",
    "next/dist/server/lib/server-ipc/utils",
    "next/dist/shared/lib/router/utils/route-matcher",
    "next/dist/shared/lib/router/utils/route-regex",
    // node-server.ts
    "next/dist/server/lib/mock-request",
    // node-server.ts and ssr.ts
    "next/dist/server/web/utils",
    "next/dist/compiled/stream-browserify",
    vendoredFlight("client.edge"),
  ],
  browser: [
    ...react,
    "react-dom",
    "react-dom/client",
    "next/dist/client/app-bootstrap",
    "next/dist/client/app-call-server",
    "next/dist/client/app-index",
    vendoredFlight("client.browser"),
  ],
};

export type VitestPluginNextOptions = ServerCodeOptions & {
  /**
   * Lets watch mode, `vitest --changed` and `vitest related` find the test
   * files of a route: a test that opens a route does not import its files.
   * Off unless set. It leans on how Vitest works inside, so an update of
   * Vitest can break it: see docs/next-routes.md, "Watch Mode".
   *
   * Without it an edit in watch mode runs every test file that opens a route,
   * and `--changed` does not find the test files of a route.
   */
  affectedTests?: boolean;
};

export function vitestPluginNext(options: VitestPluginNextOptions = {}): Plugin[] {
  let project: NextProject;
  // What the CSS of the app gets otherwise than from Next: see `loadCssOptions()`.
  let cssDifferences: string[] = [];
  const serverCode = createServerCode(registry, options);
  const getProject = () => project;
  const resolvers = Object.fromEntries(
    layers.map((layer) => [layer, createLayerResolver(getProject, layer)]),
  ) as Record<NextLayer, LayerResolver>;

  return [
    ...createRunnerEnvironmentPlugins(environmentOf.ssr),
    createPathsPlugin(getProject),
    // Watch mode and `vitest --changed` find the test files of a route. On
    // its own: nothing else here knows of it.
    ...(options.affectedTests
      ? [
          affectedTests({
            environments: layers.map((layer) => environmentOf[layer]),
            lists: routeKinds.map((kind) => `\0${routeLists[kind]}`),
            modulesOf: (kind, entry) =>
              [...project.routes, ...project.componentRoutes].flatMap((route, index) =>
                route.kind === kind && entryOf(route) === entry
                  ? [`\0${routeEntryPrefix}${index}`]
                  : [],
              ),
            next: getProject,
          }),
        ]
      : []),
    {
      name: "vitest-plugin-rsc:next",
      enforce: "pre",
      async config(config) {
        project = await loadNextProject(path.resolve(config.root ?? process.cwd()));
        serverCode.configure(project.root);

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
        const entryImports = [
          ...appPageEntries.flatMap(({ code }) => findImports(code)),
          ...findImports((await project.loadMiddlewareEntry()) ?? ""),
        ];
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
        ]);
        const clientBoundaries = findClientBoundaries(project.nextDir, resolvers.rsc);
        const include: Record<NextLayer, string[]> = {
          rsc: rscInclude,
          ssr: [
            ...toInclude("ssr", [...apiImports("ssr"), ...runtimeImports.ssr, ...clientBoundaries]),
            nextRouting,
          ],
          browser: toInclude("browser", [
            ...apiImports("browser"),
            ...runtimeImports.browser,
            ...clientBoundaries,
          ]),
        };

        // What Next's compiler makes app code import, like `styled-jsx/style`
        // for a `<style jsx>`: not an import the dependency scan finds.
        const dependenciesOfNext = (layer: NextLayer) =>
          Object.entries(project.aliases[layer]).flatMap(([key, target]) =>
            key.endsWith("$") && target && resolvers[layer].isDependencyOfNext(target)
              ? [`next > ${key.slice(0, -1)}`]
              : [],
          );

        const appEntries = normalizePath(path.join(project.appDir, "**/*.{js,jsx,ts,tsx}"));
        // The proxy of the app is a module of the rsc layer that no file of
        // `app/` imports.
        const middlewareEntries = project.middlewareFile
          ? [normalizePath(project.middlewareFile)]
          : [];
        const optimizeDeps = (layer: NextLayer) => ({
          include: [...include[layer], ...dependenciesOfNext(layer)],
          rolldownOptions: {
            plugins: [
              resolvers[layer].plugin(),
              createDependencyCompilePlugin(getProject, layer),
              ...(layer === "rsc" ? [nextClientBoundaryPlugin(getProject, resolvers.rsc)] : []),
              ...(layer === "browser" ? [] : [serverCode.optimizerPlugin(layer)]),
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
                ...(layer !== "browser" && serverCode.cacheKey),
              },
            },
          },
        });

        // Next's rules for CSS, unless the Vitest config has its own, which
        // then wins, and is said to.
        const css = await project.loadCssOptions();
        cssDifferences = [...css.differences];
        const cssOptions = { ...css.options };
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
            test?: { setupFiles?: string | string[]; browser?: { testerHtmlPath?: string } };
          }
        ).test ??= {});
        test.setupFiles = [setupFile, ...[test.setupFiles ?? []].flat()];
        // A page of the project's own wins.
        (test.browser ??= {}).testerHtmlPath ??= testerHtml;

        return {
          // Vite bundles the CSS of the app, with Next's PostCSS plugins and
          // Next's class names of a CSS module.
          css: cssOptions,
          environments: {
            [environmentOf.rsc]: {
              optimizeDeps: {
                ...optimizeDeps("rsc"),
                // A route loads when it is first requested, and so does the
                // proxy. Scan the app up front, or Vite finds the
                // dependencies of a page mid-test and reloads the page.
                entries: [appEntries, ...middlewareEntries],
              },
            },
            [environmentOf.ssr]: {
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
                // The Client Components it renders are the app's.
                entries: [appEntries],
                exclude: ["vitest-plugin-rsc", "@vitejs/plugin-rsc"],
              },
            },
            [environmentOf.browser]: { optimizeDeps: optimizeDeps("browser") },
          },
        };
      },
      // What the app has and does not get here: said once, when a run starts.
      configResolved(config) {
        for (const difference of cssDifferences) {
          config.logger.warnOnce(`vitest-plugin-rsc: ${difference}.`);
        }
        if (project.edgeRouteFiles.length > 0) {
          config.logger.warnOnce(
            `vitest-plugin-rsc: Next.js has deprecated its edge runtime. These routes ask for ` +
              `it with \`export const runtime = "edge"\` and run on Node.js here, like the ` +
              `others: ${project.edgeRouteFiles.join(", ")}`,
          );
        }
        if (project.unmatchedRoutes.length > 0) {
          config.logger.warnOnce(
            `vitest-plugin-rsc: @next/routing does not find a dynamic route under a folder with ` +
              `a name that a URL percent-encodes. These routes get the not-found page: ` +
              project.unmatchedRoutes.join(", "),
          );
        }
        // An app with metadata files still runs, as it would without them.
        // Not `favicon.ico`, which only adds a `<link rel="icon">`, and which
        // every new app has.
        const files = project.metadataFiles.filter((file) => path.basename(file) !== "favicon.ico");
        if (files.length === 0) return;
        const app = path.relative(process.cwd(), project.root) || path.basename(project.root);
        config.logger.warnOnce(
          `vitest-plugin-rsc: Next.js metadata files are not supported yet. The pages of ` +
            `${app} leave them out, and their routes are not served: ${files.join(", ")}`,
        );
      },
      // Vitest's hook for a plugin of a project: what its config says is a
      // test file or a setup file is not server code.
      configureVitest({ project: testProject }: { project: TestProject }) {
        const test = testProject.config;
        const setupFiles = new Set(test.setupFiles.map((file) => normalizePath(file)));
        // `test.include`, matched the way Vitest does. Not `includeSource`:
        // a file with tests in its source is a file of the app.
        const isIncluded = createFilter(test.include, test.exclude, {
          resolve: test.dir || test.root,
        });
        serverCode.addTestFiles((file) => setupFiles.has(file) || isIncluded(file));
      },
      resolveId(source) {
        if (source === manifestId || isRouteModule(source)) return `\0${source}`;
        if (source === middlewareId || source === middlewareEntryId) return `\0${source}`;
        // TODO: run Next's metadata loaders for these inline loader requests.
        // Until then a page has no metadata from files: see configResolved.
        if (/^next-metadata-(image|route)-loader\?/.test(source)) return `${bridgePrefix}metadata`;
      },
      async load(id) {
        if (id === `${bridgePrefix}metadata`) {
          return `export default async function metadata() { return []; }`;
        }

        if (id === `\0${manifestId}`) {
          const routes = project.routes.map(({ kind, page, pathname }) => ({
            kind,
            page,
            pathname,
          }));
          return (
            `export const routes = ${JSON.stringify([...routes, ...project.componentRoutes])};\n` +
            `export const nextConfig = ${JSON.stringify(project.config)};\n` +
            `export const routing = ${JSON.stringify(project.routing)};\n` +
            `export const routesManifest = ${JSON.stringify(project.routesManifest)};\n` +
            `export const preview = ${JSON.stringify(project.preview)};\n`
          );
        }

        // Only the rsc layer has the middleware: see the route modules below.
        const hasMiddleware =
          project.middlewareFile !== undefined && this.environment.name === environmentOf.rsc;
        if (id === `\0${middlewareId}`) {
          const load = `() => import(${JSON.stringify(middlewareEntryId)})`;
          return `export default ${hasMiddleware ? load : "undefined"};\n`;
        }
        if (id === `\0${middlewareEntryId}`) {
          const code = hasMiddleware && (await project.loadMiddlewareEntry());
          if (!code) return "export {};";
          return serverCode.compile(code, "next-middleware-entry.js", definesOf(project, "rsc"));
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
                  `  ${JSON.stringify(entryOf(route))}: ` +
                    `() => import(${JSON.stringify(routeEntryPrefix + index)}),`,
                ]
              : [],
          );
          return `export default {\n${entries.join("\n")}\n};\n`;
        }

        const route = routes[Number(id.slice(routeEntryPrefix.length + 1))]!;
        const entry = await project.loadRouteEntry(route);
        for (const file of entry.watchFiles) this.addWatchFile(file);
        // A generated module: Vite only replaces `define` keys in pre-bundled
        // dependencies.
        return serverCode.compile(
          entry.code,
          `${id.replace(/\W+/g, "-")}.js`,
          definesOf(project, "rsc"),
        );
      },
    },
    serverCode.plugin({ [environmentOf.rsc]: "rsc", [environmentOf.ssr]: "ssr" }),
    // The CSS of the app, as the stylesheets of a route.
    ...createStylesPlugins({
      getProject,
      environments: environmentOf,
      isServerCode: (file) => serverCode.isServerCode(file, "rsc"),
      routeOf: (entry) =>
        [...project.routes, ...project.componentRoutes].find(
          (route) => route.kind === "page" && entryOf(route) === entry,
        ),
      lists: routeKinds.map((kind) => `\0${routeLists[kind]}`),
    }),
    createCompilePlugin(
      getProject,
      (environment) => layers.find((layer) => environmentOf[layer] === environment),
      serverCode.isAppCode,
    ),
    ...layers.map((layer) => ({
      ...resolvers[layer].plugin(),
      applyToEnvironment: (environment: { name: string }) =>
        environment.name === environmentOf[layer],
    })),
  ];
}
