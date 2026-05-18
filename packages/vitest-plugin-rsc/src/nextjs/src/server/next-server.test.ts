import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ACTION_HEADER,
  RSC_CONTENT_TYPE_HEADER,
} from "next/dist/client/components/app-router-headers.js";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { importReactSsr } from "../../../utilts.ts";
import {
  dispatchNextAppRouteRequest,
  dispatchNextAppPageActionPost,
  dispatchNextAppPageInitialRender,
  dispatchNextAppPageRscGet,
  readNextAppPageInitialDocument,
  readNextAppPageInitialDocumentHtml,
  resolveNextAppRouteRequestDispatch,
  resolveNextAppPageActionPostDispatch,
  resolveNextAppPageInitialRenderDispatch,
  resolveNextAppPageRscGetDispatch,
} from "./next-server.ts";
import {
  createNextRoutingData,
  type NextRoutingManifest,
} from "../build/adapter/build-complete.ts";
import type {
  NextEdgeAppPageModule,
  NextEdgeAppRouteModule,
  NextRouteHandlerManifestEntry,
  NextRouteManifest,
  NextRouteManifestEntry,
} from "../../request-router.ts";
import {
  createNextServerActionManifest,
  emptyServerActionsManifest,
} from "../build/webpack/plugins/flight-client-entry-plugin.ts";
import { htmlClientReferenceManifest } from "../build/webpack/plugins/flight-manifest-plugin.ts";

vi.mock("../../../utilts.ts", () => ({
  importReactSsr: vi.fn(),
}));

const loaderTree = [] as unknown as LoaderTree;
const nextServerSource = fileURLToPath(new URL("./next-server.ts", import.meta.url));
const runtimeSource = fileURLToPath(new URL("../../testing-library-runtime.tsx", import.meta.url));
const mswSource = fileURLToPath(new URL("../../msw.ts", import.meta.url));
const pluginSource = fileURLToPath(new URL("../../plugin.ts", import.meta.url));
const legacyAppRenderRuntimeSource = fileURLToPath(new URL("../../app-render.ts", import.meta.url));
const localAppRenderCompatibilitySource = fileURLToPath(
  new URL("./app-render/app-render.ts", import.meta.url),
);
const localAccessFallbackRecoverySource = fileURLToPath(
  new URL("./app-render/create-component-tree.tsx", import.meta.url),
);
const localFontAssetInjectionSource = fileURLToPath(
  new URL("./app-render/get-layer-assets.tsx", import.meta.url),
);
const localDirectLoaderTreeSource = fileURLToPath(
  new URL("./lib/app-dir-module.ts", import.meta.url),
);
const importReactSsrMock = vi.mocked(importReactSsr);

beforeEach(() => {
  importReactSsrMock.mockReset();
  resetNextEdgeAppPageManifestGlobals();
});

afterEach(resetNextEdgeAppPageManifestGlobals);

test("selects the generated Edge App Page source for App Page RSC GET targets", async () => {
  const loadEdgeAppPage = vi.fn<() => Promise<NextEdgeAppPageModule>>();
  const edgeAppPageSource = "virtual:vitest-plugin-rsc/next-edge-ssr-app?VAR_PAGE=%2Fnotes%2Fpage";
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPageSource,
        edgeAppPage: loadEdgeAppPage,
      }),
    ],
  });

  const selection = await resolveNextAppPageRscGetDispatch({
    request: new Request("http://localhost/edge-app-page-delegation?from=unit", {
      headers: {
        rsc: "1",
        "next-router-state-tree": "[]",
        "next-url": "/edge-app-page-delegation",
      },
    }),
    manifest,
  });

  expect(selection.kind).toBe("edge-app-page");
  if (selection.kind !== "edge-app-page") return;
  expect(selection.target.entry.route).toBe("/edge-app-page-delegation");
  expect(selection.target.entry.edgeAppPageSource).toBe(edgeAppPageSource);
  expect(selection.request.url).toBe("http://localhost/edge-app-page-delegation?from=unit");
  expect(selection.request.headers.get("rsc")).toBe("1");
  expect(selection.request.headers.get("next-router-state-tree")).toBe("[]");
  expect(selection.load).toBe(loadEdgeAppPage);
  expect(loadEdgeAppPage).not.toHaveBeenCalled();
});

