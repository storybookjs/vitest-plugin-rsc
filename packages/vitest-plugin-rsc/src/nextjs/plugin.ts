import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasDirective, transformDirectiveProxyExport } from "@vitejs/plugin-rsc/transforms";
import { createFilter, normalizePath, parseAst, parseAstAsync, type Plugin } from "vite";
import type { TestProject, Vitest } from "vitest/node";
import { createRunnerEnvironmentPlugins } from "../runner-environment.ts";
import { flightBridge, type FlightEntry } from "./flight.ts";
import { createCompilePlugin, createDependencyCompilePlugin } from "./compile.ts";
import { loadNextProject, type NextLayer, type NextProject } from "./project.ts";
import { createServerCode, type ServerCodeOptions } from "./server-code.ts";
import { createRelatedRoutes } from "./related.ts";
import { createRouteWatch, routeLoadedCommand, type RouteKind } from "./watch.ts";

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
// by its place in `project.routes`. A page has a module in the rsc layer, and
// the ssr layer handles its requests (node-server.ts). Next's bundler config
// puts a route handler in the rsc layer as a whole: its route module, which
// is with the modules of the pages and has its request handler. The routes
// of a node are pages too, listed after the ones of the app.
const virtual = (name: string) => `virtual:vitest-plugin-rsc/next-${name}`;
const routeModules = [
  { list: virtual("app-pages"), prefix: virtual("app-page/"), layer: "rsc", kind: "page" },
  {
    list: virtual("route-handlers"),
    prefix: virtual("route-handler/"),
    layer: "rsc",
    kind: "route",
  },
] as const;
const [appPages] = routeModules;
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

// The modules of Next's Node.js server that reach for what a tab does not
// have, and the Node modules they import. Each of Next's is one module that
// Next itself keeps apart.
const forward = (owner: string, names: string[]) =>
  names
    .map((name) => `export const ${name} = (...args) => ${registry}.${owner}.${name}(...args);`)
    .join("\n");
