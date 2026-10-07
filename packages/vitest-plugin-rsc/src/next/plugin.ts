import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformProxyExport } from "@vitejs/plugin-rsc/transforms";
import { createFilter, normalizePath, parseAstAsync, transformWithOxc, type Plugin } from "vite";
import type { TestProject } from "vitest/node";
import { createRunnerEnvironmentPlugins } from "../runner-environment.ts";
import { loadNextProject, type NextLayer, type NextProject, type NextRoute } from "./project.ts";
import { createServerCode, type ServerCodeOptions } from "./server-code.ts";

// Next compiles an App Router app into three layers, each with its own module
// graph: `rsc` (Server Components, the `react-server` React), `ssr` (the
// request handler and the HTML renderer, the regular React) and `browser`.
// Every layer is a Vite environment here, and all three run in the test's
// browser tab:
//
//   rsc     -> `client`        loaded by the page, next to the test
//   ssr     -> `next_ssr`      loaded through a module runner
//   browser -> `react_client`  loaded through a module runner
//
// Where Next's own bundler config says a module belongs to another layer, the
// module is bridged to that environment through `registry` (see registry.ts).
const environmentOf: Record<NextLayer, string> = {
  rsc: "client",
  ssr: "next_ssr",
  browser: "react_client",
};
const layers = Object.keys(environmentOf) as NextLayer[];

const registry = "globalThis.__vitest_plugin_rsc_next__";
// Shared by the layers: the routes and the `next.config`.
const manifestId = "virtual:vitest-plugin-rsc/next-manifest";
// The modules of the routes, per layer: one that lists them and one for each.
const appPagesId = "virtual:vitest-plugin-rsc/next-app-pages";
const appPagePrefix = "virtual:vitest-plugin-rsc/next-app-page/";
const edgeEntriesId = "virtual:vitest-plugin-rsc/next-edge-entries";
const edgeEntryPrefix = "virtual:vitest-plugin-rsc/next-edge-entry/";
// The edge entries of the route handlers. Next's bundler config puts a route
// handler in the rsc layer as a whole: `route.ts`, its route module and its
// request handler.
const routeHandlersId = "virtual:vitest-plugin-rsc/next-route-handlers";
const routeHandlerPrefix = "virtual:vitest-plugin-rsc/next-route-handler/";
const layerOfRouteModule = (id: string): NextLayer | undefined =>
  [appPagesId, routeHandlersId].some((listId) => id === `\0${listId}`) ||
  [appPagePrefix, routeHandlerPrefix].some((prefix) => id.startsWith(`\0${prefix}`))
    ? "rsc"
    : id === `\0${edgeEntriesId}` || id.startsWith(`\0${edgeEntryPrefix}`)
      ? "ssr"
      : undefined;
const bridgePrefix = "\0vitest-plugin-rsc/next-bridge/";
const emptyModuleId = "\0vitest-plugin-rsc/next-empty";
const vendoredFlight = (entry: string) => `@vitejs/plugin-rsc/vendor/react-server-dom/${entry}`;
// Vitest wants a file for a setup file. This is `vitest-plugin-rsc/next/setup`.
const setupFile = fileURLToPath(
  new URL(`./setup${path.extname(import.meta.url)}`, import.meta.url),
);

// A module that forwards its exports to an object in `registry`, which the
// runtime of the owning environment puts there. The lookup is deferred to the
// call, so a pre-bundled chunk can load before the owner has.
function bridgeModule(owner: string, names: string[]): string {
  return names
    .map((name) => `export const ${name} = (...args) => ${registry}.${owner}.${name}(...args);`)
    .join("\n");
}

// Next's renderer is bundler-agnostic, apart from the Flight codec it imports
// as `react-server-dom-webpack`. In the rsc layer that codec is Vite RSC's,
// through the adapters in rsc.ts.
const rscFlightBridges: Record<string, string> = {
  server: bridgeModule("flightServer", [
    "renderToReadableStream",
    "decodeReply",
    "decodeReplyFromAsyncIterable",
    "decodeAction",
    "decodeFormState",
    "createTemporaryReferenceSet",
    "registerServerReference",
    "registerClientReference",
    "createClientModuleProxy",
  ]),
  static: bridgeModule("flightStatic", ["prerender"]),
  client: bridgeModule("flightClient", [
    "createFromReadableStream",
    "encodeReply",
    "createTemporaryReferenceSet",
  ]),
};