test("selects the generated Edge App Page source for Server Action POST targets", async () => {
  const actionId = "/app/actions.ts#saveNote";
  const loadEdgeAppPage = vi.fn<() => Promise<NextEdgeAppPageModule>>();
  const edgeAppPageSource = "virtual:vitest-plugin-rsc/next-edge-ssr-app?VAR_PAGE=%2Fnotes%2Fpage";
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPageSource,
        edgeAppPage: loadEdgeAppPage,
      }),
    ],
  });

  const selection = await resolveNextAppPageActionPostDispatch({
    request: new Request("http://localhost/edge-app-page-delegation?from=action", {
      method: "POST",
      headers: {
        [ACTION_HEADER]: actionId,
        "content-type": "text/plain;charset=UTF-8",
        "next-router-state-tree": "[]",
        "next-url": "/edge-app-page-delegation",
      },
      body: "raw action body",
    }),
    manifest,
  });

  expect(selection.kind).toBe("edge-app-page");
  if (selection.kind !== "edge-app-page") return;
  expect(selection.target.entry.route).toBe("/edge-app-page-delegation");
  expect(selection.target.entry.edgeAppPageSource).toBe(edgeAppPageSource);
  expect(selection.request.method).toBe("POST");
  expect(selection.request.url).toBe("http://localhost/edge-app-page-delegation?from=action");
  expect(selection.request.headers.get(ACTION_HEADER)).toBe(actionId);
  expect(selection.request.headers.get("host")).toBe("localhost");
  expect(selection.request.headers.get("x-forwarded-host")).toBe("localhost");
  expect(selection.request.headers.get("next-router-state-tree")).toBe("[]");
  await expect(selection.request.text()).resolves.toBe("raw action body");
  expect(selection.load).toBe(loadEdgeAppPage);
  expect(loadEdgeAppPage).not.toHaveBeenCalled();
});

test("dispatches Server Action POSTs to the generated Edge handler without decoding the body", async () => {
  const actionId = "/app/actions.ts#saveNote";
  const handler = vi.fn<NextEdgeAppPageModule["handler"]>(async (request) => {
    expect(request.method).toBe("POST");
    expect(request.headers.get(ACTION_HEADER)).toBe(actionId);
    expect(request.headers.get("host")).toBe("localhost");
    expect(request.headers.get("x-forwarded-host")).toBe("localhost");
    expect(request.headers.get("next-url")).toBe("/edge-app-page-delegation");
    return new Response(await request.text());
  });
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPage: async () => ({ handler }),
      }),
    ],
  });

  const response = await dispatchNextAppPageActionPost({
    request: new Request("http://localhost/edge-app-page-delegation?from=action", {
      method: "POST",
      headers: {
        [ACTION_HEADER]: actionId,
        "content-type": "text/plain;charset=UTF-8",
        "next-url": "/edge-app-page-delegation",
      },
      body: "raw action body",
    }),
    manifest,
  });

  expect(response?.status).toBe(200);
  await expect(response?.text()).resolves.toBe("raw action body");
  expect(handler).toHaveBeenCalledOnce();
});

test("dispatches App Page RSC GETs to the generated Edge handler", async () => {
  const handler = vi.fn(async () => new Response("edge app page"));
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPage: async () => ({ handler }),
      }),
    ],
  });

  const response = await dispatchNextAppPageRscGet({
    request: new Request("http://localhost/edge-app-page-delegation", {
      headers: { rsc: "1" },
    }),
    manifest,
  });

  expect(response?.status).toBe(200);
  await expect(response?.text()).resolves.toBe("edge app page");
  expect(handler).toHaveBeenCalledOnce();
});

test("returns Next routing redirects before selecting Edge App Page handlers", async () => {
  const loadEdgeAppPage = vi.fn<() => Promise<NextEdgeAppPageModule>>();
  const manifest = createManifest({
    pages: [page("/edge-app-page-delegation", { edgeAppPage: loadEdgeAppPage })],
    redirects: [
      {
        source: "/next-config-redirect",
        destination: "/edge-app-page-delegation?from=config-redirect",
        permanent: false,
      },
    ],
  });

  const selection = await resolveNextAppPageRscGetDispatch({
    request: new Request("http://localhost/next-config-redirect", {
      headers: { rsc: "1" },
    }),
    manifest,
  });

  expect(selection.kind).toBe("redirect");
  const response = await dispatchNextAppPageRscGet({
    request: new Request("http://localhost/next-config-redirect", {
      headers: { rsc: "1" },
    }),
    manifest,
  });

  expect(response?.status).toBe(307);
  expectRedirectLocation(response, "/edge-app-page-delegation?from=config-redirect");
  expect(loadEdgeAppPage).not.toHaveBeenCalled();
});

test("selects the generated Edge App Route source for normal API request targets", async () => {
  const loadEdgeAppRoute = vi.fn<() => Promise<NextEdgeAppRouteModule>>();
  const edgeAppRouteSource =
    "virtual:vitest-plugin-rsc/next-edge-app-route?VAR_PAGE=%2Fapi%2Fnotes%2Froute";
  const manifest = createManifest({
    routeHandlers: [
      routeHandler("/api/notes", {
        edgeAppRouteSource,
        edgeAppRoute: loadEdgeAppRoute,
      }),
    ],
  });

  const selection = await resolveNextAppRouteRequestDispatch({
    request: new Request("http://localhost/api/notes?from=unit", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: "raw route body",
    }),
    manifest,
  });

  expect(selection.kind).toBe("edge-app-route");
  if (selection.kind !== "edge-app-route") return;
  expect(selection.target.entry.route).toBe("/api/notes");
  expect(selection.target.entry.edgeAppRouteSource).toBe(edgeAppRouteSource);
  expect(selection.request.method).toBe("POST");
  expect(selection.request.url).toBe("http://localhost/api/notes?from=unit");
  expect(selection.request.headers.get("content-type")).toBe("text/plain;charset=UTF-8");
  await expect(selection.request.text()).resolves.toBe("raw route body");
  expect(selection.load).toBe(loadEdgeAppRoute);
  expect(loadEdgeAppRoute).not.toHaveBeenCalled();
});

