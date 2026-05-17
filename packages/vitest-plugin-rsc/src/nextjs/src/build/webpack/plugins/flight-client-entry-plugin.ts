// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/plugins/flight-client-entry-plugin.ts#L77-L120
// Adaptation: Vite RSC owns action module loading, so this is a minimal worker
// lookup shim for Next app-render/action handling.
// Begin adapted: Next.js server action manifest shape
export function createNextServerActionManifest(actionId: string, page: string) {
  const [filename, exportedName] = actionId.split("#");
  const worker = {
    moduleId: actionId,
    async: true as const,
  };
  const actionEntry = {
    exportedName,
    filename,
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
