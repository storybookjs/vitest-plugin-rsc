import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { init as initCjsLexer, parse as parseCjs } from "cjs-module-lexer";
import type { NextBuild } from "../build.ts";
import { rscFlightCodec, type FlightEntry } from "../flight.ts";
import type { NextLayer } from "../project.ts";
import type { NextContext } from "./context.ts";

/**
 * What Next's build gives each layer: its compile-time constants and its
 * module aliases. And the exports of the Flight codec of the rsc layer.
 */
export async function layerTables(context: NextContext, build: NextBuild) {
  const {
    root,
    projectRequire,
    fail,
    config,
    appDir,
    pageExtensions,
    distDir,
    buildEnvironment,
    next,
  } = context;
  const { SUPPORTED_NATIVE_MODULES, compilerAliases, getDefineEnv, needsExperimentalReact } = next;
  const definesFor = (layer: NextLayer) => {
    const defines = getDefineEnv({
      isTurbopack: false,
      config,
      dev: false,
      distDir,
      projectPath: root,
      fetchCacheKeyPrefix: config.experimental.fetchCacheKeyPrefix,
      hasRewrites: false,
      isClient: layer === "browser",
      isEdgeServer: false,
      isNodeServer: layer !== "browser",
      clientRouterFilters: undefined,
      middlewareMatchers: undefined,
      rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
    });
    // Next's code takes the branches of its Node.js server with it.
    if (layer !== "browser" && defines["process.env.NEXT_RUNTIME"] !== '"nodejs"') {
      fail("`getDefineEnv()` does not define `process.env.NEXT_RUNTIME` as `nodejs`");
    }
    // Next's Node.js server renders to Node.js streams unless this is off:
    // a compile-time switch of its own. A browser has web streams.
    if (layer !== "browser") defines["process.env.__NEXT_USE_NODE_STREAMS"] = "false";
    return {
      ...(layer !== "browser" &&
        Object.fromEntries(
          Object.entries(buildEnvironment).map(([name, value]) => [
            `process.env.${name}`,
            JSON.stringify(value),
          ]),
        )),
      // Code strings; an option that is not set is undefined.
      ...Object.fromEntries(
        Object.entries(defines).filter((entry) => typeof entry[1] === "string"),
      ),
    };
  };

  // The tables Next gives webpack: the base one of a compilation, and on top of
  // it the ones its module rules apply per layer.
  const aliasesFor = (layer: NextLayer) => {
    const aliases: Record<string, string | false> = {
      "@opentelemetry/api$": "next/dist/compiled/@opentelemetry/api",
    };
    // The Node modules that Next's edge runtime has too. A browser has
    // none of them, so use the polyfills Next ships for its own client
    // bundles. The others that Next's server asks for are in plugin.ts.
    for (const name of SUPPORTED_NATIVE_MODULES) {
      if (name === "async_hooks") continue;
      aliases[`${name}$`] = aliases[`node:${name}$`] = `next/dist/compiled/${name}`;
    }
    if (layer !== "browser") {
      aliases.path$ = aliases["node:path$"] = "next/dist/compiled/path-browserify";
      // Next's route modules load a bundle of Next's own for Node.js. The
      // module that bundle is made of, as Next's edge build takes it.
      for (const kind of ["app-page", "app-route"]) {
        const file = `next/dist/server/route-modules/${kind}/module`;
        aliases[`${file}.compiled$`] = aliases[`${file}.compiled.js$`] = file;
      }
      // Next's own module for `react-dom/server` takes React's build for
      // Node.js streams by the runtime. The one for web streams, of the
      // `build` option. Not React's entry file for it, which brings React's
      // legacy server renderer along.
      for (const channel of ["", "-experimental"]) {
        aliases[`next/dist/build/webpack/alias/react-dom-server${channel}.js$`] =
          `next/dist/compiled/react-dom${channel}/cjs/react-dom-server.edge.${build}.js`;
      }
    }
    const base = compilerAliases.createWebpackAliases({
      distDir,
      isClient: layer === "browser",
      // Not the runtime: Next's name for a server compilation that takes the
      // ESM files of Next, and here also the builds of React for web
      // streams, which is what a browser has.
      isEdgeServer: layer !== "browser",
      dev: false,
      config,
      pagesDir: undefined,
      appDir,
      dir: root,
      reactProductionProfiling: false,
    });
    for (const [key, target] of Object.entries(base)) {
      // An array is a list of candidates: the user's file, then a fallback.
      aliases[key] = Array.isArray(target)
        ? (target.find((candidate) =>
            ["", ...pageExtensions.map((extension) => `.${extension}`)].some(
              (extension) => path.isAbsolute(candidate) && fs.existsSync(candidate + extension),
            ),
          ) ?? false)
        : target;
    }
    // The App Router does not run on the `react` of the project. Next brings
    // its own React, a different build of it per layer. The last two tables
    // are keyed by the public entry file, e.g. `<next>/link.js`.
    Object.assign(
      aliases,
      compilerAliases.createServerOnlyClientOnlyAliases(layer === "rsc"),
      compilerAliases.createVendoredReactAliases(
        needsExperimentalReact(config) ? "-experimental" : "",
        {
          layer: layer === "browser" ? "app-pages-browser" : layer,
          isBrowser: layer === "browser",
          isEdgeServer: layer !== "browser",
          reactProductionProfiling: false,
        },
      ),
      compilerAliases.createNextApiEsmAliases(),
      compilerAliases.createAppRouterApiAliases(layer === "rsc"),
    );
    // The plugin finds Next's Flight codec next to this one.
    if (typeof aliases["react-server-dom-webpack/server$"] !== "string") {
      fail("the alias tables have no `react-server-dom-webpack/server$`");
    }
    return aliases;
  };

  const aliases = {
    rsc: aliasesFor("rsc"),
    ssr: aliasesFor("ssr"),
    browser: aliasesFor("browser"),
  };

  // The Flight codec of the rsc layer is CommonJS. Its exports, the way Node
  // finds them for an `import` of it. Of a `module.exports = require()` in
  // each branch the lexer gives the last: the development build. The
  // production build has the same exports.
  await initCjsLexer();
  const exportsOf = (file: string): string[] => {
    const { exports, reexports } = parseCjs(fs.readFileSync(file, "utf8"));
    const requireFrom = createRequire(file);
    return [
      ...exports.filter((name) => name !== "__esModule"),
      ...reexports.flatMap((reexport) => exportsOf(requireFrom.resolve(reexport))),
    ];
  };
  const flightExports = {} as Record<FlightEntry, string[]>;
  for (const entry of Object.keys(rscFlightCodec) as FlightEntry[]) {
    const specifier = `react-server-dom-webpack/${entry}`;
    const target = aliases.rsc[`${specifier}$`];
    if (typeof target !== "string") return fail(`the alias tables have no \`${specifier}$\``);
    try {
      flightExports[entry] = [...new Set(exportsOf(projectRequire.resolve(target)))];
    } catch (error) {
      return fail(`${target} cannot be read (${(error as Error).message})`, error);
    }
  }

  return {
    defines: { rsc: definesFor("rsc"), ssr: definesFor("ssr"), browser: definesFor("browser") },
    aliases,
    flightExports,
  };
}