test("adds dynamic route params to generated Edge App Route request queries", async () => {
  const loadEdgeAppRoute = vi.fn<() => Promise<NextEdgeAppRouteModule>>();
  const manifest = createManifest({
    routeHandlers: [
      routeHandler("/sitemap/[__metadata_id__]", {
        edgeAppRoute: loadEdgeAppRoute,
      }),
    ],
  });

  const selection = await resolveNextAppRouteRequestDispatch({
    request: new Request("http://localhost/sitemap/notes.xml?from=unit"),
    manifest,
  });

  expect(selection.kind).toBe("edge-app-route");
  if (selection.kind !== "edge-app-route") return;
  const url = new URL(selection.request.url);
  expect(url.pathname).toBe("/sitemap/notes.xml");
  expect(url.searchParams.get("from")).toBe("unit");
  expect(url.searchParams.get("__metadata_id__")).toBe("notes.xml");
  expect(selection.target.routeMatches).toEqual({ __metadata_id__: "notes.xml" });
});

test("dispatches normal API requests to the generated Edge App Route handler", async () => {
  const handler = vi.fn<NextEdgeAppRouteModule["handler"]>(async (request) => {
    return new Response(await request.text(), { status: 202 });
  });
  const manifest = createManifest({
    routeHandlers: [
      routeHandler("/api/notes", {
        edgeAppRoute: async () => ({ handler }),
      }),
    ],
  });

  const response = await dispatchNextAppRouteRequest({
    request: new Request("http://localhost/api/notes?from=unit", {
      method: "POST",
      body: "raw route body",
    }),
    manifest,
  });

  expect(response?.status).toBe(202);
  await expect(response?.text()).resolves.toBe("raw route body");
  expect(handler).toHaveBeenCalledOnce();
  const [request] = handler.mock.calls[0]!;
  expect(request.url).toBe("http://localhost/api/notes?from=unit");
});

test("returns Next routing redirects before selecting Edge App Route handlers", async () => {
  const loadEdgeAppRoute = vi.fn<() => Promise<NextEdgeAppRouteModule>>();
  const manifest = createManifest({
    routeHandlers: [routeHandler("/api/notes", { edgeAppRoute: loadEdgeAppRoute })],
    redirects: [
      {
        source: "/api/legacy-notes",
        destination: "/api/notes?from=config-redirect",
        permanent: false,
      },
    ],
  });

  const selection = await resolveNextAppRouteRequestDispatch({
    request: new Request("http://localhost/api/legacy-notes"),
    manifest,
  });

  expect(selection.kind).toBe("redirect");
  const response = await dispatchNextAppRouteRequest({
    request: new Request("http://localhost/api/legacy-notes"),
    manifest,
  });

  expect(response?.status).toBe(307);
  expectRedirectLocation(response, "/api/notes?from=config-redirect");
  expect(loadEdgeAppRoute).not.toHaveBeenCalled();
});

test("loads normal API Edge App Route modules from generated virtual sources", async () => {
  const handler = vi.fn(async () => new Response("edge app route"));
  const edgeAppRouteSource =
    "virtual:vitest-plugin-rsc/next-edge-app-route?VAR_PAGE=%2Fapi%2Fnotes%2Froute";
  importReactSsrMock.mockResolvedValue({ handler });
  const manifest = createManifest({
    routeHandlers: [
      routeHandler("/api/notes", {
        edgeAppRouteSource,
        edgeAppRoute: async () => {
          throw new Error("edgeAppRoute loader should not run when edgeAppRouteSource is present.");
        },
      }),
    ],
  });

  const response = await dispatchNextAppRouteRequest({
    request: new Request("http://localhost/api/notes"),
    manifest,
  });

  expect(response?.status).toBe(200);
  await expect(response?.text()).resolves.toBe("edge app route");
  expect(importReactSsrMock).toHaveBeenCalledWith(edgeAppRouteSource);
  expect(handler).toHaveBeenCalledOnce();
});

