import path from "node:path";
import { transformHoistInlineDirective } from "@vitejs/plugin-rsc/transforms";
import type { Plugin } from "vite";
import { parseAstAsync } from "vite";
import { loadNextProjectConfig } from "../config.ts";
import { getProjectRoot, isProjectFile, normalizePath } from "../plugin-utils.ts";
import {
  createNextUseCacheRuntimeModule,
  virtualNextUseCacheRuntimeId,
  virtualNextUseCacheRuntimePublicId,
} from "../src/server/use-cache/use-cache-wrapper.ts";

export function useNextUseCacheTransform(): Plugin {
  let root = process.cwd();
  let mode = "test";
  let enabledPromise: Promise<boolean> | undefined;

  return {
    name: "next-rsc-use-cache-transform",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
      mode = config.mode;
      enabledPromise = undefined;
    },
    resolveId(source) {
      if (source === virtualNextUseCacheRuntimePublicId) {
        return virtualNextUseCacheRuntimeId;
      }
    },
    load(id) {
      if (id !== virtualNextUseCacheRuntimeId) return;

      return createNextUseCacheRuntimeModule();
    },
    async transform(code, id) {
      if (
        !code.includes("use cache") ||
        !isUserSourceFile(id) ||
        !isProjectFile(root, id) ||
        isTestSourceFile(id) ||
        this.environment.name !== "client"
      ) {
        return;
      }

      enabledPromise ??= loadNextProjectConfig(root, mode).then(
        (projectConfig) => projectConfig.nextConfig.cacheComponents === true,
      );
      if (!(await enabledPromise)) return;

      const ast = await parseAstAsync(code, { lang: getParserLanguage(id) }, id);
      assertSupportedNextUseCacheFunctions(ast, id);

      // Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/use-cache/use-cache-wrapper.ts
      // Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-flight-loader/action-client-wrapper.ts
      // Source: https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-rsc/src/transforms/hoist-inline-directive.ts
      // Adaptation: @vitejs/plugin-rsc owns directive hoisting and the RSC
      // graph in this Vite harness. This block adapts that hoist output into
      // Next's `cache(kind, id, boundArgsLength, originalFn, args)` runtime
      // without enabling Next's webpack/Turbopack RSC transforms.
      // Begin adapted: Next.js use-cache source transform bridge
      const result = transformHoistInlineDirective(code, ast as never, {
        runtime: (value, name, meta) => {
          const kind = getNextUseCacheKind(meta.directiveMatch[1]);
          return `__next_rsc_use_cache(${JSON.stringify(kind)}, ${JSON.stringify(
            createNextUseCacheFunctionId(root, id, name),
          )}, ${value})`;
        },
        directive: /^use cache(?:: ([\w-]+))?$/,
        rejectNonAsyncFunction: true,
        noExport: true,
      });
      // End adapted
      if (!result.output.hasChanged()) return;

      result.output.prepend(
        `import { __next_rsc_use_cache } from ${JSON.stringify(virtualNextUseCacheRuntimePublicId)};\n`,
      );
      return {
        code: result.output.toString(),
        map: result.output.generateMap({ hires: "boundary" }),
      };
    },
  };
}

function assertSupportedNextUseCacheFunctions(ast: unknown, id: string) {
  walkAst(ast, (node) => {
    if (!isFunctionWithBlock(node) || !hasNextUseCacheDirective(node)) return;
    if (!hasChildrenParameter(node) || !containsJsx(node.body)) return;

    const file = normalizePath(id.replace(/\?.*$/, ""));
    throw new Error(
      `Next cached components with children are not supported yet in ${file}. ` +
        `The current Vite RSC hoist cannot produce Next's encrypted boundArgsLength call shape; ` +
        `move children outside the "use cache" boundary or avoid cached components with children.`,
    );
  });
}

type AstNode = {
  type?: string;
  body?: unknown;
  params?: unknown[];
  properties?: unknown[];
  argument?: unknown;
  key?: unknown;
  name?: string;
  expression?: unknown;
  value?: unknown;
};

function isFunctionWithBlock(node: AstNode): node is AstNode & {
  body: { type: "BlockStatement"; body: AstNode[] };
  params: AstNode[];
} {
  return (
    (node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression") &&
    isAstNode(node.body) &&
    node.body.type === "BlockStatement" &&
    Array.isArray(node.body.body) &&
    Array.isArray(node.params)
  );
}

function hasNextUseCacheDirective(node: { body: { body: AstNode[] } }) {
  return node.body.body.some((statement) => {
    if (
      statement.type !== "ExpressionStatement" ||
      !isAstNode(statement.expression) ||
      statement.expression.type !== "Literal" ||
      typeof statement.expression.value !== "string"
    ) {
      return false;
    }

    return /^use cache(?:: [\w-]+)?$/.test(statement.expression.value);
  });
}

function hasChildrenParameter(node: { params: AstNode[] }) {
  return node.params.some(hasChildrenBinding);
}

function hasChildrenBinding(node: AstNode): boolean {
  if (node.type === "Identifier") return node.name === "children";
  if (node.type !== "ObjectPattern" || !Array.isArray(node.properties)) return false;

  return node.properties.some((property) => {
    if (!isAstNode(property)) return false;
    if (property.type === "RestElement" && isAstNode(property.argument)) {
      return hasChildrenBinding(property.argument);
    }
    if (property.type !== "Property" && property.type !== "ObjectProperty") return false;
    if (isChildrenPropertyKey(property.key)) return true;
    return isAstNode(property.value) && hasChildrenBinding(property.value);
  });
}

function isChildrenPropertyKey(key: unknown) {
  return (
    (isAstNode(key) && key.type === "Identifier" && key.name === "children") ||
    (isAstNode(key) && key.type === "Literal" && key.value === "children")
  );
}

function containsJsx(node: unknown) {
  let found = false;
  walkAst(node, (candidate) => {
    if (candidate.type === "JSXElement" || candidate.type === "JSXFragment") {
      found = true;
    }
  });
  return found;
}

function walkAst(node: unknown, visit: (node: AstNode) => void) {
  if (!isAstNode(node)) return;
  visit(node);

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) walkAst(item, visit);
    } else {
      walkAst(value, visit);
    }
  }
}

function isAstNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && "type" in value;
}

function getNextUseCacheKind(kind: string | undefined) {
  return kind ?? "default";
}

function createNextUseCacheFunctionId(root: string, id: string, name: string) {
  const file = id.replace(/\?.*$/, "");
  const relative = path.isAbsolute(file) ? normalizePath(path.relative(root, file)) : file;
  return `${relative}#${name}`;
}

function isUserSourceFile(id: string) {
  return (
    /\.(?:[cm]?[jt]sx?)($|\?)/.test(id) && !id.includes("/node_modules/") && !id.includes("/.vite/")
  );
}

function isTestSourceFile(id: string) {
  return /(?:^|[/\\])[^/\\]+\.(?:test|spec)\.[cm]?[jt]sx?(?:$|\?)/.test(id);
}

function getParserLanguage(id: string) {
  const file = id.replace(/\?.*$/, "");
  if (file.endsWith(".tsx")) return "tsx";
  if (file.endsWith(".ts") || file.endsWith(".mts") || file.endsWith(".cts")) return "ts";
  if (file.endsWith(".jsx")) return "jsx";
  return "js";
}
