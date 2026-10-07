import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasDirective, transformDirectiveProxyExport } from "@vitejs/plugin-rsc/transforms";
import { createFilter, normalizePath, parseAst, parseAstAsync, type Plugin } from "vite";
import type { TestProject } from "vitest/node";
import { createRunnerEnvironmentPlugins } from "../runner-environment.ts";
import { flightBridge, type FlightEntry } from "./flight.ts";
import { loadNextProject, type NextLayer, type NextProject } from "./project.ts";
import { createServerCode, type ServerCodeOptions } from "./server-code.ts";

// Each layer of Next is a Vite environment, and all three run in the test's
// tab (docs/next-routes.md). Where Next's own bundler config says a module
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
// The modules of the routes, per layer: one that lists them, and one for each
// by its place in `project.routes`. A page has a module in the rsc layer and
// its request handler in the ssr layer. Next's bundler config puts a route
// handler in the rsc layer as a whole: its route module, which is with the
// modules of the pages, and its request handler.
const virtual = (name: string) => `virtual:vitest-plugin-rsc/next-${name}`;
const routeModules = [
  { list: virtual("app-pages"), prefix: virtual("app-page/"), layer: "rsc", kind: "page" },
  { list: virtual("edge-entries"), prefix: virtual("edge-entry/"), layer: "ssr", kind: "page" },
  {
    list: virtual("route-handlers"),
    prefix: virtual("route-handler/"),
    layer: "rsc",
    kind: "route",
  },
] as const;
const [appPages, edgeEntries] = routeModules;
const isRouteModule = (id: string) => (modules: (typeof routeModules)[number]) =>
  id === modules.list || id.startsWith(modules.prefix);
const bridgePrefix = "\0vitest-plugin-rsc/next-bridge/";
const emptyModuleId = "\0vitest-plugin-rsc/next-empty";
const serverReferenceInfo = "next/dist/esm/shared/lib/server-reference-info.js";
const vendoredFlight = (entry: string) => `@vitejs/plugin-rsc/vendor/react-server-dom/${entry}`;
// Vitest wants a file path for a setup file, not a package specifier.
const setupFile = fileURLToPath(
  new URL(`./setup${path.extname(import.meta.url)}`, import.meta.url),
);

// Next's server reference ids are 42 hex characters whose first byte says
// which arguments the function uses. Vite RSC's are `<module>#<export>`. The
// rest of the module stays as it is.
const serverReferenceInfoShim = `
import * as original from ${JSON.stringify(serverReferenceInfo)};
export * from ${JSON.stringify(serverReferenceInfo)};
const isNextId = (id) => id.length === original.SERVER_REFERENCE_ID_LENGTH && /^[0-9a-f]+$/i.test(id);
export function mightBeServerReferenceId(id) {
  return typeof id === "string" && id.length > 0;
}
export function extractInfoFromServerReferenceId(id) {
  return isNextId(id)
    ? original.extractInfoFromServerReferenceId(id)
    : { type: "server-action", usedArgs: [true, true, true, true, true, true], hasRestArgs: true };
}
`;

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
    const base = path.join(getProject().nextDir, specifier.slice("next/".length));
    return [base, `${base}.js`, path.join(base, "index.js")].find((candidate) =>
      fs.statSync(candidate, { throwIfNoEntry: false })?.isFile(),
    );
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
      // Next's edge compilation sends its directories to its ESM build this
      // way. `normalize()` does that for every layer, file by file.
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
      if (source === key) return target;
      if (!exact && source.startsWith(`${key}/`)) {
        return target && target + source.slice(key.length);
      }
    }
  }

  function bridgeOf(source: string): string | undefined {
    if (layer === "rsc") {
      const flight = /^react-server-dom-webpack\/(server|static|client)(\.edge)?$/.exec(source);
      if (flight) return `${bridgePrefix}flight-${flight[1]}`;
    }
    if (source === serverReferenceInfo) return `${bridgePrefix}server-reference-info`;
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
        const { flightExports, version } = getProject();
        const entry = name.slice("flight-".length) as FlightEntry;
        return flightBridge(entry, flightExports[entry], version, registry);
      },
    };
  }

  return { normalize, nextFile, toSpecifier, plugin };
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
      // and a browser that do not share a tab.)
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

