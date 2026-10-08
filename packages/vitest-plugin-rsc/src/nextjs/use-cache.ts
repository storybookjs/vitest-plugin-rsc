import { createHash } from "node:crypto";
import fs from "node:fs";
import { transformHoistInlineDirective, transformWrapExport } from "@vitejs/plugin-rsc/transforms";
import { parseAstAsync, type Plugin } from "vite";
import type { NextLayer, NextProject } from "./project.ts";

// `"use cache"`: a function of the app whose result the server keeps. Next's
// build compiles such a function with the part of its SWC transform that also
// compiles Server Actions, which is Vite RSC's here. So this compiles it, with
// Vite RSC's own transforms, into what Next's makes of it: a call of Next's
// cache wrapper, which is Next's runtime and does the rest.

/** The module with the function that compiled code wraps a cached function in. */
export const useCacheId = "virtual:vitest-plugin-rsc/next-use-cache";

// The wrapper is Next's. Next's compiler also puts React's `cache()` around
// it, so that two calls with the same arguments in one render are one.
export const useCacheModule = `
import { cache } from "next/dist/build/webpack/loaders/next-flight-loader/cache-wrapper";
import { cache as reactCache } from "react";
export function useCache(kind, id, fn, undeclared) {
  const cached = reactCache(function () {
    // The arguments the function declares, as Next's compiler passes them:
    // what a caller passes on top of those, like the index of a \`map()\`, is
    // no part of the key. \`fn.length\` also counts what the function closes
    // over, which comes first: it is passed like an argument of the call,
    // not as a bound argument, and is part of the key like one.
    const args =
      undeclared === null
        ? arguments
        : Array.prototype.slice.call(arguments, 0, fn.length + undeclared);
    return cache(kind, id, 0, fn, args);
  });
  Object.defineProperty(cached, "name", { value: fn.name });
  return cached;
}
`;

// `"use cache"`, or with the name of a cache handler: `"use cache: remote"`.
const directive = /^use cache(?:: (.+))?$/;

type FunctionNode = { type: string; params?: { type: string }[] };

// The parameters of a function that its `length` does not count: the ones
// from the first with a default value on. Nothing for a function that takes
// the rest of its arguments, or for what is not a function to see.
function undeclaredParams(node: FunctionNode | undefined): number | null {
  if (!node?.params || !/Function/.test(node.type)) return null;
  if (node.params.some((param) => param.type === "RestElement")) return null;
  const counted = node.params.findIndex((param) => param.type === "AssignmentPattern");
  return counted === -1 ? 0 : node.params.length - counted;
}

export function createUseCachePlugin(
  getProject: () => NextProject,
  layerOf: (environment: string) => NextLayer | undefined,
  isAppCode: (file: string, layer: NextLayer) => boolean,
): Plugin {
  return {
    name: "vitest-plugin-rsc:next-use-cache",
    async transform(code, id) {
      if (!code.includes("use cache")) return;
      const config = getProject().config as {
        cacheComponents?: boolean;
        experimental?: { useCache?: boolean };
      };
      // What Next's compiler takes the directive with.
      if (!config.cacheComponents && !config.experimental?.useCache) return;
      const file = id.split("?")[0]!;
      if (layerOf(this.environment.name) !== "rsc" || !isAppCode(file, "rsc")) return;
      if (!fs.existsSync(file)) return;

      const ast = await parseAstAsync(code);
      // What Next's cache has an entry of the function under, with its arguments.
      const moduleId = createHash("sha1").update(file).digest("hex").slice(0, 16);
      const runtime = (
        kind: string | undefined,
        value: string,
        name: string,
        node: FunctionNode | undefined,
      ) =>
        `$$useCache(${JSON.stringify(kind ?? "default")}, ` +
        `${JSON.stringify(`${moduleId}:${name}`)}, ${value}, ${undeclaredParams(node)})`;

      // At the top of a module: every function it exports.
      let moduleKind: string | undefined;
      let ofModule = false;
      for (const statement of ast.body) {
        if (statement.type !== "ExpressionStatement" || !("directive" in statement)) break;
        const match = directive.exec(String(statement.directive));
        if (match) [ofModule, moduleKind] = [true, match[1]];
      }
      const { output } = ofModule
        ? transformWrapExport(code, ast, {
            runtime: (value, name, meta) =>
              runtime(moduleKind, value, name, meta.valueNode as FunctionNode | undefined),
            ignoreExportAllDeclaration: true,
            rejectNonAsyncFunction: true,
          })
        : transformHoistInlineDirective(code, ast, {
            directive,
            runtime: (value, name, meta) =>
              runtime(meta.directiveMatch[1], value, name, meta.valueNode),
            rejectNonAsyncFunction: true,
            noExport: true,
          });
      if (!output.hasChanged()) return;
      output.prepend(`import { useCache as $$useCache } from ${JSON.stringify(useCacheId)};\n`);
      return { code: output.toString(), map: output.generateMap({ hires: "boundary" }) };
    },
  };
}
