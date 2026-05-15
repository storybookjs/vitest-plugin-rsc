export function createViteRscClientModulesProxy() {
  return new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== "string") return;

        const [id, name] = key.split("#");
        if (!id || !name) return;

        return {
          id: normalizeViteRscManifestModuleId(id),
          name,
          chunks: [],
          async: true,
        };
      },
    },
  );
}

export function createViteRscModuleMappingProxy() {
  return new Proxy(
    {},
    {
      get(_target, id) {
        if (typeof id !== "string") return;
        return createViteRscModuleExportsProxy(id);
      },
    },
  );
}

// Begin copy: Next.js server action manifest shape
// Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack/plugins/flight-client-entry-plugin.ts
// Adaptation: Vite RSC owns action module loading, so this is a minimal worker
// lookup shim for Next app-render/action handling.
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
// End copy

function createViteRscModuleExportsProxy(id: string) {
  return new Proxy(
    {},
    {
      get(_target, name) {
        if (typeof name !== "string") return;
        return {
          id: normalizeViteRscManifestModuleId(id),
          name,
          chunks: [],
          async: true,
        };
      },
    },
  );
}

function normalizeViteRscManifestModuleId(id: string) {
  const withoutCacheTag = id.split("$$cache=")[0]!;
  if (isNextBuiltinGlobalErrorModuleId(withoutCacheTag)) {
    return "/@id/__x00__virtual:vitest-plugin-rsc/next-builtin-global-error-stub";
  }
  return withoutCacheTag;
}

function isNextBuiltinGlobalErrorModuleId(id: string) {
  return (
    id.includes("next_dist_client_components_builtin_global-error") ||
    id.includes("next/dist/client/components/builtin/global-error")
  );
}
