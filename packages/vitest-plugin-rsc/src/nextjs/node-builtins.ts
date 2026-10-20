// The modules of Node.js that the server layers import and that neither Next's
// aliases (project/layers.ts) nor node-platform.ts stand in for. A browser
// has none of them, and Vite gives each a module without its exports.
//
// - `fs` and `fs/promises`: a disk in memory, memfs, that `cleanup()`
//   empties. See disk.ts.
// - `process`: the page's, which globals.ts makes Next's server's.
// - The others: unenv's, made of what a browser has, like Web Crypto,
//   `Uint8Array` and `URL`. What it has no stand-in for throws once called,
//   or answers like a machine without it would: `os.hostname()` is "".
//
// Each only where it is imported: a layer that imports none of them has none
// of their code. And not for a package that says what it uses in a browser
// instead, in the `browser` field of its `package.json`, like PGlite, which
// has no use for `fs` there: it gets what that says, from Vite. The app's
// own field is not one: Next's server does not read it.
//
// The named exports are unenv's, whose version fixes them, and not those of
// the Node.js that runs Vite.

import fs from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import path from "node:path";
import { parseAst } from "vite";
import { diskGlobal } from "./disk.ts";

const ownRequire = createRequire(import.meta.url);

// The package's own `async_hooks`, which ../index.ts aliases.
const notHere = new Set(["async_hooks"]);

const unenvFiles = new Map<string, string | undefined>();
function unenvFile(name: string): string | undefined {
  if (!unenvFiles.has(name)) {
    let file: string | undefined;
    try {
      file = ownRequire.resolve(`unenv/node/${name}`);
    } catch {}
    unenvFiles.set(name, file);
  }
  return unenvFiles.get(name);
}

// The names a pattern of a declaration binds, like `export const { a, b } = c`.
function namesOf(pattern: any): string[] {
  switch (pattern?.type) {
    case "Identifier":
      return [pattern.name];
    case "ObjectPattern":
      return pattern.properties.flatMap((property: any) =>
        namesOf(property.type === "RestElement" ? property.argument : property.value),
      );
    case "ArrayPattern":
      return pattern.elements.flatMap(namesOf);
    case "AssignmentPattern":
      return namesOf(pattern.left);
    case "RestElement":
      return namesOf(pattern.argument);
    default:
      return [];
  }
}

// The named exports of a file of unenv, read from its code: unenv's own
// `process` touches the process it runs in as it is evaluated.
function exportsOfFile(file: string): string[] {
  const names: string[] = [];
  for (const node of parseAst(fs.readFileSync(file, "utf8")).body as any[]) {
    if (node.type === "ExportNamedDeclaration") {
      const { declaration } = node;
      if (declaration?.type === "VariableDeclaration") {
        names.push(...declaration.declarations.flatMap((each: any) => namesOf(each.id)));
      } else if (declaration?.id) {
        names.push(declaration.id.name);
      }
      for (const specifier of node.specifiers)
        names.push(specifier.exported.name ?? specifier.exported.value);
    } else if (node.type === "ExportAllDeclaration") {
      if (node.exported) names.push(node.exported.name ?? node.exported.value);
      else if (node.source.value.startsWith(".")) {
        names.push(...exportsOfFile(path.resolve(path.dirname(file), node.source.value)));
      } else {
        // Its names would be missing here, and so in the stand-in.
        throw new Error(`vitest-plugin-rsc: ${file} re-exports ${node.source.value}`);
      }
    }
  }
  return [...new Set(names)].filter((name) => name !== "default");
}

/** The named exports of unenv's stand-in for a module of Node.js. */
export const exportsOf = (name: string): string[] => exportsOfFile(unenvFile(name)!);

/** A function that throws when called, in the code of a stand-in. */
export const missing = `
const missing = (name) =>
  function () {
    throw new Error("vitest-plugin-rsc: " + name + " of Node.js is not there in the browser");
  };
`;

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
 * The stand-ins, for a `prefix` that their module ids start with.
 */
