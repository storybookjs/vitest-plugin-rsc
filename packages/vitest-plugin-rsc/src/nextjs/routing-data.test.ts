import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { expect, test } from "vitest";
import {
  createNextRoutingData,
  type NextRoutingManifest,
  type NextRoutingData,
} from "./plugin/routing-data";
import { resolveRoutes } from "./next-routing";
import type { NextRouteHandlerManifestEntry, NextRouteManifestEntry } from "./request-router";

const loaderTree = [] as unknown as LoaderTree;

const manifest: NextRoutingManifest = {
  pages: [
    page("/next-apis"),
    page("/before-target"),
    page("/route-patterns/[team]/settings"),
    page("/route-patterns/docs/[...slug]"),
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
        source: "/before",
        headers: [{ key: "x-before-source", value: "rewrite-source" }],
      },
      {
        source: "/legacy/:slug",
        headers: [{ key: "x-legacy-slug", value: ":slug" }],
      },
      {
        source: "/route-patterns/:team/settings",
        headers: [{ key: "x-route-team", value: ":team" }],
      },
    ],
    onMatchHeaders: [
      {
        source: "/next-apis",
        headers: [{ key: "x-on-match-header", value: "notes-demo-on-match" }],
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
      fallback: [
        { source: "/missing/:path*", destination: "/fallback-target?from=fallback&path=:path*" },
      ],
    },
  },
};

