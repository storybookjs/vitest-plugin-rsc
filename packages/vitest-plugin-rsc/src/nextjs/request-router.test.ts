import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LoaderTree } from "next/dist/server/lib/app-dir-module.js";
import { expect, test } from "vitest";
import {
  resolveNextRequestTarget,
  type NextRouteHandlerManifestEntry,
  type NextRouteManifest,
  type NextRouteManifestEntry,
} from "./request-router";
import { createNextRoutingData, type NextRoutingManifest } from "./plugin/routing-data";

const loaderTree = [] as unknown as LoaderTree;
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

const routingManifest = {
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
        source: "/route-patterns/:team/settings",
        headers: [{ key: "x-route-team", value: ":team" }],
      },
    ],
    onMatchHeaders: [],
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
} satisfies NextRoutingManifest;

const manifest: NextRouteManifest = {
  pages: routingManifest.pages,
  routeHandlers: routingManifest.routeHandlers,
  routingData: createNextRoutingData(routingManifest),
};

test("resolves beforeFiles rewrites to app pages", async () => {
  const target = await resolveNextRequestTarget({ url: "/before", manifest });

  expect(target.kind).toBe("app-page");
  if (target.kind !== "app-page") return;
  expect(target.entry.route).toBe("/before-target");
  expect(target.invocationUrl.pathname).toBe("/before-target");
  expect(target.invocationUrl.searchParams.get("via")).toBe("before");
});

test("does not let afterFiles rewrites shadow exact app routes", async () => {
  const target = await resolveNextRequestTarget({ url: "/next-apis", manifest });

  expect(target.kind).toBe("app-page");
  if (target.kind !== "app-page") return;
  expect(target.entry.route).toBe("/next-apis");
  expect(target.invocationUrl.pathname).toBe("/next-apis");
  expect(target.responseHeaders.get("x-next-config-header")).toBe("notes-demo");
});

test("selects dynamic app routes after afterFiles rewrites", async () => {
  const target = await resolveNextRequestTarget({
    url: "/route-patterns/alpha/settings",
    manifest,
  });

  expect(target.kind).toBe("app-page");
  if (target.kind !== "app-page") return;
  expect(target.entry.route).toBe("/route-patterns/[team]/settings");
  expect(target.routeMatches).toEqual({ team: "alpha" });
  expect(target.invocationUrl.searchParams.has("team")).toBe(false);
  expect(target.responseHeaders.get("x-route-team")).toBe("alpha");
});

test("uses fallback rewrites only after no exact or dynamic route matches", async () => {
  const target = await resolveNextRequestTarget({ url: "/missing/deep/path", manifest });

  expect(target.kind).toBe("app-page");
  if (target.kind !== "app-page") return;
  expect(target.entry.route).toBe("/fallback-target");
  expect(target.invocationUrl.pathname).toBe("/fallback-target");
  expect(target.invocationUrl.searchParams.get("from")).toBe("fallback");
  expect(target.invocationUrl.searchParams.get("path")).toBe("deep/path");
});

test("normalizes catch-all dynamic route matches through Next route matcher", async () => {
  const target = await resolveNextRequestTarget({
    url: "/route-patterns/docs/a/b",
    manifest,
  });

  expect(target.kind).toBe("app-page");
  if (target.kind !== "app-page") return;
  expect(target.entry.route).toBe("/route-patterns/docs/[...slug]");
  expect(target.routeMatches).toEqual({ slug: ["a", "b"] });
  expect(target.invocationUrl.searchParams.has("slug")).toBe(false);
});

test("maps basePath-prefixed routing results back to discovered app routes", async () => {
  const basePathManifest: NextRouteManifest = {
    pages: routingManifest.pages,
    routeHandlers: routingManifest.routeHandlers,
    routingData: createNextRoutingData({
      ...routingManifest,
      nextConfig: {
        basePath: "/base",
      },
    }),
  };
  const target = await resolveNextRequestTarget({
    url: "/base/route-patterns/alpha/settings?mode=edit",
    manifest: basePathManifest,
  });

  expect(target.kind).toBe("app-page");
  if (target.kind !== "app-page") return;
  expect(target.entry.route).toBe("/route-patterns/[team]/settings");
  expect(target.invocationUrl.pathname).toBe("/base/route-patterns/alpha/settings");
  expect(target.invocationUrl.searchParams.get("mode")).toBe("edit");
  expect(target.invocationUrl.searchParams.has("team")).toBe(false);
  expect(target.routeMatches).toEqual({ team: "alpha" });
});

test("preserves user-supplied query params that share dynamic route param keys", async () => {
  const target = await resolveNextRequestTarget({
    url: "/route-patterns/docs/a/b?slug=query&mode=docs",
    manifest,
  });

  expect(target.kind).toBe("app-page");
  if (target.kind !== "app-page") return;
  expect(target.entry.route).toBe("/route-patterns/docs/[...slug]");
  expect(target.routeMatches).toEqual({ slug: ["a", "b"] });
  expect(target.invocationUrl.searchParams.get("slug")).toBe("query");
  expect(target.invocationUrl.searchParams.get("mode")).toBe("docs");
});

test("returns redirect targets with Next redirect status and destination query params", async () => {
  const target = await resolveNextRequestTarget({ url: "/legacy/config", manifest });

  expect(target.kind).toBe("redirect");
  if (target.kind !== "redirect") return;
  expect(target.status).toBe(307);
  expect(target.url.pathname).toBe("/next-apis");
  expect(target.url.searchParams.get("from")).toBe("config");
  expect(target.responseHeaders.get("location")).toBe("/next-apis?from=config");
});

test("keeps explicit route overrides constrained to matching invocation pathnames", async () => {
  const target = await resolveNextRequestTarget({
    url: "/route-patterns/alpha/settings",
    route: "/route-patterns/[team]/settings",
    manifest,
  });

  expect(target.kind).toBe("app-page");
  if (target.kind !== "app-page") return;
  expect(target.entry.route).toBe("/route-patterns/[team]/settings");
  expect(target.routeMatches).toEqual({ team: "alpha" });
});

test("does not fall back to URL-matched pages when explicit route overrides mismatch", async () => {
  const target = await resolveNextRequestTarget({
    url: "/next-apis",
    route: "/route-patterns/[team]/settings",
    manifest,
  });

  expect(target.kind).toBe("not-found");
});

test("detects app route targets separately from app pages", async () => {
  const target = await resolveNextRequestTarget({ url: "/api/next-request-response", manifest });

  expect(target.kind).toBe("app-route");
  if (target.kind !== "app-route") return;
  expect(target.entry.appPath).toBe("/api/next-request-response/route");
});

test("keeps Next build-time routing imports out of runtime request modules", () => {
  for (const file of ["request-router.ts", "testing-library.tsx"]) {
    const source = fs.readFileSync(path.join(currentDirectory, file), "utf8");

    expect(source).not.toContain("next/dist/build/");
    expect(source).not.toContain("next/dist/lib/build-custom-route");
    expect(source).not.toContain("next/dist/lib/load-custom-routes");
    expect(source).not.toContain("next/dist/compiled/@vercel/routing-utils");
  }
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