const nodeStream = `
import stream from "next/dist/compiled/stream-browserify";
const { Readable } = stream;
// Next's polyfill is an older \`stream\`, without the bridge to web streams.
Readable.toWeb ??= (readable) =>
  new ReadableStream({
    start(controller) {
      readable.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
      readable.on("end", () => controller.close());
      readable.on("error", (error) => controller.error(error));
    },
    cancel: (reason) => void readable.destroy(reason),
  });
Readable.fromWeb ??= (web) => {
  const reader = web.getReader();
  return new Readable({
    read() {
      reader.read().then(
        ({ done, value }) => void this.push(done ? null : Buffer.from(value)),
        (error) => this.destroy(error),
      );
    },
  });
};
export default stream;
export const { Writable, Duplex, Transform, PassThrough, Stream, finished, pipeline } = stream;
export { Readable };
`;
const nodeBridges: Record<string, string> = {
  "node-stream": nodeStream,
  "node-stream-promises": `
import stream from ${JSON.stringify(`${bridgePrefix}node-stream`)};
const isStream = (value) => value && (typeof value.pipe === "function" || typeof value.write === "function");
export const pipeline = (...streams) => {
  // The options, with a signal: the request ends with the test here.
  if (!isStream(streams.at(-1))) streams.pop();
  return new Promise((resolve, reject) =>
    stream.pipeline(...streams, (error) => (error ? reject(error) : resolve())),
  );
};
export const finished = (target) =>
  new Promise((resolve, reject) => stream.finished(target, (error) => (error ? reject(error) : resolve())));
`,
  "react-server-node": forward("flightServer", [
    "createTemporaryReferenceSet",
    "decodeReply",
    "decodeReplyFromBusboy",
    "decodeAction",
    "decodeFormState",
  ]),
  "load-manifest":
    forward("node", [
      "loadManifest",
      "evalManifest",
      "loadManifestFromRelativePath",
      "evalManifestFromRelativePath",
    ]) + `\nexport const clearManifestCache = () => false;`,
  // \`instrumentation.ts\` is not run yet.
  instrumentation: `
export async function getInstrumentationModule() {}
export async function instrumentationOnRequestError() {}
export async function ensureInstrumentationRegistered() {}
`,
  // What Next's Node.js server patches when it starts: \`console\`, \`Date\`,
  // \`Math.random\`, \`crypto\`, \`setImmediate\`, the handlers of its process.
  // The tab is the test's too. (Cache Components reads these patches.)
  "node-environment": `export const installProcessErrorHandlers = () => {};`,
  // Next's bundle for Node.js brings React for both server layers, and its
  // route module hands them to those patches. Here a layer has its own.
  "vendored-react": `export const React = undefined;`,
  // For the server code of the app. Next's own importer of it is replaced below.
  "node-timers": `
export const setImmediate = (...args) => ${registry}.setImmediate(...args);
export const clearImmediate = (...args) => ${registry}.clearImmediate(...args);
export const setTimeout = (...args) => globalThis.setTimeout(...args);
export const clearTimeout = (...args) => globalThis.clearTimeout(...args);
export const setInterval = (...args) => globalThis.setInterval(...args);
export const clearInterval = (...args) => globalThis.clearInterval(...args);
export default { setImmediate, clearImmediate, setTimeout, clearTimeout, setInterval, clearInterval };
`,
  // Of Node's \`crypto\`, what Next's server uses where it has no Web Crypto
  // branch: the ids of nanoid.
  "node-crypto": `
const web = globalThis.crypto;
export const webcrypto = web;
export const randomUUID = () => web.randomUUID();
export const randomFillSync = (buffer) => (web.getRandomValues(buffer), buffer);
export const randomBytes = (size) => web.getRandomValues(Buffer.alloc(size));
export const getRandomValues = (buffer) => web.getRandomValues(buffer);
// Web Crypto hashes asynchronously. Next's cache keys are SHA-256, at once.
const K = new Uint32Array(64);
for (let n = 2, i = 0; i < 64; n++) {
  let prime = true;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
  if (prime) K[i++] = (Math.cbrt(n) % 1) * 2 ** 32;
}
function sha256(bytes) {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const length = bytes.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  const out = new Uint8Array(32);
  h.forEach((word, i) => new DataView(out.buffer).setUint32(i * 4, word));
  return out;
}
export const createHash = (algorithm) => {
  if (!/^sha-?256$/i.test(algorithm)) {
    throw new Error("vitest-plugin-rsc: node:crypto's createHash(" + JSON.stringify(algorithm) + ") is not there in a tab");
  }
  const chunks = [];
  const hash = {
    update(data) {
      chunks.push(typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength));
      return hash;
    },
    digest(encoding) {
      const digest = Buffer.from(sha256(Buffer.concat(chunks)));
      return encoding ? digest.toString(encoding) : digest;
    },
  };
  return hash;
};
export default { webcrypto, randomUUID, randomFillSync, randomBytes, getRandomValues, createHash };
`,
  // Next patches the global \`setImmediate\` when this loads, to run the
  // stages of a prerender in one task. That is for Cache Components, and the
  // tab's globals are the page's too.
  "fast-set-immediate": `
export const unpatchedSetImmediate = (...args) => ${registry}.setImmediate(...args);
export function DANGEROUSLY_runPendingImmediatesAfterCurrentTask() {
  throw new Error("vitest-plugin-rsc: Next's staged rendering, for Cache Components, is not supported.");
}
export function expectNoPendingImmediates() {}
`,
  // Next asks Node.js for the source map of a file in a stack. Vite has them.
  "node-module": `
export const findSourceMap = () => undefined;
export default { findSourceMap };
`,
  "ssr-app-page-module": `
export const AppPageRouteModule = new Proxy(class {}, {
  construct: (_, args) => new ${registry}.ssr.AppPageRouteModule(...args),
});
`,
  // Next's cache keeps its entries in memory. With this it finds no file.
  "node-fs": `
const missing = () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); };
export const nodeFs = {
  existsSync: () => false,
  readFile: async () => missing(),
  readFileSync: missing,
  stat: async () => missing(),
  writeFile: async () => {},
  mkdir: async () => {},
};
`,
};
const nodeBridgeOf: [RegExp, string][] = [
  [/^(node:)?stream$/, "node-stream"],
  [/^(node:)?stream\/promises$/, "node-stream-promises"],
  [/^next\/dist\/(esm\/)?server\/app-render\/react-server\.node(\.js)?$/, "react-server-node"],
  [/^next\/dist\/(esm\/)?server\/load-manifest\.external(\.js)?$/, "load-manifest"],
  [
    /^next\/dist\/(esm\/)?server\/lib\/router-utils\/instrumentation-globals\.external(\.js)?$/,
    "instrumentation",
  ],
  [/^next\/dist\/(esm\/)?server\/lib\/node-fs-methods(\.js)?$/, "node-fs"],
  [
    /^next\/dist\/(esm\/)?server\/node-environment(-extensions\/(error-inspect|console-file|console-exit|console-dim\.external|unhandled-rejection\.external|random|date|web-crypto|node-crypto|process-error-handlers))?(\.js)?$/,
    "node-environment",
  ],
  // What sets up a Node.js process for Next: the patches above, a hook on
  // \`require\`, a \`crypto\` global.
  [/^next\/dist\/(esm\/)?build\/adapter\/setup-node-env\.external(\.js)?$/, "node-environment"],
  [/^(node:)?module$/, "node-module"],
  [
    /^next\/dist\/(esm\/)?server\/node-environment-extensions\/fast-set-immediate\.external(\.js)?$/,
    "fast-set-immediate",
  ],
  [/^(node:)?timers$/, "node-timers"],
  [/^(node:)?crypto$/, "node-crypto"],
  [
    /^next\/dist\/(esm\/)?server\/route-modules\/app-page\/vendored\/(rsc|ssr)\/entrypoints(\.js)?$/,
    "vendored-react",
  ],
];

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
    if (layer !== "browser") {
      const bridge = nodeBridgeOf.find(([pattern]) => pattern.test(source));
      if (bridge) return bridgePrefix + bridge[1];
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
        if (name in nodeBridges) return nodeBridges[name];
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
    // ssr.ts, for the server in front of the app
    "next/dist/client/components/app-router-headers",
    "next/dist/server/lib/is-rsc-request",
    "next/dist/server/web/utils",
    // node-server.ts
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

export type VitestPluginNextOptions = ServerCodeOptions;

export function vitestPluginNext(options: VitestPluginNextOptions = {}): Plugin[] {
  let project: NextProject;
  const serverCode = createServerCode(registry, options);
  const getProject = () => project;
  // `vitest --changed` knows the routes a test file loaded, see related.ts.
  // The modules of the routes, for what follows.
  const lists = routeModules.map(({ list }) => `\0${list}`);
  const modulesOf = (kind: RouteKind, page: string) =>
    [...project.routes, ...project.componentRoutes].flatMap((route, index) =>
      route.kind === kind && entryOf(route) === page
        ? routeModules
            .filter((modules) => modules.layer === "rsc")
            .map(({ prefix }) => `\0${prefix}${index}`)
        : [],
    );
  const relatedRoutes = createRelatedRoutes({
    environments: layers.map((layer) => environmentOf[layer]),
    lists,
    appDir: () => project.appDir,
    // What Next reads next to the `app` directory, in the root or in `src`,
    // and the mocks of packages, which Vitest reads from the root.
    shared: () => {
      const mocks = path.join(project.root, "__mocks__");
      return [
        ...nextFiles(),
        ...(fs.existsSync(mocks)
          ? (fs.readdirSync(mocks, { recursive: true }) as string[])
              .map((name) => path.join(mocks, name))
              .filter((file) => fs.statSync(file).isFile())
          : []),
      ];
    },
  });
  const nextFiles = () =>
    [...new Set([project.root, path.dirname(project.appDir)])].flatMap((directory) =>
      fs
        .readdirSync(directory)
        .filter((name) =>
          /^(next\.config|middleware|proxy|instrumentation(-client)?)\.\w+$|^[tj]sconfig(\.[\w-]+)?\.json$|^\.env(\.|$)/.test(
            name,
          ),
        )
        .map((name) => path.join(directory, name)),
    );
  // Watch mode runs the test files that loaded a route, see watch.ts.
  const routeWatch = createRouteWatch({ environment: environmentOf.rsc, lists, modulesOf });
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
        // The route of a node has Next's own global error page, which an app
        // with one of its own does not import.
        const appPageEntries = await Promise.all(
          [...project.routes, ...project.componentRoutes.slice(0, 1)].map((candidate) =>
            project.loadAppPageEntry(candidate),
          ),
        );
        const entryImports = {
          rsc: [
            ...appPageEntries.flatMap(({ code }) => findImports(code)),
            ...findImports((await project.loadMiddlewareEntry()) ?? ""),
          ],
          // What node-server.ts imports is in `runtimeImports`.
          ssr: [] as string[],
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
          ssr: [
            ...toInclude("ssr", [
              ...entryImports.ssr,
              ...apiImports("ssr"),
              ...runtimeImports.ssr,
              ...clientBoundaries,
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
        // for a `<style jsx>`: not an import the dependency scan finds.
        const dependenciesOfNext = (layer: NextLayer) =>
          Object.entries(project.aliases[layer]).flatMap(([key, target]) =>
            key.endsWith("$") && target && resolvers[layer].isDependencyOfNext(target)
              ? [`next > ${key.slice(0, -1)}`]
              : [],
          );

        const appEntries = normalizePath(path.join(project.appDir, "**/*.{js,jsx,ts,tsx}"));
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

        // Before the project's own setup files: one that imports a module of
        // Next's server needs the server's platform to be there.
        const test = ((
          config as {
            test?: {
              setupFiles?: string | string[];
              browser?: { commands?: Record<string, unknown> };
            };
          }
        ).test ??= {});
        test.setupFiles = [setupFile, ...[test.setupFiles ?? []].flat()];
        // Vitest lists the commands for the tab when the project starts.
        ((test.browser ??= {}).commands ??= {})[routeLoadedCommand] = (
          context: { testPath: string | undefined },
          kind: RouteKind | "action",
          page: string,
        ) => {
          // A Server Action of a module that no page of the test imports: the
          // id of an action starts with its module.
          if (kind === "action") return relatedRoutes.loaded(context.testPath, [page]);
          routeWatch.command(context, kind, page);
          relatedRoutes.loaded(context.testPath, modulesOf(kind, page));
        };

        return {
          // Next's build resolves the `paths` of the tsconfig.
          resolve: { tsconfigPaths: config.resolve?.tsconfigPaths ?? true },
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
      configureVitest({ vitest, project: testProject }: { vitest: Vitest; project: TestProject }) {
        const test = testProject.config;
        routeWatch.start(vitest, testProject);
        const setupFiles = new Set(test.setupFiles.map((file) => normalizePath(file)));
        // `test.include`, matched the way Vitest does. Not `includeSource`:
        // a file with tests in its source is a file of the app.
        const isIncluded = createFilter(test.include, test.exclude, {
          resolve: test.dir || test.root,
        });
        serverCode.addTestFiles((file) => setupFiles.has(file) || isIncluded(file));
        relatedRoutes.start(vitest, testProject, isIncluded);
      },
      // Vitest looks up the test files of a changed file in this environment.
      transform(_, id) {
        return relatedRoutes.lookup(this.environment.name, id.split("?")[0]!);
      },
      resolveId(source) {
        if (source === manifestId || routeModules.some(isRouteModule(source))) return `\0${source}`;
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
            `export const routesManifest = ${JSON.stringify(project.routesManifest)};\n`
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

        const modules = routeModules.find(isRouteModule(id.slice(1)));
        if (!id.startsWith("\0") || !modules) return;
        const { list, prefix, layer, kind } = modules;
        // Vite's dependency scan follows the test's imports in every
        // environment, also into the modules of another layer.
        if (environmentOf[layer] !== this.environment.name) return "export default {};";
        const routes = [...project.routes, ...project.componentRoutes];

        if (id === `\0${list}`) {
          const entries = routes.flatMap((route, index) =>
            route.kind === kind
              ? [
                  `  ${JSON.stringify(entryOf(route))}: () => import(${JSON.stringify(prefix + index)}),`,
                ]
              : [],
          );
          return `export default {\n${entries.join("\n")}\n};\n`;
        }

        const index = id.slice(prefix.length + 1);
        const route = routes[Number(index)]!;
        let code: string;
        if (modules === appPages) {
          const entry = await project.loadAppPageEntry(route);
          for (const file of entry.watchFiles) this.addWatchFile(file);
          code = entry.code;
        } else {
          // The route module that Next's app loader makes of a route handler
          // has its request handler for Node.js.
          code = `export * from ${JSON.stringify(appPages.prefix + index)};\n`;
        }
        // A generated module: Vite only replaces `define` keys in pre-bundled
        // dependencies.
        return serverCode.compile(code, `${id.replace(/\W+/g, "-")}.js`, definesOf(project, layer));
      },
    },
    serverCode.plugin({ [environmentOf.rsc]: "rsc", [environmentOf.ssr]: "ssr" }),
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