// Follows the imports of Next's rsc-layer runtime up to each `"use client"`
// module: the modules a Flight payload can refer to. The other two layers
// pre-bundle them up front, or Vite would discover them mid-test and reload
// the page. This is what Next's client entry plugin does for its own bundles.
function findClientBoundaries(resolver: LayerResolver, roots: string[]): string[] {
  const boundaries = new Set<string>();
  const seen = new Set<string>();
  const queue = [...roots];

  for (const specifier of queue) {
    if (seen.has(specifier) || !specifier.startsWith("next/dist/esm/")) continue;
    seen.add(specifier);
    const file = resolver.nextFile(specifier);
    if (!file) continue;
    const code = fs.readFileSync(file, "utf8");
    if (code.includes("use client") && hasDirective(parseAst(code).body, "use client")) {
      boundaries.add(specifier);
      continue;
    }
    for (const source of findImports(code)) {
      const target = resolver.normalize(
        source.startsWith(".")
          ? resolver.toSpecifier(path.resolve(path.dirname(file), source))
          : source,
      );
      if (target) queue.push(target);
    }
  }
  return [...boundaries];
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
    "next/dist/server/app-render/manifests-singleton",
    "next/dist/server/lib/incremental-cache",
    "next/dist/server/lib/incremental-cache/tags-manifest.external",
    "next/dist/server/web/get-edge-preview-props",
    "next/dist/shared/lib/router/utils/route-regex",
    "next/dist/shared/lib/router/utils/route-matcher",
    "next/dist/shared/lib/router/utils/sorted-routes",
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

export type VitestPluginNextOptions = ServerCodeOptions;

export function vitestPluginNext(options: VitestPluginNextOptions = {}): Plugin[] {
  let project: NextProject;
  const serverCode = createServerCode(registry, options);
  const getProject = () => project;
  const resolvers = Object.fromEntries(
    layers.map((layer) => [layer, createLayerResolver(getProject, layer)]),
  ) as Record<NextLayer, LayerResolver>;

  return [
    ...createRunnerEnvironmentPlugins(environmentOf.ssr),
    {
      name: "vitest-plugin-rsc:next",
      enforce: "pre",
      async config(config) {
        project = await loadNextProject(path.resolve(config.root ?? process.cwd()));
        serverCode.configure(project.root);

        // What the route entries import from Next. The request handler is
        // one template per kind of route. The loader tree differs: which of
        // Next's builtin boundaries a route needs depends on what the app
        // leaves out.
        const appPageEntries = await Promise.all(
          project.routes.map((candidate) => project.loadAppPageEntry(candidate)),
        );
        const edgeEntryImports = async (kind: "page" | "route") => {
          const route = project.routes.find((candidate) => candidate.kind === kind);
          return route ? findImports(await project.loadEdgeEntry(route, "")) : [];
        };
        const entryImports = {
          rsc: [
            ...appPageEntries.flatMap(({ code }) => findImports(code)),
            ...(await edgeEntryImports("route")),
          ],
          ssr: await edgeEntryImports("page"),
        };
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
          ...entryImports.rsc,
          ...apiImports("rsc"),
          ...runtimeImports.rsc,
        ]);
        const clientBoundaries = findClientBoundaries(resolvers.rsc, rscInclude);
        const include: Record<NextLayer, string[]> = {
          rsc: rscInclude,
          ssr: toInclude("ssr", [
            ...entryImports.ssr,
            ...apiImports("ssr"),
            ...runtimeImports.ssr,
            ...clientBoundaries,
          ]),
          browser: toInclude("browser", [
            ...apiImports("browser"),
            ...runtimeImports.browser,
            ...clientBoundaries,
          ]),
        };

        const appEntries = normalizePath(path.join(project.appDir, "**/*.{js,jsx,ts,tsx}"));
        const optimizeDeps = (layer: NextLayer) => ({
          include: include[layer],
          rolldownOptions: {
            plugins: [
              resolvers[layer].plugin(),
              ...(layer === "rsc" ? [nextClientBoundaryPlugin(getProject, resolvers.rsc)] : []),
              ...(layer === "browser" ? [] : [serverCode.optimizerPlugin(layer)]),
            ],
            // A package can import what only another layer's build of a module
            // has, like `useRouter` of `next/navigation` in the rsc layer (the
            // notes demo). webpack leaves such an import undefined.
            shimMissingExports: true,
            // Vite only defines NODE_ENV for dependencies.
            transform: {
              define: {
                ...definesOf(project, layer),
                ...(layer !== "browser" && serverCode.cacheKey),
              },
            },
          },
        });

        // Before the project's own setup files: one that imports a module of
        // Next's server needs the server's platform to be there.
        const test = ((config as { test?: { setupFiles?: string | string[] } }).test ??= {});
        test.setupFiles = [setupFile, ...[test.setupFiles ?? []].flat()];

        return {
          environments: {
            [environmentOf.rsc]: {
              optimizeDeps: {
                ...optimizeDeps("rsc"),
                // A route loads when it is first requested. Scan the app up
                // front, or Vite finds the dependencies of a page mid-test
                // and reloads the tab.
                entries: [appEntries],
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
      // An app with metadata files still runs, as it would without them: say
      // which files are left out. Not `favicon.ico`, which only adds a
      // `<link rel="icon">`, and which every new app has.
      configResolved(config) {
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
      configureVitest({ project: { config: test } }: { project: TestProject }) {
        const setupFiles = new Set(test.setupFiles.map((file) => normalizePath(file)));
        // `test.include`, matched the way Vitest does. Not `includeSource`:
        // a file with tests in its source is a file of the app.
        const isIncluded = createFilter(test.include, test.exclude, {
          resolve: test.dir || test.root,
        });
        serverCode.addTestFiles((file) => setupFiles.has(file) || isIncluded(file));
      },
      resolveId(source) {
        if (source === manifestId || routeModules.some(isRouteModule(source))) return `\0${source}`;
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
            `export const routes = ${JSON.stringify(routes)};\n` +
            `export const nextConfig = ${JSON.stringify(project.config)};\n`
          );
        }

        const modules = routeModules.find(isRouteModule(id.slice(1)));
        if (!id.startsWith("\0") || !modules) return;
        const { list, prefix, layer, kind } = modules;
        // Vite's dependency scan follows the test's imports in every
        // environment, also into the modules of another layer.
        if (environmentOf[layer] !== this.environment.name) return "export default {};";

        if (id === `\0${list}`) {
          const entries = project.routes.flatMap((route, index) =>
            route.kind === kind
              ? [
                  `  ${JSON.stringify(route.page)}: () => import(${JSON.stringify(prefix + index)}),`,
                ]
              : [],
          );
          return `export default {\n${entries.join("\n")}\n};\n`;
        }

        const index = id.slice(prefix.length + 1);
        const route = project.routes[Number(index)]!;
        let code: string;
        if (modules === appPages) {
          const entry = await project.loadAppPageEntry(route);
          for (const file of entry.watchFiles) this.addWatchFile(file);
          code = entry.code;
        } else {
          // The page a request handler serves is in the other environment.
          // The route module of a route handler is in this one.
          code = await project.loadEdgeEntry(
            route,
            modules === edgeEntries
              ? `${registry}.appPages[${JSON.stringify(route.page)}]`
              : appPages.prefix + index,
          );
        }
        // A generated module: Vite only replaces `define` keys in pre-bundled
        // dependencies.
        return serverCode.compile(code, `${id.replace(/\W+/g, "-")}.js`, definesOf(project, layer));
      },
    },
    serverCode.plugin({ [environmentOf.rsc]: "rsc", [environmentOf.ssr]: "ssr" }),
    ...layers.map((layer) => ({
      ...resolvers[layer].plugin(),
      applyToEnvironment: (environment: { name: string }) =>
        environment.name === environmentOf[layer],
    })),
  ];
}
