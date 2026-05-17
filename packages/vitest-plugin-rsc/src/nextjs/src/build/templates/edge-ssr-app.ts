import { defaultConfig } from "next/dist/server/config-shared.js";
import { getNextFontManifestForRender } from "../webpack/plugins/next-font-manifest-plugin.ts";

export type NextEdgeAppPageManifests = {
  clientReferenceManifest: unknown;
  serverActionsManifest: unknown;
};

type NextEdgeAppPageBuildManifest = {
  devFiles: string[];
  lowPriorityFiles: string[];
  pages: Record<string, string[]>;
  polyfillFiles: string[];
  rootMainFiles: string[];
  rootMainFilesTree: Record<string, string[]>;
};

// Begin adapted: Next.js Edge App Page render manifest globals
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/templates/edge-ssr-app.ts
// Adaptation: Next's generated edge-ssr-app entrypoint reads these worker
// globals before seeding app-render's manifest singleton and again from
// RouteModule.prepare() for each request. Install the dispatch manifests before
// importing the generated module so module evaluation observes the same manifest
// data that app-render receives for the request.
export function installNextEdgeAppPageManifests(
  page: string,
  manifests: NextEdgeAppPageManifests,
): void {
  const globalScope = globalThis as typeof globalThis & {
    __BUILD_MANIFEST?: NextEdgeAppPageBuildManifest;
    __NEXT_FONT_MANIFEST?: string;
    __REACT_LOADABLE_MANIFEST?: string;
    __RSC_MANIFEST?: Record<string, unknown>;
    __RSC_SERVER_MANIFEST?: string;
    __SERVER_FILES_MANIFEST?: { config: Record<string, unknown> };
  };

  const clientReferenceManifests = (globalScope.__RSC_MANIFEST ??= {});
  clientReferenceManifests[page] = manifests.clientReferenceManifest;
  globalScope.__RSC_SERVER_MANIFEST = JSON.stringify(manifests.serverActionsManifest);
  globalScope.__SERVER_FILES_MANIFEST ??= { config: createNextEdgeAppPageRuntimeConfig() };
  globalScope.__BUILD_MANIFEST ??= createNextEdgeAppPageBuildManifest();
  globalScope.__REACT_LOADABLE_MANIFEST ??= "{}";
  installNextFontManifestGlobal(globalScope);
}

function createNextEdgeAppPageBuildManifest(): NextEdgeAppPageBuildManifest {
  return {
    devFiles: [],
    lowPriorityFiles: [],
    pages: {
      "/_app": [],
    },
    polyfillFiles: [],
    // Next required-scripts reads rootMainFiles/rootMainFilesTree and requires at
    // least one bootstrap script for HTML renders.
    rootMainFiles: ["static/chunks/vitest-plugin-rsc-next-bootstrap.js"],
    rootMainFilesTree: {},
  };
}

function installNextFontManifestGlobal(
  globalScope: typeof globalThis & { __NEXT_FONT_MANIFEST?: string },
) {
  const fontManifest = getNextFontManifestForRender();
  Object.defineProperty(globalScope, "__NEXT_FONT_MANIFEST", {
    configurable: true,
    enumerable: true,
    get() {
      return JSON.stringify(fontManifest);
    },
  });
}

function createNextEdgeAppPageRuntimeConfig() {
  return {
    ...defaultConfig,
    basePath: readNextDefineString(process.env.__NEXT_BASE_PATH, defaultConfig.basePath),
    cacheComponents: isNextDefineFlagEnabled(process.env.__NEXT_CACHE_COMPONENTS),
    cacheLife: readNextDefineObject(process.env.__NEXT_CACHE_LIFE) ?? defaultConfig.cacheLife,
    cacheMaxMemorySize: readNextDefineObject(process.env.__NEXT_CACHE_MAX_MEMORY_SIZE) ?? null,
    images: {
      ...defaultConfig.images,
      ...readNextDefineObject(process.env.__NEXT_IMAGE_OPTS),
    },
    trailingSlash: isNextDefineFlagEnabled(process.env.__NEXT_TRAILING_SLASH),
    experimental: {
      ...defaultConfig.experimental,
      authInterrupts: isNextDefineFlagEnabled(process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS),
    },
  };
}

function isNextDefineFlagEnabled(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function readNextDefineString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function readNextDefineObject(value: unknown): Record<string, unknown> | undefined {
  if (!value) return;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return;

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return;
  }
}
// End adapted
