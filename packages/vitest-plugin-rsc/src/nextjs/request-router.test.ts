import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { expect, test } from "vitest";
import {
  resolveNextRequestTarget,
  resolveNextRoute,
  tryResolveDirectRenderRoute,
  type NextRouteHandlerManifestEntry,
  type NextRouteManifest,
  type NextRouteManifestEntry,
} from "./request-router";

const loaderTree = [] as unknown as LoaderTree;

const manifest: NextRouteManifest = {
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

test("resolves beforeFiles rewrites to app pages", () => {
  const target = resolveNextRequestTarget({ url: "/before", manifest });

  expect(target.kind).toBe("app-page");
  if (target.kind !== "app-page") return;
  expect(target.entry.route).toBe("/before-target");
  expect(target.invocationUrl.pathname).toBe("/before-target");
  expect(target.invocationUrl.searchParams.get("via")).toBe("before");
});

test("does not let afterFiles rewrites shadow exact app routes", () => {
  const target = resolveNextRequestTarget({ url: "/next-apis", manifest });

  expect(target.kind).toBe("app-page");
  if (target.kind !== "app-page") return;
  expect(target.entry.route).toBe("/next-apis");
  expect(target.invocationUrl.pathname).toBe("/next-apis");
  expect(target.responseHeaders.get("x-next-config-header")).toBe("notes-demo");
});

test("selects dynamic app routes after afterFiles rewrites", () => {
  const target = resolveNextRequestTarget({
    url: "/route-patterns/alpha/settings",
    manifest,
  });

  expect(target.kind).toBe("app-page");
  if (target.kind !== "app-page") return;
  expect(target.entry.route).toBe("/route-patterns/[team]/settings");
  expect(target.routeMatches).toEqual({ team: "alpha" });
  expect(target.responseHeaders.get("x-route-team")).toBe("alpha");
});

test("uses fallback rewrites only after no exact or dynamic route matches", () => {
  const target = resolveNextRequestTarget({ url: "/missing/deep/path", manifest });

  expect(target.kind).toBe("app-page");
  if (target.kind !== "app-page") return;
  expect(target.entry.route).toBe("/fallback-target");
  expect(target.invocationUrl.pathname).toBe("/fallback-target");
  expect(target.invocationUrl.searchParams.get("from")).toBe("fallback");
});

test("returns redirect targets with Next redirect status and destination query params", () => {
  const target = resolveNextRequestTarget({ url: "/legacy/config", manifest });

  expect(target.kind).toBe("redirect");
  if (target.kind !== "redirect") return;
  expect(target.status).toBe(307);
  expect(target.url.pathname).toBe("/next-apis");
  expect(target.url.searchParams.get("from")).toBe("config");
  expect(target.responseHeaders.get("location")).toBe("/next-apis?from=config");
});

test("detects app route targets separately from app pages", () => {
  const target = resolveNextRequestTarget({ url: "/api/next-request-response", manifest });

  expect(target.kind).toBe("app-route");
  if (target.kind !== "app-route") return;
  expect(target.entry.appPath).toBe("/api/next-request-response/route");
  expect(() =>
    resolveNextRoute(
      manifest.pages,
      manifest.routeHandlers,
      undefined,
      "/api/next-request-response",
    ),
  ).toThrow(/Route handlers are not page render targets yet/);
});

test("keeps direct component route overrides constrained to matching pathnames", () => {
  expect(
    tryResolveDirectRenderRoute(
      manifest.pages,
      "/route-patterns/[team]/settings",
      "/route-patterns/alpha/settings",
    )?.route,
  ).toBe("/route-patterns/[team]/settings");
  expect(
    tryResolveDirectRenderRoute(
      manifest.pages,
      "/route-patterns/[team]/settings",
      "/route-patterns/alpha/profile",
    ),
  ).toBeUndefined();
});

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
