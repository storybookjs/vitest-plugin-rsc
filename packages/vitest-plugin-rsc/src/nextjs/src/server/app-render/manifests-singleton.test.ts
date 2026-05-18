import { afterEach, beforeEach, expect, test } from "vitest";
import { createNextServerActionManifest } from "../../build/webpack/plugins/flight-client-entry-plugin.ts";
import { setNextRenderManifests } from "./manifests-singleton.ts";

const manifestsSymbol = Symbol.for("next.server.manifests");

beforeEach(resetNextManifestsSingleton);
afterEach(resetNextManifestsSingleton);

test("keys Edge App Page manifests from VAR_PAGE through Next route normalization", async () => {
  const clientReferenceManifest = createClientReferenceManifest();

  await setNextRenderManifests({
    page: "/notes/page",
    clientReferenceManifest,
    serverActionsManifest: createEmptyServerActionsManifest(),
  });

  const singleton = readNextManifestsSingleton();
  expect(singleton.clientReferenceManifestsPerRoute.get("/notes")).toBe(clientReferenceManifest);
  expect(singleton.clientReferenceManifestsPerRoute.has("/notes/page")).toBe(false);
});

test("overwrites the server action manifest for the current render request", async () => {
  const actionId = "/app/actions.ts#saveNote";
  const clientReferenceManifest = createClientReferenceManifest();

  await setNextRenderManifests({
    page: "/notes/page",
    clientReferenceManifest,
    serverActionsManifest: createEmptyServerActionsManifest(),
  });
  await setNextRenderManifests({
    page: "/notes/page",
    clientReferenceManifest,
    serverActionsManifest: createNextServerActionManifest(actionId, "/notes/page"),
  });

  const singleton = readNextManifestsSingleton();
  expect(singleton.clientReferenceManifestsPerRoute.get("/notes")).toBe(clientReferenceManifest);
  expect(singleton.serverActionsManifest.edge[actionId]?.workers["app/notes/page"]).toEqual({
    async: true,
    moduleId: actionId,
  });
});

function resetNextManifestsSingleton() {
  delete (globalThis as Record<symbol, unknown>)[manifestsSymbol];
}

function readNextManifestsSingleton() {
  const singleton = (
    globalThis as Record<
      symbol,
      | {
          clientReferenceManifestsPerRoute: Map<string, unknown>;
          serverActionsManifest: {
            edge: Record<
              string,
              {
                workers: Record<string, { async: true; moduleId: string }>;
              }
            >;
          };
        }
      | undefined
    >
  )[manifestsSymbol];

  expect(singleton).toBeDefined();
  return singleton!;
}

function createClientReferenceManifest() {
  return {
    moduleLoading: { prefix: "", crossOrigin: null },
    clientModules: {},
    rscModuleMapping: {},
    edgeRscModuleMapping: {},
    ssrModuleMapping: {},
    edgeSSRModuleMapping: {},
    entryCSSFiles: {},
    entryJSFiles: {},
  };
}

function createEmptyServerActionsManifest() {
  return {
    encryptionKey: "",
    node: {},
    edge: {},
  };
}