export function createNodeBuiltins(prefix: string) {
  const idPrefix = `${prefix}builtin:`;
  const disk = `
  import { Volume, createFsFromVolume } from "memfs";
  ${missing}
  const disk = (globalThis.${diskGlobal} ??= (() => {
    const volume = new Volume();
    // What watches a file of the disk, which \`reset()\` closes.
    const watchers = new Set();
    const watch = volume.watch.bind(volume);
    volume.watch = (...args) => {
      const watcher = watch(...args);
      watchers.add(watcher);
      return watcher;
    };
    const fs = createFsFromVolume(volume);
    const reset = () => {
      for (const watcher of watchers) watcher.close();
      watchers.clear();
      for (const watcher of Object.values(volume.statWatchers)) watcher.stop();
      volume.statWatchers = {};
      volume.reset();
      fs.mkdirSync("/tmp");
    };
    reset();
    return { fs, reset };
  })());
  `;
  const modules: Record<string, () => string> = {
    fs: () => `
  ${disk}
  const fs = disk.fs;
  export default fs;
  ${exportsOf("fs")
    .map((name) => `export const ${name} = fs.${name} ?? missing("fs.${name}");`)
    .join("\n  ")}
  `,
    "fs/promises": () => `
  import fs from ${JSON.stringify(`${idPrefix}fs`)};
  ${missing}
  const promises = fs.promises;
  export default promises;
  ${exportsOf("fs/promises")
    .map((name) => `export const ${name} = promises.${name} ?? missing("fs/promises.${name}");`)
    .join("\n  ")}
  `,
    // The functions themselves, as Node's are: \`hrtime.bigint()\`.
    process: () => `
  const process = (globalThis.process ??= { env: {} });
  export default process;
  ${exportsOf("process")
    .map((name) => `export const ${name} = process.${name};`)
    .join("\n  ")}
  `,
  };

  return {
    /** The id of the stand-in for a module of Node.js, if it has one. */
    moduleOf(source: string): string | undefined {
      if (!isBuiltin(source)) return;
      const name = source.replace(/^node:/, "");
      if (notHere.has(name)) return;
      if (name in modules || unenvFile(name)) return `${idPrefix}${name}`;
    },
    isStandIn: (id: string) => id.startsWith(idPrefix),
    /**
     * Whether the package of `importer`, a dependency, says what it uses for
     * `source` in a browser, by its `browser` field: `false` for nothing, or
     * a file of its own. Vite's resolution then gives it that.
     */
    mappedBy(source: string, importer: string | undefined): boolean {
      const file = importer?.split("?")[0];
      if (!file || !path.isAbsolute(file) || !/[\\/]node_modules[\\/]/.test(file)) return false;
      const field = browserFieldOf(path.dirname(file));
      const name = source.replace(/^node:/, "");
      return !!field && (name in field || `node:${name}` in field);
    },
    /** The code of a stand-in, by its id without the prefix. */
    load(id: string): string | undefined {
      if (!id.startsWith("builtin:")) return;
      const name = id.slice("builtin:".length);
      const own = modules[name];
      if (own) return own();
      if (!unenvFile(name)) return;
      // From the package, see `importsOwn`. Its default export too, where it
      // has one.
      const specifier = JSON.stringify(`unenv/node/${name}`);
      return (
        `import * as unenv from ${specifier};\n` +
        `export * from ${specifier};\n` +
        `export default unenv.default;\n`
      );
    },
    /**
     * Whether a stand-in imports `source` as a package of its own, which is
     * this package's dependency and maybe not the app's. By its name: a dev
     * server's scan of the app finds it so, where the app imports the module
     * of Node.js, and pre-bundles it. Otherwise Vite would serve its files as
     * they are, find what they import as a test runs, and reload the page.
     */
    importsOwn: (source: string, importer: string | undefined) =>
      !!importer?.startsWith(idPrefix) && (source === "memfs" || source.startsWith("unenv/")),
  };
}
