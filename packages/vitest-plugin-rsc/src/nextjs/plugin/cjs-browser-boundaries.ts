import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";
import {
  cjsBrowserPlugin,
  collectCjsRequireSources,
  hasUseClientDirective,
  type CjsBrowserPluginOptions,
} from "../../cjs-browser-plugin.ts";
import { getProjectRoot, tryResolveFromProject } from "../plugin-utils.ts";

const nextEntryBaseModuleId = "next/dist/server/app-render/entry-base.js";
const nextBuiltinGlobalErrorModuleId = "next/dist/client/components/builtin/global-error.js";
const nextDirectClientBoundaryModuleIds = [
  "next/dist/client/app-dir/form.js",
  "next/dist/client/app-dir/link.js",
  "next/dist/client/script.js",
] as const;

type NextCjsBrowserBoundaryOptions = Pick<
  CjsBrowserPluginOptions,
  "boundary" | "runtime" | "optimizer"
>;

type NextCjsBrowserBoundaryPluginOptions = {
  initialRoot?: string;
  name: string;
};

// Next's app-render entry-base is a server-layer CJS module that re-exports
// client components via relative require() calls. Next's webpack/Turbopack
// layer metadata keeps those imports as client references; Vite/Rolldown dep
// optimization otherwise sees ordinary CommonJS and may inline those client
// files into the RSC chunk.
//
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/entry-base.ts
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack/plugins/flight-client-entry-plugin.ts
// Adaptation: @vitejs/plugin-rsc owns the client-reference protocol in this
// package, so this code only discovers the small set of real Next CJS files
// that must be routed through the generic CJS browser transform.
export function useNextCjsBrowserBoundaries({
  initialRoot = process.cwd(),
  name,
}: NextCjsBrowserBoundaryPluginOptions): Plugin[] {
  let includeFiles = new Set<string>();
  const options = createNextCjsBrowserBoundaryOptionsFromFiles(includeFiles);
  const refreshIncludeFiles = async (root: string) => {
    const discovered = await collectNextCjsBrowserBoundaryFiles(root);
    includeFiles.clear();
    for (const file of discovered) includeFiles.add(file);
  };

  return [
    {
      name: `${name}:boundary-discovery`,
      async configResolved(config) {
        await refreshIncludeFiles(getProjectRoot(config));
      },
      async buildStart() {
        if (includeFiles.size === 0) {
          await refreshIncludeFiles(initialRoot);
        }
      },
    },
    ...cjsBrowserPlugin({
      ...options,
      name,
    }),
  ];
}

export async function createNextCjsBrowserBoundaryOptions(
  root: string,
): Promise<NextCjsBrowserBoundaryOptions> {
  return createNextCjsBrowserBoundaryOptionsFromFiles(
    await collectNextCjsBrowserBoundaryFiles(root),
  );
}

function createNextCjsBrowserBoundaryOptionsFromFiles(
  files: ReadonlySet<string>,
): NextCjsBrowserBoundaryOptions {
  return {
    boundary: {
      include: isNextEntryBaseModuleFile,
      includeParent: isNextEntryBaseModuleFile,
      includeReferenced: (id) => files.has(normalizeModuleFile(id)),
      moduleId: createNextDistModuleId,
    },
    runtime: {
      include: (id) => isNextRuntimeCjsFile(id) && !files.has(normalizeModuleFile(id)),
      moduleId: createNextDistModuleId,
      resolveBareImport: resolveNextBareBrowserImport,
      rewriteNestedRequires: shouldRewriteNextNestedRequires,
    },
    optimizer: {
      rewriteParentRequires: true,
    },
  };
}

