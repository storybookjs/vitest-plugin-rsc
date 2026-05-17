import { expect, test } from "vitest";
import {
  createViteRscClientModulesProxy,
  createViteRscModuleMappingProxy,
  emptyClientReferenceManifest,
  htmlClientReferenceManifest,
} from "./flight-manifest-plugin.ts";

type ManifestRecord = {
  id: string;
  name: string;
  chunks: unknown[];
  async: true;
};

type ModuleExports = Record<PropertyKey, ManifestRecord | undefined>;
type ModuleMapping = Record<PropertyKey, ModuleExports | undefined>;

type ClientReferenceManifest = {
  moduleLoading: {
    prefix: string;
    crossOrigin: string | null;
  };
  clientModules: Record<PropertyKey, ManifestRecord | undefined>;
  rscModuleMapping: ModuleMapping;
  edgeRscModuleMapping: ModuleMapping;
  ssrModuleMapping: ModuleMapping;
  edgeSSRModuleMapping: ModuleMapping;
  entryCSSFiles: Record<string, unknown>;
  entryJSFiles: Record<string, unknown>;
};

test("returns Next client module records for Vite RSC id/export keys", () => {
  const clientModules = createViteRscClientModulesProxy() as Record<
    PropertyKey,
    ManifestRecord | undefined
  >;

  expect(clientModules["/app/client-card.tsx#ClientCard"]).toEqual({
    id: "/app/client-card.tsx",
    name: "ClientCard",
    chunks: [],
    async: true,
  });
  expect(clientModules["/app/client-card.tsx#default"]).toEqual({
    id: "/app/client-card.tsx",
    name: "default",
    chunks: [],
    async: true,
  });
});

test("normalizes Vite RSC cache wrapper ids in client and mapped records", () => {
  const clientModules = createViteRscClientModulesProxy() as Record<
    PropertyKey,
    ManifestRecord | undefined
  >;
  const moduleMapping = createViteRscModuleMappingProxy() as ModuleMapping;

  expect(clientModules["/app/client-card.tsx$$cache=cache-key#ClientCard"]).toEqual({
    id: "/app/client-card.tsx",
    name: "ClientCard",
    chunks: [],
    async: true,
  });
  expect(moduleMapping["/app/client-card.tsx$$cache=cache-key"]?.ClientCard).toEqual({
    id: "/app/client-card.tsx",
    name: "ClientCard",
    chunks: [],
    async: true,
  });
});

test("exposes proxy-backed RSC and SSR mapping records on the HTML manifest", () => {
  const manifest = htmlClientReferenceManifest as ClientReferenceManifest;
  const mappingNames = [
    "rscModuleMapping",
    "edgeRscModuleMapping",
    "ssrModuleMapping",
    "edgeSSRModuleMapping",
  ] as const;

  expect(manifest.moduleLoading).toEqual({ prefix: "", crossOrigin: null });
  expect(manifest.entryCSSFiles).toEqual({});
  expect(manifest.entryJSFiles).toEqual({});

  for (const mappingName of mappingNames) {
    expect(manifest[mappingName]["/app/client-card.tsx"]?.default).toEqual({
      id: "/app/client-card.tsx",
      name: "default",
      chunks: [],
      async: true,
    });
    expect(manifest[mappingName]["/app/client-card.tsx$$cache=cache-key"]?.ClientCard).toEqual({
      id: "/app/client-card.tsx",
      name: "ClientCard",
      chunks: [],
      async: true,
    });
  }
});

test("keeps Next builtin global-error records on their module ids", () => {
  const clientModules = createViteRscClientModulesProxy() as Record<
    PropertyKey,
    ManifestRecord | undefined
  >;
  const moduleMapping = createViteRscModuleMappingProxy() as ModuleMapping;

  expect(
    clientModules[
      "/node_modules/.vite/deps/next_dist_client_components_builtin_global-error.js#default"
    ],
  ).toEqual({
    id: "/node_modules/.vite/deps/next_dist_client_components_builtin_global-error.js",
    name: "default",
    chunks: [],
    async: true,
  });
  expect(
    moduleMapping["/node_modules/next/dist/client/components/builtin/global-error.js"]?.default,
  ).toEqual({
    id: "/node_modules/next/dist/client/components/builtin/global-error.js",
    name: "default",
    chunks: [],
    async: true,
  });
});

test("keeps empty render manifest mappings empty while proxying client modules", () => {
  const manifest = emptyClientReferenceManifest as ClientReferenceManifest;

  expect(manifest.moduleLoading).toEqual({ prefix: "", crossOrigin: null });
  expect(manifest.clientModules["/app/client-card.tsx#default"]).toEqual({
    id: "/app/client-card.tsx",
    name: "default",
    chunks: [],
    async: true,
  });
  expect(manifest.rscModuleMapping["/app/client-card.tsx"]).toBeUndefined();
  expect(manifest.edgeRscModuleMapping["/app/client-card.tsx"]).toBeUndefined();
  expect(manifest.ssrModuleMapping["/app/client-card.tsx"]).toBeUndefined();
  expect(manifest.edgeSSRModuleMapping["/app/client-card.tsx"]).toBeUndefined();
});

test("ignores malformed client module keys and non-string proxy keys", () => {
  const clientModules = createViteRscClientModulesProxy() as Record<
    PropertyKey,
    ManifestRecord | undefined
  >;
  const moduleMapping = createViteRscModuleMappingProxy() as ModuleMapping;
  const moduleExports = moduleMapping["/app/client-card.tsx"] as ModuleExports;

  expect(clientModules["/app/client-card.tsx"]).toBeUndefined();
  expect(clientModules["#default"]).toBeUndefined();
  expect(clientModules["/app/client-card.tsx#"]).toBeUndefined();
  expect(clientModules[Symbol.iterator]).toBeUndefined();
  expect(moduleMapping[Symbol.iterator]).toBeUndefined();
  expect(moduleExports[Symbol.iterator]).toBeUndefined();
});