test("selects the generated Edge App Page source for initial Flight targets", async () => {
  const loadEdgeAppPage = vi.fn<() => Promise<NextEdgeAppPageModule>>();
  const edgeAppPageSource = "virtual:vitest-plugin-rsc/next-edge-ssr-app?VAR_PAGE=%2Fnotes%2Fpage";
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPageSource,
        edgeAppPage: loadEdgeAppPage,
      }),
    ],
  });

  const selection = await resolveNextAppPageInitialRenderDispatch({
    request: {
      url: "http://localhost/edge-app-page-delegation?from=initial",
      headers: new Headers({ "x-next-header": "preserved" }),
    },
    manifest,
    mode: "flight",
  });

  expect(selection.kind).toBe("edge-app-page");
  if (selection.kind !== "edge-app-page") return;
  expect(selection.target.entry.route).toBe("/edge-app-page-delegation");
  expect(selection.target.entry.edgeAppPageSource).toBe(edgeAppPageSource);
  expect(selection.request.url).toBe("http://localhost/edge-app-page-delegation?from=initial");
  expect(selection.request.headers.get("rsc")).toBe("1");
  expect(selection.request.headers.get("x-next-header")).toBe("preserved");
  expect(selection.load).toBe(loadEdgeAppPage);
  expect(loadEdgeAppPage).not.toHaveBeenCalled();
});

test("dispatches initial HTML render to the generated Edge handler", async () => {
  const handler = vi.fn<NextEdgeAppPageModule["handler"]>(async (request) => {
    return new Response(request.headers.has("rsc") ? "flight" : "html");
  });
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPage: async () => ({ handler }),
      }),
    ],
  });

  const response = await dispatchNextAppPageInitialRender({
    request: new Request("http://localhost/edge-app-page-delegation?from=initial", {
      headers: { rsc: "1", "x-next-header": "preserved" },
    }),
    manifest,
    mode: "html",
  });

  expect(response?.status).toBe(200);
  await expect(response?.text()).resolves.toBe("html");
  expect(handler).toHaveBeenCalledOnce();
  const [request] = handler.mock.calls[0]!;
  expect(request.url).toBe("http://localhost/edge-app-page-delegation?from=initial");
  expect(request.headers.get("rsc")).toBeNull();
  expect(request.headers.get("x-next-header")).toBe("preserved");
});

test("reads initial Edge HTML response as testing-library document HTML", async () => {
  const handler = vi.fn<NextEdgeAppPageModule["handler"]>(async (request) => {
    return new Response(
      request.headers.has("rsc")
        ? "flight"
        : "<html><body><script>self.__next_f.push([0])</script></body></html>",
    );
  });
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPage: async () => ({ handler }),
      }),
    ],
  });

  const documentHtml = await readNextAppPageInitialDocumentHtml({
    request: {
      url: "http://localhost/edge-app-page-delegation",
      headers: new Headers({ rsc: "1" }),
    },
    manifest,
  });

  expect(documentHtml).toContain("<html>");
  expect(documentHtml).toContain("__next_f");
  expect(handler).toHaveBeenCalledOnce();
  const [request] = handler.mock.calls[0]!;
  expect(request.headers.get("rsc")).toBeNull();
});

test("follows generated Edge initial HTML redirect responses", async () => {
  const redirectHandler = vi.fn<NextEdgeAppPageModule["handler"]>(
    async () =>
      new Response(null, {
        headers: { location: "/route-patterns/conventions?from=edge-initial-redirect" },
        status: 307,
      }),
  );
  const targetHandler = vi.fn<NextEdgeAppPageModule["handler"]>(async (request) => {
    expect(request.url).toBe(
      "http://localhost/route-patterns/conventions?from=edge-initial-redirect",
    );
    expect(request.headers.get("rsc")).toBeNull();
    return new Response("<html><body>redirect target</body></html>");
  });
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPage: async () => ({ handler: redirectHandler }),
      }),
      page("/route-patterns/conventions", {
        edgeAppPage: async () => ({ handler: targetHandler }),
      }),
    ],
  });

  const document = await readNextAppPageInitialDocument({
    request: {
      url: "http://localhost/edge-app-page-delegation?mode=redirect",
      headers: new Headers({ rsc: "1", "x-next-header": "preserved" }),
    },
    manifest,
  });

  expect(document).toEqual({
    html: "<html><body>redirect target</body></html>",
    url: "/route-patterns/conventions?from=edge-initial-redirect",
  });
  expect(redirectHandler).toHaveBeenCalledOnce();
  expect(targetHandler).toHaveBeenCalledOnce();
});

test("dispatches initial Flight render to the generated Edge handler", async () => {
  const handler = vi.fn<NextEdgeAppPageModule["handler"]>(async (request) => {
    return new Response(request.headers.has("rsc") ? "flight" : "html");
  });
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPage: async () => ({ handler }),
      }),
    ],
  });

  const response = await dispatchNextAppPageInitialRender({
    request: {
      url: "http://localhost/edge-app-page-delegation?from=initial",
      headers: new Headers({ "x-next-header": "preserved" }),
    },
    manifest,
    mode: "flight",
  });

  expect(response?.status).toBe(200);
  await expect(response?.text()).resolves.toBe("flight");
  expect(handler).toHaveBeenCalledOnce();
  const [request] = handler.mock.calls[0]!;
  expect(request.url).toBe("http://localhost/edge-app-page-delegation?from=initial");
  expect(request.headers.get("rsc")).toBe("1");
  expect(request.headers.get("x-next-header")).toBe("preserved");
});