// Next's server reference ids are 42 hex characters whose first byte says
// which arguments the function uses. Vite RSC's are `<module>#<export>`.
const serverReferenceInfoShim = (original: string) => `
import * as original from ${JSON.stringify(original)};
export const SERVER_REFERENCE_ID_LENGTH = original.SERVER_REFERENCE_ID_LENGTH;
export const omitUnusedArgs = original.omitUnusedArgs;
const isNextId = (id) => id.length === SERVER_REFERENCE_ID_LENGTH && /^[0-9a-f]+$/i.test(id);
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
function createLayerResolver(getProject: () => NextProject, layer: NextLayer) {
  let aliases: Alias[] | undefined;
  const normalized = new Map<string, string | false>();
  const files = new Map<string, string | null>();

  function nextFile(specifier: string): string | null {
    let file = files.get(specifier);
    if (file !== undefined) return file;
    const base = path.join(getProject().nextDir, specifier.slice("next/".length));
    file =
      [base, `${base}.js`, path.join(base, "index.js")].find(
        (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
      ) ?? null;
    files.set(specifier, file);
    return file;
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
      // way. `esmTwin()` does that for every layer, file by file.
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

  // Next ships its runtime twice: CommonJS in `next/dist`, ESM in
  // `next/dist/esm`. Its edge and Turbopack builds take the ESM one, and so
  // does Vite, which pre-bundles ESM best.
  function esmTwin(specifier: string): string | undefined {
    const match = /^next\/dist\/(?!esm\/|compiled\/)(.+)$/.exec(specifier);
    const twin = match && nextFile(`next/dist/esm/${match[1]}`);
    return twin ? toSpecifier(twin) : undefined;
  }

  function bridgeOf(source: string): string | undefined {
    if (layer === "rsc") {
      const flight = /^react-server-dom-webpack\/(server|static|client)(\.edge)?$/.exec(source);
      if (flight) return `${bridgePrefix}flight-${flight[1]}`;
    }
    if (source === "next/dist/esm/shared/lib/server-reference-info.js") {
      return `${bridgePrefix}server-reference-info`;
    }
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
      const commonJs: string = current.replace(/^next\/dist\/esm\//, "next/dist/");
      // Aliases are keyed by the CommonJS file.
      let next: string | false | undefined = applyAlias(current) ?? applyAlias(commonJs);
      if (next === undefined && current.startsWith("next/")) {
        // `x.compiled` picks a prebundled Node.js runtime of Next. On the
        // edge that is the plain module next to it.
        const plain: string = current.replace(/\.compiled(\.js)?$/, "");
        // A few files only exist in the CommonJS build.
        const file = nextFile(plain) ?? nextFile(commonJs);
        // The canonical spelling of a file, so that aliases keyed by file
        // match and an import maps to one pre-bundled dependency.
        if (file) next = esmTwin(toSpecifier(file)) ?? toSpecifier(file);
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
          return nextFile("next/dist/esm/shared/lib/server-reference-info.js");
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
        if (name === "server-reference-info") {
          return serverReferenceInfoShim("next/dist/esm/shared/lib/server-reference-info.js");
        }
        return rscFlightBridges[name.slice("flight-".length)];
      },
    };
  }

  return { normalize, nextFile, toSpecifier, plugin };
}

type LayerResolver = ReturnType<typeof createLayerResolver>;

// Not `next-themes`, which is next to it in a flat `node_modules`.
function isNextFile(project: NextProject, file: string): boolean {
  return normalizePath(file).startsWith(`${normalizePath(project.nextDir)}/`);
}

// Client Components of Next's own runtime: the layout router, the error
// boundaries, `next/link`. Vite RSC turns `"use client"` modules into client
// references while it serves source files, but dependencies are pre-bundled
// without that step, so do it here. The reference is the module's specifier,
// which the other two layers load as their own pre-bundled copy. (`/@id/` is
// how Vite spells a bare specifier where a URL is expected.)
function hasUseClientDirective(code: string): boolean {
  return /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*(["'])use client\1/.test(code);
}

function nextClientBoundaryPlugin(getProject: () => NextProject, resolver: LayerResolver): Plugin {
  return {
    name: "vitest-plugin-rsc:next-client-boundary",
    async transform(code, id) {
      const file = id.split("?")[0]!;
      if (!isNextFile(getProject(), file) || !hasUseClientDirective(code)) return;

      const specifier = resolver.toSpecifier(file);
      const ast = (await parseAstAsync(code)) as Parameters<typeof transformProxyExport>[0];
      const result = transformProxyExport(ast, {
        code,
        runtime: (name) =>
          `$$ReactServer.registerClientReference(` +
          `() => { throw new Error(${JSON.stringify(`${specifier}#${name} is a Client Component and cannot be called on the server`)}) }, ` +
          `${JSON.stringify(`/@id/${specifier}`)}, ${JSON.stringify(name)})`,
      });
      result.output.prepend(
        `import * as $$ReactServer from ${JSON.stringify(vendoredFlight("server.edge"))};\n`,
      );
      return { code: result.output.toString(), map: null };
    },
  };
}

function encodePage(page: string): string {
  return Buffer.from(page).toString("hex");
}

function decodePage(encoded: string): string {
  return Buffer.from(encoded, "hex").toString();
}

// Next's templates carry Turbopack-only import attributes. They mean nothing
// to Vite and are a syntax error in a browser.
function stripTurbopackTransitions(code: string): string {
  return code.replace(/\s+with\s*\{\s*['"]turbopack-transition['"]\s*:\s*['"][^'"]*['"]\s*\}/g, "");
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

function findNextImports(code: string): string[] {
  return [
    ...code.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(?:\/\*.*?\*\/\s*)?["'](next\/[^"'?!]+)["']/g,
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
    if (hasUseClientDirective(code)) {
      boundaries.add(specifier);
      continue;
    }
    for (const [, source] of code.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g,
    )) {
      const imported = source!.startsWith(".")
        ? resolver.toSpecifier(path.resolve(path.dirname(file), source!))
        : source!;
      const target = resolver.normalize(imported);
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
  // A route entry is a module of a server layer that is generated here: Vite
  // only replaces `define` keys in pre-bundled dependencies.
  const compileRouteEntry = (code: string, id: string, layer: NextLayer) =>
    serverCode.compile(code, `${id.replace(/\W+/g, "-")}.js`, definesOf(project, layer));
  const getProject = () => project;
  const resolvers = Object.fromEntries(
    layers.map((layer) => [layer, createLayerResolver(getProject, layer)]),
  ) as Record<NextLayer, LayerResolver>;
  const findRoute = (id: string, prefix: string): NextRoute => {
    const page = decodePage(id.slice(prefix.length + 1));
    const route = project.routes.find((candidate) => candidate.page === page);
    if (!route) throw new Error(`vitest-plugin-rsc: unknown Next.js app page ${page}`);
    return route;
  };

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
        const edgeEntryImports = async (kind: NextRoute["kind"]) => {
          const route = project.routes.find((candidate) => candidate.kind === kind);
          return route ? findNextImports(await project.loadEdgeEntry(route, "")) : [];
        };
        const entryImports = {
          rsc: [
            ...appPageEntries.flatMap(({ code }) => findNextImports(code)),
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
            // Next's files import names that only another layer's build of a
            // package has, in branches that layer never takes. webpack leaves
            // such an import undefined.
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
        if (
          source === manifestId ||
          source === appPagesId ||
          source === edgeEntriesId ||
          source === routeHandlersId ||
          source.startsWith(appPagePrefix) ||
          source.startsWith(edgeEntryPrefix) ||
          source.startsWith(routeHandlerPrefix)
        ) {
          return `\0${source}`;
        }
        // TODO: run Next's metadata loaders for these inline loader requests.
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

        // Vite's dependency scan follows the test's imports in every
        // environment, also into the modules of another layer.
        const layer = layerOfRouteModule(id);
        if (!layer) return;
        if (environmentOf[layer] !== this.environment.name) return "export default {};";

        const list = (
          [
            [appPagesId, appPagePrefix, "page"],
            [edgeEntriesId, edgeEntryPrefix, "page"],
            [routeHandlersId, routeHandlerPrefix, "route"],
          ] as const
        ).find(([listId]) => id === `\0${listId}`);
        if (list) {
          const [, prefix, kind] = list;
          const entries = project.routes
            .filter((route) => route.kind === kind)
            .map(
              ({ page }) =>
                `  ${JSON.stringify(page)}: () => import(${JSON.stringify(prefix + encodePage(page))}),`,
            );
          return `export default {\n${entries.join("\n")}\n};\n`;
        }

        // The rsc-layer module of a route, from Next's own app loader. For a
        // page: the loader tree with the page, its layouts and its boundaries.
        // For a route handler: the route module of its `route.ts`.
        if (id.startsWith(`\0${appPagePrefix}`)) {
          const route = findRoute(id, appPagePrefix);
          const { code, watchFiles } = await project.loadAppPageEntry(route);
          for (const file of watchFiles) this.addWatchFile(file);
          if (route.kind === "route") {
            // Next's template loads `route.ts` when the first request comes
            // in, with the `require` of its bundler. Here that is `import()`:
            // Next waits for a module that loads asynchronously.
            const loadUserland = /(\buserland: \(\)\s*=>\s*)require\(/;
            if (!loadUserland.test(code)) {
              throw new Error("vitest-plugin-rsc: unsupported Next.js app-route template");
            }
            return compileRouteEntry(
              stripTurbopackTransitions(code).replace(loadUserland, "$1import("),
              id,
              "rsc",
            );
          }
          return (
            `import { requireModule as __next_require__ } from "vitest-plugin-rsc/next/rsc";\n` +
            (await compileRouteEntry(
              stripTurbopackTransitions(code).replaceAll("__webpack_require__", "__next_require__"),
              id,
              "rsc",
            ))
          );
        }

        // The ssr-layer module of a route, from Next's own edge template:
        // `handler(Request)`. Its userland import is the rsc-layer module,
        // which lives in the other environment.
        if (id.startsWith(`\0${edgeEntryPrefix}`)) {
          const route = findRoute(id, edgeEntryPrefix);
          const userland = "virtual:vitest-plugin-rsc/next-userland";
          const code = await project.loadEdgeEntry(route, userland);
          const importUserland = `import * as pageMod from ${JSON.stringify(userland)};`;
          if (!code.includes(importUserland)) {
            throw new Error("vitest-plugin-rsc: unsupported Next.js edge-ssr-app template");
          }
          return compileRouteEntry(
            stripTurbopackTransitions(code).replace(
              importUserland,
              `const pageMod = ${registry}.appPages[${JSON.stringify(route.page)}];`,
            ),
            id,
            "ssr",
          );
        }

        // The request handler of a route handler, from Next's own edge
        // template: `handler(Request)`. Its userland import is the route
        // module, which is in this layer too.
        if (id.startsWith(`\0${routeHandlerPrefix}`)) {
          const route = findRoute(id, routeHandlerPrefix);
          const code = await project.loadEdgeEntry(route, appPagePrefix + encodePage(route.page));
          return compileRouteEntry(stripTurbopackTransitions(code), id, "rsc");
        }
      },
    },
    {
      // The route entry binds Next's renderer to its bundler. Bind it to this
      // one instead: see app-page-entrypoint.ts.
      name: "vitest-plugin-rsc:next-app-page-entrypoint",
      enforce: "pre",
      applyToEnvironment: (environment) => environment.name === environmentOf.rsc,
      resolveId(source, importer, options) {
        if (
          resolvers.rsc.normalize(source) !== "next/dist/esm/build/templates/app-page-runtime.js"
        ) {
          return;
        }
        return this.resolve("vitest-plugin-rsc/next/app-page-entrypoint", importer, {
          ...options,
          skipSelf: true,
        });
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
