// @vitest-environment node

import { expect, test } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from "./route.ts";

test("route handlers can read params, nextUrl, cookies, and userAgent", async () => {
  const response = await GET(
    createNextRequest("GET", "http://localhost/api/route-handler-matrix/demo?q=docs", {
      cookie: "route-input=request-cookie",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }),
    createRouteContext("demo"),
  );

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
    POST(
      createNextRequest(
        "POST",
        "http://localhost/api/route-handler-matrix/post",
        {
          "content-type": "application/json",
          cookie: "route-input=post-cookie",
        },
        JSON.stringify({ title: "posted" }),
      ),
      createRouteContext("post"),
    ).then(async (response) => ({
      cookie: response.cookies.get("route-output")?.value,
      json: await response.json(),
    })),
  ).resolves.toEqual({
    cookie: "post",
    json: {
      body: { title: "posted" },
      id: "post",
      method: "POST",
      requestCookie: "post-cookie",
    },
  });
  await expect(
    PUT(
      createNextRequest("PUT", "http://localhost/api/route-handler-matrix/put", {}, "put body"),
      createRouteContext("put"),
    ).then((response) => response.json()),
  ).resolves.toEqual({ id: "put", method: "PUT", text: "put body" });
  await expect(
    PATCH(
      createNextRequest("PATCH", "http://localhost/api/route-handler-matrix/patch"),
      createRouteContext("patch"),
    ).then((response) => response.json()),
  ).resolves.toEqual({ id: "patch", method: "PATCH" });
  await expect(
    DELETE(
      createNextRequest("DELETE", "http://localhost/api/route-handler-matrix/delete"),
      createRouteContext("delete"),
    ).then((response) => response.json()),
  ).resolves.toEqual({ id: "delete", method: "DELETE" });

  const head = HEAD();
  expect(head.status).toBe(204);
  expect(head.headers.get("x-route-handler")).toBe("head");

  const options = OPTIONS();
  expect(options.status).toBe(204);
  expect(options.headers.get("allow")).toBe("GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
});

test("route handlers can stream response bodies", async () => {
  const response = await GET(
    createNextRequest("GET", "http://localhost/api/route-handler-matrix/streamed?mode=stream"),
    createRouteContext("streamed"),
  );

  await expect(response.text()).resolves.toBe("stream streamed done");
  expect(response.headers.get("content-type")).toContain("text/plain");
});

test("route handlers can return NextResponse redirects and rewrites", async () => {
  const redirect = await GET(
    createNextRequest(
      "GET",
      "http://localhost/api/route-handler-matrix/redirect-source?mode=redirect",
    ),
    createRouteContext("redirect-source"),
  );
  expect(redirect.status).toBe(307);
  expect(redirect.headers.get("location")).toBe(
    "http://localhost/api/route-handler-matrix/redirected",
  );

  const rewrite = await GET(
    createNextRequest(
      "GET",
      "http://localhost/api/route-handler-matrix/rewrite-source?mode=rewrite",
    ),
    createRouteContext("rewrite-source"),
  );
  expect(rewrite.headers.get("x-middleware-rewrite")).toBe(
    "http://localhost/api/route-handler-matrix/rewritten",
  );
});

function createNextRequest(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: BodyInit,
) {
  return new NextRequest(
    new Request(url, {
      body,
      headers,
      method,
    }),
  );
}

function createRouteContext(id: string) {
  return {
    params: Promise.resolve({ id }),
  };
}
