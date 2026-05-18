import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";
import { htmlClientReferenceManifest } from "../webpack/plugins/flight-manifest-plugin.ts";
import { recordNextFontManifestEntry } from "../webpack/plugins/next-font-manifest-plugin.ts";
import { installNextEdgeAppPageManifests } from "./edge-ssr-app.ts";

const edgeSsrAppSource = fileURLToPath(new URL("./edge-ssr-app.ts", import.meta.url));

beforeEach(resetNextEdgeAppPageManifestGlobals);
afterEach(resetNextEdgeAppPageManifestGlobals);

test("installs explicit Edge App Page render manifest globals", () => {
  const serverActionsManifest = {
    encryptionKey: "unit-test-key",
    node: {},
    edge: {},
  };

  installNextEdgeAppPageManifests("/notes/page", {
    clientReferenceManifest: htmlClientReferenceManifest,
    serverActionsManifest,
  });

  const globalScope = globalThis as typeof globalThis & {
    __BUILD_MANIFEST?: unknown;
    __NEXT_FONT_MANIFEST?: string;
    __REACT_LOADABLE_MANIFEST?: string;
    __RSC_MANIFEST?: Record<string, unknown>;
    __RSC_SERVER_MANIFEST?: string;
    __SERVER_FILES_MANIFEST?: { config: Record<string, unknown> };
  };

  expect(globalScope.__RSC_MANIFEST?.["/notes/page"]).toBe(htmlClientReferenceManifest);
  expect(globalScope.__RSC_SERVER_MANIFEST).toBe(JSON.stringify(serverActionsManifest));
  expect(globalScope.__SERVER_FILES_MANIFEST?.config).toEqual(
    expect.objectContaining({
      basePath: "",
      experimental: expect.any(Object),
      images: expect.any(Object),
    }),
  );
  expect(globalScope.__BUILD_MANIFEST).toEqual(
    expect.objectContaining({
      pages: { "/_app": [] },
      rootMainFiles: ["static/chunks/vitest-plugin-rsc-next-bootstrap.js"],
      rootMainFilesTree: {},
    }),
  );
  expect(globalScope.__REACT_LOADABLE_MANIFEST).toBe("{}");
  expect(JSON.parse(globalScope.__NEXT_FONT_MANIFEST ?? "null")).toEqual({
    app: {},
    appUsingSizeAdjust: false,
    pages: {},
    pagesUsingSizeAdjust: false,
  });
});

test("exposes a live Edge font manifest for userland imports evaluated after install", () => {
  installNextEdgeAppPageManifests("/notes/page", {
    clientReferenceManifest: htmlClientReferenceManifest,
    serverActionsManifest: {
      encryptionKey: "unit-test-key",
      node: {},
      edge: {},
    },
  });

  recordNextFontManifestEntry(["/app/layout"], {
    fontFile: "static/media/inter.woff2",
    preload: true,
    isUsingSizeAdjust: true,
  });

  const globalScope = globalThis as typeof globalThis & {
    __NEXT_FONT_MANIFEST?: string;
  };

  expect(JSON.parse(globalScope.__NEXT_FONT_MANIFEST ?? "null")).toEqual(
    expect.objectContaining({
      app: {
        "/app/layout": ["static/media/inter.woff2"],
      },
      appUsingSizeAdjust: true,
    }),
  );
});

test("documents edge-ssr-app as explicit dispatch manifest setup only", () => {
  const source = fs.readFileSync(edgeSsrAppSource, "utf8");

  expect(source).toContain("Begin adapted: Next.js Edge App Page render manifest globals");
  expect(source).toContain("packages/next/src/build/templates/edge-ssr-app.ts");
  expect(source).toContain("Next required-scripts reads rootMainFiles/rootMainFilesTree");
  expect(source).not.toContain("installNextEdgeAppPageFallbackManifests");
  expect(source).not.toContain("emptyClientReferenceManifest");
  expect(source).not.toContain("emptyServerActionsManifest");
  expect(source).not.toContain("server/app-render/manifests-singleton");
});

function resetNextEdgeAppPageManifestGlobals() {
  delete (globalThis as { __RSC_MANIFEST?: unknown }).__RSC_MANIFEST;
  delete (globalThis as { __RSC_SERVER_MANIFEST?: unknown }).__RSC_SERVER_MANIFEST;
  delete (globalThis as { __SERVER_FILES_MANIFEST?: unknown }).__SERVER_FILES_MANIFEST;
  delete (globalThis as { __BUILD_MANIFEST?: unknown }).__BUILD_MANIFEST;
  delete (globalThis as { __REACT_LOADABLE_MANIFEST?: unknown }).__REACT_LOADABLE_MANIFEST;
  delete (globalThis as { __NEXT_FONT_MANIFEST?: unknown }).__NEXT_FONT_MANIFEST;
  delete (globalThis as Record<symbol, unknown>)[
    Symbol.for("vitest-plugin-rsc.nextjs.fontManifest")
  ];
}
