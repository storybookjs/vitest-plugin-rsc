import MagicString, { type SourceMap } from "magic-string";
import { parseAst } from "vite";

// Compiles the async functions of a module to read, after an `await`, the
// stores of `AsyncLocalStorage` they were called with. A browser tab does not
// carry them there, so the function puts them back itself, with the hooks of
// async-local-storage.ts, here `h`:
//
//   async function getQuote(topic) {     async function getQuote(topic) {
//                                          const call = h.e();
//                                          try {
//     const quote = await load(topic);       const quote = h.r(call, await h.s(call, (load(topic))));
//     cacheTag("quotes");                    cacheTag("quotes");
//     return quote;                          return quote;
//                                          } finally { h.x(call); }
//   }                                    }
//
// `s` is called before the function waits and `r` when it goes on. Between
// them the stores are those of whoever runs then. A `catch` and a `finally`
// call `c`: an `await` that rejects goes on there. `x` is called when the
// function is done. The function stays a native async function: its stack
// traces, its `this` and its `arguments` are what they were.
//
// Left as it is, without its stores after an `await`:
//
//   - a function that waits where no call can go: one with a `for await` or
//     an `await using`, and an async generator, which also waits at a `yield`,
//   - a function that would not parse with its body in the block of a `try`,
//     where a function declaration cannot have the name of another one or of
//     a `var`,
//   - an `await` at the top level of a module, which was called with no store.

type Node = {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
};

type FunctionNode = Node & {
  async: boolean;
  generator: boolean;
  params: Node[];
  body: Node & { body: Node[] };
};

// One piece of text to put in. Text that closes something goes before text
// that opens something at the same place, and each in the order that nests.
type Insertion = { at: number; text: string; closes: boolean; order: number };

type AsyncFunction = {
  awaits: boolean;
  compiles: boolean;
  /** The names its `var` declarations declare. */
  vars: Set<string>;
  insertions: Insertion[];
};

const call = "__vitest_plugin_rsc_call__";

const isFunction = (node: Node): node is FunctionNode =>
  node.type === "FunctionDeclaration" ||
  node.type === "FunctionExpression" ||
  node.type === "ArrowFunctionExpression";

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}

function children(node: Node): Node[] {
  const result: Node[] = [];
  for (const key in node) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (isNode(item)) result.push(item);
    } else if (isNode(value)) {
      result.push(value);
    }
  }
  return result;
}

// The names a pattern declares: of `var { a, b: [c] = [] } = value`, a and c.
function addNames(pattern: Node | null | undefined, names: Set<string>): void {
  if (!pattern) return;
  if (pattern.type === "Identifier") names.add(pattern.name as string);
  else if (pattern.type === "ObjectPattern") {
    for (const property of pattern.properties as Node[]) {
      addNames((property.value ?? property.argument) as Node, names);
    }
  } else if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements as (Node | null)[]) addNames(element, names);
  } else addNames((pattern.left ?? pattern.argument) as Node | undefined, names);
}

// The place right after the `=>` of an arrow function: what follows is its
// body, with the parentheses around it that the body node leaves out.
function afterArrow(code: string, from: number, to: number): number {
  for (let i = from; i < to; i++) {
    if (code.startsWith("//", i)) i = code.indexOf("\n", i);
    else if (code.startsWith("/*", i)) i = code.indexOf("*/", i) + 1;
    else if (code.startsWith("=>", i)) return i + 2;
    if (i < 0) break;
  }
  throw new Error("vitest-plugin-rsc: an arrow function without `=>`");
}

/**
 * Compiles the async functions of a module to call `hooks`, an expression for
 * `asyncFunctionHooks` of async-local-storage.ts. Returns nothing for code
 * that stays as it is, and throws for code that does not parse.
 */
export function transformAsyncFunctions(
  code: string,
  id: string,
  hooks: string,
): { code: string; map: SourceMap } | undefined {
  if (!/\bawait\b/.test(code)) return;
  const program = parseAst(code) as unknown as Node;

  const insertions: Insertion[] = [];
  let order = 0;

  function visit(node: Node, fn: AsyncFunction | undefined): void {
    const at = order++;
    const open = (position: number, text: string) =>
      fn!.insertions.push({ at: position, text, closes: false, order: at });
    const close = (position: number, text: string) =>
      fn!.insertions.push({ at: position, text, closes: true, order: at });

    if (isFunction(node)) {
      // The parameters are not the body: a default value can be a function.
      for (const param of node.params) visit(param, undefined);
      const own: AsyncFunction | undefined =
        node.async && !node.generator
          ? { awaits: false, compiles: true, vars: new Set(), insertions: [] }
          : undefined;
      visit(node.body, own);
      if (!own?.awaits || !own.compiles) return;
      if (node.body.type === "BlockStatement") {
        const declared = node.body.body
          .filter((statement) => statement.type === "FunctionDeclaration")
          .map((statement) => (statement.id as Node).name as string);
        if (new Set(declared).size < declared.length) return;
        if (declared.some((name) => own.vars.has(name))) return;
      }

      const enter = `const ${call}=${hooks}.e();try{`;
      const exit = `}finally{${hooks}.x(${call})}`;
      if (node.body.type === "BlockStatement") {
        // After the directives, which have to come first, and which can be
        // without a semicolon.
        let start = node.body.start + 1;
        let separator = "";
        for (const statement of node.body.body) {
          if (typeof statement.directive !== "string") break;
          start = statement.end;
          separator = ";";
        }
        insertions.push({ at: start, text: separator + enter, closes: false, order: at });
        insertions.push({ at: node.body.end - 1, text: exit, closes: true, order: at });
      } else {
        const lastParam = node.params.at(-1);
        const body = afterArrow(code, lastParam ? lastParam.end : node.start, node.body.start);
        insertions.push({ at: body, text: `{${enter}return(`, closes: false, order: at });
        insertions.push({ at: node.end, text: `)${exit}}`, closes: true, order: at });
      }
      insertions.push(...own.insertions);
      return;
    }

    if (fn) {
      switch (node.type) {
        case "AwaitExpression": {
          const argument = node.argument as Node;
          fn.awaits = true;
          open(node.start, `${hooks}.r(${call},`);
          open(argument.start, `${hooks}.s(${call},(`);
          close(argument.end, "))");
          close(node.end, ")");
          break;
        }
        case "TryStatement": {
          const handler = node.handler as (Node & { body: Node }) | null;
          const finalizer = node.finalizer as Node | null;
          if (handler) open(handler.body.start + 1, `${hooks}.c(${call});`);
          if (finalizer) open(finalizer.start + 1, `${hooks}.c(${call});`);
          break;
        }
        // Where the function waits without an `await` to compile.
        case "ForOfStatement":
          if (node.await) fn.compiles = false;
          break;
        case "VariableDeclaration":
          if (node.kind === "await using") fn.compiles = false;
          if (node.kind === "var") {
            for (const { id } of node.declarations as { id: Node }[]) addNames(id, fn.vars);
          }
          break;
      }
    }
    for (const child of children(node)) visit(child, fn);
  }

  visit(program, undefined);
  if (insertions.length === 0) return;

  const output = new MagicString(code);
  insertions.sort(
    (a, b) =>
      a.at - b.at ||
      Number(b.closes) - Number(a.closes) ||
      (a.closes ? b.order - a.order : a.order - b.order),
  );
  for (const { at, text, closes } of insertions) {
    if (closes) output.appendLeft(at, text);
    else output.appendRight(at, text);
  }
  return {
    code: output.toString(),
    map: output.generateMap({ source: id, includeContent: true, hires: "boundary" }),
  };
}
