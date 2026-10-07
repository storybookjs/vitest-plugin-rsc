import { createRequire } from "node:module";
import path from "node:path";
import { parseAstAsync, type Plugin } from "vite";
import type { NextProject } from "./project.ts";

// SPIKE (research/use-cache-spike). Not a feature build.
//
// `"use cache"` is compiled by Next's own SWC transform, the one `next build`
// runs: `async function f() { "use cache" }` becomes
// `$$cache__(kind, id, boundArgsLength, f, args)`. Only its server-actions
// pass runs here, on the JavaScript Vite has already made of the file.
//
// The same pass also compiles `"use server"`, with ids of Next's build. Vite
// RSC has compiled those by the time this runs and leaves the directive
// behind, so it is removed first and Next's pass sees none.

const cacheWrapperId = "private-next-rsc-cache-wrapper";
const serverReferenceId = "private-next-rsc-server-reference";
const encryptionId = "private-next-rsc-action-encryption";

type AstNode = { type: string; start: number; end: number; [key: string]: any };

// Replacements of ranges of the code, applied from the end. An insertion is a
// range without length.
type Edit = [start: number, end: number, text: string];

function applyEdits(code: string, edits: Edit[]): string {
  const ordered = edits.map((edit, index) => ({ edit, index }));
  ordered.sort((a, b) => b.edit[0] - a.edit[0] || b.index - a.index);
  for (const { edit } of ordered) code = code.slice(0, edit[0]) + edit[2] + code.slice(edit[1]);
  return code;
}

function* statementsOf(node: unknown): Generator<AstNode> {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) yield* statementsOf(item);
    return;
  }
  const candidate = node as AstNode;
  if (typeof candidate.type !== "string") return;
  yield candidate;
  for (const [key, value] of Object.entries(candidate)) {
    if (key !== "type" && typeof value === "object") yield* statementsOf(value);
  }
}

// What the cached function of the "coroutine" variant is compiled to: the same
// function as a generator, with `yield` for each `await` of its own. The
// runner (use-cache-runtime.ts) enters the scope of the call around each step.
// Only the functions Next's pass has named `$$RSC_SERVER_CACHE_<n>_INNER`.
function compileCoroutines(code: string, ast: AstNode): string | undefined {
  const edits: Edit[] = [];
  for (const node of statementsOf(ast)) {
    if (
      node.type !== "VariableDeclarator" ||
      !/^\$\$RSC_SERVER_CACHE_\d+_INNER$/.test(node.id?.name ?? "") ||
      node.init?.type !== "FunctionExpression" ||
      !node.init.async
    ) {
      continue;
    }
    const fn = node.init as AstNode;
    const visit = (child: unknown): void => {
      if (!child || typeof child !== "object") return;
      if (Array.isArray(child)) return child.forEach(visit);
      const inner = child as AstNode;
      if (typeof inner.type !== "string") return;
      // An `await` of a function inside belongs to that function.
      if (/Function/.test(inner.type)) return;
      if (inner.type === "ForOfStatement" && inner.await) {
        throw new Error('vitest-plugin-rsc spike: `for await` in a "use cache" function');
      }
      if (inner.type === "AwaitExpression") {
        edits.push([inner.start, inner.argument.start, "(yield "], [inner.end, inner.end, ")"]);
      }
      for (const [key, value] of Object.entries(inner)) {
        if (key !== "type" && typeof value === "object") visit(value);
      }
    };
    visit(fn.body);
    // async function name(params) { body }  ->
    // function name(params) { return $$coroutine(function* () { body }.bind(this)); }
    edits.push(
      [fn.start, fn.start + "async ".length, ""],
      [fn.body.start, fn.body.start, "{ return $$coroutine(function* () "],
      [fn.body.end, fn.body.end, "); }"],
    );
  }
  if (edits.length === 0) return;
  return `import { coroutine as $$coroutine } from "vitest-plugin-rsc/next/use-cache-runtime";\n${applyEdits(code, edits)}`;
}

/**
 * What a compiled `"use cache"` function imports. Next's alias table sends
 * `private-next-rsc-cache-wrapper` to its own wrapper, so this has to resolve
 * before that table does.
 */
export function useCacheResolvePlugin(environment: string): Plugin {
  return {
    name: "vitest-plugin-rsc:next-use-cache-resolve",
    enforce: "pre",
    applyToEnvironment: (candidate) => candidate.name === environment,
    resolveId(source, importer, options) {
      if (source === cacheWrapperId) {
        return this.resolve("vitest-plugin-rsc/next/use-cache-runtime", importer, options);
      }
      if (source === serverReferenceId) return `\0${serverReferenceId}`;
      if (source === encryptionId) {
        return this.resolve("next/dist/server/app-render/encryption", importer, options);
      }
    },
    load(id) {
      // SPIKE: a cached function is also a server reference in Next, so that a
      // Client Component can get it as a prop. Not looked at here.
      if (id === `\0${serverReferenceId}`) {
        return `export const registerServerReference = (fn) => fn;`;
      }
    },
  };
}

export function useCachePlugin(
  getProject: () => NextProject,
  environment: string,
  variant: () => string,
): Plugin {
  let swc: { loadBindings(): Promise<unknown>; transform(code: string, options: object): Promise<{ code: string; map?: string }> };

  return {
    name: "vitest-plugin-rsc:next-use-cache",
    applyToEnvironment: (candidate) => candidate.name === environment,
    async transform(code, id) {
      const file = id.split("?")[0]!;
      if (!code.includes("use cache") || !/\.[cm]?[jt]sx?$/.test(file)) return;
      if (file.includes("/node_modules/")) return;
      const project = getProject();
      const ast = (await parseAstAsync(code)) as unknown as AstNode;

      const edits: Edit[] = [];
      let found = false;
      for (const node of statementsOf(ast)) {
        if (node.type !== "ExpressionStatement" || node.expression?.type !== "Literal") continue;
        const value = node.expression.value;
        if (value === "use server") edits.push([node.start, node.end, ""]);
        if (typeof value === "string" && /^use cache(?:: .+)?$/.test(value)) found = true;
      }
      if (!found) return;

      if (!swc) {
        const require = createRequire(path.join(project.root, "package.json"));
        swc = require("next/dist/build/swc/index.js");
        await swc.loadBindings();
      }
      const config = project.config as {
        cacheHandlers?: Record<string, string>;
        experimental?: { useCache?: boolean };
      };
      const result = await swc.transform(applyEdits(code, edits), {
        filename: file,
        sourceMaps: true,
        isModule: true,
        jsc: { parser: { syntax: "ecmascript" }, target: "esnext" },
        // The options of `getBaseSWCOptions()` in next/dist/build/swc/options.
        serverActions: {
          isReactServerLayer: true,
          isDevelopment: false,
          useCacheEnabled: !!config.experimental?.useCache,
          hashSalt: "",
          cacheKinds: ["default", "remote", "private", ...Object.keys(config.cacheHandlers ?? {})],
        },
      });

      if (variant() === "coroutine") {
        const compiled = compileCoroutines(
          result.code,
          (await parseAstAsync(result.code)) as unknown as AstNode,
        );
        if (compiled) return { code: compiled, map: null };
      }
      return { code: result.code, map: result.map ?? null };
    },
  };
}
