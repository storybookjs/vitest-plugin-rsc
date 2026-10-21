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
    nextDir,
    projectRequire,
    fail,
    config,
    appDir,
    pageExtensions,
    distDir,
    buildEnvironment,
    next,
  } = context;
  const {
    SUPPORTED_NATIVE_MODULES,
    compilerAliases,
    getDefineEnv,
    getNextPublicEnvironmentVariables,
    getNextConfigEnv,
    needsExperimentalReact,
  } = next;
  const definesFor = (layer: NextLayer) => {
    // The `NEXT_PUBLIC_*` names of the host's process and `env` of
    // `next.config`, which Next inlines: here they are in the page's
    // `process.env`, from the env of the run (env.ts). The host's values are
    // not the page's, and a change of a value would bundle the dependencies
    // again, as their constants are in the key of the optimizer's cache.
    const envKeys = new Set(
      Object.keys({ ...getNextPublicEnvironmentVariables(), ...getNextConfigEnv(config) }),
    );
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
    // The project from the working directory, which `next build` runs in. So
    // that the route modules do not depend on where a run starts, like a
    // build from the root of a monorepo. Next's server joins it to its own
    // working directory, which the plugin has as `/`.
    if ("process.env.__NEXT_RELATIVE_PROJECT_DIR" in defines) {
      defines["process.env.__NEXT_RELATIVE_PROJECT_DIR"] = '""';
    }
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
        Object.entries(defines).filter(
          ([key, value]) => typeof value === "string" && !envKeys.has(key),
        ),
      ),
    };
  };

  // The entries of the app's code that are not Next's own: see below.
  const appAliases: Record<NextLayer, Record<string, string>> = { rsc: {}, ssr: {}, browser: {} };

  // The tables Next gives webpack: the base one of a compilation, and on top of
  // it the ones its module rules apply per layer.
  const aliasesFor = (layer: NextLayer) => {
    const aliases: Record<string, string | false> = {
      "@opentelemetry/api$": "next/dist/compiled/@opentelemetry/api",
    };
    // The browser layer gets the four modules of Node.js that Next's edge
    // runtime has, as before, from Next's polyfills, and nothing for the
    // rest. The server layers get every module of Node.js from the package
    // (nextjs/node-builtins.ts).
    if (layer === "browser") {
      for (const name of SUPPORTED_NATIVE_MODULES) {
        if (name === "async_hooks") continue;
        aliases[`${name}$`] = aliases[`node:${name}$`] = `next/dist/compiled/${name}`;
      }
    } else {
      // Next's route modules load a bundle of Next's own for Node.js. The
      // module that bundle is made of, as Next's edge build takes it.
      for (const kind of ["app-page", "app-route"]) {
        const file = `next/dist/server/route-modules/${kind}/module`;
        aliases[`${file}.compiled$`] = aliases[`${file}.compiled.js$`] = file;
      }
      // Next's own module for `react-dom/server`, the edge table's entry that
      // Next's renderer gets (see `appAliases` below), takes React's build for Node.js by the runtime. The
      // one for web streams, of the `build` option, as on Next's edge
      // runtime. Not React's entry file for it, which brings React's legacy
      // server renderer along.
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
    const channel = needsExperimentalReact(config) ? "-experimental" : "";
    const vendoredReactAliases = (isEdgeServer: boolean) =>
      compilerAliases.createVendoredReactAliases(channel, {
        layer: layer === "browser" ? "app-pages-browser" : layer,
        isBrowser: layer === "browser",
        isEdgeServer,
        reactProductionProfiling: false,
      });
    Object.assign(
      aliases,
      compilerAliases.createServerOnlyClientOnlyAliases(layer === "rsc"),
      // The server layers run Next's Node.js runtime, loaded from Next's
      // ESM files, so their tables are Next's for its edge runtime: the
      // table for Node.js loads React from Next's one bundle of it for both
      // server layers, `vendored/(rsc|ssr)/entrypoints`, which
      // node-platform.ts stands in for, as each layer has a React of its
      // own.
      vendoredReactAliases(layer !== "browser"),
      compilerAliases.createNextApiEsmAliases(),
      compilerAliases.createAppRouterApiAliases(layer === "rsc"),
    );
    // `react-dom/server` and `react-dom/static` of the ssr layer, which differ
    // by runtime and which Next's renderer imports too: Next's own files keep
    // the edge table's, and the app's code, its files and its packages, gets
    // the Node.js one, as a route on Node.js does. The plugin's resolver
    // picks by the importer (plugin.ts). Next's renderer runs on web streams
    // here, `stream-ops.web`, which Next pairs with the edge table's builds.
    // In the ssr layer, where a Client Component imports them: the rsc
    // layer's are Next's modules for a Server Component, which is not to
    // render, in Next's table for Node.js too. React's entries for Node.js
    // need `stream`, `util`, `crypto` and `async_hooks`, the package's
    // stand-ins.
    if (layer === "ssr") {
      const nodeTable = vendoredReactAliases(false);
      for (const key of [
        // Next's renderer, `stream-ops.web`, imports `renderToReadableStream()`
        // and `resume()` here, which the edge table has from Next's own module
        // above. React's entry for Node.js has `renderToString()` and
        // `renderToStaticMarkup()` too, which that build has not.
        "react-dom/server$",
        // Next's renderer imports `prerender()`, from React's entry for web
        // streams. The entry for Node.js has `prerenderToNodeStream()` too.
        "react-dom/static$",
      ]) {
        const entry = nodeTable[key];
        if (typeof entry !== "string") {
          return fail(`Next's alias table for Node.js has no \`${key}\``);
        }
        appAliases[layer][key] = entry;
      }
    }
    // The plugin finds Next's Flight codec next to this one.
    if (typeof aliases["react-server-dom-webpack/server$"] !== "string") {
      fail("the alias tables have no `react-server-dom-webpack/server$`");
    }
    // Next's build for Node.js has a module rule, not an alias, for the
    // contexts of `shared/lib/*.shared-runtime` in the server layers: an
    // import of one goes to `app-page/vendored/contexts/<name>`, which takes
    // the context from the one bundle of Next's server, `module.compiled`,
    // where the SSR React made it. So does `next/router` in a Server
    // Component, whose React, the server build, has no `createContext()`.
    // The ssr layer loads that module itself, and its `contexts/entrypoints`
    // imports the files: an alias there would be a cycle. The rsc layer's
    // `module.compiled` is the ssr layer's (plugin.ts), so the alias gives
    // it what Next's rule does.
    if (layer === "rsc") {
      const contexts = "server/route-modules/app-page/vendored/contexts";
      const names = fs
        .readdirSync(path.join(nextDir, "dist", contexts))
        .filter((file) => file.endsWith(".js") && file !== "entrypoints.js")
        .map((file) => file.slice(0, -".js".length));
      if (names.length === 0) fail(`next/dist/${contexts} has no contexts`);
      for (const name of names) {
        aliases[`next/dist/shared/lib/${name}.shared-runtime$`] = `next/dist/${contexts}/${name}`;
      }
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
    appAliases,
    flightExports,
  };
}
