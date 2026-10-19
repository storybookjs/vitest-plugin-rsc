import { expect, test } from "vitest";
import {
  builtClientStylesheetsOf,
  builtFileKey,
  builtStylesheetsOf,
  componentPagePath,
  type BuiltFiles,
} from "./styles-shared.ts";

// Next links a stylesheet at `${assetPath}${path}`, from the root of the site.
// The files are in the directory of the build, wherever that is served.
const built: BuiltFiles = {
  assetPath: "/_next/",
  routes: {
    "/app/styles/page": {
      "app/layout": ["_next/static/css/global-abc.css"],
      "app/styles/page": ["_next/static/css/page-def.css", "_next/static/css/card-123.css"],
    },
    // The route of a node.
    "/app/notes/[id]/page": {
      "app/layout": ["_next/static/css/global-abc.css"],
      [componentPagePath]: [],
    },
  },
  // The files of the host, by their paths from the root of the project.
  hostFiles: {
    "host/preview.tsx": ["_next/static/css/theme-111.css"],
    "host/callout.tsx": ["_next/static/css/callout-222.css", "_next/static/css/theme-111.css"],
    "host/plain.tsx": [],
    "callout.tsx": ["_next/static/css/other-333.css"],
  },
  chunks: [],
  modules: {},
};

const paths = (stylesheets: ReturnType<typeof builtStylesheetsOf>) =>
  Object.fromEntries(
    Object.entries(stylesheets).map(([segment, files]) => [segment, files.map((f) => f.path)]),
  );

test("names the files of the build from the asset path when the build is the site", () => {
  expect(paths(builtStylesheetsOf(built, "/app/styles/page", "http://localhost:3000/"))).toEqual({
    "app/layout": ["static/css/global-abc.css"],
    "app/styles/page": ["static/css/page-def.css", "static/css/card-123.css"],
  });
});

test("goes up to the root first when the build is served from a directory", () => {
  const stylesheets = builtStylesheetsOf(built, "/app/styles/page", "http://localhost/docs/");
  expect(paths(stylesheets)["app/layout"]).toEqual(["../docs/_next/static/css/global-abc.css"]);
  // Resolved against `/_next/`, that is the file of the build.
  const href = new URL(paths(stylesheets)["app/layout"]![0]!, "http://localhost/_next/").pathname;
  expect(href).toBe("/docs/_next/static/css/global-abc.css");
});

test("decodes the directory, which Next encodes again when it links", () => {
  const stylesheets = builtStylesheetsOf(built, "/app/styles/page", "http://localhost/My%20Docs/");
  expect(paths(stylesheets)["app/layout"]).toEqual(["../My Docs/_next/static/css/global-abc.css"]);
});

test("has nothing for a route the build does not know", () => {
  expect(builtStylesheetsOf(built, "/app/nope/page", "http://localhost/")).toEqual({});
});

test("names the files under the asset prefix of the app", () => {
  const prefixed: BuiltFiles = {
    assetPath: "/assets/_next/",
    routes: { "/app/page": { "app/page": ["assets/_next/static/css/page-def.css"] } },
    hostFiles: {},
    chunks: [],
    modules: {},
  };
  expect(paths(builtStylesheetsOf(prefixed, "/app/page", "http://localhost/"))).toEqual({
    "app/page": ["static/css/page-def.css"],
  });
  expect(paths(builtStylesheetsOf(prefixed, "/app/page", "http://localhost/docs/"))).toEqual({
    "app/page": ["../../docs/assets/_next/static/css/page-def.css"],
  });
});

const node = "/app/notes/[id]/page";
const site = "http://localhost/";

test("gives a node the stylesheets of the files of the host, in their order, each once", () => {
  const missing: string[] = [];
  const stylesheets = builtStylesheetsOf(
    built,
    node,
    site,
    ["host/preview.tsx", "host/callout.tsx"],
    (file) => missing.push(file),
  );
  expect(paths(stylesheets)).toEqual({
    "app/layout": ["static/css/global-abc.css"],
    [componentPagePath]: ["static/css/theme-111.css", "static/css/callout-222.css"],
  });
  expect(missing).toEqual([]);
});

test("has no stylesheets of files for a node without any, nor for a page route", () => {
  expect(paths(builtStylesheetsOf(built, node, site))[componentPagePath]).toEqual([]);
  const plain = builtStylesheetsOf(built, node, site, ["host/plain.tsx"]);
  expect(paths(plain)[componentPagePath]).toEqual([]);
  // A page route renders no node: a file the page names is not its.
  const page = builtStylesheetsOf(built, "/app/styles/page", site, ["host/callout.tsx"]);
  expect(paths(page)).toEqual(paths(builtStylesheetsOf(built, "/app/styles/page", site)));
});

test("tells of a file that the build has no stylesheets for, and leaves it out", () => {
  const missing: string[] = [];
  const stylesheets = builtStylesheetsOf(
    built,
    node,
    site,
    ["app/page.tsx", "host/callout.tsx"],
    (file) => missing.push(file),
  );
  expect(missing).toEqual(["app/page.tsx"]);
  expect(paths(stylesheets)[componentPagePath]).toEqual([
    "static/css/callout-222.css",
    "static/css/theme-111.css",
  ]);
});

test("finds a file of the host by its path from the root, or by an absolute path", () => {
  const keys = Object.keys(built.hostFiles);
  expect(builtFileKey("host/callout.tsx", keys)).toBe("host/callout.tsx");
  expect(builtFileKey("./host/callout.tsx", keys)).toBe("host/callout.tsx");
  expect(builtFileKey("host/../host/callout.tsx", keys)).toBe("host/callout.tsx");
  expect(builtFileKey("/home/ada/app/host/callout.tsx", keys)).toBe("host/callout.tsx");
  expect(builtFileKey(String.raw`C:\app\host\callout.tsx`, keys)).toBe("host/callout.tsx");
  // The longest path that it ends with, from a separator on.
  expect(builtFileKey("/home/ada/app/callout.tsx", keys)).toBe("callout.tsx");
  expect(builtFileKey("/home/ada/app/my-callout.tsx", keys)).toBeUndefined();
  expect(builtFileKey("host/other.tsx", keys)).toBeUndefined();
  expect(builtFileKey("../host/callout.tsx", keys)).toBeUndefined();
});

// A file of the host with `"use client"` renders without a page: the tab
// links its stylesheets itself, as URLs, from wherever the build is served.
test("gives a file of the host with `use client` the stylesheets of the build, as URLs", () => {
  expect(builtClientStylesheetsOf(built, "host/callout.tsx", "https://site.test/docs/")).toEqual([
    "https://site.test/docs/_next/static/css/callout-222.css",
    "https://site.test/docs/_next/static/css/theme-111.css",
  ]);
  expect(builtClientStylesheetsOf(built, "host/plain.tsx", "https://site.test/")).toEqual([]);
  // One the build has no stylesheets for.
  expect(builtClientStylesheetsOf(built, "host/gone.tsx", "https://site.test/")).toEqual([]);
});
