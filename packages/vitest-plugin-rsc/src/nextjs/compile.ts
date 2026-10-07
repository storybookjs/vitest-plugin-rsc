import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { normalizePath, type Plugin } from "vite";
import type { NextLayer, NextProject } from "./project.ts";

// Before Next bundles the code of the app, its build compiles it: with its SWC
// transform, and with a webpack loader for fonts. Here those run in the
// environments of the three layers, as Next's own code (project.ts). What the
// loader emits for the browser, the dev server serves where a deployment does.

// A call of a `next/font` function: a module for what it returns, and one for
// its CSS, which Vite puts in the page.
const fontPrefix = "\0vitest-plugin-rsc/next-font/";
const fontRequest = /^next\/font\/(?:google|local)\/target\.css\?/;
// The files next-swc-loader compiles, as far as Vite serves them as modules.
const sourceFile = /\.(?:tsx|ts|jsx|js|mjs)$/;

// Next also compiles a package that calls `next/font`, like `geist`. For the
// dependency optimizer, which pre-bundles a package without Vite's plugins:
// the import of the font stays one, for the plugin below to resolve when the
// pre-bundled package is served.
export function createDependencyCompilePlugin(getProject: () => NextProject, layer: NextLayer) {
  return {
    name: "vitest-plugin-rsc:next-compile-dependency",
    resolveId(source: string) {
      if (fontRequest.test(source)) return { id: source, external: true };
    },
    async transform(code: string, id: string) {
      if (!/\.[cm]?js$/.test(id) || !/\bnext\/font\b/.test(code)) return;
      // Not Next's own files, which name it too.
      if (!path.relative(getProject().nextDir, id).startsWith("..")) return;
      const compiled = await getProject().compile(code, id, layer);
      return compiled && { code: compiled.code, map: compiled.map ?? null };
    },
  };
}

export function createCompilePlugin(
  getProject: () => NextProject,
  layerOf: (environment: string) => NextLayer | undefined,
  isAppCode: (file: string, layer: NextLayer) => boolean,
): Plugin {
  return {
    name: "vitest-plugin-rsc:next-compile",
    enforce: "pre",
    configureServer(server) {
      const serve = async (request: IncomingMessage, response: ServerResponse) => {
        const project = getProject();
        const file = project.readEmittedFile(new URL(request.url!, "http://n").pathname);
        if (!file) return false;
        response.setHeader("content-type", file.contentType);
        response.end(file.body);
        return true;
      };
      server.middlewares.use(async (request, response, next) => {
        let served: boolean;
        try {
          served = await serve(request, response);
        } catch (error) {
          // As Next's server answers a request that failed. Vite would
          // answer it with the error overlay of a module.
          server.config.logger.error(`vitest-plugin-rsc: ${request.url} failed. ${String(error)}`);
          response.statusCode = 500;
          response.end("Internal Server Error");
          return;
        }
        if (!served) next();
      });
    },
    resolveId(source) {
      if (source.startsWith(fontPrefix)) return source;
      if (!fontRequest.test(source)) return;
      // The call is in the id, the same one in every layer.
      return `${fontPrefix}${Buffer.from(source).toString("base64url")}.js`;
    },
    async load(id) {
      if (id.startsWith(fontPrefix)) {
        const key = id.slice(fontPrefix.length).replace(/\.(?:js|css)$/, "");
        const request = Buffer.from(key, "base64url").toString();
        const { css, exports } = await getProject().loadFont(request);
        if (id.endsWith(".css")) return css;
        return (
          `import ${JSON.stringify(`${fontPrefix}${key}.css`)};\n` +
          `export default ${JSON.stringify(exports)};\n`
        );
      }
    },
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
