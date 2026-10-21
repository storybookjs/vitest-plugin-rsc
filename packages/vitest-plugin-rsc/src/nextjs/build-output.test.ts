import { expect, test, vi } from "vitest";
import { loadManifest, prerenderManifest, setStylesheets } from "./build-output.ts";

// What the plugin gives the module in the app's server layers.
vi.mock("virtual:vitest-plugin-rsc/next-manifest", () => ({
  nextConfig: {},
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
test("answers for the prerender manifest with the one object of the module", () => {
  expect(loadManifest("/.next/prerender-manifest.json")).toBe(prerenderManifest);
});
