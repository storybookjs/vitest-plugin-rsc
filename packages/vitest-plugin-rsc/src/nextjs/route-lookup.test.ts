import { describe, expect, test } from "vitest";
import type { NextProject, NextRoute } from "./project.ts";
import { placeholder, requestsOf, routeLookupPlugin, routesOf } from "./route-lookup.ts";

const specifier = "vitest-plugin-rsc/nextjs/testing-library";
const imports = `import { renderServer, handleRequest } from "${specifier}";\n`;
const requests = (code: string) => requestsOf(imports + code, specifier);
const route = (url: string, proxy = true) => ({ url, route: true, proxy });

describe("requestsOf", () => {
  test("reads the URL of a route, a string or a template literal", async () => {
    expect(
      await requests(
        'await renderServer({ url: "/notes" });\n' +
          "await renderServer({ url: `/notes/${id}/edit` });\n" +
          "await renderServer({});\n" +
          "await renderServer();\n",
      ),
    ).toEqual([route("/notes"), route(`/notes/${placeholder}/edit`), route("/"), route("/")]);
  });

  test("a route without the server in front of it skips the middleware", async () => {
    expect(await requests('await renderServer({ url: "/notes", proxy: false });')).toEqual([
      route("/notes", false),
    ]);
  });

  test("a node gets the route's files only with its layouts, and the middleware only with proxy", async () => {
    expect(
      await requests(
        "await renderServer(jsx(Note, {}));\n" +
          'await renderServer(jsx(Note, {}), { url: "/notes/1" });\n' +
          'await renderServer(jsx(Note, {}), { url: "/notes/1", layouts: true });\n' +
          'await renderServer(jsx(Note, {}), { url: "/notes/1", proxy: true });\n',
      ),
    ).toEqual([
      { url: "/notes/1", route: true, proxy: false },
      { url: "/notes/1", route: false, proxy: true },
    ]);
  });

  test("a request goes through the server in front of the app", async () => {
    expect(await requests('await handleRequest("/api/notes", { method: "POST" });')).toEqual([
      route("/api/notes"),
    ]);
  });

  test.each([
    ["a URL of a variable", "await renderServer({ url });"],
    ["a URL of an expression", 'await handleRequest(new URL("/notes", base));'],
    ["options of a variable", "await renderServer(options);"],
    ["options with a spread", "await renderServer({ ...options });"],
    ["the function passed on", "open(renderServer);"],
    ["the function exported", "export { renderServer };"],
    ["options a function makes", 'await renderServer(optionsFor("/notes"));'],
    ["options of a condition", 'await renderServer(flag ? { url: "/a" } : { url: "/b" });'],
    [
      "the testing library imported later",
      `const { renderServer } = await import("${specifier}");`,
    ],
  ])("every route for %s", async (_, code) => {
    expect(await requests(code)).toBe("every");
  });

  test("a module that exports them from the testing library opens every route", async () => {
    expect(await requestsOf(`export { renderServer } from "${specifier}";`, specifier)).toBe(
      "every",
    );
  });

  test("reads a namespace import and a renamed import", async () => {
    expect(
      await requestsOf(
        `import * as testing from "${specifier}";\n` +
          `import { renderServer as open, "handleRequest" as send } from "${specifier}";\n` +
          'await send("/c");\n' +
          'await testing.renderServer({ url: "/a" });\n' +
          "await testing.cleanup();\n" +
          'await open({ url: "/b" });\n',
        specifier,
      ),
    ).toEqual([route("/c"), route("/a"), route("/b")]);
    expect(
      await requestsOf(`import * as testing from "${specifier}";\nuse(testing);`, specifier),
    ).toBe("every");
  });

  test("not a function of another module, or the key of a property", async () => {
    expect(
      await requestsOf(
        'import { renderServer } from "@testing-library/other";\nrenderServer({ url });',
        specifier,
      ),
    ).toEqual([]);
    expect(await requests("const page = { renderServer: 1 }; page.renderServer(url);")).toEqual([]);
  });
});

