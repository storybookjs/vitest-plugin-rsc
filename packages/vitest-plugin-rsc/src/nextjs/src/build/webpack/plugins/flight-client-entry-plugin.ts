import { virtualNextServerActionEntryPublicId } from "../../../../virtual-ids.ts";

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/plugins/flight-client-entry-plugin.ts#L77-L120
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-flight-action-entry-loader.ts#L12-L27
// Adaptation: Vite RSC owns action module loading, so this is a minimal worker
// lookup shim for Next app-render/action handling.
// Begin adapted: Next.js server action manifest shape
export function createNextServerActionManifest(actionId: string, page: string) {
  const actionReference = parseNextServerActionReference(actionId);
  if (!actionReference) return emptyServerActionsManifest;

  const worker = {
    moduleId: createNextServerActionEntryVirtualSource(actionId),
    async: true as const,
  };
  const actionEntry = {
    exportedName: actionReference.exportedName,
    filename: actionReference.filename,
    workers: createServerActionWorkers(page, worker),
  };

  return {
    encryptionKey: "",
    node: {
      [actionId]: actionEntry,
    },
    edge: {
      [actionId]: actionEntry,
    },
  } as never;
}

export const emptyServerActionsManifest = {
  encryptionKey: "",
  node: {},
  edge: {},
} as never;

export function createNextServerActionEntryVirtualSource(actionId: string) {
  return `${virtualNextServerActionEntryPublicId}?${new URLSearchParams({ actionId })}`;
}

export function createNextServerActionEntryModule(actionId: string) {
  const actionReference = parseNextServerActionReference(actionId);
  if (!actionReference) {
    throw new Error(
      `Cannot create a Next server action entry for malformed action id "${actionId}".`,
    );
  }

  return `export { ${actionReference.exportedName} as ${JSON.stringify(actionId)} } from ${JSON.stringify(actionReference.filename)};\n`;
}

function parseNextServerActionReference(actionId: string) {
  const separatorIndex = actionId.lastIndexOf("#");
  if (separatorIndex <= 0 || separatorIndex === actionId.length - 1) return;

  return {
    filename: actionId.slice(0, separatorIndex),
    exportedName: actionId.slice(separatorIndex + 1),
  };
}

function createServerActionWorkers(
  page: string,
  worker: {
    moduleId: string;
    async: true;
  },
) {
  const workerPage = page.startsWith("app") ? page : `app${page}`;
  const routeWorkerPage = workerPage.replace(/\/(?:page|route)$/, "");

  return new Proxy(
    {
      [workerPage]: worker,
      [routeWorkerPage]: worker,
    },
    {
      get(target, key) {
        if (typeof key !== "string") {
          return Reflect.get(target, key);
        }
        return Reflect.get(target, key) ?? worker;
      },
    },
  );
}
// End adapted
