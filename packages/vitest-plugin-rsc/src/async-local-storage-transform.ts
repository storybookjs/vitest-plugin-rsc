import type { Plugin } from "vite";
import { parse } from "@babel/parser";
import MagicString from "magic-string";

type AstNode = {
  type: string;
  start?: number | null;
  end?: number | null;
  async?: boolean;
  argument?: AstNode | null;
  body?: AstNode | AstNode[] | null;
  expression?: AstNode | null;
  value?: unknown;
  [key: string]: unknown;
};

const helperModule = "vitest-plugin-rsc/async-local-storage";
const executeAsyncName = "__vitestPluginRscExecuteAsync";
const tempName = "__vitestPluginRscTemp";
const restoreName = "__vitestPluginRscRestore";
const transformedMarker = "/* _processed_vitest_plugin_rsc_async_context */\n";
const transformedMarkerRE = /^\/\* _processed_vitest_plugin_rsc_async_context \*\/\n/;

export function createAsyncLocalStorageTransformPlugin(): Plugin {
  return {
    name: "rsc:async-local-storage-transform",
    enforce: "post",
    applyToEnvironment(environment) {
      return environment.name === "client" || environment.name === "react_client";
    },
    transform(code, id) {
      if (!shouldTransform(id, code)) return;

      let ast: AstNode;
      try {
        ast = parse(code, {
          sourceType: "module",
          plugins: ["jsx", "typescript", "importAttributes"],
        }) as unknown as AstNode;
      } catch {
        return;
      }

      const s = new MagicString(code);
      let transformed = false;

      walk(ast, (node) => {
        const body = node.body;
        if (
          !isFunctionNode(node) ||
          node.async !== true ||
          !isAstNode(body) ||
          body.type !== "BlockStatement"
        ) {
          return;
        }

        if (transformAsyncFunctionBody(s, body)) {
          transformed = true;
        }
      });

      if (!transformed) return;

      const importInsertionIndex = getImportInsertionIndex(ast);
      s.appendLeft(
        importInsertionIndex,
        `${importInsertionIndex > 0 ? "\n" : ""}${transformedMarker}import { executeAsync as ${executeAsyncName} } from ${JSON.stringify(
          helperModule,
        )};\n`,
      );

      return {
        code: s.toString(),
        map: s.generateMap({
          source: id,
          includeContent: true,
        }),
      };
    },
  };
}

function shouldTransform(id: string, code: string): boolean {
  if (!code.includes("await") || transformedMarkerRE.test(code)) return false;

  const [file] = id.split("?", 1);
  if (!file || file.includes("/node_modules/")) return false;
  if (file.includes("/packages/vitest-plugin-rsc/dist/")) return false;
  if (/[/\\]vitest\.setup(?:\.[\w-]+)?\.[cm]?[jt]sx?$/.test(file)) return false;

  return /\.[cm]?[jt]sx?$/.test(file);
}

function transformAsyncFunctionBody(s: MagicString, body: AstNode): boolean {
  let transformed = false;

  walk(body, (node, parent, grandparent) => {
    if (node !== body && isFunctionNode(node)) return false;
    if (node.type !== "AwaitExpression") return;

    const argument = node.argument;
    if (
      !isAstNode(argument) ||
      typeof node.start !== "number" ||
      typeof node.end !== "number" ||
      typeof argument.start !== "number" ||
      typeof argument.end !== "number"
    ) {
      return;
    }

    transformed = true;
    injectAwaitRestore(s, node, argument, parent, grandparent);
  });

  if (transformed && typeof body.start === "number") {
    s.appendLeft(body.start + 1, `let ${tempName}, ${restoreName};`);
  }

  return transformed;
}

function injectAwaitRestore(
  s: MagicString,
  node: AstNode,
  argument: AstNode,
  parent: AstNode | undefined,
  grandparent: AstNode | undefined,
): void {
  const nodeStart = node.start!;
  const nodeEnd = node.end!;
  const argumentStart = argument.start!;
  const argumentEnd = argument.end!;
  const isStatement = parent?.type === "ExpressionStatement";
  const needsLeadingSemicolon = isStatement && !isSingleStatementBody(parent, grandparent);

  s.remove(nodeStart, argumentStart);
  s.remove(nodeEnd, argumentEnd);
  s.appendLeft(argumentStart, needsLeadingSemicolon ? `;(${tempName}=` : `(${tempName}=`);
  s.appendRight(
    argumentEnd,
    isStatement
      ? `,[${tempName},${restoreName}]=${executeAsyncName}(()=>${tempName}),await ${tempName},${restoreName}());`
      : `,[${tempName},${restoreName}]=${executeAsyncName}(()=>${tempName}),${tempName}=await ${tempName},${restoreName}(),${tempName})`,
  );
}

function isFunctionNode(node: AstNode): boolean {
  return (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ObjectMethod" ||
    node.type === "ClassMethod" ||
    node.type === "ClassPrivateMethod"
  );
}

function isSingleStatementBody(node: AstNode, parent: AstNode | undefined): boolean {
  if (!parent) return false;

  return (
    parent.body === node ||
    parent.consequent === node ||
    parent.alternate === node ||
    parent.delegate === node
  );
}

function getImportInsertionIndex(ast: AstNode): number {
  const program = isAstNode(ast.program) ? ast.program : ast;
  const directives = program.directives;
  if (Array.isArray(directives) && directives.length > 0) {
    const lastDirective = directives[directives.length - 1];
    if (isAstNode(lastDirective) && typeof lastDirective.end === "number") {
      return lastDirective.end;
    }
  }

  const body = program.body;
  if (!Array.isArray(body)) return 0;

  let index = 0;
  for (const node of body) {
    if (!isDirectiveStatement(node)) break;
    index = typeof node.end === "number" ? node.end : index;
  }

  return index;
}

function isDirectiveStatement(node: AstNode): boolean {
  const expression = node.expression;
  return (
    node.type === "ExpressionStatement" &&
    expression?.type === "StringLiteral" &&
    typeof expression.value === "string"
  );
}

function walk(
  node: AstNode,
  enter: (
    node: AstNode,
    parent: AstNode | undefined,
    grandparent: AstNode | undefined,
  ) => false | void,
  parent?: AstNode,
  grandparent?: AstNode,
): void {
  if (enter(node, parent, grandparent) === false) return;

  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;

    if (Array.isArray(value)) {
      for (const child of value) {
        if (isAstNode(child)) walk(child, enter, node, parent);
      }
      continue;
    }

    if (isAstNode(value)) walk(value, enter, node, parent);
  }
}

function isAstNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && typeof (value as AstNode).type === "string";
}