test("loads generated Edge App Page sources through the SSR runner", async () => {
  const handler = vi.fn<NextEdgeAppPageModule["handler"]>(async () => new Response("flight"));
  const fallbackLoad = vi.fn<() => Promise<NextEdgeAppPageModule>>();
  const edgeAppPageSource = "virtual:vitest-plugin-rsc/next-edge-ssr-app?VAR_PAGE=%2Fnotes%2Fpage";
  importReactSsrMock.mockResolvedValueOnce({ handler });
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPageSource,
        edgeAppPage: fallbackLoad,
      }),
    ],
  });

  const response = await dispatchNextAppPageInitialRender({
    request: { url: "http://localhost/edge-app-page-delegation" },
    manifest,
    mode: "flight",
  });

  expect(response?.status).toBe(200);
  await expect(response?.text()).resolves.toBe("flight");
  expect(importReactSsrMock).toHaveBeenCalledWith(edgeAppPageSource);
  expect(fallbackLoad).not.toHaveBeenCalled();
  expect(handler).toHaveBeenCalledOnce();
});

test("installs explicit manifests before invoking route-manifest Edge App Page imports", async () => {
  const handler = vi.fn<NextEdgeAppPageModule["handler"]>(async () => new Response("flight"));
  const edgeAppPage = vi.fn<() => Promise<NextEdgeAppPageModule>>(async () => {
    expectInstalledEdgeAppPageManifests(
      "/edge-app-page-delegation/page",
      emptyServerActionsManifest,
    );
    return { handler };
  });
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPage,
      }),
    ],
  });

  const response = await dispatchNextAppPageRscGet({
    request: new Request("http://localhost/edge-app-page-delegation", {
      headers: { rsc: "1" },
    }),
    manifest,
  });

  expect(response?.status).toBe(200);
  await expect(response?.text()).resolves.toBe("flight");
  expect(edgeAppPage).toHaveBeenCalledOnce();
  expect(importReactSsrMock).not.toHaveBeenCalled();
  expect(handler).toHaveBeenCalledOnce();
});

test("installs explicit manifests before importing generated Edge App Page sources for RSC GETs", async () => {
  const handler = vi.fn<NextEdgeAppPageModule["handler"]>(async () => new Response("flight"));
  const edgeAppPageSource = "virtual:vitest-plugin-rsc/next-edge-ssr-app?VAR_PAGE=%2Fnotes%2Fpage";
  importReactSsrMock.mockImplementationOnce(async (source) => {
    expect(source).toBe(edgeAppPageSource);
    expectInstalledEdgeAppPageManifests(
      "/edge-app-page-delegation/page",
      emptyServerActionsManifest,
    );
    return { handler };
  });
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPageSource,
        edgeAppPage: async () => {
          throw new Error("edgeAppPage loader should not run when edgeAppPageSource is present.");
        },
      }),
    ],
  });

  const response = await dispatchNextAppPageRscGet({
    request: new Request("http://localhost/edge-app-page-delegation", {
      headers: { rsc: "1" },
    }),
    manifest,
  });

  expect(response?.status).toBe(200);
  await expect(response?.text()).resolves.toBe("flight");
  expect(importReactSsrMock).toHaveBeenCalledOnce();
});

test("installs explicit manifests before importing generated Edge App Page sources for initial render", async () => {
  const handler = vi.fn<NextEdgeAppPageModule["handler"]>(async (request) => {
    return new Response(request.headers.has("rsc") ? "flight" : "html");
  });
  const edgeAppPageSource = "virtual:vitest-plugin-rsc/next-edge-ssr-app?VAR_PAGE=%2Fnotes%2Fpage";
  importReactSsrMock.mockImplementationOnce(async (source) => {
    expect(source).toBe(edgeAppPageSource);
    expectInstalledEdgeAppPageManifests(
      "/edge-app-page-delegation/page",
      emptyServerActionsManifest,
    );
    return { handler };
  });
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPageSource,
        edgeAppPage: async () => {
          throw new Error("edgeAppPage loader should not run when edgeAppPageSource is present.");
        },
      }),
    ],
  });

  const response = await dispatchNextAppPageInitialRender({
    request: { url: "http://localhost/edge-app-page-delegation" },
    manifest,
    mode: "html",
  });

  expect(response?.status).toBe(200);
  await expect(response?.text()).resolves.toBe("html");
  expect(importReactSsrMock).toHaveBeenCalledOnce();
});

