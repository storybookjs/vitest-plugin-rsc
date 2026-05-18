import fs from "node:fs";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { scanNextAppRoutes } from "./dev-app-page-route-matcher-provider.ts";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

test("discovers App Page routes through Next's dev matcher provider", async () => {
  const root = createNextAppFixture({
    "app/page.tsx": "export default function Page() { return null; }\n",
    "app/(marketing)/about/page.tsx": "export default function Page() { return null; }\n",
    "app/blog/[slug]/page.tsx": "export default function Page() { return null; }\n",
    "app/docs/[...slug]/page.tsx": "export default function Page() { return null; }\n",
    "app/optional/[[...slug]]/page.tsx": "export default function Page() { return null; }\n",
  });

  const entries = await scanNextAppRoutes(root, "test");
  const routes = entries.map((entry) => entry.route);

  expect(routes).toEqual([
    "/",
    "/about",
    "/blog/[slug]",
    "/docs/[...slug]",
    "/optional/[[...slug]]",
  ]);

  expect(entriesByRoute(entries).get("/about")).toMatchObject({
    route: "/about",
    appDir: path.join(root, "app"),
    appPath: "/(marketing)/about/page",
    appPaths: ["/(marketing)/about/page"],
    pageFile: path.join(root, "app/(marketing)/about/page.tsx"),
  });
  expect(entriesByRoute(entries).get("/blog/[slug]")).toMatchObject({
    appPath: "/blog/[slug]/page",
    appPaths: ["/blog/[slug]/page"],
    pageFile: path.join(root, "app/blog/[slug]/page.tsx"),
  });
  expect(entriesByRoute(entries).get("/docs/[...slug]")).toMatchObject({
    appPath: "/docs/[...slug]/page",
    appPaths: ["/docs/[...slug]/page"],
    pageFile: path.join(root, "app/docs/[...slug]/page.tsx"),
  });
  expect(entriesByRoute(entries).get("/optional/[[...slug]]")).toMatchObject({
    appPath: "/optional/[[...slug]]/page",
    appPaths: ["/optional/[[...slug]]/page"],
    pageFile: path.join(root, "app/optional/[[...slug]]/page.tsx"),
  });
  for (const entry of entries) {
    expect(entry.allNormalizedAppPaths).toEqual(routes);
  }
});

function createNextAppFixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-next-app-page-routes-"));
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
