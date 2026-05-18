// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/plugins/flight-manifest-plugin.ts#L54-L116
// Adaptation: @vitejs/plugin-rsc owns client reference resolution in this
// adapter. These proxies provide the Next client-reference manifest shape that
// app-render expects while resolving modules through Vite RSC IDs.
// Begin adapted: Next.js flight manifest client-reference proxy
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

export const emptyClientReferenceManifest = {
  moduleLoading: { prefix: "", crossOrigin: null },
  clientModules: createViteRscClientModulesProxy(),
  rscModuleMapping: {},
  edgeRscModuleMapping: {},
  ssrModuleMapping: {},
  edgeSSRModuleMapping: {},
  entryCSSFiles: {},
  entryJSFiles: {},
} as never;

export const htmlClientReferenceManifest = {
  moduleLoading: { prefix: "", crossOrigin: null },
  clientModules: createViteRscClientModulesProxy(),
  rscModuleMapping: createViteRscModuleMappingProxy(),
  edgeRscModuleMapping: createViteRscModuleMappingProxy(),
  ssrModuleMapping: createViteRscModuleMappingProxy(),
  edgeSSRModuleMapping: createViteRscModuleMappingProxy(),
  entryCSSFiles: {},
  entryJSFiles: {},
} as never;

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
  return id.split("$$cache=")[0]!;
}
// End adapted
