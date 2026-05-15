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
