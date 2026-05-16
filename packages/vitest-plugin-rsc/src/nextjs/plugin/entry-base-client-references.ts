import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { getProjectRoot, normalizePath, tryResolveFromProject } from "../plugin-utils.ts";

const virtualNextEntryBaseClientReferencePrefix =
  "\0vitest-plugin-rsc:next-entry-base-client-reference:";
const virtualNextEntryBaseClientReferencePublicPrefix =
  "virtual:vitest-plugin-rsc/next-entry-base-client-reference/";

// Next's app-render entry-base is a server-layer CJS module that re-exports
// client components via relative require() calls. Next's webpack/Turbopack
// layer metadata keeps those imports as client references. Vite/Rolldown dep
// optimization otherwise inlines the CJS "use client" modules into the RSC
// optimized chunk, so they execute with React Server aliases. Keep the real
// Next entry-base module, but intercept only these entry-base imports so the
// RSC graph receives client references and the browser/SSR graphs load the
// real Next client modules.
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/entry-base.ts
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack/plugins/flight-client-entry-plugin.ts
// Upstream direction: @vitejs/plugin-rsc could preserve CJS "use client"
// dependency boundaries during RSC dep optimization, externalize/proxy those
// modules, and register that proxy with registerClientReference.
export function useNextEntryBaseClientReferences(initialRoot = process.cwd()): Plugin {
  let root = initialRoot;

  return {
    name: "next-rsc-entry-base-client-references",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
    },
    resolveId(source, importer) {
      if (source.startsWith(virtualNextEntryBaseClientReferencePrefix)) {
        return source;
      }
      if (source.startsWith(virtualNextEntryBaseClientReferencePublicPrefix)) {
        const moduleId = source.slice(virtualNextEntryBaseClientReferencePublicPrefix.length);
        return `${virtualNextEntryBaseClientReferencePrefix}${encodeURIComponent(moduleId)}`;
      }
      if (!importer || !isNextEntryBaseModule(importer)) {
        return;
      }

      const moduleId = resolveNextEntryBaseClientReferenceModuleId(root, source, importer);
      if (!moduleId) {
        return;
      }

      return `${virtualNextEntryBaseClientReferencePrefix}${encodeURIComponent(moduleId)}`;
    },
    load(id) {
      if (!id.startsWith(virtualNextEntryBaseClientReferencePrefix)) return;

      const moduleId = decodeURIComponent(
        id.slice(virtualNextEntryBaseClientReferencePrefix.length),
      );
      if (!this.environment || this.environment.name === "client") {
        return createNextEntryBaseServerClientReferenceModule(root, moduleId);
      }

      return createNextEntryBaseClientReferenceModule(root, moduleId);
    },
  };
}

function isNextEntryBaseModule(id: string) {
  return /[/\\]next[/\\]dist[/\\]server[/\\]app-render[/\\]entry-base\.js(?:\?|$)/.test(id);
}

function createNextEntryBaseClientReferenceModule(root: string, moduleId: string) {
  const exports = getNextEntryBaseClientReferenceExports(root, moduleId).join(", ");

  return `"use client";\nexport { ${exports} } from ${JSON.stringify(moduleId)};\n`;
}

function createNextEntryBaseServerClientReferenceModule(root: string, moduleId: string) {
  const encodedModuleId = encodeURIComponent(moduleId);
  const id = `/@id/__x00__${virtualNextEntryBaseClientReferencePrefix.slice(1)}${encodedModuleId}`;
  const exports = getNextEntryBaseClientReferenceExports(root, moduleId);
  const namedExports = exports
    .filter((name) => name !== "default")
    .map((name) => `export const ${name} = createClientReference(${JSON.stringify(name)});`)
    .join("\n");
  const defaultExport = exports.includes("default")
    ? `export default createClientReference("default");`
    : "";

  return `
import { registerClientReference } from "@vitejs/plugin-rsc/react/rsc";

function createClientReference(name) {
  return registerClientReference(
    function() {
      throw new Error("Unexpectedly client reference export '" + name + "' is called on server");
    },
    ${JSON.stringify(id)},
    name
  );
}

${defaultExport}
${namedExports}
`;
}

function getNextEntryBaseClientReferenceExports(root: string, moduleId: string) {
  const moduleFile = tryResolveFromProject(root, moduleId);
  if (!moduleFile) {
    throw new Error(`Could not resolve ${moduleId} for Next entry-base client reference.`);
  }

  try {
    const exports = readNextCommonJsExports(moduleFile) ?? [];
    if (exports.length === 0) {
      throw new Error(`No CommonJS exports found in ${moduleId}.`);
    }
    return exports;
  } catch (error) {
    throw new Error(`Could not read exports from ${moduleId}.`, { cause: error });
  }
}

function resolveNextEntryBaseClientReferenceModuleId(
  root: string,
  source: string,
  importer: string,
) {
  const importerFile = importer.split("?")[0];
  if (!importerFile) return;

  const moduleFile = resolveNextEntryBaseImport(source, importerFile);
  if (!moduleFile || !isNextClientModuleFile(moduleFile)) return;

  return createNextDistModuleId(root, moduleFile);
}

function resolveNextEntryBaseImport(source: string, importerFile: string) {
  if (!source.startsWith(".")) return;

  const resolved = path.resolve(path.dirname(importerFile), source);
  for (const file of [resolved, `${resolved}.js`, path.join(resolved, "index.js")]) {
    if (fs.existsSync(file)) return file;
  }
}

function isNextClientModuleFile(file: string) {
  try {
    return hasUseClientDirective(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}

function hasUseClientDirective(code: string) {
  return /^\s*(?:["']use client["'];?)/.test(code);
}

function createNextDistModuleId(root: string, file: string) {
  const nextDistDir = path.dirname(tryResolveFromProject(root, "next/package.json") ?? "");
  const distDir = path.join(nextDistDir, "dist");
  const relative = path.relative(distDir, file);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    return `next/dist/${normalizePath(relative)}`;
  }

  const marker = `${path.sep}node_modules${path.sep}next${path.sep}dist${path.sep}`;
  const markerIndex = file.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return `next/dist/${normalizePath(file.slice(markerIndex + marker.length))}`;
  }
}

function readNextCommonJsExports(file: string) {
  const code = fs.readFileSync(file, "utf8");
  const names: string[] = [];
  const seen = new Set<string>();
  const addName = (name: string) => {
    if (name === "__esModule" || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };

  const exportMarker = /0 && \(module\.exports = \{([\s\S]*?)\}\);/.exec(code);
  if (exportMarker) {
    for (const match of exportMarker[1]!.matchAll(/^\s*([A-Za-z_$][\w$]*|default):/gm)) {
      addName(match[1]!);
    }
  }

  for (const match of code.matchAll(
    /Object\.defineProperty\(exports,\s*(?:\/\*[\s\S]*?\*\/\s*)*["']([^"']+)["']/g,
  )) {
    addName(match[1]!);
  }

  return names.length > 0 ? names : undefined;
}
