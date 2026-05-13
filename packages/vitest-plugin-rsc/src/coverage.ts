import { addMapping, GenMapping, setSourceContent, toEncodedMap } from "@jridgewell/gen-mapping";
import type { SourceMapInput } from "rolldown";
import { type Plugin, type ViteDevServer } from "vite";
import {
  ssrDynamicImportKey,
  ssrExportAllKey,
  ssrExportNameKey,
  ssrImportKey,
  ssrImportMetaKey,
  ssrModuleExportsKey,
} from "vite/module-runner";
import * as convertSourceMap from "convert-source-map";

const reactClientCoverageModulePath = "/@vite/react-client-coverage-module";
const reactClientCoverageQuery = "vitest-plugin-rsc-react-client-coverage";
const moduleRunnerArgumentNames = [
  ssrModuleExportsKey,
  ssrImportMetaKey,
  ssrImportKey,
  ssrDynamicImportKey,
  ssrExportAllKey,
  ssrExportNameKey,
];

type ReactClientCoverageModule = {
  code: string;
  map: SourceMapInput;
};

export function createReactClientCoveragePlugin(): Plugin {
  const modules = new Map<string, ReactClientCoverageModule>();

  return {
    name: "rsc:react-client-coverage",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "https://any.local");

        if (url.pathname !== reactClientCoverageModulePath) {
          next();
          return;
        }

        const coverageModule = await readCoverageModule(req);
        const id = normalizeCoverageFileId(coverageModule.file);
        const code = wrapModuleRunnerCode(coverageModule.code);
        const sourceMap = extractInlineSourceMap(coverageModule.code);

        // The posted code already ran in the test iframe via Vite's
        // ModuleRunner. Vitest's V8 provider later remaps browser coverage by
        // asking the Browser Mode `client` graph for source and maps, so this
        // mirrors the react_client transform result under a private URL.
        modules.set(id, {
          code,
          map: hasMappings(sourceMap) ? sourceMap : createIdentitySourceMap(id, code),
        });
        invalidateClientModules(server, id);

        res.statusCode = 204;
        res.end();
      });
    },
    load(id) {
      if (this.environment.name !== "client") return;
      if (!isReactClientCoverageId(id)) return;
      return modules.get(normalizeCoverageFileId(id));
    },
  };
}

function isReactClientCoverageId(id: string) {
  const query = id.split("?", 2)[1];
  return query !== undefined && new URLSearchParams(query).has(reactClientCoverageQuery);
}

async function readCoverageModule(req: AsyncIterable<Uint8Array>) {
  const decoder = new TextDecoder();
  let json = "";

  for await (const chunk of req) {
    json += decoder.decode(chunk, { stream: true });
  }

  json += decoder.decode();

  const body = JSON.parse(json) as { file: string; code: string };
  if (typeof body.file !== "string" || typeof body.code !== "string") {
    throw new TypeError("Invalid react client coverage module payload.");
  }
  return body;
}

function extractInlineSourceMap(code: string) {
  return convertSourceMap.fromSource(code)?.toObject();
}

function hasMappings(map: unknown): map is { mappings: string } {
  return (
    typeof map === "object" &&
    map !== null &&
    "mappings" in map &&
    typeof map.mappings === "string" &&
    map.mappings.length > 0
  );
}

function createIdentitySourceMap(file: string, code: string) {
  const source = `file://${file}`;
  const map = new GenMapping();

  setSourceContent(map, source, code);

  for (let line = 1; line <= code.split("\n").length; line++) {
    addMapping(map, {
      generated: { line, column: 0 },
      source,
      original: { line, column: 0 },
    });
  }

  return toEncodedMap(map);
}

function wrapModuleRunnerCode(code: string) {
  const AsyncFunction = async function () {}.constructor as new (
    ...args: string[]
  ) => (...args: unknown[]) => Promise<unknown>;

  return new AsyncFunction(...moduleRunnerArgumentNames, `"use strict";${code}`).toString();
}

function normalizeCoverageFileId(id: string) {
  const cleanId = id.split(/[?#]/, 1)[0]!;
  let pathname = cleanId;

  if (cleanId.startsWith("file://")) {
    return fileUrlToPath(cleanId);
  }

  if (cleanId.startsWith("http://") || cleanId.startsWith("https://")) {
    pathname = decodeURIComponent(new URL(cleanId).pathname);
  }

  if (pathname.startsWith("/@fs/")) {
    return pathname.slice("/@fs".length);
  }

  return pathname;
}

function fileUrlToPath(id: string) {
  const url = new URL(id);
  const pathname = decodeURIComponent(url.pathname);
  if (url.hostname) return `//${url.hostname}${pathname}`;
  return pathname.replace(/^\/([A-Za-z]:)/, "$1");
}

function invalidateClientModules(server: ViteDevServer, file: string) {
  const modules = server.environments.client.moduleGraph.getModulesByFile(file) ?? [];

  for (const moduleNode of modules) {
    server.environments.client.moduleGraph.invalidateModule(moduleNode);
  }
}
