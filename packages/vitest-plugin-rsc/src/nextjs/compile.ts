import fs from "node:fs";
import { normalizePath, type Plugin } from "vite";
import type { NextLayer, NextProject } from "./project.ts";

// Before Next bundles the code of the app, its build compiles it with its SWC
// transform. Here that runs in the environments of the three layers, as
// Next's own code (project.ts).

// The files next-swc-loader compiles, as far as Vite serves them as modules.
const sourceFile = /\.(?:tsx|ts|jsx|js|mjs)$/;

export function createCompilePlugin(
  getProject: () => NextProject,
  layerOf: (environment: string) => NextLayer | undefined,
  isAppCode: (file: string, layer: NextLayer) => boolean,
): Plugin {
  return {
    name: "vitest-plugin-rsc:next-compile",
    enforce: "pre",
    async transform(code, id) {
      const layer = layerOf(this.environment.name);
      if (!layer || id.includes("?") || !sourceFile.test(id)) return;
      if (!isAppCode(id, layer) || !fs.existsSync(id)) return;
      if (id.startsWith(`${normalizePath(this.environment.config.cacheDir)}/`)) return;
      const compiled = await getProject().compile(code, id, layer);
      return compiled && { code: compiled.code, map: compiled.map ?? null };
    },
  };
}
