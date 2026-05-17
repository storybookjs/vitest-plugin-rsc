import { expect, test } from "vitest";
import {
  createNextServerActionEntryModule,
  createNextServerActionEntryVirtualSource,
  createNextServerActionManifest,
  emptyServerActionsManifest,
} from "./flight-client-entry-plugin.ts";
import { virtualNextServerActionEntryPublicId } from "../../../../virtual-ids.ts";

test("creates Next-shaped Server Action manifest entries for Vite action ids", () => {
  const actionId = "/app/edge-app-page-delegation/actions.ts#saveDelegatedNote";
  const manifest = createNextServerActionManifest(actionId, "/edge-app-page-delegation/page") as {
    edge: Record<
      string,
      {
        exportedName: string;
        filename: string;
        workers: Record<string, { moduleId: string; async: boolean }>;
      }
    >;
    node: Record<
      string,
      {
        exportedName: string;
        filename: string;
        workers: Record<string, { moduleId: string; async: boolean }>;
      }
    >;
  };
  const actionEntrySource = createNextServerActionEntryVirtualSource(actionId);

  expect(actionEntrySource).toBe(
    `${virtualNextServerActionEntryPublicId}?actionId=%2Fapp%2Fedge-app-page-delegation%2Factions.ts%23saveDelegatedNote`,
  );
  expect(manifest.edge[actionId]).toEqual({
    exportedName: "saveDelegatedNote",
    filename: "/app/edge-app-page-delegation/actions.ts",
    workers: expect.objectContaining({
      "app/edge-app-page-delegation/page": {
        moduleId: actionEntrySource,
        async: true,
      },
      "app/edge-app-page-delegation": {
        moduleId: actionEntrySource,
        async: true,
      },
    }),
  });
  expect(manifest.node[actionId]).toEqual(manifest.edge[actionId]);
});

test("proxies Server Action workers for route lookups outside the owning page", () => {
  const actionId = "/app/actions.ts#saveNote";
  const actionEntrySource = createNextServerActionEntryVirtualSource(actionId);
  const manifest = createNextServerActionManifest(actionId, "/notes/page") as {
    edge: Record<
      string,
      {
        workers: Record<PropertyKey, { moduleId: string; async: true } | undefined>;
      }
    >;
  };
  const workers = manifest.edge[actionId]?.workers;

  expect(workers?.["app/notes/page"]).toEqual({
    moduleId: actionEntrySource,
    async: true,
  });
  expect(workers?.["app/notes"]).toEqual({
    moduleId: actionEntrySource,
    async: true,
  });
  expect(workers?.["app/notes/archive/page"]).toEqual({
    moduleId: actionEntrySource,
    async: true,
  });
  expect(workers?.[Symbol.iterator]).toBeUndefined();
});

test("creates a Next flight action-entry module for the original action export", () => {
  const actionId = "/app/edge-app-page-delegation/actions.ts#saveDelegatedNote";

  expect(createNextServerActionEntryModule(actionId)).toBe(
    `export { saveDelegatedNote as ${JSON.stringify(actionId)} } from "/app/edge-app-page-delegation/actions.ts";\n`,
  );
});

test("leaves malformed action ids to Next's action-not-found protocol", () => {
  expect(
    createNextServerActionManifest("missing-action-id", "/edge-app-page-delegation/page"),
  ).toBe(emptyServerActionsManifest);
});
