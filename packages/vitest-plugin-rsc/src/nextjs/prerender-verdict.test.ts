import { AsyncLocalStorage } from "node:async_hooks";
import { expect, test, vi } from "vitest";

// What Next's server sets up on Node.js before its stores load.
Object.assign(globalThis, { AsyncLocalStorage });
const { prerenderVerdictOf } = await import("./prerender-verdict.ts");

// What the plugin gives the module in the rsc layer.
vi.mock("virtual:vitest-plugin-rsc/next-manifest", () => ({
  nextConfig: {
    experimental: {},
    staticPageGenerationTimeout: 60,
    cacheMaxMemorySize: 0,
    cacheLife: {},
  },
  routing: { buildId: "test" },
}));
vi.mock("./registry.ts", () => ({
  registry: { cacheGeneration: () => 0, buildDir: () => "/.next/0" },
}));

type Module = Record<string, unknown>;

// The route entry of a page, `app/<segments>/page.tsx`, with a root layout:
// the loader tree that Next's app loader writes, by the modules of its
// segments, the page's last.
function pageEntry(pathname: string, modules: Module[]) {
  const names = pathname.split("/").filter(Boolean);
  const page = modules.at(-1)!;
  const segmentModules = modules.slice(0, -1);
  const moduleOf = (mod: Module | undefined, file: string) =>
    mod ? { layout: [async () => mod, file] } : {};
  let tree: unknown = ["__PAGE__", {}, { page: [async () => page, `app${pathname}/page.tsx`] }];
  for (let index = names.length - 1; index >= 0; index--) {
    const name = names[index]!;
    tree = [
      name,
      { children: tree },
      moduleOf(segmentModules[index + 1], `app/${name}/layout.tsx`),
    ];
  }
  tree = ["", { children: tree }, moduleOf(segmentModules[0] ?? {}, "app/layout.tsx")];
  return {
    patchFetch() {},
    routeModule: {
      definition: { kind: "APP_PAGE", page: `${pathname}/page`, pathname },
      userland: { loaderTree: tree },
    },
  };
}

// The route entry of a route handler, `app/<segments>/route.ts`.
function routeEntry(pathname: string, userland: Module) {
  return {
    patchFetch() {},
    routeModule: {
      definition: {
        kind: "APP_ROUTE",
        page: `${pathname}/route`,
        pathname,
        filename: `app${pathname}/route.ts`,
      },
      userland,
      ensureUserland: async () => {},
    },
  };
}

const verdictOf = (pathname: string, modules: Module[]) =>
  prerenderVerdictOf(pageEntry(pathname, modules) as never, pathname, "page");

test("prerenders a page without params at its own pathname", async () => {
  expect(await verdictOf("/about", [{}, {}])).toEqual({ pathnames: ["/about"] });
});

test("prerenders the paths of `generateStaticParams`, and others at their first request", async () => {
  const page = { generateStaticParams: async () => [{ slug: "a" }, { slug: "b" }] };

  expect(await verdictOf("/blog/[slug]", [{}, {}, page])).toEqual({
    pathnames: ["/blog/a", "/blog/b"],
    fallback: null,
  });
});

test("prerenders every path at its first request with a `generateStaticParams` that lists none", async () => {
  const page = { generateStaticParams: async () => [] };

  expect(await verdictOf("/blog/[slug]", [{}, {}, page])).toEqual({
    pathnames: [],
    fallback: null,
  });
});

test("answers not found for another path with `dynamicParams = false`", async () => {
  const page = { dynamicParams: false, generateStaticParams: async () => [{ slug: "a" }] };

  expect((await verdictOf("/blog/[slug]", [{}, {}, page]))?.fallback).toBe(false);
});

test("leaves a page with params and without `generateStaticParams` to every request", async () => {
  expect(await verdictOf("/blog/[slug]", [{}, {}, {}])).toBeUndefined();
});

test("prerenders a page with params at its first request with `force-static`", async () => {
  expect(await verdictOf("/blog/[slug]", [{}, {}, { dynamic: "force-static" }])).toEqual({
    pathnames: [],
    fallback: null,
  });
  // The page's `dynamic` over its layout's, as Next reduces the config.
  expect(
    await verdictOf("/blog/[slug]", [{}, { dynamic: "force-static" }, { dynamic: "auto" }]),
  ).toBeUndefined();
});

test("lists a `force-dynamic` page too: Next's handler finds it dynamic as it prerenders it", async () => {
  expect(await verdictOf("/about", [{}, { dynamic: "force-dynamic" }])).toEqual({
    pathnames: ["/about"],
  });
});

test("leaves a page of the edge runtime, which runs on Node.js here, to every request", async () => {
  expect(await verdictOf("/about", [{}, { runtime: "edge" }])).toBeUndefined();
});

test("prerenders a route handler only where it opts in", async () => {
  const GET = () => Response.json({});
  const verdict = (pathname: string, userland: Module) =>
    prerenderVerdictOf(routeEntry(pathname, userland) as never, pathname, "route");

  expect(await verdict("/api/time", { GET })).toBeUndefined();
  expect(await verdict("/api/time", { GET, dynamic: "force-static" })).toEqual({
    pathnames: ["/api/time"],
  });
  expect(await verdict("/api/time", { GET, revalidate: 30 })).toEqual({ pathnames: ["/api/time"] });
  // Not one of the edge runtime, which runs on Node.js here.
  expect(await verdict("/api/time", { GET, dynamic: "force-static", runtime: "edge" })).toBe(
    undefined,
  );
  // A metadata route, like a sitemap, also without.
  expect(await verdict("/sitemap.xml", { GET })).toMatchObject({ pathnames: ["/sitemap.xml"] });
  // Not one with a method that changes something, which the build finds dynamic.
  const POST = () => new Response(null, { status: 204 });
  expect(await verdict("/api/time", { GET, POST, dynamic: "force-static" })).toBeUndefined();
  expect(await verdict("/sitemap.xml", { GET, PUT: POST })).toBeUndefined();
});
