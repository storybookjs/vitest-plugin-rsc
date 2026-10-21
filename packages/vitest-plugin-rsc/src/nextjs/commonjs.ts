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

/** The export of a module compiled here that a `require()` of it returns. */
const moduleExports = "module.exports";

// What a `require()` returns for the namespace of what it imports. A
// dependency of CommonJS that Vite pre-bundled comes as Vite's interop of it:
// an object that is no namespace, with `module.exports` as its default, or
// `module.exports` itself when it says `__esModule`.
const requireHelper =
  `const $$cjsRequire = (ns) => ${JSON.stringify(moduleExports)} in ns ? ns[${JSON.stringify(moduleExports)}]` +
  ` : Object.prototype.toString.call(ns) === "[object Module]" || ns.__esModule ? ns : ns.default;\n`;

type Node = { type: string; start: number; end: number; [key: string]: unknown };

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as Node).type === "string";

function* walk(node: Node, parent?: Node): Generator<[Node, Node | undefined]> {
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
): Promise<{ code: string; map: ReturnType<MagicString["generateMap"]> } | undefined> {
  if (!/\brequire\s*\(|\bmodule\.exports\b|\bexports\.[\w$]+\s*=/.test(code)) return;
  const ast = (await parseAstAsync(code)) as unknown as Node & { body: Node[] };

  const requires: { call: Node; source: string }[] = [];
  let ownRequire = false;
  let usesModule = false;
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
        requires.push({ call: parent, source: source.value });
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
  for (const { call, source } of requires) {
    let name = imports.get(source);
    if (!name) imports.set(source, (name = `$$cjs${imports.size}`));
    output.overwrite(call.start, call.end, `$$cjsRequire(${name})`);
  }
  let header = [...imports]
    .map(([source, name]) => `import * as ${name} from ${JSON.stringify(source)};\n`)
    .join("");
  if (imports.size > 0) header += requireHelper;
  if (isCommonJs) {
    header += "var module = { exports: {} }, exports = module.exports;\n";
    // What `module.exports` is once the module has run.
    let footer =
      `\nvar $$cjsExports = module.exports;\n` +
      `export { $$cjsExports as default, $$cjsExports as ${JSON.stringify(moduleExports)} };\n`;
    await initCjsLexer();
    for (const name of new Set(parseCjs(code).exports)) {
      if (!identifier.test(name) || name === "default") continue;
      footer += `var $$cjs_${name} = $$cjsExports.${name};\nexport { $$cjs_${name} as ${name} };\n`;
    }
    output.append(footer);
  }
  output.prepend(header);
  return { code: output.toString(), map: output.generateMap({ hires: "boundary" }) };
}

export function createCommonJsPlugin(
  layerOf: (environment: string) => NextLayer | undefined,
  isAppCode: (file: string, layer: NextLayer) => boolean,
): Plugin {
  return {
    name: "vitest-plugin-rsc:next-commonjs",
    async transform(code, id) {
      const layer = layerOf(this.environment.name);
      const file = id.split("?")[0]!;
      if (!layer || !/\.[cm]?[jt]sx?$/.test(file) || !isAppCode(file, layer)) return;
      return compileCommonJs(code);
    },
  };
}
