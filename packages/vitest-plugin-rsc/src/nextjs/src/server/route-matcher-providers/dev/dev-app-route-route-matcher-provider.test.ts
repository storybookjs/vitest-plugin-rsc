import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { scanNextAppRouteHandlers } from "./dev-app-route-route-matcher-provider.ts";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

test("discovers App Route handlers and metadata routes through Next's dev matcher provider", async () => {
  const root = createNextAppFixture({
    "app/api/items/route.ts": "export function GET() { return Response.json({ ok: true }); }\n",
    "app/(api)/teams/[team]/route.ts": "export function GET() { return new Response(); }\n",
    "app/sitemap.ts": "export default function sitemap() { return []; }\n",
    "app/icon.png": "static icon metadata is served from the filesystem\n",
  });

  const entries = await scanNextAppRouteHandlers(root, "test");
  const byRoute = entriesByRoute(entries);
  const routes = entries.map((entry) => entry.route);

  expect(routes).toEqual(
    expect.arrayContaining([
      "/api/items",
      "/teams/[team]",
      "/sitemap.xml",
      "/sitemap/[__metadata_id__]",
    ]),
  );
  expect(routes).not.toContain("/icon.png");

  expect(byRoute.get("/api/items")).toEqual({
    route: "/api/items",
    appPath: "/api/items/route",
    routeFile: path.join(root, "app/api/items/route.ts"),
  });
  expect(byRoute.get("/teams/[team]")).toEqual({
    route: "/teams/[team]",
    appPath: "/(api)/teams/[team]/route",
    routeFile: path.join(root, "app/(api)/teams/[team]/route.ts"),
  });
  expect(byRoute.get("/sitemap.xml")).toEqual({
    route: "/sitemap.xml",
    appPath: "/sitemap.xml/route",
    routeFile: path.join(root, "app/sitemap.ts"),
  });
  expect(byRoute.get("/sitemap/[__metadata_id__]")).toEqual({
    route: "/sitemap/[__metadata_id__]",
    appPath: "/sitemap/[__metadata_id__]/route",
    routeFile: path.join(root, "app/sitemap.ts"),
  });
});

function createNextAppFixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-next-app-route-routes-"));
  tempRoots.push(root);
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");

  for (const [relativePath, source] of Object.entries(files)) {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }

  return root;
}

function entriesByRoute<T extends { route: string }>(entries: T[]) {
  return new Map(entries.map((entry) => [entry.route, entry]));
}
