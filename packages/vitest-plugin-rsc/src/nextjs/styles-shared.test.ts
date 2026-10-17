import { expect, test } from "vitest";
import { builtStylesheetsOf, type BuiltStylesheets } from "./styles-shared.ts";

// Next links a stylesheet at `${assetPath}${path}`, from the root of the site.
// The files are in the directory of the build, wherever that is served.
const built: BuiltStylesheets = {
  assetPath: "/_next/",
  routes: {
    "/app/styles/page": {
      "app/layout": ["_next/static/css/global-abc.css"],
      "app/styles/page": ["_next/static/css/page-def.css", "_next/static/css/card-123.css"],
    },
  },
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
  const prefixed: BuiltStylesheets = {
    assetPath: "/assets/_next/",
    routes: { "/app/page": { "app/page": ["assets/_next/static/css/page-def.css"] } },
  };
  expect(paths(builtStylesheetsOf(prefixed, "/app/page", "http://localhost/"))).toEqual({
    "app/page": ["static/css/page-def.css"],
  });
  expect(paths(builtStylesheetsOf(prefixed, "/app/page", "http://localhost/docs/"))).toEqual({
    "app/page": ["../../docs/assets/_next/static/css/page-def.css"],
  });
});
