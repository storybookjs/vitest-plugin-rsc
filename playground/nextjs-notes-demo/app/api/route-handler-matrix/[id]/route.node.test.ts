// @vitest-environment node

import { expect, test } from "vitest";
import { invokeNextRouteHandler } from "vitest-plugin-rsc/nextjs/app-route";
import * as userland from "./route";

const route = "/api/route-handler-matrix/[id]";

test("route handlers can read params, nextUrl, cookies, and userAgent", async () => {
  const response = await invokeNextRouteHandler({
    userland,
    route,
    url: "http://localhost/api/route-handler-matrix/demo?q=docs",
    headers: {
      cookie: "route-input=request-cookie",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    params: { id: "demo" },
  });

  await expect(response.json()).resolves.toEqual({
    id: "demo",
    method: "GET",
    query: "docs",
    requestCookie: "request-cookie",
    userAgentBrowser: "Chrome",
  });
  expect(response.headers.get("content-type")).toContain("application/json");
});

test("route handlers cover documented HTTP method exports", async () => {
  await expect(
    invokeNextRouteHandler({
      userland,
      route,
      url: "http://localhost/api/route-handler-matrix/post",
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "route-input=post-cookie",
      },
      body: JSON.stringify({ title: "posted" }),
      params: { id: "post" },
    }).then(async (response) => ({
      cookie: response.headers.get("set-cookie"),
      json: await response.json(),
    })),
  ).resolves.toEqual({
    cookie: expect.stringContaining("route-output=post"),
    json: {
      body: { title: "posted" },
      id: "post",
      method: "POST",
      requestCookie: "post-cookie",
    },
  });
  await expect(
    invokeNextRouteHandler({
      userland,
      route,
      url: "http://localhost/api/route-handler-matrix/put",
      method: "PUT",
      body: "put body",
      params: { id: "put" },
    }).then((response) => response.json()),
  ).resolves.toEqual({ id: "put", method: "PUT", text: "put body" });
  await expect(
    invokeNextRouteHandler({
      userland,
      route,
      url: "http://localhost/api/route-handler-matrix/patch",
      method: "PATCH",
      params: { id: "patch" },
    }).then((response) => response.json()),
  ).resolves.toEqual({ id: "patch", method: "PATCH" });
  await expect(
    invokeNextRouteHandler({
      userland,
      route,
      url: "http://localhost/api/route-handler-matrix/delete",
      method: "DELETE",
      params: { id: "delete" },
    }).then((response) => response.json()),
  ).resolves.toEqual({ id: "delete", method: "DELETE" });

  const head = await invokeNextRouteHandler({
    userland,
    route,
    url: "http://localhost/api/route-handler-matrix/head",
    method: "HEAD",
    params: { id: "head" },
  });
  expect(head.status).toBe(204);
  expect(head.headers.get("x-route-handler")).toBe("head");

  const options = await invokeNextRouteHandler({
    userland,
    route,
    url: "http://localhost/api/route-handler-matrix/options",
    method: "OPTIONS",
    params: { id: "options" },
  });
  expect(options.status).toBe(204);
  expect(options.headers.get("allow")).toBe("GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
});

test("route handlers can stream response bodies", async () => {
  const response = await invokeNextRouteHandler({
    userland,
    route,
    url: "http://localhost/api/route-handler-matrix/streamed?mode=stream",
    params: { id: "streamed" },
  });

  await expect(response.text()).resolves.toBe("stream streamed done");
  expect(response.headers.get("content-type")).toContain("text/plain");
});

test("route handlers can return redirects and reject rewrites like Next", async () => {
  const redirect = await invokeNextRouteHandler({
    userland,
    route,
    url: "http://localhost/api/route-handler-matrix/redirect-source?mode=redirect",
    params: { id: "redirect-source" },
  });
  expect(redirect.status).toBe(307);
  expect(redirect.headers.get("location")).toBe(
    "http://localhost/api/route-handler-matrix/redirected",
  );

  await expect(
    invokeNextRouteHandler({
      userland,
      route,
      url: "http://localhost/api/route-handler-matrix/rewrite-source?mode=rewrite",
      params: { id: "rewrite-source" },
    }),
  ).rejects.toThrow(/NextResponse\.rewrite\(\) was used in a app route handler/);
});
