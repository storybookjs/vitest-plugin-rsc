import type { RenderOpts } from "next/dist/server/app-render/types.js";
import { defaultConfig } from "next/dist/server/config-shared.js";
import { getNextFontManifestForRender } from "../../build/webpack/plugins/next-font-manifest-plugin.ts";

export type RequestLifecycle = {
  waitUntil(promise: Promise<unknown>): void;
  onClose(callback: () => void): void;
  onAfterTaskError(error: unknown): void;
  close(): Promise<void>;
};

const emptyBuildManifest = {
  devFiles: [],
  polyfillFiles: [],
  lowPriorityFiles: [],
  rootMainFiles: ["static/chunks/vitest-plugin-rsc-next-bootstrap.js"],
  rootMainFilesTree: {},
  pages: {
    "/_app": [],
  },
};

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/app-render/types.ts#L92-L230
// Adaptation: component tests provide the minimum dynamic render options
// needed by Next app-render without starting a Next server.
// Begin adapted: Next.js app-render RenderOpts fields used by app-render
export function createNextRenderOpts(
  manifests: {
    clientReferenceManifest: unknown;
    serverActionsManifest: unknown;
  },
  lifecycle: RequestLifecycle,
): RenderOpts {
  return {
    basePath: readNextDefineString(process.env.__NEXT_BASE_PATH, defaultConfig.basePath),
    supportsDynamicResponse: true,
    buildManifest: emptyBuildManifest,
    nextFontManifest: getNextFontManifestForRender(),
    crossOrigin: undefined,
    clientReferenceManifest: manifests.clientReferenceManifest,
    serverActionsManifest: manifests.serverActionsManifest,
    subresourceIntegrityManifest: undefined,
    images: {
      ...defaultConfig.images,
      ...readNextDefineObject(process.env.__NEXT_IMAGE_OPTS),
    },
    trailingSlash: isNextDefineFlagEnabled(process.env.__NEXT_TRAILING_SLASH),
    assetPrefix: readNextDefineString(process.env.__NEXT_ASSET_PREFIX, defaultConfig.assetPrefix),
    cacheComponents: isNextDefineFlagEnabled(process.env.__NEXT_CACHE_COMPONENTS),
    cacheLifeProfiles:
      readNextDefineObject(process.env.__NEXT_CACHE_LIFE) ?? defaultConfig.cacheLife,
    experimental: {
      isRoutePPREnabled: false,
      authInterrupts: isNextDefineFlagEnabled(process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS),
    },
    waitUntil: lifecycle.waitUntil,
    onClose: lifecycle.onClose,
    onAfterTaskError: lifecycle.onAfterTaskError,
  } as unknown as RenderOpts;
}

export function isNextDefineFlagEnabled(value: unknown) {
  return value === true || value === "true" || value === "1";
}

export function readNextDefineNumber(value: unknown, fallback: number) {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || value.length === 0) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readNextDefineString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

export function readNextDefineObject(value: unknown): Record<string, unknown> | undefined {
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
