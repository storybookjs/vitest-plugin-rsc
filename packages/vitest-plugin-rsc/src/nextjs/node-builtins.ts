// The modules of Node.js that the server layers import. A browser has none
// of them, and Vite gives each a module without its exports. A worker of
// Node.js has all of them: with the page there (../page-in-node.ts) the
// server layers import Node's own, as on `next start`, see `NodeModules`.
//
// For a browser the package ships a module of its own for each,
// `vitest-plugin-rsc/node/<name>` in src/node/, which scripts/node-modules.ts
// writes, built to one file of its own in dist/node/ with memfs, unenv or
// another package in it:
//
// - `fs` and `fs/promises`: a disk in memory, memfs, that `cleanup()`
//   empties. See disk.ts.
// - `process`: the page's, which globals.ts makes Next's server's, and
//   unenv's for what it lacks.
// - Written by hand where unenv's is not enough, with Node's own code as
//   a package, or a small library of JavaScript: `assert`, `buffer`,
//   `crypto`, `path`, `stream`, `stream/consumers`, `stream/promises`,
//   `string_decoder`, `timers`, `timers/promises`, `util` and `zlib`.
//   A function of Node.js gets one that works only when Next's server
//   calls it on a path the plugin supports, a recipe or a playground needs
//   it, or server code commonly calls it, directly or through a common
//   library; and when it is glue over a web API or the public API of an
//   established library, with no cipher or compression of its own, and a
//   test against Node's own.
//   Otherwise it throws when called: a stand-in does what Node.js does, or
//   throws, and never answers wrong. See docs/nodejs-in-the-browser.md.
// - The others: unenv's, made of what a browser has, like Web Crypto,
//   `Uint8Array` and `URL`. What it has no stand-in for throws once called,
//   or answers like a machine without it would: `os.hostname()` is "".
//
// A layer gets the file: not a dependency for Vite to find and pre-bundle,
// which a cache older than the import would find as a test runs, but an ESM
// file that Vite serves as it is, and that a build, or the pre-bundle of a
// dependency that imports the module, bundles. Each only where it is
// imported: a layer that imports none of them has none of their code. Every
// module of Node.js, from one place: Next's own polyfills of the four its
// edge runtime has are for the browser layer alone, as before, and
// node-platform.ts has Next's own modules of its process, no module of
// Node.js. Not for a package that says what it uses in a
// browser instead, in the `browser` field of its `package.json`, like PGlite,
// which has no use for `fs` there: `false` is nothing, and a file of its own
// is what Vite's resolution gives it. The app's own field is not one: Next's
// server does not read it. Node's own modules are every package's, the
// `browser` field or not, as on Next's server.

import fs from "node:fs";
import { builtinModules, isBuiltin } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { esmExternalRequirePlugin, normalizePath } from "vite";

// Where the package's modules of Node.js are: dist/node/, the built files,
// each with what it has in it, from the source in src/ as from dist/. The
// source of one, src/node/, imports memfs or unenv, which Vite would then
// find as a test runs: `pnpm test` builds the package first.
const ownFile = fileURLToPath(import.meta.url);
const nodeDir =
  normalizePath(
    path.join(
      path.dirname(ownFile),
      path.extname(ownFile) === ".ts" ? "../../dist/node" : "../node",
    ),
  ) + "/";
const extension = ".js";

// The package's own `async_hooks`, which ../index.ts aliases in every layer:
// in a worker of Node.js Node's own for the server layers, by the `node`
// condition of its export (../async-hooks-node.ts).
const notHere = new Set(["async_hooks"]);

const files = new Map<string, string | undefined>();

/**
 * What the server layers import for a module of Node.js: the package's
 * `stand-ins`, for a page in a browser, or Node's own, `native`, for a page in
 * a worker of Node.js. A native module is no file: the layer leaves it to
 * the runner to import, and so does a pre-bundle that imports it.
 */
export type NodeModules = "stand-ins" | "native";

/**
 * What a server layer imports for `source`, a module of Node.js with or
 * without `node:`, if it imports another module for it: the file of the
 * package's module, `.../node/fs.js` for `node:fs`, or, `native`, the module
 * of Node.js by its `node:` name.
 */
export function nodeModuleOf(source: string, modules: NodeModules): string | undefined {
  if (!isBuiltin(source)) return;
  const name = source.replace(/^node:/, "");
  if (notHere.has(name)) return;
  if (modules === "native") return `node:${name}`;
  if (!files.has(name)) {
    // Without a build the layer would get Vite's empty module, and nothing
    // would say why.
    if (!fs.existsSync(nodeDir)) {
      throw new Error(
        `vitest-plugin-rsc: no ${nodeDir}, the package is not built: run \`pnpm build\``,
      );
    }
    const file = `${nodeDir}${name}${extension}`;
    files.set(name, fs.existsSync(file) ? file : undefined);
  }
  return files.get(name);
}

/** Whether `id` is a file of the package's modules of Node.js. */
export const isNodeModule = (id: string): boolean => id.startsWith(nodeDir);

/** Whether `id` is a module of Node.js itself, which `nodeModuleOf()` gives for `native`. */
export const isNativeNodeModule = (id: string): boolean => id.startsWith("node:");

/**
 * The plugin of a server layer's optimizer for `native` modules: in a
 * pre-bundle, a `require()` of a module of Node.js is an import of it, which
 * the runner imports, and `module.exports` its default export, as Node.js
 * gives it. Rolldown's runtime for a browser has no `require` to call.
 */
export function nativeRequirePlugin(): ReturnType<typeof esmExternalRequirePlugin> {
  const names = builtinModules.filter(
    (name) => !name.startsWith("_") && nodeModuleOf(name, "native"),
  );
  const external = [
    ...new Set([...names, ...names.map((name) => name.replace(/^(?!node:)/, "node:"))]),
  ];
  return esmExternalRequirePlugin({ external });
}

// What the `browser` field of the `package.json` closest to a file maps a
// module to: `false` for none.
const browserFields = new Map<string, Record<string, unknown> | undefined>();
function browserFieldOf(dir: string): Record<string, unknown> | undefined {
  if (browserFields.has(dir)) return browserFields.get(dir);
  let field: Record<string, unknown> | undefined;
  const file = path.join(dir, "package.json");
  const parent = path.dirname(dir);
  if (fs.existsSync(file)) {
    const { browser } = JSON.parse(fs.readFileSync(file, "utf8")) as { browser?: unknown };
    field = typeof browser === "object" && browser ? (browser as Record<string, unknown>) : {};
  } else if (parent !== dir) {
    field = browserFieldOf(parent);
  }
  browserFields.set(dir, field);
  return field;
}

/**
 * What the package of `importer`, a dependency, says it uses for `source` in
 * a browser, by its `browser` field: `false` for nothing, a file of its own
 * as a string, or `undefined` where it says nothing. By the specifier as
 * written: Vite maps `fs` and `node:fs` apart too.
 */
export function browserMapping(
  source: string,
  importer: string | undefined,
): false | string | undefined {
  const file = importer?.split("?")[0];
  if (!file || !path.isAbsolute(file) || !/[\\/]node_modules[\\/]/.test(file)) return;
  const mapping = browserFieldOf(path.dirname(file))?.[source];
  return mapping === false || typeof mapping === "string" ? mapping : undefined;
}
