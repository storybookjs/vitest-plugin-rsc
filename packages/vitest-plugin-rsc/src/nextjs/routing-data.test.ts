import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { expect, test } from "vitest";
import {
  createNextRoutingData,
  type NextRoutingManifest,
  type NextRoutingData,
} from "./routing-data";
import type { NextRouteHandlerManifestEntry, NextRouteManifestEntry } from "./request-router";

type NextRoutingModule = typeof import("@next/routing");

const loaderTree = [] as unknown as LoaderTree;

const manifest: NextRoutingManifest = {
  pages: [
    page("/next-apis"),
    page("/before-target"),
    page("/route-patterns/[team]/settings"),
    page("/fallback-target"),
  ],
  routeHandlers: [routeHandler("/api/next-request-response")],
  customRoutes: {
    headers: [
      {
        source: "/next-apis",
        headers: [{ key: "x-next-config-header", value: "notes-demo" }],
      },
      {
        source: "/route-patterns/:team/settings",
        headers: [{ key: "x-route-team", value: ":team" }],
      },
    ],
    redirects: [
      {
        source: "/legacy/:slug",
        destination: "/next-apis?from=:slug",
        permanent: false,
      },
    ],
    rewrites: {
      beforeFiles: [{ source: "/before", destination: "/before-target?via=before" }],
      afterFiles: [
        {
          source: "/next-apis",
          destination: "/route-patterns/acme/settings?from=after-files-shadow",
        },
        {
          source: "/after-dynamic",
          destination: "/route-patterns/acme/settings?from=after-files",
        },
      ],
      fallback: [{ source: "/missing/:path*", destination: "/fallback-target?from=fallback" }],
    },
  },
};

test("converts discovered pages, route handlers, and custom routes to routing data", () => {
  const data = createNextRoutingData(manifest);

  expect(data.pathnames).toEqual([
    "/next-apis",
    "/before-target",
    "/route-patterns/[team]/settings",
    "/fallback-target",
    "/api/next-request-response",
  ]);
  expect(data.routes.beforeMiddleware).toEqual([
    expect.objectContaining({
      destination: "/next-apis?from=$1",
      headers: { Location: "/next-apis?from=$1" },
      status: 307,
    }),
  ]);
  expect(data.routes.dynamicRoutes).toEqual([
    expect.objectContaining({
      destination: "/route-patterns/[team]/settings?team=$team",
    }),
  ]);
  expect(data.routes.onMatch).toEqual([
    expect.objectContaining({
      headers: { "x-next-config-header": "notes-demo" },
    }),
    expect.objectContaining({
      headers: { "x-route-team": "$1" },
    }),
  ]);
});

test("normalizes array rewrites to afterFiles routes", () => {
  const data = createNextRoutingData({
    ...manifest,
    customRoutes: {
      ...manifest.customRoutes,
      rewrites: [{ source: "/array-rewrite", destination: "/next-apis?via=array" }],
    },
  });

  expect(data.routes.beforeFiles).toEqual([]);
  expect(data.routes.afterFiles).toEqual([
    expect.objectContaining({
      destination: "/next-apis?via=array",
    }),
  ]);
  expect(data.routes.fallback).toEqual([]);
});

test("does not let afterFiles rewrites shadow exact app routes", async () => {
  const result = await resolveRoute("/next-apis");

  expect(result.resolvedPathname).toBe("/next-apis");
  expect(result.invocationTarget?.pathname).toBe("/next-apis");
  expect(result.resolvedQuery).toEqual({});
  expect(result.resolvedHeaders?.get("x-next-config-header")).toBe("notes-demo");
});

test("resolves beforeFiles rewrites to app routes", async () => {
  const result = await resolveRoute("/before");

  expect(result.resolvedPathname).toBe("/before-target");
  expect(result.invocationTarget?.pathname).toBe("/before-target");
  expect(result.resolvedQuery).toEqual({ via: "before" });
});

test("selects dynamic app routes after afterFiles rewrites", async () => {
  const result = await resolveRoute("/after-dynamic");

  expect(result.resolvedPathname).toBe("/route-patterns/[team]/settings");
  expect(result.invocationTarget?.pathname).toBe("/route-patterns/acme/settings");
  expect(result.routeMatches).toMatchObject({ team: "acme" });
  expect(result.resolvedQuery).toMatchObject({
    from: "after-files",
    team: "acme",
  });
  expect(result.resolvedHeaders?.get("x-route-team")).toBe("acme");
});

test("uses fallback rewrites only after no exact or dynamic route matches", async () => {
  const result = await resolveRoute("/missing/deep/path");

  expect(result.resolvedPathname).toBe("/fallback-target");
  expect(result.invocationTarget?.pathname).toBe("/fallback-target");
  expect(result.resolvedQuery).toEqual({ from: "fallback" });
});

test("returns redirects with Next status and interpolated destination query", async () => {
  const result = await resolveRoute("/legacy/config");

  expect(result.redirect?.url.pathname).toBe("/next-apis");
  expect(result.redirect?.url.searchParams.get("from")).toBe("config");
  expect(result.status).toBe(307);
  expect(result.resolvedHeaders?.get("location")).toBe("/next-apis?from=config");
});

async function resolveRoute(path: string, data: NextRoutingData = createNextRoutingData(manifest)) {
  const { resolveRoutes } = await loadNextRouting();
  return resolveRoutes({
    url: new URL(path, "https://example.com"),
    buildId: "BUILD_ID",
    basePath: "",
    requestBody: new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    headers: new Headers(),
    pathnames: data.pathnames,
    routes: data.routes,
    invokeMiddleware: async () => ({}),
  });
}

async function loadNextRouting(): Promise<NextRoutingModule> {
  const routingModule = (await import("@next/routing")) as NextRoutingModule & {
    default?: NextRoutingModule;
  };
  return typeof routingModule.resolveRoutes === "function" ? routingModule : routingModule.default!;
}

function page(route: string): NextRouteManifestEntry {
  return {
    route,
    appPath: `${route}/page`,
    pageFile: `/app${route}/page.tsx`,
    loaderTree,
  };
}

function routeHandler(route: string): NextRouteHandlerManifestEntry {
  return {
    route,
    appPath: `${route}/route`,
    routeFile: `/app${route}/route.ts`,
  };
}
