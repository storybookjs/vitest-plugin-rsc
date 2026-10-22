import { expect, test, vi } from "vitest";
import {
  demoteRoute,
  isPrerendered,
  loadManifest,
  prerenderManifest,
  recordRoute,
  setStylesheets,
} from "./build-output.ts";

// What the plugin gives the module in the app's server layers.
vi.mock("virtual:vitest-plugin-rsc/next-manifest", () => ({
  nextConfig: { expireTime: 31536000 },
  preview: {},
  routesManifest: {},
  routing: { buildId: "test" },
}));

// What Next's renderer reads to preload the fonts of a segment, by the name
// of its file in the loader tree.
test("lists the fonts of each file as Next's manifest of fonts, from its stylesheets", () => {
  setStylesheets({
    "app/layout": [
      {
        path: "static/css/a/font.css",
        fonts: ["static/media/a-s.p.woff2", "static/media/b.woff2"],
      },
      { path: "static/css/a/global.css" },
    ],
    // A font with `preload: false`: Next adds a preconnect for it.
    "app/page": [{ path: "static/css/b/font.css", fonts: ["static/media/c-s.woff2"] }],
    "app/other/page": [{ path: "static/css/a/global.css" }],
  });
  const manifest = loadManifest("/.next/server/next-font-manifest.json") as {
    app: Record<string, string[]>;
  };

  expect(manifest.app["app/layout"]).toEqual(["static/media/a-s.p.woff2"]);
  expect(manifest.app["app/page"]).toEqual([]);
  expect(manifest.app["app/other/page"]).toBeUndefined();

  // Another request of the file: what it has now.
  setStylesheets({ "app/layout": [{ path: "static/css/a/global.css" }] });
  expect(manifest.app["app/layout"]).toBeUndefined();
});

// The server's cache reads the same manifest: see cache.ts.
test("answers for the prerender manifest with the object the server's cache gets", () => {
  expect(loadManifest("/.next/prerender-manifest.json")).toBe(prerenderManifest);
});

// What Next's handler of a page reads of the prerender manifest: see
// prerender-verdict.ts for the verdict.
test("lists what the build prerenders of a route, and takes a route out of it", () => {
  const blog = { kind: "page" as const, page: "/blog/[slug]/page", pathname: "/blog/[slug]" };
  const before = loadManifest("/.next/prerender-manifest.json");

  recordRoute(blog, { pathnames: ["/blog/a"], fallback: null, revalidate: 60 });

  const manifest = loadManifest("/.next/prerender-manifest.json") as typeof prerenderManifest;
  expect(manifest.routes["/blog/a"]).toEqual({
    initialRevalidateSeconds: 60,
    initialExpireSeconds: 31536000,
    srcRoute: "/blog/[slug]",
    dataRoute: "/blog/a.rsc",
  });
  expect(manifest.dynamicRoutes["/blog/[slug]"]).toEqual({
    fallback: null,
    dataRoute: "/blog/[slug].rsc",
  });
  // Another object as a dynamic route comes: Next's route module of a page
  // keeps what it matched by the object.
  expect(manifest).not.toBe(before);
  expect(isPrerendered(blog)).toBe(true);

  demoteRoute(blog);

  const demoted = loadManifest("/.next/prerender-manifest.json") as typeof prerenderManifest;
  expect(demoted.routes).toEqual({});
  expect(demoted.dynamicRoutes).toEqual({});
  expect(isPrerendered(blog)).toBe(false);
});

test("lists a route handler without the data of a page", () => {
  recordRoute(
    { kind: "route", page: "/api/time/route", pathname: "/api/time" },
    { pathnames: ["/api/time"], revalidate: false },
  );

  expect(prerenderManifest.routes["/api/time"]).toMatchObject({
    initialExpireSeconds: undefined,
    dataRoute: null,
  });
});
