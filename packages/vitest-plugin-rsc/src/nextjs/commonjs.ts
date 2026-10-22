import { init as initCjsLexer, parse as parseCjs } from "cjs-module-lexer";
import MagicString from "magic-string";
import { parseAstAsync, type Plugin } from "vite";
import type { NextLayer } from "./project.ts";

// CommonJS in a source file of the app. Next's bundler takes a module that
// calls `require()` next to its `import`s, like a page that reads a constant
// of `next/constants`, and a module of CommonJS alone, like the cache handler
// that `next.config` names with `require.resolve()`. Vite serves a source
// file as an ES module, where neither `require` nor `module` is defined. So
// this compiles such a file into one:
//
//   const { a } = require("./a");       import * as $$cjs0 from "./a";
//   module.exports = { b: a };          const { a } = $$cjsRequire($$cjs0);
//                                       module.exports = { b: a };
//                                       export default module.exports;
//
// A `require()` with a string is an `import` of that module, which runs
// before the module does, also where the call is in a function that may not
// run. What it returns is what Node.js returns: the `module.exports` of a
// module of CommonJS, the namespace of an ES module. A module of CommonJS has
// `module.exports` as its default export, and the names `cjs-module-lexer`
// finds in it, as Node.js gives them to an `import` of it.
//
// A file that has `require` as a name of its own, or passes it around, is
// left as it is.

/**
 * The export of a module compiled here that a `require()` of it returns: its
 * `module.exports`. A name, as Vite RSC reads the exports of a `"use client"`
 * module and takes no string for one.
 */
const moduleExports = "$$cjsModuleExports";

// What a `require()` returns for the namespace of what it imports. A
// dependency of CommonJS that Vite pre-bundled comes as Vite's interop of it:
// an object that is no namespace, with `module.exports` as its default, or
// `module.exports` itself when it says `__esModule`.
const requireHelper =
  `const $$cjsRequire = (ns) => ${JSON.stringify(moduleExports)} in ns ? ns[${JSON.stringify(moduleExports)}]` +
  ` : Object.prototype.toString.call(ns) === "[object Module]" || ns.__esModule ? ns : ns.default;\n`;
// What a `require()` of a module that is not there throws, as Node.js does:
// with the `code` that a `catch` of an optional dependency looks for.
export const missingHelper =
  "const $$cjsMissing = (source) => { throw Object.assign(new Error(`Cannot find module '${source}'`), { code: \"MODULE_NOT_FOUND\" }); };\n";

// A JSON file or a stylesheet: what `require()` returns is what Vite has as
// its default export, the value of the JSON or the classes of a CSS module.
// Its namespace has the keys of an object as named exports, and nothing of an
// array or of a class with a dash.
const defaultOnly = /\.(?:json|css|scss|sass|less|styl|stylus|pcss)(?:\?|$)/;

/** What `compileCommonJs()` needs of the file. */
export type CommonJsOptions = {
  /** The language of the code: `parseAstAsync` of Vite takes TypeScript as well. */
  lang?: "js" | "jsx" | "ts" | "tsx";
  /**
   * Whether a `require()` in a `try` finds its module. A module that is not
   * there throws when the call runs, so the `catch` runs, as it does with
   * webpack. Without this, every `require()` is an import.
   */
  resolves?: (source: string) => Promise<boolean>;
};

export type Node = { type: string; start: number; end: number; [key: string]: unknown };

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string";

export function* walk(node: Node, parent?: Node): Generator<[Node, Node | undefined]> {
  yield [node, parent];
  for (const key in node) {
    const value = node[key];
    for (const child of Array.isArray(value) ? value : [value]) {
      if (isNode(child)) yield* walk(child, node);
    }
  }
}

const isIdentifier = (node: unknown, name: string) =>
  isNode(node) && node.type === "Identifier" && node.name === name;

// The names of `module.exports` that an `import { name }` can have.
const identifier = /^[A-Za-z_$][\w$]*$/;

