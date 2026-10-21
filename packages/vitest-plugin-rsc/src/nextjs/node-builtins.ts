// The modules of Node.js that the server layers import and that neither
// Next's aliases (project/layers.ts) nor node-platform.ts stand in for. A
// browser has none of them, and Vite gives each a module without its exports.
//
// The package ships a module of its own for each, `vitest-plugin-rsc/node/<name>`
// in src/node/, which scripts/node-modules.ts writes:
//
// - `fs` and `fs/promises`: a disk in memory, memfs, that `cleanup()`
//   empties. See disk.ts.
// - `process`: the page's, which globals.ts makes Next's server's, and
//   unenv's for what it lacks.
// - `crypto`: Web Crypto, a SHA-256 of its own, and the rest unenv's.
// - The others: unenv's, made of what a browser has, like Web Crypto,
//   `Uint8Array` and `URL`. What it has no stand-in for throws once called,
//   or answers like a machine without it would: `os.hostname()` is "".
//
// To Vite the module is a dependency of the app like any other, that it
// resolves from the app's root, pre-bundles where its scan finds the import,
// and bundles in a build. Each only where it is imported: a layer that
// imports none of them has none of their code. They come last: Next's
// aliases (`buffer`, `events`, `path`...) and node-platform.ts's stand-ins
// (`stream`, `timers`, `module`...) take a module first, so the package's
// `stream` is there, but not what `node:stream` gets. And not for a package that
// says what it uses in a browser instead, in the `browser` field of its
// `package.json`, like PGlite, which has no use for `fs` there: `false` is
// nothing, and a file of its own is what Vite's resolution gives it. The
// app's own field is not one: Next's server does not read it.

import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeModulesExport, ownName } from "../own-package.ts";

/** What the package's modules of Node.js are imported as, up to the name. */
export const nodeModulePrefix = `${ownName}/${nodeModulesExport.slice("./".length, -1)}`;

// Where this package's files are: src/ or dist/, with .ts or .js files.
const ownFile = fileURLToPath(import.meta.url);
const nodeDir = path.join(path.dirname(ownFile), "../node");
const extension = path.extname(ownFile);

// The package's own `async_hooks`, which ../index.ts aliases in every layer.
const notHere = new Set(["async_hooks"]);

const shipped = new Map<string, boolean>();
function ships(name: string): boolean {
  if (!shipped.has(name)) shipped.set(name, fs.existsSync(path.join(nodeDir, name + extension)));
  return shipped.get(name)!;
}

/**
 * The package's module for `source`, a module of Node.js with or without
 * `node:`, if it has one: `vitest-plugin-rsc/node/fs` for `node:fs`.
 */
export function nodeModuleOf(source: string): string | undefined {
  if (!isBuiltin(source)) return;
  const name = source.replace(/^node:/, "");
  if (notHere.has(name) || !ships(name)) return;
  return `${nodeModulePrefix}${name}`;
}

/** Whether `id` is one of the package's modules of Node.js. */
export const isNodeModule = (id: string): boolean => id.startsWith(nodeModulePrefix);

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