export async function collectNextCjsBrowserBoundaryFiles(root: string) {
  const files = new Set<string>();
  const queue: string[] = [];

  const add = (file: string | undefined) => {
    if (!file) return;

    const normalized = normalizeModuleFile(file);
    if (files.has(normalized)) return;

    files.add(normalized);
    queue.push(normalized);
  };

  const entryBaseFile = tryResolveFromProject(root, nextEntryBaseModuleId);
  add(entryBaseFile);
  if (entryBaseFile) {
    for (const file of await collectUseClientRelativeRequires(entryBaseFile)) add(file);
  }

  const globalErrorFile = tryResolveFromProject(root, nextBuiltinGlobalErrorModuleId);
  if (globalErrorFile && (await hasUseClientDirectiveFile(globalErrorFile))) {
    add(globalErrorFile);
  }

  for (const moduleId of nextDirectClientBoundaryModuleIds) {
    const file = tryResolveFromProject(root, moduleId);
    if (file && (await hasUseClientDirectiveFile(file))) {
      add(file);
    }
  }

  for (let index = 0; index < queue.length; index++) {
    const file = queue[index]!;
    if (file === normalizeModuleFile(entryBaseFile ?? "")) continue;
    if (!(await hasUseClientDirectiveFile(file))) continue;

    for (const child of await collectUseClientRelativeRequires(file)) add(child);
  }

  return files;
}

export function isNextEntryBaseModuleFile(id: string) {
  return /[/\\]node_modules[/\\]next[/\\]dist[/\\]server[/\\]app-render[/\\]entry-base\.js$/.test(
    normalizeModuleFile(id),
  );
}

function normalizeModuleFile(id: string) {
  const file = path.normalize(id.replace(/[?#].*$/, ""));
  try {
    return fs.realpathSync.native(file);
  } catch {
    return file;
  }
}

async function collectUseClientRelativeRequires(importer: string) {
  const code = fs.readFileSync(importer, "utf8");
  const files: string[] = [];

  for (const source of await collectCjsRequireSources(code, importer)) {
    if (!source.startsWith(".")) continue;

    const file = tryResolveRelativeImport(source, importer);
    if (file && (await hasUseClientDirectiveFile(file))) {
      files.push(file);
    }
  }

  return files;
}

async function hasUseClientDirectiveFile(file: string) {
  try {
    return await hasUseClientDirective(fs.readFileSync(file, "utf8"), file);
  } catch {
    return false;
  }
}

function tryResolveRelativeImport(source: string, importer: string) {
  try {
    return createRequire(importer).resolve(source);
  } catch {
    return;
  }
}

function createNextDistModuleId(file: string) {
  const marker = `${path.sep}node_modules${path.sep}next${path.sep}dist${path.sep}`;
  const markerIndex = file.lastIndexOf(marker);
  if (markerIndex === -1) return;
  return `next/dist/${file
    .slice(markerIndex + marker.length)
    .split(path.sep)
    .join("/")}`;
}

function isNextExecutableCjsChildFile(id: string) {
  return /[/\\]node_modules[/\\]next[/\\]dist[/\\](?:compiled[/\\]next-devtools[/\\]index|client[/\\]components[/\\](?:navigation-devtools|not-found))\.js$/.test(
    normalizeModuleFile(id),
  );
}

function isNextRuntimeCjsFile(id: string) {
  const file = normalizeModuleFile(id);
  if (
    /[/\\]node_modules[/\\]next[/\\]dist[/\\]client[/\\]components[/\\](?:router-reducer[/\\]fetch-server-response|segment-cache[/\\](?:cache|navigation)\.js$)/.test(
      file,
    )
  ) {
    return false;
  }
  return /[/\\]node_modules[/\\]next[/\\]dist[/\\](?:client[/\\].+|compiled[/\\][^/\\]+[/\\]index|lib[/\\].+|next-devtools[/\\].+|server[/\\](?:app-render[/\\](?:action-async-storage|work-async-storage|work-unit-async-storage)(?:\.external|-instance)|dev[/\\]hot-reloader-types)|shared[/\\].+)\.js$/.test(
    file,
  );
}

function shouldRewriteNextNestedRequires(id: string) {
  return !/[/\\]node_modules[/\\]next[/\\]dist[/\\]client[/\\]components[/\\]navigation-untracked\.js$/.test(
    normalizeModuleFile(id),
  );
}

function resolveNextBareBrowserImport(source: string, environmentName?: string) {
  if (source !== "react-server-dom-webpack/client") return;
  return environmentName === "react_client"
    ? "@vitejs/plugin-rsc/vendor/react-server-dom/client.browser"
    : "@vitejs/plugin-rsc/vendor/react-server-dom/client.edge";
}
