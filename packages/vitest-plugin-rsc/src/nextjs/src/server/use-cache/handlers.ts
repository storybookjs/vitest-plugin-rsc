import path from "node:path";
import type { Plugin } from "vite";
import { loadNextProjectConfig } from "../../../config.ts";
import { getProjectRoot, normalizePath } from "../../../plugin-utils.ts";

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/use-cache/handlers.ts#L11-L127
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-edge-ssr-loader/index.ts#L66-L105
// Adaptation: Next's webpack/Edge entries register configured cache handlers
// directly. The Vite runtime emits a virtual module with the same configured
// handler imports so app render can initialize Next's handler registry.
// Begin adapted: Next.js cache handler setup bridge
export const virtualNextCacheHandlersPublicId = "virtual:vitest-plugin-rsc/next-cache-handlers";
const virtualNextCacheHandlersId = `\0${virtualNextCacheHandlersPublicId}`;

export function useNextCacheHandlers(initialRoot = process.cwd()): Plugin {
  let root = initialRoot;
  let mode = "test";
  let cacheHandlersModule: Promise<string> | undefined;

  return {
    name: "next-rsc-cache-handlers",
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === "client";
    },
    configResolved(config) {
      root = getProjectRoot(config);
      mode = config.mode;
      cacheHandlersModule = undefined;
    },
    resolveId(source) {
      if (source === virtualNextCacheHandlersPublicId) {
        return virtualNextCacheHandlersId;
      }
    },
    load(id) {
      if (id !== virtualNextCacheHandlersId) return;

      cacheHandlersModule ??= createNextCacheHandlersModule(root, mode);
      return cacheHandlersModule;
    },
  };
}

async function createNextCacheHandlersModule(root: string, mode: string) {
  const { nextConfig, distDir } = await loadNextProjectConfig(root, mode);
  const cacheHandlers = Object.entries(nextConfig.cacheHandlers ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
  );

  if (cacheHandlers.length === 0) {
    return "export const nextCacheHandlers = {};\n";
  }

  const imports: string[] = [];
  const entries: string[] = [];
  for (const [index, [kind, handler]] of cacheHandlers.entries()) {
    const binding = `cacheHandler_${index}`;
    const handlerPath = path.isAbsolute(handler) ? handler : path.join(root, distDir, handler);
    // Mirror Next's cache handler config resolution: relative handler paths are
    // resolved from distDir, absolute paths stay absolute.
    // Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/next-server.ts#L394-L405
    imports.push(`import ${binding} from ${JSON.stringify(normalizePath(handlerPath))};`);
    entries.push(`${JSON.stringify(kind)}: ${binding}`);
  }

  return `${imports.join("\n")}\nexport const nextCacheHandlers = { ${entries.join(", ")} };\n`;
}
// End adapted