test("converts discovered pages, route handlers, and custom routes to routing data", () => {
  const data = createNextRoutingData(manifest);

  expect(data.pathnames).toEqual([
    "/next-apis",
    "/before-target",
    "/route-patterns/[team]/settings",
    "/route-patterns/docs/[...slug]",
    "/fallback-target",
    "/api/next-request-response",
  ]);
  expect(data.routes.beforeMiddleware).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        headers: { "x-next-config-header": "notes-demo" },
      }),
      expect.objectContaining({
        headers: { "x-before-source": "rewrite-source" },
      }),
      expect.objectContaining({
        headers: { Location: "/next-apis?from=$1" },
        status: 307,
      }),
    ]),
  );
  expect(data.routes.dynamicRoutes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        destination: expect.stringContaining("/route-patterns/[team]/settings?nxtPteam=$nxtPteam"),
      }),
      expect.objectContaining({
        destination: expect.stringContaining("/route-patterns/docs/[...slug]?nxtPslug=$nxtPslug"),
      }),
    ]),
  );
  expect(data.routes.onMatch).toEqual([
    expect.objectContaining({
      headers: { "x-on-match-header": "notes-demo-on-match" },
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
  expect(result.resolvedHeaders?.get("x-on-match-header")).toBe("notes-demo-on-match");
});

test("applies next.config headers before beforeFiles rewrites", async () => {
  const result = await resolveRoute("/before");

  expect(result.resolvedPathname).toBe("/before-target");
  expect(result.invocationTarget?.pathname).toBe("/before-target");
  expect(result.resolvedQuery).toEqual({ via: "before" });
  expect(result.resolvedHeaders?.get("x-before-source")).toBe("rewrite-source");
});

test("selects dynamic app routes after afterFiles rewrites", async () => {
  const result = await resolveRoute("/after-dynamic");

  expect(result.resolvedPathname).toBe("/route-patterns/[team]/settings");
  expect(result.invocationTarget?.pathname).toBe("/route-patterns/acme/settings");
  expect(result.routeMatches).toMatchObject({ nxtPteam: "acme" });
  expect(result.resolvedQuery).toMatchObject({
    from: "after-files",
    nxtPteam: "acme",
  });
  expect(result.resolvedHeaders?.get("x-route-team")).toBeNull();
  expect(result.resolvedQuery).not.toHaveProperty("team");
});

test("uses fallback rewrites only after no exact or dynamic route matches", async () => {
  const result = await resolveRoute("/missing/deep/path");

  expect(result.resolvedPathname).toBe("/fallback-target");
  expect(result.invocationTarget?.pathname).toBe("/fallback-target");
  expect(result.resolvedQuery).toEqual({ from: "fallback", path: "deep/path" });
});

test("converts catch-all custom route params without preserving literal modifiers", async () => {
  const data = createNextRoutingData({
    ...manifest,
    customRoutes: {
      ...manifest.customRoutes,
      rewrites: {
        beforeFiles: [
          { source: "/catch/:path*", destination: "/fallback-target?path=:path*" },
          { source: "/plus/:path+", destination: "/fallback-target?path=:path+" },
          { source: "/optional/:path?", destination: "/fallback-target?path=:path?" },
        ],
        afterFiles: [],
        fallback: [],
      },
    },
  });

  for (const route of data.routes.beforeFiles) {
    expect(route.destination).toContain("$1");
    expect(route.destination).not.toContain(":path");
  }

  const result = await resolveRoute("/catch/deep/path", data);

  expect(result.resolvedPathname).toBe("/fallback-target");
  expect(result.resolvedQuery).toEqual({ path: "deep/path" });
});

test("preserves query delimiters after non-modified custom route params", async () => {
  const data = createNextRoutingData({
    ...manifest,
    pages: [...manifest.pages, page("/posts/[slug]")],
    customRoutes: {
      ...manifest.customRoutes,
      redirects: [],
      rewrites: {
        beforeFiles: [{ source: "/legacy/:slug", destination: "/posts/:slug?from=legacy" }],
        afterFiles: [],
        fallback: [],
      },
    },
  });

  expect(data.routes.beforeFiles).toEqual([
    expect.objectContaining({ destination: "/posts/$1?from=legacy" }),
  ]);

  const result = await resolveRoute("/legacy/config", data);

  expect(result.resolvedPathname).toBe("/posts/[slug]");
  expect(result.invocationTarget?.pathname).toBe("/posts/config");
  expect(result.resolvedQuery).toEqual({ from: "legacy", nxtPslug: "config" });
});

test("routes catch-all dynamic app routes with Next route-key query params", async () => {
  const result = await resolveRoute("/route-patterns/docs/a/b");

  expect(result.resolvedPathname).toBe("/route-patterns/docs/[...slug]");
  expect(result.invocationTarget?.pathname).toBe("/route-patterns/docs/a/b");
  expect(result.resolvedQuery).toEqual({ nxtPslug: "a/b" });
});

test("preserves user query params that share dynamic route param keys", async () => {
  const result = await resolveRoute("/route-patterns/docs/a/b?slug=query&mode=docs");

  expect(result.resolvedPathname).toBe("/route-patterns/docs/[...slug]");
  expect(result.invocationTarget?.pathname).toBe("/route-patterns/docs/a/b");
  expect(result.resolvedQuery).toEqual({ mode: "docs", nxtPslug: "a/b", slug: "query" });
  expect(result.routeMatches).toMatchObject({ nxtPslug: "a/b" });
});

test("returns redirects as Next adapter status and Location headers", async () => {
  const result = await resolveRoute("/legacy/config");

  expect(result.redirect).toBeUndefined();
  expect(result.status).toBe(307);
  expect(result.resolvedHeaders?.get("location")).toBe("/next-apis?from=config");
  expect(result.resolvedHeaders?.get("x-legacy-slug")).toBe("config");
});

test("converts Next internal trailing slash redirects on the plugin side", async () => {
  const data = createNextRoutingData({
    ...manifest,
    customRoutes: {
      ...manifest.customRoutes,
      redirects: [
        {
          source: "/:path+/",
          destination: "/:path+",
          permanent: true,
          internal: true,
          priority: true,
        } as (typeof manifest.customRoutes.redirects)[number],
      ],
    },
  });
  const result = await resolveRoute("/route-patterns/docs/", data);

  expect(data.routes.beforeMiddleware).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sourceRegex: "^/(.*)\\/$",
        headers: { Location: "/$1" },
        status: 308,
      }),
    ]),
  );
  expect(result.status).toBe(308);
  expect(result.resolvedHeaders?.get("location")).toBe("/route-patterns/docs");
});

async function resolveRoute(path: string, data: NextRoutingData = createNextRoutingData(manifest)) {
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
