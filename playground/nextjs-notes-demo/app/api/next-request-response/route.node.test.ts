// @vitest-environment node

import { expect, test } from "vitest";
import React from "react";
import { ImageResponse } from "next/og";
import { NextRequest, NextResponse, URLPattern, userAgentFromString } from "next/server";
import { GET } from "./route";

test("route handlers can use documented NextRequest, NextResponse, cookies, nextUrl, and userAgent APIs", async () => {
  const request = new NextRequest(
    new Request("http://localhost/api/next-request-response?q=docs", {
      headers: {
        cookie: "demo=request-cookie",
        "x-route-input": "node-request",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    }),
  );

  const response = await GET(request);

  await expect(response.json()).resolves.toEqual({
    pathname: "/api/next-request-response",
    query: "docs",
    requestCookie: "request-cookie",
    requestHeader: "node-request",
    userAgentBrowser: "Chrome",
  });
  expect(response.cookies.get("route-demo")?.value).toBe("ok");
  expect(response.headers.get("content-type")).toContain("application/json");
});

test("documented next/server helpers behave like Next middleware primitives", () => {
  const redirect = NextResponse.redirect(new URL("/redirected", "http://localhost"), 308);
  expect(redirect.status).toBe(308);
  expect(redirect.headers.get("location")).toBe("http://localhost/redirected");

  const rewrite = NextResponse.rewrite(new URL("/rewritten", "http://localhost"));
  expect(rewrite.headers.get("x-middleware-rewrite")).toBe("http://localhost/rewritten");

  const next = NextResponse.next();
  expect(next.headers.get("x-middleware-next")).toBe("1");

  expect(userAgentFromString("Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36").browser.name).toBe(
    "Chrome",
  );
  expect(
    new URLPattern({ pathname: "/api/:resource" }).exec("http://localhost/api/notes")?.pathname
      .groups.resource,
  ).toBe("notes");
});

test("next/og ImageResponse produces an image response", async () => {
  const response = new ImageResponse(
    React.createElement(
      "div",
      {
        style: {
          alignItems: "center",
          background: "white",
          color: "black",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        },
      },
      "OG",
    ),
    { height: 16, width: 16 },
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
});
