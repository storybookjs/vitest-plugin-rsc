import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { setupServer } from "msw/node";
import { ACTION_HEADER } from "next/dist/client/components/app-router-headers.js";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { nextRscRequestHandlers } from "./msw.ts";
import type {
  NextEdgeAppPageModule,
  NextEdgeAppRouteModule,
  NextRouteHandlerManifestEntry,
  NextRouteManifest,
  NextRouteManifestEntry,
} from "./request-router.ts";
import {
  createNextRoutingData,
  type NextRoutingManifest,
} from "./src/build/adapter/build-complete.ts";

const virtualNextRoutes = vi.hoisted(() => ({
  current: undefined as NextRouteManifest | undefined,
}));

vi.mock("virtual:vitest-plugin-rsc/next-routes", () => ({
  get nextRouteManifest() {
    return virtualNextRoutes.current?.pages ?? [];
  },
  get nextRouteHandlerManifest() {
    return virtualNextRoutes.current?.routeHandlers ?? [];
  },
  get routing() {
    const routingData = virtualNextRoutes.current?.routingData;
    if (!routingData)
      throw new Error("Expected test to configure the virtual Next route manifest.");
    return routingData;
  },
  get nextRoutingData() {
    const routingData = virtualNextRoutes.current?.routingData;
    if (!routingData)
      throw new Error("Expected test to configure the virtual Next route manifest.");
    return routingData;
  },
}));

const retiredDispatchGlobalName = "vitest-plugin-rsc.nextjs." + "dispatch" + "NextAppPageRequest";
const server = setupServer(...nextRscRequestHandlers);
const loaderTree = [] as unknown as LoaderTree;
const currentDirectory = fileURLToPath(new URL("./", import.meta.url));

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

beforeEach(() => {
  virtualNextRoutes.current = createManifest({});
});