test("installs action manifests before importing generated Edge App Page sources for action POSTs", async () => {
  const actionId = "/app/actions.ts#saveNote";
  const handler = vi.fn<NextEdgeAppPageModule["handler"]>(async () => new Response("action"));
  const edgeAppPageSource = "virtual:vitest-plugin-rsc/next-edge-ssr-app?VAR_PAGE=%2Fnotes%2Fpage";
  importReactSsrMock.mockImplementationOnce(async (source) => {
    expect(source).toBe(edgeAppPageSource);
    expectInstalledEdgeAppPageManifests(
      "/edge-app-page-delegation/page",
      createNextServerActionManifest(actionId, "/edge-app-page-delegation/page"),
    );
    return { handler };
  });
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPageSource,
        edgeAppPage: async () => {
          throw new Error("edgeAppPage loader should not run when edgeAppPageSource is present.");
        },
      }),
    ],
  });

  const response = await dispatchNextAppPageActionPost({
    request: new Request("http://localhost/edge-app-page-delegation", {
      method: "POST",
      headers: {
        [ACTION_HEADER]: actionId,
        "content-type": "text/plain;charset=UTF-8",
      },
      body: "raw action body",
    }),
    manifest,
  });

  expect(response?.status).toBe(200);
  await expect(response?.text()).resolves.toBe("action");
  expect(importReactSsrMock).toHaveBeenCalledOnce();
});

test("passes Edge App Page action protocol responses through unchanged", async () => {
  const actionId = "/app/actions.ts#saveNote";
  const actionFlightPayload = '0:[["$","span",null,{"children":"saved"}]]\n';
  const edgeAppPageSource = "virtual:vitest-plugin-rsc/next-edge-ssr-app?VAR_PAGE=%2Fnotes%2Fpage";
  const handler = vi.fn<NextEdgeAppPageModule["handler"]>(async () => {
    return new Response(actionFlightPayload, {
      status: 202,
      headers: {
        "content-type": RSC_CONTENT_TYPE_HEADER,
        "x-action-revalidated": "[[],0,0]",
      },
    });
  });
  importReactSsrMock.mockImplementationOnce(async (source) => {
    expect(source).toBe(edgeAppPageSource);
    expectInstalledEdgeAppPageManifests(
      "/edge-app-page-delegation/page",
      createNextServerActionManifest(actionId, "/edge-app-page-delegation/page"),
    );
    return { handler };
  });
  const manifest = createManifest({
    pages: [
      page("/edge-app-page-delegation", {
        edgeAppPageSource,
        edgeAppPage: async () => {
          throw new Error("edgeAppPage loader should not run when edgeAppPageSource is present.");
        },
      }),
    ],
  });

  const response = await dispatchNextAppPageActionPost({
    request: new Request("http://localhost/edge-app-page-delegation", {
      method: "POST",
      headers: {
        [ACTION_HEADER]: actionId,
        "content-type": "text/plain;charset=UTF-8",
      },
      body: "raw action body",
    }),
    manifest,
  });

  expect(response?.status).toBe(202);
  expect(response?.headers.get("content-type")).toBe(RSC_CONTENT_TYPE_HEADER);
  expect(response?.headers.get("x-action-revalidated")).toBe("[[],0,0]");
  await expect(response?.text()).resolves.toBe(actionFlightPayload);
  expect(importReactSsrMock).toHaveBeenCalledOnce();
  expect(handler).toHaveBeenCalledOnce();
});

test("does not select a local App Page fallback for non-page RSC GET targets", async () => {
  const manifest = createManifest({
    pages: [],
    routeHandlers: [routeHandler("/api/notes")],
  });

  const selection = await resolveNextAppPageRscGetDispatch({
    request: new Request("http://localhost/api/notes", {
      headers: { rsc: "1" },
    }),
    manifest,
  });

  expect(selection.kind).toBe("unhandled");
  if (selection.kind !== "unhandled") return;
  expect(selection.target.kind).toBe("app-route");
});

test("requires the generated Edge App Page manifest entry", async () => {
  const manifest = createManifest({
    pages: [page("/edge-app-page-delegation")],
  });

  await expect(
    resolveNextAppPageRscGetDispatch({
      request: new Request("http://localhost/edge-app-page-delegation", {
        headers: { rsc: "1" },
      }),
      manifest,
    }),
  ).rejects.toThrow("resolved without a generated Edge App Page handler");
});

test("requires the generated Edge App Route manifest entry", async () => {
  const manifest = createManifest({
    routeHandlers: [routeHandler("/api/notes")],
  });

  await expect(
    resolveNextAppRouteRequestDispatch({
      request: new Request("http://localhost/api/notes"),
      manifest,
    }),
  ).rejects.toThrow("resolved without a generated Edge App Route handler");
});