/** Compiles CommonJS in a module into ES module code. Nothing for a module without it. */
export async function compileCommonJs(
  code: string,
  { lang, resolves }: CommonJsOptions = {},
): Promise<{ code: string; map: ReturnType<MagicString["generateMap"]> } | undefined> {
  if (!/\brequire\s*\(|\bmodule\.exports\b|\bexports\.[\w$]+\s*=/.test(code)) return;
  const ast = (await parseAstAsync(code, { lang })) as unknown as Node & { body: Node[] };

  const requires: { call: Node; source: string; tried: boolean }[] = [];
  let ownRequire = false;
  let usesModule = false;
  // The calls in the block of a `try`.
  const tried = new Set<Node>();
  for (const [node] of walk(ast)) {
    if (node.type !== "TryStatement") continue;
    for (const [inner] of walk(node.block as Node)) {
      if (inner.type === "CallExpression") tried.add(inner);
    }
  }
  for (const [node, parent] of walk(ast)) {
    if (isIdentifier(node, "module") || isIdentifier(node, "exports")) {
      // Not the key of a property, as in `a.module` or `{ exports: 1 }`.
      const isKey =
        (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) ||
        (parent?.type === "Property" && parent.key === node && !parent.computed);
      if (!isKey) usesModule = true;
    }
    if (!isIdentifier(node, "require")) continue;
    const args = parent?.arguments as Node[] | undefined;
    if (parent?.type === "CallExpression" && parent.callee === node) {
      const [source] = args ?? [];
      if (args?.length === 1 && source?.type === "Literal" && typeof source.value === "string") {
        requires.push({ call: parent, source: source.value, tried: tried.has(parent) });
        continue;
      }
    }
    // `require.resolve()` names a file, and imports nothing.
    if (parent?.type === "MemberExpression" && parent.object === node) continue;
    ownRequire = true;
  }
  const isEsModule = ast.body.some((statement) =>
    /^(?:Import|ExportNamed|ExportDefault|ExportAll)Declaration$/.test(statement.type),
  );
  const isCommonJs = !isEsModule && usesModule;
  if (ownRequire || (requires.length === 0 && !isCommonJs)) return;

  const output = new MagicString(code);
  const imports = new Map<string, string>();
  let missing = false;
  for (const { call, source, tried } of requires) {
    if (tried && resolves && !(await resolves(source))) {
      missing = true;
      output.overwrite(call.start, call.end, `$$cjsMissing(${JSON.stringify(source)})`);
      continue;
    }
    let name = imports.get(source);
    if (!name) imports.set(source, (name = `$$cjs${imports.size}`));
    const value = defaultOnly.test(source) ? `${name}.default` : `$$cjsRequire(${name})`;
    output.overwrite(call.start, call.end, value);
  }
  let header = [...imports]
    .map(([source, name]) => `import * as ${name} from ${JSON.stringify(source)};\n`)
    .join("");
  if ([...imports.keys()].some((source) => !defaultOnly.test(source))) header += requireHelper;
  if (missing) header += missingHelper;
  if (isCommonJs) {
    header += "var module = { exports: {} }, exports = module.exports;\n";
    // What `module.exports` is once the module has run.
    let footer =
      `\nvar $$cjsExports = module.exports;\n` +
      `export { $$cjsExports as default, $$cjsExports as ${moduleExports} };\n`;
    await initCjsLexer();
    for (const name of new Set(parseCjs(code).exports)) {
      if (!identifier.test(name) || name === "default") continue;
      footer += `var $$cjs_${name} = $$cjsExports.${name};\nexport { $$cjs_${name} as ${name} };\n`;
    }
    output.append(footer);
  }
  // After the directives, like `"use client"` or `"use cache"`, which are
  // only directives at the top of the module.
  const afterDirectives = ast.body.find(
    (statement) => !(statement.type === "ExpressionStatement" && "directive" in statement),
  );
  if (afterDirectives) output.appendLeft(afterDirectives.start, header);
  else output.append(header);
  return { code: output.toString(), map: output.generateMap({ hires: "boundary" }) };
}

export function createCommonJsPlugin(
  layerOf: (environment: string) => NextLayer | undefined,
  isAppCode: (file: string, layer: NextLayer) => boolean,
): Plugin {
  return {
    name: "vitest-plugin-rsc:next-commonjs",
    // Before `rsc:use-client` of Vite RSC, which reads the exports of a
    // `"use client"` module: the ones of a module of CommonJS are made here.
    // And after Next's compiler, which is `pre` too and comes first.
    enforce: "pre",
    async transform(code, id) {
      const layer = layerOf(this.environment.name);
      const file = id.split("?")[0]!;
      const extension = /\.[cm]?([jt]sx?)$/.exec(file);
      if (!layer || !extension || !isAppCode(file, layer)) return;
      return compileCommonJs(code, {
        lang: extension[1] as CommonJsOptions["lang"],
        resolves: async (source) => (await this.resolve(source, id)) !== null,
      });
    },
  };
}