afterEach(() => {
  delete (globalThis as typeof globalThis & Record<symbol, unknown>)[
    Symbol.for(retiredDispatchGlobalName)
  ];
  virtualNextRoutes.current = undefined;
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

test("rejects RSC GETs that do not select a generated Edge App Page", async () => {
  virtualNextRoutes.current = createManifest({
    routeHandlers: [routeHandler("/api/notes")],
  });

  const response = await fetch("http://localhost/api/notes?from=msw", {
    headers: {
      rsc: "1",
      "next-router-state-tree": '["",{}]',
      "next-url": "/api/notes?from=client",
      "x-next-header": "preserved",
    },
  });

  expect(response.status).toBe(404);
  await expect(response.text()).resolves.toBe(
    'No generated Next Edge App Page handler found for RSC GET "/api/notes".',
  );
  expect(
    (globalThis as typeof globalThis & Record<symbol, unknown>)[
      Symbol.for(retiredDispatchGlobalName)
    ],
  ).toBeUndefined();
});

test("dispatches intercepted App Page RSC GETs through NextServer manifest helpers", async () => {
  const handler = vi.fn<NextEdgeAppPageModule["handler"]>(async (request) => {
    expect(request).toBeInstanceOf(Request);
    expect(request.method).toBe("GET");
    expect(request.url).toBe("http://localhost/edge-app-page-delegation?from=msw");
    expect(request.headers.get("rsc")).toBe("1");
    expect(request.headers.get("next-router-state-tree")).toBe("[]");
    expect(request.headers.get("next-url")).toBe("/edge-app-page-delegation");

    return new Response("selected edge app page source");
  });
  const loadEdgeAppPage = vi.fn<() => Promise<NextEdgeAppPageModule>>(async () => ({ handler }));
  virtualNextRoutes.current = createManifest({
    pages: [page("/edge-app-page-delegation", { edgeAppPage: loadEdgeAppPage })],
  });

  const response = await fetch("http://localhost/edge-app-page-delegation?from=msw", {
    headers: {
      rsc: "1",
      "next-router-state-tree": "[]",
      "next-url": "/edge-app-page-delegation",
    },
  });

  expect(response.status).toBe(200);
  await expect(response.text()).resolves.toBe("selected edge app page source");
  expect(loadEdgeAppPage).toHaveBeenCalledOnce();
  expect(handler).toHaveBeenCalledOnce();
});

test("returns Next redirects for intercepted App Page RSC GETs before Edge dispatch", async () => {
  const loadEdgeAppPage = vi.fn<() => Promise<NextEdgeAppPageModule>>();
  virtualNextRoutes.current = createManifest({
    pages: [page("/edge-app-page-delegation", { edgeAppPage: loadEdgeAppPage })],
    redirects: [
      {
        source: "/next-config-redirect",
        destination: "/edge-app-page-delegation?from=config-redirect",
        permanent: false,
      },
    ],
  });

  const response = await fetch("http://localhost/next-config-redirect", {
    headers: {
      rsc: "1",
      "next-router-state-tree": "[]",
      "next-url": "/next-config-redirect",
    },
    redirect: "manual",
  });

  expect(response.status).toBe(307);
  expectRedirectLocation(response, "/edge-app-page-delegation?from=config-redirect");
  expect(loadEdgeAppPage).not.toHaveBeenCalled();
});

test("dispatches Edge App Page Server Action POSTs through raw Request handlers", async () => {
  const actionId = "/app/actions.ts#saveNote";
  const handler = vi.fn<NextEdgeAppPageModule["handler"]>(async (request) => {
    expect(request).toBeInstanceOf(Request);
    expect(request.method).toBe("POST");
    expect(request.url).toBe("http://localhost/edge-app-page-delegation?from=action");
    expect(request.headers.get(ACTION_HEADER)).toBe(actionId);
    expect(request.headers.get("content-type")).toBe("text/plain;charset=UTF-8");
    expect(request.headers.get("host")).toBe("localhost");
    expect(request.headers.get("x-forwarded-host")).toBe("localhost");
    expect(request.headers.get("next-router-state-tree")).toBe("[]");
    expect(request.headers.get("next-url")).toBe("/edge-app-page-delegation");
    await expect(request.text()).resolves.toBe("raw action body");

    return new Response("selected edge app page action");
  });
  const loadEdgeAppPage = vi.fn<() => Promise<NextEdgeAppPageModule>>(async () => ({ handler }));
  virtualNextRoutes.current = createManifest({
    pages: [page("/edge-app-page-delegation", { edgeAppPage: loadEdgeAppPage })],
  });

  const response = await fetch("http://localhost/edge-app-page-delegation?from=action", {
    method: "POST",
    headers: {
      [ACTION_HEADER]: actionId,
      "content-type": "text/plain;charset=UTF-8",
      "next-router-state-tree": "[]",
      "next-url": "/edge-app-page-delegation",
    },
    body: "raw action body",
  });

  expect(response.status).toBe(200);
  await expect(response.text()).resolves.toBe("selected edge app page action");
  expect(loadEdgeAppPage).toHaveBeenCalledOnce();
  expect(handler).toHaveBeenCalledOnce();
});

test("dispatches normal App Route API requests through Edge App Route handlers", async () => {
  const handler = vi.fn<NextEdgeAppRouteModule["handler"]>(async (request) => {
    expect(request).toBeInstanceOf(Request);
    expect(request.method).toBe("POST");
    expect(request.url).toBe("http://localhost/api/notes?from=msw");
    expect(request.headers.get("x-next-header")).toBe("preserved");
    await expect(request.text()).resolves.toBe("route body");

    return Response.json({ ok: true, via: "edge-app-route" }, { status: 201 });
  });
  const loadEdgeAppRoute = vi.fn<() => Promise<NextEdgeAppRouteModule>>(async () => ({ handler }));
  virtualNextRoutes.current = createManifest({
    routeHandlers: [
      routeHandler("/api/notes", {
        edgeAppRoute: loadEdgeAppRoute,
      }),
    ],
  });

  const response = await fetch("http://localhost/api/notes?from=msw", {
    method: "POST",
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      "x-next-header": "preserved",
    },
    body: "route body",
  });

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({ ok: true, via: "edge-app-route" });
  expect(loadEdgeAppRoute).toHaveBeenCalledOnce();
  expect(handler).toHaveBeenCalledOnce();
});

test("returns Next redirects for browser App Route requests before Edge dispatch", async () => {
  const loadEdgeAppRoute = vi.fn<() => Promise<NextEdgeAppRouteModule>>();
  virtualNextRoutes.current = createManifest({
    routeHandlers: [routeHandler("/api/notes", { edgeAppRoute: loadEdgeAppRoute })],
    redirects: [
      {
        source: "/api/legacy-notes",
        destination: "/api/notes?from=config-redirect",
        permanent: false,
      },
    ],
  });

  const response = await fetch("http://localhost/api/legacy-notes", {
    redirect: "manual",
  });

  expect(response.status).toBe(307);
  expectRedirectLocation(response, "/api/notes?from=config-redirect");
  expect(loadEdgeAppRoute).not.toHaveBeenCalled();
});

test("uses direct NextServer dispatch and route manifest imports without private globals", () => {
  const mswSource = fs.readFileSync(`${currentDirectory}/msw.ts`, "utf8");
  const runtimeSource = fs.readFileSync(`${currentDirectory}/testing-library-runtime.tsx`, "utf8");
  const nextServerSource = fs.readFileSync(`${currentDirectory}/src/server/next-server.ts`, "utf8");

  expect(mswSource).toContain("dispatchNextAppPageRscGet");
  expect(mswSource).toContain("dispatchNextAppPageActionPost");
  expect(mswSource).toContain("dispatchNextAppRouteRequest");
  expect(mswSource).toContain("virtual:vitest-plugin-rsc/next-routes");
  expect(mswSource).not.toContain("FetchNextRsc");
  expect(mswSource).not.toContain("NextRouteRequest");
  expect(mswSource).not.toContain("requestType");
  expect(mswSource).not.toContain("fetchRscSymbol");
  expect(mswSource).not.toContain("readActionReply");
  expect(mswSource).not.toContain(retiredDispatchGlobalName);
  expect(mswSource).not.toContain("getDispatch" + "NextAppPageRequest");

  expect(runtimeSource).toContain("dispatchNextAppPageInitialRender");
  expect(runtimeSource).not.toMatch(/Edge App Page[\s\S]{0,120}nextRscRequestsViaMsw/);
  expect(runtimeSource).not.toContain("nextRscRequestsViaMsw");
  expect(runtimeSource).not.toContain("decodeReply");
  expect(runtimeSource).not.toContain("loadServerAction");
  expect(runtimeSource).not.toContain("FetchNextRsc");
  expect(runtimeSource).not.toContain("createNextActionPostRequest");
  expect(runtimeSource).not.toContain("createNextRscGetRequest");
  expect(runtimeSource).not.toContain("edgeAppPage setup");
  expect(runtimeSource).not.toContain(retiredDispatchGlobalName);

  expect(nextServerSource).not.toContain('from "../../app-render.ts"');
  expect(nextServerSource).not.toContain("renderNextRouteFlightResponse");
  expect(nextServerSource).not.toContain("renderToHTMLOrFlight");
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

function expectRedirectLocation(response: Response, expected: string) {
  const location = response.headers.get("location");
  expect(location).toBeTruthy();
  const url = new URL(location!, "http://localhost");
  expect(`${url.pathname}${url.search}`).toBe(expected);
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
