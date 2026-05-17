export type NextRenderManifests = {
  page: string;
  clientReferenceManifest: unknown;
  serverActionsManifest: unknown;
};

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/app-render/manifests-singleton.ts
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/encryption-utils.ts
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/server/app-render/action-utils.ts
// Adaptation: Next changed the manifest singleton module across supported
// versions. This bridge writes the same app-render manifest payload into the
// available installed Next singleton without starting a Next server.
// Begin adapted: Next.js app-render manifest singleton compatibility
export async function setNextRenderManifests(manifests: NextRenderManifests): Promise<void> {
  const modern = await importModernManifestsSingleton();
  if (modern?.setManifestsSingleton) {
    modern.setManifestsSingleton(manifests);
    return;
  }

  const legacy = await importLegacyManifestsSingleton();
  if (!legacy?.setReferenceManifestsSingleton) return;

  const actionUtils = await importLegacyActionUtils();
  legacy.setReferenceManifestsSingleton({
    ...manifests,
    serverModuleMap: actionUtils?.createServerModuleMap?.({
      serverActionsManifest: manifests.serverActionsManifest,
    }),
  });
}

async function importModernManifestsSingleton(): Promise<
  | {
      setManifestsSingleton?: (manifests: NextRenderManifests) => void;
    }
  | undefined
> {
  try {
    return (await import("next/dist/server/app-render/manifests-singleton.js")) as {
      setManifestsSingleton?: (manifests: NextRenderManifests) => void;
    };
  } catch {
    return undefined;
  }
}

async function importLegacyManifestsSingleton(): Promise<
  | {
      setReferenceManifestsSingleton?: (
        manifests: NextRenderManifests & { serverModuleMap?: unknown },
      ) => void;
    }
  | undefined
> {
  try {
    return (await import("next/dist/server/app-render/encryption-utils.js")) as {
      setReferenceManifestsSingleton?: (
        manifests: NextRenderManifests & { serverModuleMap?: unknown },
      ) => void;
    };
  } catch {
    return undefined;
  }
}

async function importLegacyActionUtils(): Promise<
  | {
      createServerModuleMap?: (options: { serverActionsManifest: unknown }) => unknown;
    }
  | undefined
> {
  try {
    // @ts-ignore - this was a Next 16.0 internal and is not present in newer versions.
    return (await import("next/dist/server/app-render/action-utils.js")) as {
      createServerModuleMap?: (options: { serverActionsManifest: unknown }) => unknown;
    };
  } catch {
    return undefined;
  }
}
// End adapted