describe("routesOf", () => {
  const routes = [
    "/",
    "/notes",
    "/notes/new",
    "/notes/[id]",
    "/notes/[id]/edit",
    "/docs/[...slug]",
    "/shop/[[...path]]",
    "/_not-found",
  ].map(
    (pathname): NextRoute => ({
      kind: "page",
      page: `${pathname === "/" ? "" : pathname}/page`,
      pathname,
      pagePath: "",
      appPaths: [],
    }),
  );
  // The routes of the app, and the server in front of it, where `next.config`
  // sends `/old` to `/notes` and `/old/:id` to `/notes/:id`.
  const pageOf = async ({ pathname }: URL, { proxy }: { proxy: boolean }) =>
    ({
      "/notes/1": "/notes/[id]/page",
      ...(proxy && { "/old": "/notes/page", "/old/-x-": "/notes/[id]/page" }),
    })[pathname];
  const project = {
    routes,
    routing: { basePath: "" } as never,
    pageOf,
    middlewareFile: undefined as string | undefined,
  };
  const pathnames = async (url: string, proxy = true, of = project) =>
    (await routesOf(of, { url, proxy })).map(({ pathname }) => pathname);
  const template = (...parts: string[]) => parts.join(placeholder);
  const every = routes.map(({ pathname }) => pathname);

  test("a string is the route the server answers it with, with the server in front of the app or without", async () => {
    expect(await pathnames("/old")).toEqual(["/notes"]);
    expect(await pathnames("/old", false)).toEqual(["/_not-found"]);
    expect(await pathnames("/notes/1?tab=2")).toEqual(["/notes/[id]"]);
    expect(await pathnames("https://example.com/notes/1")).toEqual(["/notes/[id]"]);
  });

  test("a URL of no route is the not-found page, every route where a middleware can send it anywhere", async () => {
    expect(await pathnames("/nowhere")).toEqual(["/_not-found"]);
    const withMiddleware = { ...project, middlewareFile: "/app/proxy.ts" };
    expect(await pathnames("/nowhere", true, withMiddleware)).toEqual(every);
    expect(await pathnames("/nowhere", false, withMiddleware)).toEqual(["/_not-found"]);
  });

  test("a template literal is every route it can be, an expression one segment", async () => {
    expect(await pathnames(template("/notes/", ""))).toEqual(["/notes/new", "/notes/[id]"]);
    expect(await pathnames(template("/notes/", "/edit"))).toEqual(["/notes/[id]/edit"]);
    expect(await pathnames(template("/docs/", "/", ""))).toEqual(["/docs/[...slug]"]);
    expect(await pathnames(template("/shop", "?q=", ""))).toEqual(["/shop/[[...path]]"]);
  });

  test("an expression at the end of a segment with text can have slashes in it", async () => {
    expect(await pathnames(template("/notes", ""))).toEqual([
      "/notes",
      "/notes/new",
      "/notes/[id]",
      "/notes/[id]/edit",
    ]);
    expect(await pathnames(template("/notes/note-", ""))).toEqual([
      "/notes/[id]",
      "/notes/[id]/edit",
    ]);
  });

  test("a template literal goes through the server in front of the app too", async () => {
    expect(await pathnames(template("/old/", ""))).toEqual(["/notes/[id]"]);
  });

  test("an expression in front of the path is its origin, and alone any pathname", async () => {
    expect(await pathnames(template("", "/notes"))).toEqual(["/notes"]);
    expect(await pathnames(template("http://localhost:3000/notes/", ""))).toEqual([
      "/notes/new",
      "/notes/[id]",
    ]);
    expect(await pathnames(template("", "", ""))).toEqual(every);
  });

  test("a template literal of no route is every route: an expression can make it one", async () => {
    expect(await pathnames(template("/users/", ""))).toEqual(every);
  });
});

describe("routeLookupPlugin", () => {
  type Generator = (context: { environment: { name: string }; sourceCode: string }) => unknown;
  // Its `configureVitest`, for a project in the browser or in Node.js: the
  // generators of the key of Vitest's cache that it defines.
  const configure = (browser: boolean) => {
    const plugin = routeLookupPlugin({ getProject: () => ({}) as NextProject, specifier });
    const generators: Generator[] = [];
    (plugin.configureVitest as (context: unknown) => void)({
      project: { config: { browser: { enabled: browser } }, vite: { config: {} } },
      defineCacheKeyGenerator: (generator: Generator) => generators.push(generator),
    });
    return generators;
  };
  const test_ = `${imports}await renderServer({ url: "/notes" });`;

  test("keeps a module that can open a route out of Vitest's cache in the lookup's environment", () => {
    const [generator] = configure(true);
    expect(generator!({ environment: { name: "ssr" }, sourceCode: test_ })).toBe(false);
    expect(generator!({ environment: { name: "client" }, sourceCode: test_ })).toBeUndefined();
    expect(generator!({ environment: { name: "ssr" }, sourceCode: "export {};" })).toBeUndefined();
  });

  test("leaves a project in Node.js alone", () => {
    expect(configure(false)).toEqual([]);
  });
});