test("documents NextServer as the upstream owner", () => {
  const source = fs.readFileSync(nextServerSource, "utf8");

  expect(source).toContain("Begin adapted: Next.js Edge App Page request dispatch");
  expect(source).toContain("Source: NextServer.renderPageComponent");
  expect(source).toContain("Source: NextServer.runEdgeFunction");
  expect(source).toContain("packages/next/src/server/next-server.ts#L767-L798");
  expect(source).toContain("packages/next/src/server/next-server.ts#L1981-L2108");
  expect(source).toContain("packages/next/src/build/templates/edge-ssr-app.ts");
  expect(source).toContain("packages/next/src/build/templates/edge-app-route.ts");
  expect(source).toContain("packages/next/src/server/web/edge-route-module-wrapper.ts#L61-L165");
  expect(source).toContain("importReactSsr<NextEdgeAppPageModule>(edgeAppPageSource)");
  expect(source).toContain("importReactSsr<NextEdgeAppRouteModule>(edgeAppRouteSource)");
  expect(source).not.toContain("testing-library-client.ts");
  expect(source).not.toContain("NextRouteRequest");
  expect(source).not.toContain('from "../../app-render.ts"');
  expect(source).not.toContain("renderNextRouteInitialPayload");
  expect(source).not.toContain("renderToHTMLOrFlight");
});

test("does not keep the local App Render compatibility plugin", () => {
  expect(fs.existsSync(localAppRenderCompatibilitySource)).toBe(false);
  expect(fs.existsSync(legacyAppRenderRuntimeSource)).toBe(false);
  expect(fs.existsSync(localAccessFallbackRecoverySource)).toBe(false);
  expect(fs.existsSync(localFontAssetInjectionSource)).toBe(false);
  expect(fs.existsSync(localDirectLoaderTreeSource)).toBe(false);

  const runtime = fs.readFileSync(runtimeSource, "utf8");
  const msw = fs.readFileSync(mswSource, "utf8");
  const plugin = fs.readFileSync(pluginSource, "utf8");
  const nextServer = fs.readFileSync(nextServerSource, "utf8");

  for (const source of [runtime, msw, plugin, nextServer]) {
    expect(source).not.toContain("./src/server/app-render/app-render.ts");
    expect(source).not.toContain("./app-render/app-render.ts");
    expect(source).not.toContain("useNextAppRenderCompatibility");
    expect(source).not.toContain("next-rsc-app-render-react-dom-server");
    expect(source).not.toContain("./src/server/app-render/create-component-tree.tsx");
    expect(source).not.toContain("./src/server/app-render/get-layer-assets.tsx");
    expect(source).not.toContain("./src/server/lib/app-dir-module.ts");
  }
});

test("keeps MSW RSC GET dispatch out of the testing-library runtime", () => {
  const source = fs.readFileSync(runtimeSource, "utf8");

  expect(source).not.toContain("dispatchNextAppPageRscGet");
  expect(source).not.toContain("createNextRscGetRequest");
  expect(source).not.toContain("NextRouteRequest");
  expect(source).not.toContain("renderNextRouteFlightResponse");
  expect(source).not.toContain("renderToHTMLOrFlight");
  expect(source).not.toContain("nextRscRequestsViaMsw");
  expect(source).not.toContain("decodeReply");
  expect(source).not.toContain("loadServerAction");
});

test("routes renderServer URL initial Flight through next-server Edge dispatch", () => {
  const source = fs.readFileSync(runtimeSource, "utf8");
  const prepareServerRootSource = sliceSourceBetween(
    source,
    "async function prepareServerRoot",
    "const fetchRsc",
  );
  const initialFlightSource = sliceSourceBetween(
    source,
    "async function renderNextInitialFlightPayload",
    "async function createNextInitialFlightPayloadFromResponse",
  );

  expect(prepareServerRootSource).toContain("renderNextInitialFlightPayload");
  expect(prepareServerRootSource).not.toContain("renderNextRouteInitialPayload");
  expect(initialFlightSource).toContain("dispatchNextAppPageInitialRender");
  expect(initialFlightSource).toContain('mode: "flight"');
  expect(initialFlightSource).toContain("createNextInitialFlightPayloadFromResponse(response)");
  expect(initialFlightSource).not.toContain("renderNextRouteInitialPayload");
  expect(initialFlightSource).not.toContain("renderNextRouteHtmlResponse");
  expect(initialFlightSource).not.toContain("./app-render.ts");
  expect(initialFlightSource).toContain("requires a generated Next route manifest");
});

test("routes renderServer document HTML through generated Edge dispatch without local SSR fallback", () => {
  const source = fs.readFileSync(runtimeSource, "utf8");
  const renderSource = sliceSourceBetween(
    source,
    "export async function renderServer",
    "async function renderNextInitialFlightPayload",
  );

  expect(renderSource).toContain("renderNextDocumentHtml");
  expect(renderSource).toContain("createNextDocumentInitialPayload(documentHtml)");
  expect(renderSource).not.toContain("ssr.renderToHtml");
  expect(renderSource).not.toContain("renderNextDocumentClientFallback");
  expect(renderSource).not.toContain("findInitialAccessFallbackNode");
  expect(renderSource).not.toContain("applyInitialAccessFallback");
  expect(renderSource).not.toContain("injectNextFontStyles");
  expect(renderSource).not.toContain("injectNextFontPreloadLinks");
});

test("routes renderServer document HTML through next-server Edge dispatch", () => {
  const source = fs.readFileSync(runtimeSource, "utf8");
  const documentHtmlSource = sliceSourceBetween(
    source,
    "async function renderNextDocumentHtml",
    "async function createNextDocumentInitialPayload",
  );

  expect(documentHtmlSource).toContain("readNextAppPageInitialDocument");
  expect(documentHtmlSource).toContain(
    "renderServer({ url }) requires a generated Next route manifest",
  );
  expect(documentHtmlSource).not.toContain("renderNextRouteHtmlResponse");
  expect(documentHtmlSource).not.toContain("./app-render.ts");
});

test("removes testing-library Node baseline and raw Flight control-flow sniffing", () => {
  const runtime = fs.readFileSync(runtimeSource, "utf8");
  const appIndex = fs.readFileSync(
    fileURLToPath(new URL("../client/app-index.ts", import.meta.url)),
    "utf8",
  );

  expect(runtime).not.toContain("node-environment-baseline");
  expect(runtime).not.toContain("readReadableStreamText");
  expect(runtime).not.toContain("getNextRedirectUrlFromFlightPayloadText");
  expect(runtime).not.toContain("getNextHttpAccessFallbackStatus");
  expect(runtime).not.toContain("createNextHttpAccessFallbackError");
  expect(runtime).not.toContain("NextInitialRenderRedirectError");
  expect(runtime).not.toContain("flightPayloadText");
  expect(appIndex).not.toContain("Flight control-flow payload parsing");
  expect(appIndex).not.toContain("getReactFlightDigestRowPayloads");
  expect(appIndex).not.toContain("NEXT_HTTP_ERROR_FALLBACK");
  expect(appIndex).not.toContain("NEXT_REDIRECT");
});

test("removes testing-library direct-node and replacement App Page render paths", () => {
  const source = fs.readFileSync(runtimeSource, "utf8");

  expect(source).toContain("renderServer(<ReactNode />) and renderServer(<ReactNode />, { url })");
  expect(source).not.toContain('from "./app-render.ts"');
  expect(source).not.toContain('kind: "node"');
  expect(source).not.toContain("createDirectNodeLoaderTree");
  expect(source).not.toContain("replacePageModule");
  expect(source).not.toContain("replaceFirstPageModule");
  expect(source).not.toContain("replacementRoute");
  expect(source).not.toContain("page-replacement");
  expect(source).not.toContain("direct-page");
  expect(source).not.toContain("renderNextRouteActionResponse");
  expect(source).not.toContain("resetNextAppRenderCache");
});

function createManifest({
  pages = [],
  routeHandlers = [],
  redirects = [],
}: {
  pages?: NextRouteManifestEntry[];
  routeHandlers?: NextRouteHandlerManifestEntry[];
  redirects?: NextRoutingManifest["customRoutes"]["redirects"];
}): NextRouteManifest {
  return {
    pages,
    routeHandlers,
    routingData: createNextRoutingData({
      pages,
      routeHandlers,
      customRoutes: {
        headers: [],
        onMatchHeaders: [],
        redirects,
        rewrites: {
          beforeFiles: [],
          afterFiles: [],
          fallback: [],
        },
      },
    }),
  };
}

function page(
  route: string,
  overrides: Partial<NextRouteManifestEntry> = {},
): NextRouteManifestEntry {
  return {
    route,
    appPath: `${route}/page`,
    pageFile: `/app${route}/page.tsx`,
    loaderTree,
    ...overrides,
  };
}

function routeHandler(
  route: string,
  overrides: Partial<NextRouteHandlerManifestEntry> = {},
): NextRouteHandlerManifestEntry {
  return {
    route,
    appPath: `${route}/route`,
    routeFile: `/app${route}/route.ts`,
    ...overrides,
  };
}

function sliceSourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex).not.toBe(-1);
  const endIndex = source.indexOf(end, startIndex);
  expect(endIndex).not.toBe(-1);
  return source.slice(startIndex, endIndex);
}

function expectRedirectLocation(response: Response | undefined, expected: string) {
  const location = response?.headers.get("location");
  expect(location).toBeTruthy();
  const url = new URL(location!, "http://localhost");
  expect(`${url.pathname}${url.search}`).toBe(expected);
}

function expectInstalledEdgeAppPageManifests(page: string, serverActionsManifest: unknown) {
  const globalScope = globalThis as typeof globalThis & {
    __RSC_MANIFEST?: Record<string, unknown>;
    __RSC_SERVER_MANIFEST?: string;
  };

  expect(globalScope.__RSC_MANIFEST?.[page]).toBe(htmlClientReferenceManifest);
  expect(JSON.parse(globalScope.__RSC_SERVER_MANIFEST ?? "null")).toEqual(
    JSON.parse(JSON.stringify(serverActionsManifest)),
  );
}

function resetNextEdgeAppPageManifestGlobals() {
  delete (globalThis as { __RSC_MANIFEST?: unknown }).__RSC_MANIFEST;
  delete (globalThis as { __RSC_SERVER_MANIFEST?: unknown }).__RSC_SERVER_MANIFEST;
}
